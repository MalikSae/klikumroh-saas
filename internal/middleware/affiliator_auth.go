package middleware

import (
	"context"
	"net/http"
	"strings"

	"klikumroh/internal/repository"
)

// AffiliatorIDKey is the context key for the authenticated Affiliator KlikUmroh. Separate from the travel
// admin, agent, and staff keys: an affiliator token is only looked up in affiliator_sessions, so it never
// opens a travel dashboard, agent portal, or staff endpoint, and their tokens never open this one.
const AffiliatorIDKey contextKey = "klikumroh.affiliator_id"

// WithAffiliatorID returns a new context with the given affiliator ID.
func WithAffiliatorID(ctx context.Context, affiliatorID uint64) context.Context {
	return context.WithValue(ctx, AffiliatorIDKey, affiliatorID)
}

// GetAffiliatorID retrieves the affiliator ID from the context if present.
func GetAffiliatorID(ctx context.Context) (uint64, bool) {
	id, ok := ctx.Value(AffiliatorIDKey).(uint64)
	return id, ok
}

// AffiliatorAuthMiddleware authenticates affiliator portal requests (Bearer token, active affiliator,
// unexpired session).
func AffiliatorAuthMiddleware(repo repository.AffiliatorRepository) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			parts := strings.SplitN(r.Header.Get("Authorization"), " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
				respondUnauthorized(w)
				return
			}
			session, _, err := repo.FindSessionByToken(r.Context(), strings.TrimSpace(parts[1]))
			if err != nil {
				respondUnauthorized(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithAffiliatorID(r.Context(), session.AffiliatorID)))
		})
	}
}
