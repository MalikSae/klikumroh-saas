package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
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

// mockAccessLogRepo implements repository.AccessLogRepository in memory with strict tenant filtering.
type mockAccessLogRepo struct {
	logs []repository.AccessLog
}

func (m *mockAccessLogRepo) Create(ctx context.Context, tenantID uint64, l *repository.AccessLog) error {
	l.ID = uint64(len(m.logs) + 1)
	l.TenantID = tenantID
	l.AccessedAt = time.Now()
	m.logs = append(m.logs, *l)
	return nil
}

func (m *mockAccessLogRepo) ListByTenant(ctx context.Context, tenantID uint64, limit int) ([]repository.AccessLog, error) {
	out := make([]repository.AccessLog, 0)
	for _, l := range m.logs {
		if l.TenantID == tenantID {
			out = append(out, l)
		}
	}
	return out, nil
}

func (m *mockAccessLogRepo) ExistsRecentRequest(ctx context.Context, tenantID uint64, sessionID uint64, method, path string, window time.Duration) (bool, error) {
	for _, l := range m.logs {
		if l.TenantID == tenantID && l.SessionID != nil && *l.SessionID == sessionID &&
			l.HTTPMethod != nil && *l.HTTPMethod == method && l.Path != nil && *l.Path == path &&
			time.Since(l.AccessedAt) <= window {
			return true, nil
		}
	}
	return false, nil
}

func (m *mockAccessLogRepo) countForTenant(tenantID uint64, action string) int {
	n := 0
	for _, l := range m.logs {
		if l.TenantID == tenantID && l.Action == action {
			n++
		}
	}
	return n
}

func seedAdmin(env *testEnv, tenantID, adminID uint64, email string) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("OldPassword123"), bcrypt.DefaultCost)
	_ = env.adminUserRepo.Create(context.Background(), tenantID, &repository.AdminUser{
		ID:           adminID,
		Name:         "Admin " + email,
		Email:        email,
		PasswordHash: string(hash),
		Status:       "active",
	})
}

func doJSON(r http.Handler, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func listAccessLogs(t *testing.T, r http.Handler, token string) []repository.AccessLog {
	t.Helper()
	w := doJSON(r, http.MethodGet, "/api/dashboard/access-logs", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 listing access logs, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		AccessLogs []repository.AccessLog `json:"access_logs"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode access logs: %v", err)
	}
	return resp.AccessLogs
}

func TestAccessLog_ImpersonateRequiresReason(t *testing.T) {
	env := setupStaffTenantDetailEnv()
	seedAdmin(env, 53, 101, "ahmad@albarakah.com")

	cases := []struct {
		name string
		body interface{}
	}{
		{"missing body", nil},
		{"empty reason", map[string]string{"reason": "   "}},
		{"reason too short", map[string]string{"reason": "cek data"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sessionsBefore := len(env.sessionRepo.sessions)
			w := doJSON(env.router, http.MethodPost, "/api/staff/tenants/53/impersonate", "valid-staff-token", tc.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
			}
			if len(env.sessionRepo.sessions) != sessionsBefore {
				t.Fatalf("impersonation session created despite invalid reason")
			}
			if len(env.accessLogRepo.logs) != 0 {
				t.Fatalf("expected no access log for rejected impersonation, got %d", len(env.accessLogRepo.logs))
			}
		})
	}
}

func TestAccessLog_ImpersonationFlowIsAuditedAndTenantIsolated(t *testing.T) {
	env := setupStaffTenantDetailEnv()
	seedAdmin(env, 53, 101, "ahmad@albarakah.com")
	seedAdmin(env, 78, 201, "admin@nuriman.com")

	// Tenant 78 has its own admin session.
	env.sessionRepo.sessions["token-tenant-78"] = &repository.Session{
		ID: 2, TenantID: 78, AdminUserID: 201, Token: "token-tenant-78", ExpiresAt: time.Now().Add(time.Hour),
	}

	reason := "Membantu investigasi laporan prospek ganda"
	w := doJSON(env.router, http.MethodPost, "/api/staff/tenants/53/impersonate", "valid-staff-token", map[string]string{"reason": reason})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 impersonate, got %d: %s", w.Code, w.Body.String())
	}
	var res struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)

	session := env.sessionRepo.sessions[res.Token]
	if session == nil || session.ImpersonatedByStaffID == nil || *session.ImpersonatedByStaffID != 1 {
		t.Fatalf("expected impersonation session marked with staff id 1, got %+v", session)
	}

	t.Run("Impersonation start is logged with reason", func(t *testing.T) {
		if env.accessLogRepo.countForTenant(53, repository.AccessActionImpersonateStart) != 1 {
			t.Fatalf("expected 1 %s log for tenant 53", repository.AccessActionImpersonateStart)
		}
		if env.accessLogRepo.logs[0].Reason == nil || *env.accessLogRepo.logs[0].Reason != reason {
			t.Fatalf("expected reason stored, got %v", env.accessLogRepo.logs[0].Reason)
		}
	})

	t.Run("Dashboard request with impersonation token is logged under tenant 53", func(t *testing.T) {
		logs := listAccessLogs(t, env.router, res.Token)
		if env.accessLogRepo.countForTenant(53, repository.AccessActionImpersonateRequest) != 1 {
			t.Fatalf("expected impersonated dashboard request logged for tenant 53")
		}
		for _, l := range logs {
			if l.TenantID != 53 {
				t.Fatalf("CROSS-TENANT LEAK: tenant 53 listing returned log of tenant %d", l.TenantID)
			}
		}
	})

	t.Run("Tenant 53 real admin sees staff access records", func(t *testing.T) {
		logs := listAccessLogs(t, env.router, "token-tenant-53")
		if len(logs) < 2 {
			t.Fatalf("expected at least 2 logs visible to tenant 53, got %d", len(logs))
		}
	})

	t.Run("Tenant 78 cannot see tenant 53 access records", func(t *testing.T) {
		logs := listAccessLogs(t, env.router, "token-tenant-78")
		if len(logs) != 0 {
			t.Fatalf("CROSS-TENANT LEAK: tenant 78 sees %d access logs belonging to tenant 53", len(logs))
		}
	})

	t.Run("Regular admin requests are not logged as staff access", func(t *testing.T) {
		before := len(env.accessLogRepo.logs)
		listAccessLogs(t, env.router, "token-tenant-78")
		if len(env.accessLogRepo.logs) != before {
			t.Fatalf("regular admin request must not create access logs")
		}
	})
}

func TestAccessLog_StaffTenantActionsAreLogged(t *testing.T) {
	env := setupStaffTenantDetailEnv()
	seedAdmin(env, 53, 101, "ahmad@albarakah.com")
	seedAdmin(env, 78, 201, "admin@nuriman.com")

	t.Run("View tenant detail logs only the viewed tenant", func(t *testing.T) {
		w := doJSON(env.router, http.MethodGet, "/api/staff/tenants/53", "valid-staff-token", nil)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if env.accessLogRepo.countForTenant(53, repository.AccessActionViewTenantDetail) != 1 {
			t.Fatalf("expected detail view logged for tenant 53")
		}
		if n := len(env.accessLogRepo.logs); n != 1 {
			t.Fatalf("expected exactly 1 log, got %d", n)
		}
	})

	t.Run("Reset admin password is logged", func(t *testing.T) {
		w := doJSON(env.router, http.MethodPatch, "/api/staff/tenants/53/admin-users/101/reset-password", "valid-staff-token",
			map[string]string{"new_password": "BrandNewPassword888"})
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if env.accessLogRepo.countForTenant(53, repository.AccessActionResetAdminPassword) != 1 {
			t.Fatalf("expected reset password logged for tenant 53")
		}
		for _, l := range env.accessLogRepo.logs {
			if l.Reason != nil && bytes.Contains([]byte(*l.Reason), []byte("BrandNewPassword888")) {
				t.Fatalf("SECURITY VIOLATION: plain password written into access log")
			}
		}
	})

	t.Run("Cross-tenant reset attempt (404) is not logged against either tenant", func(t *testing.T) {
		before := len(env.accessLogRepo.logs)
		w := doJSON(env.router, http.MethodPatch, "/api/staff/tenants/53/admin-users/201/reset-password", "valid-staff-token",
			map[string]string{"new_password": "AnotherPassword777"})
		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
		if len(env.accessLogRepo.logs) != before {
			t.Fatalf("expected no log for rejected cross-tenant reset")
		}
		if env.accessLogRepo.countForTenant(78, repository.AccessActionResetAdminPassword) != 0 {
			t.Fatalf("CROSS-TENANT LEAK: reset log written to tenant 78")
		}
	})
}

func TestAccessLog_StaffTenantDetailFailsClosedWithoutLogger(t *testing.T) {
	env := setupStaffTenantDetailEnv()

	// Staff service without an access log repository must refuse tenant data access.
	staffService := service.NewStaffService(env.staffRepo, env.tenantRepo, env.domainRepo, env.planRepo,
		env.packageRepo, env.prospectRepo, env.agentRepo, env.adminUserRepo, env.sessionRepo)
	staffHandler := handler.NewStaffHandler(staffService)

	r := chi.NewRouter()
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(middleware.StaffAuthMiddleware(env.staffRepo, env.sessionRepo))
		staffProtected.Get("/api/staff/tenants/{id}", staffHandler.GetTenantDetail)
		staffProtected.Post("/api/staff/tenants/{id}/impersonate", staffHandler.ImpersonateTenant)
	})

	w := doJSON(r, http.MethodGet, "/api/staff/tenants/53", "valid-staff-token", nil)
	if w.Code == http.StatusOK {
		t.Fatalf("SECURITY VIOLATION: tenant detail returned without access log, body=%s", w.Body.String())
	}

	sessionsBefore := len(env.sessionRepo.sessions)
	w = doJSON(r, http.MethodPost, "/api/staff/tenants/53/impersonate", "valid-staff-token",
		map[string]string{"reason": "Membantu investigasi laporan prospek ganda"})
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 impersonate without logger, got %d", w.Code)
	}
	if len(env.sessionRepo.sessions) != sessionsBefore {
		t.Fatalf("SECURITY VIOLATION: impersonation session created without access log")
	}
}
