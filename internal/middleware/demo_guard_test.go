package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"klikumroh/internal/middleware"
)

// Demo travel guard: blocked actions answer 403 only for the demo travel; everything else passes, and a
// normal travel is never affected.
func TestDemoGuard(t *testing.T) {
	const demoTenant, normalTenant = 1, 2
	isDemo := func(_ context.Context, id uint64) bool { return id == demoTenant }
	h := middleware.DemoGuard(isDemo)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	call := func(tenantID uint64, method, path string) int {
		req := httptest.NewRequest(method, path, nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantID))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}

	cases := []struct {
		name         string
		method, path string
		demo, normal int
	}{
		{"own password", http.MethodPut, "/api/dashboard/me/password", 403, 204},
		{"own profile", http.MethodPut, "/api/dashboard/me", 403, 204},
		{"add team member", http.MethodPost, "/api/dashboard/team", 403, 204},
		{"reset agent password", http.MethodPatch, "/api/dashboard/agents/12/reset-password", 403, 204},
		{"custom domain", http.MethodPost, "/api/dashboard/domains", 403, 204},
		{"delete domain", http.MethodDelete, "/api/dashboard/domains/3", 403, 204},
		{"meta settings", http.MethodPut, "/api/dashboard/meta-integration", 403, 204},
		{"agent password", http.MethodPut, "/api/agent/password", 403, 204},
		{"change prospect status (allowed)", http.MethodPatch, "/api/dashboard/prospects/5/status", 204, 204},
		{"edit package (allowed)", http.MethodPut, "/api/dashboard/packages/9", 204, 204},
		{"read profile (allowed)", http.MethodGet, "/api/dashboard/me", 204, 204},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := call(demoTenant, c.method, c.path); got != c.demo {
				t.Fatalf("demo travel: %s %s = %d, want %d", c.method, c.path, got, c.demo)
			}
			if got := call(normalTenant, c.method, c.path); got != c.normal {
				t.Fatalf("normal travel: %s %s = %d, want %d", c.method, c.path, got, c.normal)
			}
		})
	}
}
