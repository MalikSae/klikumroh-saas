package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"klikumroh/internal/middleware"
)

// Bug hunt round 4 (LOW), middleware part.

// L3: the impersonation access log keeps the query string, so two different private files opened within
// the dedup window are two rows, and the same file twice is still one.
func TestBH4_ImpersonationLogKeepsQueryString(t *testing.T) {
	logRepo := &mockAccessLogRepo{}
	h := middleware.AuthMiddleware(newImpersonationSessionRepo(), logRepo)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for _, p := range []string{
		"/api/dashboard/files?path=/uploads/100/agent-proofs/1/a.webp",
		"/api/dashboard/files?path=/uploads/100/agent-proofs/2/b.webp",
		"/api/dashboard/files?path=/uploads/100/agent-proofs/1/a.webp",
	} {
		if rr := serveWithToken(h, http.MethodGet, p, "impersonation_token"); rr.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", p, rr.Code)
		}
	}
	if len(logRepo.logs) != 2 {
		t.Fatalf("want 2 rows (two files, the repeat deduplicated), got %d", len(logRepo.logs))
	}
	if got := *logRepo.logs[1].Path; got != "/api/dashboard/files?path=/uploads/100/agent-proofs/2/b.webp" {
		t.Fatalf("second row path = %q", got)
	}
}

// L11: per-IP limiter keys group an IPv6 /64; IPv4 stays per address.
func TestBH4_RateLimitIPKey(t *testing.T) {
	cases := map[string]string{
		"203.0.113.7":                   "203.0.113.7",
		"2001:db8:1:2:aaaa::1":          "2001:db8:1:2::/64",
		"2001:db8:1:2:ffff:ffff:ffff:1": "2001:db8:1:2::/64",
		"2001:db8:1:3::1":               "2001:db8:1:3::/64",
		"::ffff:203.0.113.7":            "::ffff:203.0.113.7",
		"not-an-ip":                     "not-an-ip",
	}
	for in, want := range cases {
		if got := middleware.RateLimitIPKey(in); got != want {
			t.Errorf("RateLimitIPKey(%q) = %q, want %q", in, got, want)
		}
	}

	// Rotating addresses inside one /64 shares the budget.
	limit := middleware.NewIPRateLimiter(2, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	codes := []int{}
	for _, addr := range []string{"[2001:db8:9:9::1]:1000", "[2001:db8:9:9::2]:1000", "[2001:db8:9:9::3]:1000"} {
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		req.RemoteAddr = addr
		rec := httptest.NewRecorder()
		limit.ServeHTTP(rec, req)
		codes = append(codes, rec.Code)
	}
	if codes[0] != http.StatusNoContent || codes[1] != http.StatusNoContent || codes[2] != http.StatusTooManyRequests {
		t.Fatalf("same /64 must share the limit, got %v", codes)
	}
}

// L9: the demo travel cannot deactivate/reject its shared agents or change its public identity.
func TestBH4_DemoGuardAgentsAndIdentity(t *testing.T) {
	for _, c := range []struct{ method, path string }{
		{http.MethodPatch, "/api/dashboard/agents/5/toggle-status"},
		{http.MethodPatch, "/api/dashboard/agents/5/reject"},
		{http.MethodPut, "/api/dashboard/tenant/profile"},
		{http.MethodPost, "/api/dashboard/tenant/branding/logo"},
		{http.MethodDelete, "/api/dashboard/tenant/branding/logo"},
		{http.MethodPut, "/api/dashboard/tenant/whatsapp"},
	} {
		if !middleware.IsDemoBlocked(c.method, c.path) {
			t.Errorf("%s %s must be blocked on the demo travel", c.method, c.path)
		}
	}
	for _, c := range []struct{ method, path string }{
		{http.MethodPatch, "/api/dashboard/agents/5/approve"},
		{http.MethodPut, "/api/dashboard/tenant/branding"},
		{http.MethodGet, "/api/dashboard/tenant/profile"},
	} {
		if middleware.IsDemoBlocked(c.method, c.path) {
			t.Errorf("%s %s must stay allowed on the demo travel", c.method, c.path)
		}
	}
}
