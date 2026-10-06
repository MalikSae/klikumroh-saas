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
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt round 4 (LOW), handler contracts.

// stubPayoutConflictService answers every staff payout action with ErrStatusConflict.
type stubPayoutConflictService struct{ service.AffiliatorService }

func (stubPayoutConflictService) MarkPayoutPaid(context.Context, uint64, uint64) error {
	return repository.ErrStatusConflict
}
func (stubPayoutConflictService) RejectPayout(context.Context, uint64, uint64, string) error {
	return repository.ErrStatusConflict
}
func (stubPayoutConflictService) StaffRequestPayout(context.Context, uint64, uint64) (*repository.AffiliatorPayout, error) {
	return nil, repository.ErrStatusConflict
}

// A payout already processed by another staff member is a friendly Indonesian 409, never the raw
// repository text; the staff payout request maps the same conflict to 409 instead of 500.
func TestBH4_AffiliatorPayoutConflictMessages(t *testing.T) {
	r := chi.NewRouter()
	r.Group(func(g chi.Router) {
		g.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(middleware.WithStaffUserID(req.Context(), 9)))
			})
		})
		handler.NewAffiliatorHandler(stubPayoutConflictService{}).RegisterStaffRoutes(g)
	})
	cases := []struct{ method, path, body, want string }{
		{http.MethodPatch, "/api/staff/affiliator-payouts/5/paid", "", "Pencairan ini sudah diproses staf lain. Muat ulang halaman."},
		{http.MethodPatch, "/api/staff/affiliator-payouts/5/reject", `{"reason":"rekening salah"}`, "Pencairan ini sudah diproses staf lain. Muat ulang halaman."},
		{http.MethodPost, "/api/staff/affiliators/12/payouts", "", "Data sudah berubah karena ada proses lain. Muat ulang halaman lalu coba lagi."},
	}
	for _, c := range cases {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(c.method, c.path, bytes.NewBufferString(c.body)))
		var body map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if w.Code != http.StatusConflict || body["error"] != c.want {
			t.Errorf("%s %s = %d %q, want 409 %q", c.method, c.path, w.Code, body["error"], c.want)
		}
	}
}

// PUT /api/dashboard/me/password locks after 5 wrong current passwords (429), per account.
func TestBH4_ChangePasswordLockout(t *testing.T) {
	repo := newInMemoryAdminUserRepo()
	r := setupTeamTestRouter(repo)
	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	admin := &repository.AdminUser{TenantID: 1, Email: "bh4-lock@tenant1.test", Name: "Admin", PasswordHash: string(hash), Status: "active"}
	_ = repo.Create(context.Background(), 1, admin)
	other := &repository.AdminUser{TenantID: 2, Email: "bh4-lock@tenant2.test", Name: "Admin 2", PasswordHash: string(hash), Status: "active"}
	_ = repo.Create(context.Background(), 2, other)

	put := func(tenantID, adminID uint64, current, next string) int {
		b, _ := json.Marshal(map[string]string{"current_password": current, "new_password": next})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/me/password", bytes.NewReader(b))
		ctx := middleware.WithAdminUserID(middleware.WithTenantID(req.Context(), tenantID), adminID)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req.WithContext(ctx))
		return w.Code
	}
	for i := 0; i < 5; i++ {
		if code := put(1, admin.ID, fmt.Sprintf("salah-%d", i), "passwordbaru123"); code != http.StatusUnauthorized {
			t.Fatalf("wrong attempt %d = %d, want 401", i, code)
		}
	}
	if code := put(1, admin.ID, "password123", "passwordbaru123"); code != http.StatusTooManyRequests {
		t.Fatalf("after 5 wrong attempts the correct password must still be locked out (429), got %d", code)
	}
	// Another account is not affected.
	if code := put(2, other.ID, "password123", "passwordbaru123"); code != http.StatusOK {
		t.Fatalf("other admin = %d, want 200", code)
	}
	// Over 72 bytes is a 400, not a 500.
	if code := put(2, other.ID, "passwordbaru123", string(bytes.Repeat([]byte("p"), 73))); code != http.StatusBadRequest {
		t.Fatalf("73-byte password = %d, want 400", code)
	}
}

// POST /api/dashboard/tenant/targets/{id}/close before period_end: 409 with code "period_not_ended"
// unless force is sent as ?force=true or JSON {"force": true}.
func TestBH4_CloseTargetForceContract(t *testing.T) {
	router, targetRepo, _, _, _, t1, _, _, _ := setupAgentTargetTestEnv()
	now := time.Now()
	newTarget := func() *repository.AgentTarget {
		tg := &repository.AgentTarget{Title: strPtr("BH4"), MetricType: "closing_pax", MetricValue: 1, RewardDescription: strPtr("x"),
			PeriodStart: now.AddDate(0, 0, -5).Format("2006-01-02"), PeriodEnd: now.AddDate(0, 0, 5).Format("2006-01-02"), Status: "active"}
		_ = targetRepo.Create(context.Background(), t1.ID, tg)
		return tg
	}
	post := func(path string, body []byte) (int, map[string]any) {
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer tok-admin-t1")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}

	tg := newTarget()
	code, out := post(fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", tg.ID), nil)
	if code != http.StatusConflict || out["code"] != "period_not_ended" {
		t.Fatalf("no force = %d %v, want 409 period_not_ended", code, out)
	}
	if code, _ := post(fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", tg.ID), []byte(`{"force":false}`)); code != http.StatusConflict {
		t.Fatalf("force false = %d, want 409", code)
	}
	if code, out := post(fmt.Sprintf("/api/dashboard/tenant/targets/%d/close", tg.ID), []byte(`{"force":true}`)); code != http.StatusOK {
		t.Fatalf("body force = %d %v, want 200", code, out)
	}
	tg2 := newTarget()
	if code, out := post(fmt.Sprintf("/api/dashboard/tenant/targets/%d/close?force=true", tg2.ID), nil); code != http.StatusOK {
		t.Fatalf("query force = %d %v, want 200", code, out)
	}
}
