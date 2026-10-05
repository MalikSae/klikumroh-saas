package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// M7: after the period is closed, a reward cannot be given when cancellations pushed the agent below the
// target (409), and cannot be given twice (409, audit trail kept). Another tenant gets 404.
func TestMarkRewardGiven_RecheckTargetAndNoDoubleGive(t *testing.T) {
	router, targetRepo, _, prospectRepo, _, t1, _, ag1, _ := setupAgentTargetTestEnv()
	ctx := context.Background()

	now := time.Now().UTC()
	target := &repository.AgentTarget{
		Title:       strPtr("Target 3 Pax"),
		MetricType:  "closing_pax",
		MetricValue: 3,
		PeriodStart: time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02"),
		PeriodEnd:   time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02"),
		Status:      "active",
	}
	_ = targetRepo.Create(ctx, t1.ID, target)

	pax2, pax1 := 2, 1
	pA := &repository.Prospect{TenantID: t1.ID, AgentID: &ag1.ID, Name: "Jamaah A", Phone: "0811000001", JumlahJamaah: &pax2, Status: "closing"}
	pB := &repository.Prospect{TenantID: t1.ID, AgentID: &ag1.ID, Name: "Jamaah B", Phone: "0811000002", JumlahJamaah: &pax1, Status: "closing"}
	_ = prospectRepo.Create(ctx, t1.ID, pA)
	_ = prospectRepo.Create(ctx, t1.ID, pB)

	do := func(method, path, token string, body []byte) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		return rr
	}

	if rr := do("POST", fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", target.ID), "tok-admin-t1", nil); rr.Code != http.StatusOK {
		t.Fatalf("close: %d %s", rr.Code, rr.Body.String())
	}
	var achID uint64
	for id, a := range targetRepo.achievements {
		if a.TargetID == target.ID && a.AgentID == ag1.ID {
			achID = id
		}
	}
	if achID == 0 {
		t.Fatal("achievement not recorded at close")
	}
	rewardPath := fmt.Sprintf("/api/dashboard/tenant/achievements/%d/reward", achID)
	body, _ := json.Marshal(map[string]string{"status": "given", "notes": "Diserahkan"})

	// Jamaah B cancels after the period was closed ("Batalkan Closing" moves it to tidak_lanjut): 2 of 3.
	prospectRepo.prospects[pB.ID].Status = "tidak_lanjut"
	rr := do("PATCH", rewardPath, "tok-admin-t1", body)
	if rr.Code != http.StatusConflict {
		t.Fatalf("below target: expected 409, got %d (%s)", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "di bawah target") || !strings.Contains(rr.Body.String(), "2 dari target 3") {
		t.Fatalf("unexpected message: %s", rr.Body.String())
	}
	if targetRepo.achievements[achID].RewardStatus == "given" {
		t.Fatal("reward must not be given below the target")
	}

	// Cross-tenant: another travel cannot mark it.
	if rr := do("PATCH", rewardPath, "tok-admin-t2", body); rr.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant: expected 404, got %d", rr.Code)
	}

	// Back at the target (the closing is restored): the reward can be given once.
	prospectRepo.prospects[pB.ID].Status = "closing"
	if rr := do("PATCH", rewardPath, "tok-admin-t1", body); rr.Code != http.StatusOK {
		t.Fatalf("at target: expected 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	givenAt := *targetRepo.achievements[achID].RewardGivenAt
	givenBy := *targetRepo.achievements[achID].RewardGivenBy

	time.Sleep(5 * time.Millisecond)
	rr = do("PATCH", rewardPath, "tok-admin-t1", body)
	if rr.Code != http.StatusConflict {
		t.Fatalf("second give: expected 409, got %d (%s)", rr.Code, rr.Body.String())
	}
	if got := errorOf(rr); got != service.ErrRewardAlreadyGiven.Error() {
		t.Fatalf("unexpected message %q", got)
	}
	a := targetRepo.achievements[achID]
	if !a.RewardGivenAt.Equal(givenAt) || *a.RewardGivenBy != givenBy {
		t.Fatal("second give must not overwrite the audit fields")
	}
}
