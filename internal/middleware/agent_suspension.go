package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// agentSuspendedAllowedPrefixes stay writable for agents while their travel is suspended: their own
// account (logout, password, profile) and their commission rights (payout requests, notifications).
var agentSuspendedAllowedPrefixes = []string{
	"/api/agent/logout",
	"/api/agent/password",
	"/api/agent/profile",
	"/api/agent/payout-requests",
	"/api/agent/notifications",
}

// AgentSuspensionMiddleware makes the agent portal read-only while the travel is suspended (subscription
// expired past the grace period, or deactivated), like the travel dashboard. During the grace period the
// portal works normally. Agents keep seeing their jamaah and commissions and can still request payouts.
func AgentSuspensionMiddleware(tenantRepo repository.TenantRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			for _, p := range agentSuspendedAllowedPrefixes {
				if strings.HasPrefix(r.URL.Path, p) {
					next.ServeHTTP(w, r)
					return
				}
			}
			tenantID, ok := GetTenantID(r.Context())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			tenant, err := tenantRepo.GetByID(r.Context(), tenantID)
			if err != nil || tenant == nil {
				next.ServeHTTP(w, r)
				return
			}
			if util.IsTravelSuspended(tenant.Status, tenant.SubscriptionExpiresAt, time.Now()) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Layanan travel sedang ditangguhkan. Data jamaah dan komisi Anda tetap bisa dilihat; perubahan data bisa dilakukan lagi setelah travel memperpanjang langganan.",
					"code":  "travel_suspended",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
