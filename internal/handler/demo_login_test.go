package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// "Coba demo": a password-less sign-in that only works for a travel marked is_demo, never for a real one.
func TestDemoLogin_AdminOnlyForDemoTravel(t *testing.T) {
	tenantRepo := newMockTenantRepo()
	real := &repository.Tenant{Name: "Travel Asli", Slug: "demo", Status: "active"}
	_ = tenantRepo.Create(context.Background(), real)
	adminUsers := &mockAdminUserRepo{users: map[string]*repository.AdminUser{
		"admin@asli.id": {ID: 1, TenantID: real.ID, Email: "admin@asli.id", Name: "Admin Asli", Status: "active"},
	}}
	sessions := &mockSessionRepo{sessions: map[string]*repository.Session{}}
	r := chi.NewRouter()
	handler.NewAuthHandler(service.NewAuthService(adminUsers, sessions, tenantRepo)).RegisterRoutes(r)

	post := func() *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/auth/demo-login", nil))
		return rec
	}

	t.Run("slug of a real travel: 404, no session", func(t *testing.T) {
		if rec := post(); rec.Code != http.StatusNotFound {
			t.Fatalf("real travel signed in: %d %s", rec.Code, rec.Body.String())
		}
		if len(sessions.sessions) != 0 {
			t.Fatalf("session created for a real travel")
		}
	})

	t.Run("demo travel: signed in as its admin", func(t *testing.T) {
		real.IsDemo = true
		rec := post()
		if rec.Code != http.StatusOK {
			t.Fatalf("demo login: %d %s", rec.Code, rec.Body.String())
		}
		var body map[string]interface{}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		if body["token"] == nil || body["token"] == "" {
			t.Fatalf("no token: %v", body)
		}
	})
}

func TestDemoLogin_AgentOnlyForDemoTravel(t *testing.T) {
	r, agentRepo, _, _, t1, t2 := setupAgentTestRouter()
	hash, _ := util.HashPassword("rahasia123")
	for _, tn := range []*repository.Tenant{t1, t2} {
		a := &repository.Agent{Name: "Agen " + tn.Slug, Status: "active", ReferralCode: "DL-" + tn.Slug, PasswordHash: &hash}
		if err := agentRepo.Create(context.Background(), tn.ID, a); err != nil {
			t.Fatalf("create agent: %v", err)
		}
	}
	t2.IsDemo = true

	post := func(tenantID uint64) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/agent/demo-login", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantID))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}

	if rec := post(t1.ID); rec.Code != http.StatusNotFound {
		t.Fatalf("real travel agent signed in without password: %d %s", rec.Code, rec.Body.String())
	}
	rec := post(t2.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("demo agent login: %d %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Token string `json:"token"`
		Agent struct {
			Name string `json:"name"`
		} `json:"agent"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.Token == "" || body.Agent.Name != "Agen "+t2.Slug {
		t.Fatalf("unexpected demo agent session: %s", rec.Body.String())
	}
}
