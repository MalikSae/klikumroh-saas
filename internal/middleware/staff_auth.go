package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

// StaffAuthMiddleware creates an HTTP middleware that authenticates platform staff requests using bearer tokens.
// It verifies the token against StaffRepository and injects staff_user_id into request context.
// CRITICAL: It uses StaffUserIDKey context key, completely separate from tenant admin and agent contexts.
// When adminSessionRepo is provided, valid tenant admin tokens attempting to access staff endpoints are rejected with 403 Forbidden,
// reserving 401 Unauthorized strictly for missing, unauthenticated, or expired tokens.
func StaffAuthMiddleware(staffRepo repository.StaffRepository, adminSessionRepo ...repository.SessionRepository) func(http.Handler) http.Handler {
	var sessionRepo repository.SessionRepository
	if len(adminSessionRepo) > 0 {
		sessionRepo = adminSessionRepo[0]
	}

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

			session, user, err := staffRepo.FindSessionByToken(r.Context(), token)
			if err != nil {
				// If a valid tenant admin token is used to access staff endpoints, return 403 Forbidden (wrong portal)
				if sessionRepo != nil {
					if adminSession, aErr := sessionRepo.FindByToken(r.Context(), token); aErr == nil && adminSession != nil {
						if !adminSession.ExpiresAt.Before(time.Now()) {
							w.Header().Set("Content-Type", "application/json")
							w.WriteHeader(http.StatusForbidden)
							_ = json.NewEncoder(w).Encode(map[string]string{
								"error": "Akses ditolak: Akun travel admin tidak memiliki izin mengakses portal staf KlikUmroh",
							})
							return
						}
					}
				}

				respondUnauthorized(w)
				return
			}

			if session.ExpiresAt.Before(time.Now()) {
				respondUnauthorized(w)
				return
			}

			if user.Status != "active" {
				respondUnauthorized(w)
				return
			}

			ctx := WithStaffUserID(r.Context(), session.StaffUserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
