package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
)

// Demo travel guard (3 Oct 2026). demo.klikumroh.id shares one admin and one agent login with every
// visitor and is rebuilt every night, so everything else may be tried freely. What is blocked here would
// lock other visitors out (password, profile email, team), point the demo at a real outside system
// (custom domain, Meta Pixel / Conversions API) or is not a showcase action at all.
type demoRule struct {
	method string
	path   *regexp.Regexp
}

var demoBlocked = []demoRule{
	{http.MethodPut, regexp.MustCompile(`^/api/dashboard/me$`)},
	{http.MethodPut, regexp.MustCompile(`^/api/dashboard/me/password$`)},
	{http.MethodPost, regexp.MustCompile(`^/api/dashboard/team$`)},
	{http.MethodPatch, regexp.MustCompile(`^/api/dashboard/team/[^/]+/toggle-status$`)},
	{http.MethodPatch, regexp.MustCompile(`^/api/dashboard/team/[^/]+/role$`)},
	{http.MethodPatch, regexp.MustCompile(`^/api/dashboard/agents/[^/]+/reset-password$`)},
	// Deactivating or rejecting the shared demo agents would end their sessions and break the agent
	// demo login for every visitor until the nightly rebuild.
	{http.MethodPatch, regexp.MustCompile(`^/api/dashboard/agents/[^/]+/toggle-status$`)},
	{http.MethodPatch, regexp.MustCompile(`^/api/dashboard/agents/[^/]+/reject$`)},
	// The public demo site's identity: travel profile, logo and WhatsApp number.
	{http.MethodPut, regexp.MustCompile(`^/api/dashboard/tenant/profile$`)},
	{http.MethodPost, regexp.MustCompile(`^/api/dashboard/tenant/branding/logo$`)},
	{http.MethodDelete, regexp.MustCompile(`^/api/dashboard/tenant/branding/logo$`)},
	{http.MethodPut, regexp.MustCompile(`^/api/dashboard/tenant/whatsapp$`)},
	{http.MethodPut, regexp.MustCompile(`^/api/dashboard/meta-integration$`)},
	{http.MethodPost, regexp.MustCompile(`^/api/dashboard/meta-integration/test$`)},
	{http.MethodPost, regexp.MustCompile(`^/api/dashboard/domains(/.*)?$`)},
	{http.MethodDelete, regexp.MustCompile(`^/api/dashboard/domains/.+$`)},
	{http.MethodPut, regexp.MustCompile(`^/api/agent/password$`)},
	// Billing: a renewal request or proof from the demo would be a real invoice for staff to review.
	{http.MethodPost, regexp.MustCompile(`^/api/dashboard/subscription(/.*)?$`)},
	{http.MethodPut, regexp.MustCompile(`^/api/dashboard/subscription(/.*)?$`)},
	{http.MethodPatch, regexp.MustCompile(`^/api/dashboard/subscription(/.*)?$`)},
	{http.MethodDelete, regexp.MustCompile(`^/api/dashboard/subscription(/.*)?$`)},
}

// DemoBlockedMessage is the error shown for a blocked action.
const DemoBlockedMessage = "Fitur ini tidak tersedia di akun demo."

// IsDemoBlocked reports whether a request is one of the actions closed on the demo travel.
func IsDemoBlocked(method, path string) bool {
	for _, rule := range demoBlocked {
		if rule.method == method && rule.path.MatchString(path) {
			return true
		}
	}
	return false
}

// DemoGuard answers 403 to the blocked actions when the signed-in user's travel is the demo travel.
// isDemo is only asked for a blocked action, so normal requests cost nothing extra. Place it after the
// auth middleware (the tenant comes from the session).
func DemoGuard(isDemo func(ctx context.Context, tenantID uint64) bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if IsDemoBlocked(r.Method, r.URL.Path) {
				if tenantID, ok := GetTenantID(r.Context()); ok && isDemo(r.Context(), tenantID) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					_ = json.NewEncoder(w).Encode(map[string]string{"error": DemoBlockedMessage})
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
