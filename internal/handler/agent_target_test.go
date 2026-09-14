package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func setupAgentTargetTestEnv() (
	adminRouter *chi.Mux,
	targetRepo *mockAgentTargetRepo,
	agentRepo *mockAgentRepo,
	prospectRepo *mockProspectRepo,
	adminSessionRepo *mockSessionRepo,
	t1 *repository.Tenant,
	t2 *repository.Tenant,
	ag1 *repository.Agent,
	ag2 *repository.Agent,
) {
	tenantRepo := newMockTenantRepo()
	fee0 := float64(0)
	minPayout := float64(500000)

	t1 = &repository.Tenant{
		Name:                 "Travel Amanah",
		Slug:                 "amanah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
		MinimumPayoutAmount:  &minPayout,
	}
	_ = tenantRepo.Create(context.Background(), t1)

	t2 = &repository.Tenant{
		Name:                 "Travel Berkah",
		Slug:                 "berkah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
		MinimumPayoutAmount:  &minPayout,
	}
	_ = tenantRepo.Create(context.Background(), t2)

	agentRepo = newMockAgentRepo()
	prospectRepo = newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo

	ag1 = &repository.Agent{
		TenantID:      t1.ID,
		Name:          "Agen Amanah 1",
		Phone:         strPtr("0811111111"),
		ReferralCode:  "AMN1",
		Status:        "active",
		PaymentStatus: "paid",
	}
	_ = agentRepo.Create(context.Background(), t1.ID, ag1)

	ag2 = &repository.Agent{
		TenantID:      t2.ID,
		Name:          "Agen Berkah 1",
		Phone:         strPtr("0822222222"),
		ReferralCode:  "BRK1",
		Status:        "active",
		PaymentStatus: "paid",
	}
	_ = agentRepo.Create(context.Background(), t2.ID, ag2)

	targetRepo = newMockAgentTargetRepo(agentRepo, prospectRepo)
	targetService := service.NewAgentTargetService(targetRepo, agentRepo)
	targetHandler := handler.NewAgentTargetHandler(targetService)

	adminSessionRepo = &mockSessionRepo{sessions: make(map[string]*repository.Session)}
	adminSessionRepo.sessions["tok-admin-t1"] = &repository.Session{
		ID:          1,
		Token:       "tok-admin-t1",
		TenantID:    t1.ID,
		AdminUserID: 101,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}
	adminSessionRepo.sessions["tok-admin-t2"] = &repository.Session{
		ID:          2,
		Token:       "tok-admin-t2",
		TenantID:    t2.ID,
		AdminUserID: 102,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	adminRouter = chi.NewRouter()
	adminRouter.Use(middleware.AuthMiddleware(adminSessionRepo))
	targetHandler.RegisterDashboardRoutes(adminRouter)

	return
}

func TestAgentTargetHandler_CRUD_And_CrossTenant(t *testing.T) {
	router, _, _, _, _, t1, _, _, _ := setupAgentTargetTestEnv()

	now := time.Now().UTC()
	startStr := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	endStr := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	var createdID uint64

	// 1. Create target as Tenant 1
	t.Run("Create target - success", func(t *testing.T) {
		body := map[string]interface{}{
			"title":              "Target Umroh Syawal",
			"metric_type":        "closing_pax",
			"metric_value":       10,
			"reward_description": "Bonus Rp 5.000.000",
			"period_start":       startStr,
			"period_end":         endStr,
		}
		jsonBytes, _ := json.Marshal(body)

		req := httptest.NewRequest("POST", "/api/dashboard/tenant/targets", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer tok-admin-t1")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
		}

		var created repository.AgentTarget
		if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if created.ID == 0 || created.Title == nil || *created.Title != "Target Umroh Syawal" || created.MetricValue != 10 {
			t.Fatalf("Unexpected create response: %+v", created)
		}
		createdID = created.ID
	})

	// 2. List targets for Tenant 1 vs Tenant 2
	t.Run("List targets - isolation", func(t *testing.T) {
		// Tenant 1 sees the created target
		req1 := httptest.NewRequest("GET", "/api/dashboard/tenant/targets", nil)
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)

		if rr1.Code != http.StatusOK {
			t.Fatalf("Tenant 1 List targets failed: %d", rr1.Code)
		}

		var list1 struct {
			Targets []repository.AgentTarget `json:"targets"`
		}
		_ = json.Unmarshal(rr1.Body.Bytes(), &list1)
		if len(list1.Targets) != 1 || list1.Targets[0].ID != createdID {
			t.Fatalf("Tenant 1 expected target ID %d, got %+v", createdID, list1.Targets)
		}

		// Tenant 2 sees empty list (cross-tenant isolation)
		req2 := httptest.NewRequest("GET", "/api/dashboard/tenant/targets", nil)
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)

		if rr2.Code != http.StatusOK {
			t.Fatalf("Tenant 2 List targets failed: %d", rr2.Code)
		}
		var list2 struct {
			Targets []repository.AgentTarget `json:"targets"`
		}
		_ = json.Unmarshal(rr2.Body.Bytes(), &list2)
		if len(list2.Targets) != 0 {
			t.Fatalf("Tenant 2 leaked Tenant 1 targets: %+v", list2.Targets)
		}
	})

	// 3. Update target - Tenant 2 gets 404, Tenant 1 succeeds
	t.Run("Update target - cross-tenant isolation", func(t *testing.T) {
		updateBody := map[string]interface{}{
			"title":              "Target Umroh Syawal Updated",
			"metric_value":       15,
			"reward_description": "Bonus Rp 7.500.000",
			"period_start":       startStr,
			"period_end":         endStr,
		}
		jsonBytes, _ := json.Marshal(updateBody)

		// Tenant 2 tampered attempt
		req2 := httptest.NewRequest("PUT", fmt.Sprintf("/api/dashboard/tenant/targets/%d", createdID), bytes.NewReader(jsonBytes))
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		req2.Header.Set("Content-Type", "application/json")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 updating Tenant 1 target, got %d", rr2.Code)
		}

		// Tenant 1 valid update
		req1 := httptest.NewRequest("PUT", fmt.Sprintf("/api/dashboard/tenant/targets/%d", createdID), bytes.NewReader(jsonBytes))
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		req1.Header.Set("Content-Type", "application/json")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("Expected 200 for Tenant 1 update, got %d: %s", rr1.Code, rr1.Body.String())
		}
	})

	// 4. Delete target - Tenant 2 gets 404, Tenant 1 succeeds
	t.Run("Delete target - cross-tenant isolation", func(t *testing.T) {
		req2 := httptest.NewRequest("DELETE", fmt.Sprintf("/api/dashboard/tenant/targets/%d", createdID), nil)
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 deleting Tenant 1 target, got %d", rr2.Code)
		}

		req1 := httptest.NewRequest("DELETE", fmt.Sprintf("/api/dashboard/tenant/targets/%d", createdID), nil)
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("Expected 200 for Tenant 1 delete, got %d: %s", rr1.Code, rr1.Body.String())
		}
	})

	_ = t1
}

func TestAgentTargetHandler_Progress_Close_Achievements_Export(t *testing.T) {
	router, targetRepo, agentRepo, prospectRepo, _, t1, _, ag1, _ := setupAgentTargetTestEnv()

	now := time.Now().UTC()
	startStr := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	endStr := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	// Setup a target with metric_value = 2
	target := &repository.AgentTarget{
		Title:             strPtr("Target Ramadhan 2 Pax"),
		MetricType:        "closing_pax",
		MetricValue:       2,
		RewardDescription: strPtr("Voucher Umroh"),
		PeriodStart:       startStr,
		PeriodEnd:         endStr,
		Status:            "active",
	}
	_ = targetRepo.Create(context.Background(), t1.ID, target)

	// Add prospect closing for ag1
	pax2 := 2
	p := &repository.Prospect{
		TenantID:     t1.ID,
		AgentID:      &ag1.ID,
		Name:         "Jamaah Test",
		Phone:        "0811111199",
		JumlahJamaah: &pax2,
		Status:       "closing",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, p)

	// 1. GET /api/dashboard/tenant/targets/{id}/progress
	t.Run("GetTargetProgress - success & isolation", func(t *testing.T) {
		// Tenant 1
		req1 := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/tenant/targets/%d/progress", target.ID), nil)
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("GetTargetProgress failed: %d: %s", rr1.Code, rr1.Body.String())
		}

		var progResp service.TargetProgressResponse
		_ = json.Unmarshal(rr1.Body.Bytes(), &progResp)
		if len(progResp.Rows) == 0 {
			t.Fatalf("Expected progress rows, got 0")
		}
		if progResp.Rows[0].AgentID != ag1.ID || progResp.Rows[0].AchievedValue != 2 || !progResp.Rows[0].Achieved {
			t.Fatalf("Unexpected progress data: %+v", progResp.Rows[0])
		}

		// Tenant 2 (Cross-tenant attempt)
		req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/tenant/targets/%d/progress", target.ID), nil)
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 accessing progress, got %d", rr2.Code)
		}
	})

	var achievementID uint64

	// 2. POST /api/dashboard/tenant/targets/{id}/close
	t.Run("CloseTarget - success & isolation", func(t *testing.T) {
		// Tenant 2 attempt
		req2 := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", target.ID), nil)
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 closing Tenant 1 target, got %d", rr2.Code)
		}

		// Tenant 1 close
		req1 := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", target.ID), nil)
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("Expected 200 on Close, got %d: %s", rr1.Code, rr1.Body.String())
		}

		var closeResp struct {
			AchievedCount int `json:"achieved_count"`
		}
		_ = json.Unmarshal(rr1.Body.Bytes(), &closeResp)
		if closeResp.AchievedCount != 1 {
			t.Fatalf("Expected 1 achievement recorded, got %d", closeResp.AchievedCount)
		}

		// Closing again should return 409 Conflict
		reqAgain := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", target.ID), nil)
		reqAgain.Header.Set("Authorization", "Bearer tok-admin-t1")
		rrAgain := httptest.NewRecorder()
		router.ServeHTTP(rrAgain, reqAgain)
		if rrAgain.Code != http.StatusConflict {
			t.Fatalf("Expected 409 when closing already closed target, got %d", rrAgain.Code)
		}
	})

	// 3. GET /api/dashboard/tenant/targets/{id}/achievements
	t.Run("ListAchievements - isolation & fetch", func(t *testing.T) {
		req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/tenant/targets/%d/achievements", target.ID), nil)
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 listing achievements, got %d", rr2.Code)
		}

		req1 := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/tenant/targets/%d/achievements", target.ID), nil)
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("Tenant 1 ListAchievements failed: %d", rr1.Code)
		}

		var achResp struct {
			Achievements []service.AchievementDTO `json:"achievements"`
		}
		_ = json.Unmarshal(rr1.Body.Bytes(), &achResp)
		if len(achResp.Achievements) != 1 {
			t.Fatalf("Expected 1 achievement, got %d", len(achResp.Achievements))
		}
		achievementID = achResp.Achievements[0].ID
		if achResp.Achievements[0].AgentID != ag1.ID || achResp.Achievements[0].RewardStatus != "pending" {
			t.Fatalf("Unexpected achievement: %+v", achResp.Achievements[0])
		}
	})

	// 4. PATCH /api/dashboard/tenant/achievements/{id}/reward
	t.Run("UpdateRewardStatus - isolation & success", func(t *testing.T) {
		rewardBody := map[string]interface{}{
			"status": "given",
			"notes":  "Hadiah diserahkan tunai",
		}
		jsonBytes, _ := json.Marshal(rewardBody)

		// Tenant 2 tampered attempt
		req2 := httptest.NewRequest("PATCH", fmt.Sprintf("/api/dashboard/tenant/achievements/%d/reward", achievementID), bytes.NewReader(jsonBytes))
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		req2.Header.Set("Content-Type", "application/json")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 updating reward, got %d", rr2.Code)
		}

		// Tenant 1 valid update
		req1 := httptest.NewRequest("PATCH", fmt.Sprintf("/api/dashboard/tenant/achievements/%d/reward", achievementID), bytes.NewReader(jsonBytes))
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		req1.Header.Set("Content-Type", "application/json")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("Expected 200 for Tenant 1 update reward, got %d: %s", rr1.Code, rr1.Body.String())
		}
	})

	// 5. GET /api/dashboard/tenant/targets/{id}/achievements/export (CSV)
	t.Run("ExportAchievements - CSV & isolation", func(t *testing.T) {
		// Tenant 2
		req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/tenant/targets/%d/achievements/export", target.ID), nil)
		req2.Header.Set("Authorization", "Bearer tok-admin-t2")
		rr2 := httptest.NewRecorder()
		router.ServeHTTP(rr2, req2)
		if rr2.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 for Tenant 2 exporting achievements, got %d", rr2.Code)
		}

		// Tenant 1
		req1 := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/tenant/targets/%d/achievements/export", target.ID), nil)
		req1.Header.Set("Authorization", "Bearer tok-admin-t1")
		rr1 := httptest.NewRecorder()
		router.ServeHTTP(rr1, req1)
		if rr1.Code != http.StatusOK {
			t.Fatalf("Expected 200 for Tenant 1 CSV export, got %d: %s", rr1.Code, rr1.Body.String())
		}

		contentType := rr1.Header().Get("Content-Type")
		if contentType != "text/csv; charset=utf-8" {
			t.Fatalf("Expected Content-Type text/csv, got %s", contentType)
		}
		if !bytes.Contains(rr1.Body.Bytes(), []byte("Nama Agen")) {
			t.Fatalf("Expected CSV header in body, got %s", rr1.Body.String())
		}
	})

	_ = agentRepo
}
