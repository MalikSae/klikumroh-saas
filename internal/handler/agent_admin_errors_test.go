package handler_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// failingAgentRepo makes the write methods fail like a database would (raw driver text).
type failingAgentRepo struct {
	*mockAgentRepo
	fail error
}

func (f *failingAgentRepo) UpdateStatus(ctx context.Context, tenantID, id uint64, status string) error {
	return f.fail
}

func (f *failingAgentRepo) UpdatePassword(ctx context.Context, tenantID, id uint64, hash string) error {
	return f.fail
}

func (f *failingAgentRepo) UpdateProfile(ctx context.Context, tenantID, id uint64, p repository.UpdateAgentProfileParams) (*repository.Agent, error) {
	return nil, f.fail
}

type agentAdminErrEnv struct {
	admin, agent http.Handler
	agentRepo    *mockAgentRepo
	ag1, ag2     *repository.Agent
	agentToken   string
}

func newAgentAdminErrEnv(t *testing.T, fail error) *agentAdminErrEnv {
	t.Helper()
	_, _, _, agentRepo, agentSessionRepo, tenantRepo, commRepo, payoutRepo, adminSessionRepo, t1, _, ag1, ag2, sess1 := setupAgentAdminDetailTestEnv()
	var repo repository.AgentRepository = agentRepo
	if fail != nil {
		repo = &failingAgentRepo{mockAgentRepo: agentRepo, fail: fail}
	}
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	svc := service.NewAgentService(repo, agentSessionRepo, tenantRepo, commRepo, prospectRepo, payoutRepo, nil, nil, nil)
	h := handler.NewAgentHandler(svc)

	adminSessionRepo.sessions["admin-err-t1"] = &repository.Session{ID: 7, Token: "admin-err-t1", TenantID: t1.ID, AdminUserID: 99, ExpiresAt: time.Now().Add(time.Hour)}
	admin := chi.NewRouter()
	admin.Use(middleware.AuthMiddleware(adminSessionRepo))
	h.RegisterDashboardRoutes(admin)

	agent := chi.NewRouter()
	agent.Use(middleware.AgentAuthMiddleware(agentSessionRepo))
	h.RegisterAgentProtectedRoutes(agent)

	return &agentAdminErrEnv{admin: admin, agent: agent, agentRepo: agentRepo, ag1: ag1, ag2: ag2, agentToken: sess1.Token}
}

func (e *agentAdminErrEnv) adminDo(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
	req.Header.Set("Authorization", "Bearer admin-err-t1")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	e.admin.ServeHTTP(rr, req)
	return rr
}

func (e *agentAdminErrEnv) agentPut(body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPut, "/api/agent/profile", bytes.NewReader([]byte(body)))
	req.Header.Set("Authorization", "Bearer "+e.agentToken)
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.WithTenantID(req.Context(), e.ag1.TenantID))
	rr := httptest.NewRecorder()
	e.agent.ServeHTTP(rr, req)
	return rr
}

// M8: database failures are answered 500 "internal server error" without the driver text.
func TestAgentAdmin_DBErrorsAreNotLeaked(t *testing.T) {
	e := newAgentAdminErrEnv(t, errors.New("Error 1205 (HY000): Lock wait timeout exceeded"))
	cases := []struct{ method, path, body string }{
		{http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", e.ag1.ID), `{"action":"deactivate"}`},
		{http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/reset-password", e.ag1.ID), `{"new_password":"rahasia123"}`},
		{http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"name":"Nama Baru"}`},
	}
	for _, c := range cases {
		rr := e.adminDo(c.method, c.path, c.body)
		if rr.Code != http.StatusInternalServerError {
			t.Fatalf("%s %s: expected 500, got %d (%s)", c.method, c.path, rr.Code, rr.Body.String())
		}
		if strings.Contains(rr.Body.String(), "1205") || errorOf(rr) != "internal server error" {
			t.Fatalf("%s %s: raw error leaked: %s", c.method, c.path, rr.Body.String())
		}
	}
}

// M8: known validation errors stay 400 with readable text, duplicates are 409, other tenants 404.
func TestAgentAdmin_ValidationAndDuplicateCodes(t *testing.T) {
	e := newAgentAdminErrEnv(t, nil)

	long := strings.Repeat("a", 151)
	rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"domisili":"`+long+`"}`)
	if rr.Code != http.StatusBadRequest || errorOf(rr) != "domisili maksimal 150 karakter" {
		t.Fatalf("long domisili (admin): got %d %s", rr.Code, rr.Body.String())
	}
	if rr := e.agentPut(`{"domisili":"` + long + `"}`); rr.Code != http.StatusBadRequest || errorOf(rr) != "domisili maksimal 150 karakter" {
		t.Fatalf("long domisili (agent): got %d %s", rr.Code, rr.Body.String())
	}
	ok150 := strings.Repeat("b", 150)
	if rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"domisili":"`+ok150+`"}`); rr.Code != http.StatusOK {
		t.Fatalf("150-char domisili: expected 200, got %d %s", rr.Code, rr.Body.String())
	}

	otherPhone := "081999999998"
	other := &repository.Agent{TenantID: e.ag1.TenantID, Name: "Lain", Phone: &otherPhone, Status: "active", ReferralCode: "LAIN1"}
	_ = e.agentRepo.Create(context.Background(), e.ag1.TenantID, other)
	if rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"phone":"6281999999998"}`); rr.Code != http.StatusConflict {
		t.Fatalf("duplicate phone: expected 409, got %d %s", rr.Code, rr.Body.String())
	}

	if rr := e.adminDo(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", e.ag1.ID), `{"action":"hapus"}`); rr.Code != http.StatusBadRequest || !strings.Contains(errorOf(rr), "aksi tidak valid") {
		t.Fatalf("invalid action: got %d %s", rr.Code, rr.Body.String())
	}
	if rr := e.adminDo(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/toggle-status", e.ag1.ID), `{"action":"activate"}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("activate an active agent: expected 400, got %d %s", rr.Code, rr.Body.String())
	}
	if rr := e.adminDo(http.MethodPatch, fmt.Sprintf("/api/dashboard/agents/%d/reset-password", e.ag1.ID), `{"new_password":"pendek"}`); rr.Code != http.StatusBadRequest || errorOf(rr) != "password minimal 8 karakter" {
		t.Fatalf("short password: got %d %s", rr.Code, rr.Body.String())
	}
	if rr := e.adminDo(http.MethodPut, "/api/dashboard/tenant/target-settings", `{"target_period_start":"01-10-2026","target_period_end":"2026-10-31"}`); rr.Code != http.StatusBadRequest || errorOf(rr) != "format tanggal harus YYYY-MM-DD" {
		t.Fatalf("bad target date: got %d %s", rr.Code, rr.Body.String())
	}

	// Cross-tenant: tenant 1's admin cannot edit tenant 2's agent.
	if rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag2.ID), `{"name":"Diambil"}`); rr.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant edit: expected 404, got %d", rr.Code)
	}
	if e.ag2.Name == "Diambil" {
		t.Fatal("tenant 2's agent was modified")
	}
}

// R1: a legacy agent whose stored phone fails today's rule can still have other fields edited (the
// clients always resend the phone); changing the phone to another invalid value is refused.
func TestAgentProfile_LegacyInvalidPhoneStillEditable(t *testing.T) {
	e := newAgentAdminErrEnv(t, nil)
	legacy := "12345"
	e.agentRepo.agents[e.ag1.ID].Phone = &legacy

	rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"name":"Nama Diperbarui","phone":"12345","domisili":"Bandung"}`)
	if rr.Code != http.StatusOK {
		t.Fatalf("admin edit with unchanged legacy phone: expected 200, got %d %s", rr.Code, rr.Body.String())
	}
	if e.agentRepo.agents[e.ag1.ID].Name != "Nama Diperbarui" {
		t.Fatal("name not saved")
	}
	if rr := e.agentPut(`{"name":"Nama Agen","phone":"12345","domisili":"Bogor"}`); rr.Code != http.StatusOK {
		t.Fatalf("agent edit with unchanged legacy phone: expected 200, got %d %s", rr.Code, rr.Body.String())
	}

	if rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"phone":"99999"}`); rr.Code != http.StatusBadRequest || errorOf(rr) != service.ErrInvalidAgentPhone.Error() {
		t.Fatalf("changed invalid phone (admin): expected 400, got %d %s", rr.Code, rr.Body.String())
	}
	if rr := e.agentPut(`{"phone":"99999"}`); rr.Code != http.StatusBadRequest || errorOf(rr) != service.ErrInvalidAgentPhone.Error() {
		t.Fatalf("changed invalid phone (agent): expected 400, got %d %s", rr.Code, rr.Body.String())
	}
	if rr := e.adminDo(http.MethodPut, fmt.Sprintf("/api/dashboard/agents/%d", e.ag1.ID), `{"phone":"081234567890"}`); rr.Code != http.StatusOK {
		t.Fatalf("changing to a valid phone: expected 200, got %d %s", rr.Code, rr.Body.String())
	}
}
