package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"klikumroh/internal/repository"
)

// TenantResolutionMiddleware resolves the tenant_id from the incoming Host header
// using DomainRepository.FindByHostname (reusing the Sprint 1 domain lookup) and injects
// tenant_id into the request context. Unregistered or inactive domains return 404.
func TenantResolutionMiddleware(domainRepo repository.DomainRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			host := r.Header.Get("X-Forwarded-Host")
			if host == "" {
				host = r.Host
			}
			// Strip port if present (e.g., localhost:8080 or travel.klikumroh.id:80)
			if h, _, err := net.SplitHostPort(host); err == nil {
				host = h
			}
			host = strings.TrimSpace(strings.ToLower(host))

			if host == "" {
				respondTenantNotFound(w)
				return
			}

			domain, err := domainRepo.FindByHostname(r.Context(), host)
			if err != nil {
				respondTenantNotFound(w)
				return
			}

			// Only allow active domains
			if domain.Status != "active" {
				respondTenantNotFound(w)
				return
			}

			ctx := WithTenantID(r.Context(), domain.TenantID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func respondTenantNotFound(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "tenant not found",
	})
}
