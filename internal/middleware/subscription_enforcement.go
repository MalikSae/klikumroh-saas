package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

// SubscriptionEnforcementMiddleware enforces read-only access on /api/dashboard/* endpoints
// when a tenant's subscription period has expired.
//   - Obtains tenant_id from request context (injected by AuthMiddleware).
//   - Checks tenants.subscription_expires_at via TenantRepository.
//   - If NULL (legacy tenant / never subscribed) or in the future: request proceeds normally.
//   - If expired (<= time.Now()) and request method is not GET:
//     responds with 402 Payment Required: {"error": "Langganan Anda telah berakhir. Perpanjang untuk melanjutkan mengelola data."}
//   - EXCEPTION: Requests to paths containing "/subscription" (e.g. renewal requests, payment proofs)
//     ALWAYS proceed regardless of subscription status or HTTP method.
func SubscriptionEnforcementMiddleware(tenantRepo repository.TenantRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// EXCEPTION: Any path containing "/subscription" always passes through
			if strings.Contains(r.URL.Path, "/subscription") {
				next.ServeHTTP(w, r)
				return
			}

			// GET (as well as standard read-only methods OPTIONS, HEAD) are always allowed
			if r.Method == http.MethodGet || r.Method == http.MethodOptions || r.Method == http.MethodHead {
				next.ServeHTTP(w, r)
				return
			}

			tenantID, ok := GetTenantID(r.Context())
			if !ok {
				// If no tenant_id found in context, let downstream handlers manage it
				next.ServeHTTP(w, r)
				return
			}

			tenant, err := tenantRepo.GetByID(r.Context(), tenantID)
			if err != nil {
				// If tenant not found or repo error, fail safe and proceed to downstream handlers
				next.ServeHTTP(w, r)
				return
			}

			// If tenant is pending, block modification requests until payment is approved
			if tenant.Status == "pending" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Akun travel Anda sedang menunggu verifikasi pembayaran. Akses akan aktif setelah pembayaran diverifikasi oleh tim KlikUmroh.",
				})
				return
			}

			// If tenant is inactive, block modification requests
			if tenant.Status == "inactive" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Akun travel Anda sedang tidak aktif. Hubungi tim KlikUmroh untuk mengaktifkan kembali.",
				})
				return
			}

			// If subscription_expires_at is nil (e.g. legacy tenant before billing system), allow through
			if tenant.SubscriptionExpiresAt == nil {
				next.ServeHTTP(w, r)
				return
			}

			// If subscription has expired
			if !tenant.SubscriptionExpiresAt.After(time.Now()) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "Langganan Anda telah berakhir. Perpanjang untuk melanjutkan mengelola data.",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
