package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// L1: a pending (or inactive) travel may read its own transfer proof through /api/dashboard/files, so the
// invoice page can preview the proof it just uploaded. Other private files stay blocked (402).
func TestSubscriptionEnforcement_PendingTravelSeesOwnProof(t *testing.T) {
	repo := &mockTenantRepoEnforce{tenants: map[uint64]*repository.Tenant{
		4: {ID: 4, Slug: "pending-travel", Status: "pending"},
		5: {ID: 5, Slug: "inactive-travel", Status: "inactive"},
	}}
	h := middleware.SubscriptionEnforcementMiddleware(repo)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	call := func(tenantID uint64, method, url string) int {
		req := httptest.NewRequest(method, url, nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantID))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	for _, tid := range []uint64{4, 5} {
		if got := call(tid, http.MethodGet, "/api/dashboard/files?path=/uploads/4/subscription-proofs/abc.webp"); got != http.StatusNoContent {
			t.Fatalf("tenant %d: subscription proof must pass to the handler (tenant-checked there), got %d", tid, got)
		}
		if got := call(tid, http.MethodGet, "/api/dashboard/files?path=/uploads/4/agents/7/bukti-transfer.webp"); got != http.StatusPaymentRequired {
			t.Fatalf("tenant %d: agent proof must stay blocked, got %d", tid, got)
		}
		if got := call(tid, http.MethodDelete, "/api/dashboard/files?path=/uploads/4/subscription-proofs/abc.webp"); got != http.StatusPaymentRequired {
			t.Fatalf("tenant %d: only GET passes, got %d", tid, got)
		}
	}
}
