package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

// AgentAuthMiddleware creates an HTTP middleware that authenticates requests from agents using bearer tokens.
// It verifies the token against AgentSessionRepository and injects tenant_id and agent_id into the request context.
// CRITICAL: This middleware DOES NOT block agents based on status (pending, active, rejected, inactive)
// as long as the token is valid and unexpired. Status-based restriction is performed at handler level.
func AgentAuthMiddleware(agentSessionRepo repository.AgentSessionRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				respondUnauthorized(w)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				respondUnauthorized(w)
				return
			}

			token := strings.TrimSpace(parts[1])
			if token == "" {
				respondUnauthorized(w)
				return
			}

			session, err := agentSessionRepo.FindByToken(r.Context(), token)
			if err != nil {
				respondUnauthorized(w)
				return
			}

			if session.ExpiresAt.Before(time.Now()) {
				respondUnauthorized(w)
				return
			}

			// Cross-tenant verification: if the request already has a tenant ID from subdomain resolution,
			// verify that the agent's session actually belongs to this tenant.
			if existingTenantID, hasTenant := GetTenantID(r.Context()); hasTenant && existingTenantID != session.TenantID {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": "akses ditolak: sesi agen tidak sesuai dengan travel ini",
				})
				return
			}

			ctx := WithTenantID(r.Context(), session.TenantID)
			ctx = WithAgentID(ctx, session.AgentID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
