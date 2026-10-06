package middleware

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

// impersonationReadDedupWindow limits how often an identical read request (same impersonation session,
// method, and path including the query string) is written to access_logs, so dashboard polling does not flood the travel's audit trail.
// Every mutating request (POST/PUT/PATCH/DELETE) is always logged.
const impersonationReadDedupWindow = 5 * time.Minute

const maxAccessLogPathLength = 500

// AuthMiddleware creates an HTTP middleware that authenticates requests using bearer tokens.
// It verifies the token against SessionRepository and injects tenant_id and admin_user_id into request context.
//
// When the session was created by KlikUmroh staff impersonation, every request is recorded into access_logs
// before it reaches the handler. This fails closed: if accessLogRepo is not configured or the log cannot be
// written, the request is rejected so staff can never access tenant data without an audit record.
func AuthMiddleware(sessionRepo repository.SessionRepository, accessLogRepo ...repository.AccessLogRepository) func(http.Handler) http.Handler {
	var logRepo repository.AccessLogRepository
	if len(accessLogRepo) > 0 {
		logRepo = accessLogRepo[0]
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

			if session.ImpersonatedByStaffID != nil {
				if err := recordImpersonationAccess(r, logRepo, session); err != nil {
					log.Printf("access log: failed to record impersonation request tenant=%d session=%d: %v", session.TenantID, session.ID, err)
					respondAccessLogUnavailable(w)
					return
				}
				ctx = WithImpersonatingStaffID(ctx, *session.ImpersonatedByStaffID)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func recordImpersonationAccess(r *http.Request, logRepo repository.AccessLogRepository, session *repository.Session) error {
	if logRepo == nil {
		return errAccessLogNotConfigured
	}

	method := r.Method
	// The query string is part of what was accessed (which private file, which export or search filter),
	// so it is logged and part of the read dedup key: two different files are two rows.
	path := r.URL.Path
	if r.URL.RawQuery != "" {
		path += "?" + r.URL.RawQuery
	}
	if len(path) > maxAccessLogPathLength {
		path = path[:maxAccessLogPathLength]
	}

	if method == http.MethodGet || method == http.MethodHead {
		exists, err := logRepo.ExistsRecentRequest(r.Context(), session.TenantID, session.ID, method, path, impersonationReadDedupWindow)
		if err != nil {
			return err
		}
		if exists {
			return nil
		}
	}

	sessionID := session.ID
	return logRepo.Create(r.Context(), session.TenantID, &repository.AccessLog{
		StaffID:    *session.ImpersonatedByStaffID,
		Action:     repository.AccessActionImpersonateRequest,
		HTTPMethod: &method,
		Path:       &path,
		SessionID:  &sessionID,
		Reason:     session.ImpersonationReason,
	})
}

var errAccessLogNotConfigured = errors.New("access log repository not configured")

func respondAccessLogUnavailable(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "Pencatatan akses staf sedang tidak tersedia, akses ditolak",
	})
}

func respondUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": "unauthorized",
	})
}
