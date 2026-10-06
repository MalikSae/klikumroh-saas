package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
)

// Isolation audit I2/I3: transfer proofs are served only through authenticated endpoints, to the right
// tenant/agent; /uploads serves neither private files nor directory listings.
func TestPrivateFiles_AccessRules(t *testing.T) {
	// Tenant 987654 exists only in this test; its folders are removed afterwards.
	_, storageExisted := os.Stat("storage")
	t.Cleanup(func() {
		_ = os.RemoveAll("storage/private/987654")
		_ = os.RemoveAll("uploads/987654")
		if storageExisted != nil {
			_ = os.RemoveAll("storage")
		}
	})
	write := func(p string) {
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("RIFFxxxxWEBP"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("storage/private/987654/subscription-proofs/abc.webp")
	write("storage/private/987654/agents/3/bukti-transfer.webp")
	write("uploads/987654/subscription-proofs/legacy.webp") // stored before the move: still private
	write("uploads/987654/packages/1/photo.webp")

	withTenant := func(h http.HandlerFunc, tenantID uint64, agentID uint64) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.WithTenantID(r.Context(), tenantID)
			if agentID != 0 {
				ctx = middleware.WithAgentID(ctx, agentID)
			}
			h(w, r.WithContext(context.Context(ctx)))
		})
	}
	get := func(h http.Handler, url string) int {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", url, nil))
		return rec.Code
	}

	cases := []struct {
		name string
		h    http.Handler
		url  string
		want int
	}{
		{"admin own subscription proof", withTenant(handler.ServeDashboardPrivateFile, 987654, 0), "/api/dashboard/files?path=/uploads/987654/subscription-proofs/abc.webp", 200},
		{"admin own legacy proof", withTenant(handler.ServeDashboardPrivateFile, 987654, 0), "/api/dashboard/files?path=/uploads/987654/subscription-proofs/legacy.webp", 200},
		{"admin own agent proof", withTenant(handler.ServeDashboardPrivateFile, 987654, 0), "/api/dashboard/files?path=/uploads/987654/agents/3/bukti-transfer.webp", 200},
		{"admin of another tenant", withTenant(handler.ServeDashboardPrivateFile, 987655, 0), "/api/dashboard/files?path=/uploads/987654/subscription-proofs/abc.webp", 404},
		{"admin path traversal", withTenant(handler.ServeDashboardPrivateFile, 987654, 0), "/api/dashboard/files?path=/uploads/987654/subscription-proofs/../../../go.mod", 404},
		{"admin non-private file", withTenant(handler.ServeDashboardPrivateFile, 987654, 0), "/api/dashboard/files?path=/uploads/987654/packages/1/photo.webp", 404},
		{"agent own proof", withTenant(handler.ServeAgentPrivateFile, 987654, 3), "/api/agent/files?path=/uploads/987654/agents/3/bukti-transfer.webp", 200},
		{"agent another agent's proof", withTenant(handler.ServeAgentPrivateFile, 987654, 4), "/api/agent/files?path=/uploads/987654/agents/3/bukti-transfer.webp", 404},
		{"agent subscription proof", withTenant(handler.ServeAgentPrivateFile, 987654, 3), "/api/agent/files?path=/uploads/987654/subscription-proofs/abc.webp", 404},
		{"staff any tenant", http.HandlerFunc(handler.ServeStaffPrivateFile), "/api/staff/files?path=/uploads/987654/subscription-proofs/abc.webp", 200},
		{"staff agent proof (only via impersonation)", http.HandlerFunc(handler.ServeStaffPrivateFile), "/api/staff/files?path=/uploads/987654/agents/3/bukti-transfer.webp", 404},
		{"public /uploads private file", handler.PublicUploadsHandler("./uploads"), "/uploads/987654/subscription-proofs/legacy.webp", 404},
		{"public /uploads directory listing", handler.PublicUploadsHandler("./uploads"), "/uploads/987654/", 404},
		{"public /uploads package photo", handler.PublicUploadsHandler("./uploads"), "/uploads/987654/packages/1/photo.webp", 200},
	}
	for _, c := range cases {
		if got := get(c.h, c.url); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}
