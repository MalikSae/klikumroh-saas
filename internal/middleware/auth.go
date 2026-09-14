package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

// AuthMiddleware creates an HTTP middleware that authenticates requests using bearer tokens.
// It verifies the token against SessionRepository and injects tenant_id and admin_user_id into request context.
func AuthMiddleware(sessionRepo repository.SessionRepository) func(http.Handler) http.Handler {
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

			session, err := sessionRepo.FindByToken(r.Context(), token)
			if err != nil {
				respondUnauthorized(w)
				return
			}

			if session.ExpiresAt.Before(time.Now()) {
				respondUnauthorized(w)
				return
			}

			ctx := WithTenantID(r.Context(), session.TenantID)
			ctx = WithAdminUserID(ctx, session.AdminUserID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func respondUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "unauthorized",
	})
}
