package middleware_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// mockAccessLogRepo implements repository.AccessLogRepository in memory.
type mockAccessLogRepo struct {
	logs      []repository.AccessLog
	failWrite bool
}

func (m *mockAccessLogRepo) Create(ctx context.Context, tenantID uint64, l *repository.AccessLog) error {
	if m.failWrite {
		return errors.New("db down")
	}
	l.ID = uint64(len(m.logs) + 1)
	l.TenantID = tenantID
	l.AccessedAt = time.Now()
	m.logs = append(m.logs, *l)
	return nil
}

func (m *mockAccessLogRepo) ListByTenant(ctx context.Context, tenantID uint64, limit int) ([]repository.AccessLog, error) {
	out := make([]repository.AccessLog, 0)
	for _, l := range m.logs {
		if l.TenantID == tenantID {
			out = append(out, l)
		}
	}
	return out, nil
}

func (m *mockAccessLogRepo) ExistsRecentRequest(ctx context.Context, tenantID uint64, sessionID uint64, method, path string, window time.Duration) (bool, error) {
	for _, l := range m.logs {
		if l.TenantID == tenantID && l.SessionID != nil && *l.SessionID == sessionID &&
			l.HTTPMethod != nil && *l.HTTPMethod == method && l.Path != nil && *l.Path == path &&
			time.Since(l.AccessedAt) <= window {
			return true, nil
		}
	}
	return false, nil
}

func newImpersonationSessionRepo() *mockSessionRepo {
	staffID := uint64(7)
	reason := "Bantu cek prospek yang hilang"
	return &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"impersonation_token": {
				ID:                    55,
				Token:                 "impersonation_token",
				AdminUserID:           10,
				TenantID:              100,
				ExpiresAt:             time.Now().Add(1 * time.Hour),
				ImpersonatedByStaffID: &staffID,
				ImpersonationReason:   &reason,
			},
			"regular_token": {
				ID:          56,
				Token:       "regular_token",
				AdminUserID: 10,
				TenantID:    100,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
		},
	}
}

func serveWithToken(h http.Handler, method, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func TestAuthMiddleware_ImpersonationAccessLog(t *testing.T) {
	okHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	t.Run("Regular admin session writes no access log", func(t *testing.T) {
		logRepo := &mockAccessLogRepo{}
		h := middleware.AuthMiddleware(newImpersonationSessionRepo(), logRepo)(okHandler)

		rr := serveWithToken(h, http.MethodGet, "/api/dashboard/prospects", "regular_token")
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}
		if len(logRepo.logs) != 0 {
			t.Fatalf("expected 0 access logs for regular session, got %d", len(logRepo.logs))
		}
	})

	t.Run("Impersonation request is logged with staff, tenant, path, session, and reason", func(t *testing.T) {
		logRepo := &mockAccessLogRepo{}
		var capturedStaffID uint64
		h := middleware.AuthMiddleware(newImpersonationSessionRepo(), logRepo)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			capturedStaffID, _ = middleware.GetImpersonatingStaffID(r.Context())
			w.WriteHeader(http.StatusOK)
		}))

		rr := serveWithToken(h, http.MethodGet, "/api/dashboard/prospects?search=budi", "impersonation_token")
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rr.Code)
		}
		if len(logRepo.logs) != 1 {
			t.Fatalf("expected 1 access log, got %d", len(logRepo.logs))
		}
		l := logRepo.logs[0]
		if l.TenantID != 100 || l.StaffID != 7 || l.Action != repository.AccessActionImpersonateRequest {
			t.Fatalf("unexpected log record: %+v", l)
		}
		if l.Path == nil || *l.Path != "/api/dashboard/prospects?search=budi" {
			t.Fatalf("expected path with query string, got %v", l.Path)
		}
		if l.SessionID == nil || *l.SessionID != 55 {
			t.Fatalf("expected session_id 55, got %v", l.SessionID)
		}
		if l.Reason == nil || *l.Reason != "Bantu cek prospek yang hilang" {
			t.Fatalf("expected impersonation reason copied into log, got %v", l.Reason)
		}
		if capturedStaffID != 7 {
			t.Fatalf("expected impersonating staff id 7 in context, got %d", capturedStaffID)
		}
	})

	t.Run("Repeated identical GET within window is logged once, mutations always logged", func(t *testing.T) {
		logRepo := &mockAccessLogRepo{}
		h := middleware.AuthMiddleware(newImpersonationSessionRepo(), logRepo)(okHandler)

		for i := 0; i < 5; i++ {
			serveWithToken(h, http.MethodGet, "/api/dashboard/notifications", "impersonation_token")
		}
		serveWithToken(h, http.MethodGet, "/api/dashboard/prospects/9", "impersonation_token")
		serveWithToken(h, http.MethodPatch, "/api/dashboard/prospects/9/status", "impersonation_token")
		serveWithToken(h, http.MethodPatch, "/api/dashboard/prospects/9/status", "impersonation_token")

		if len(logRepo.logs) != 4 {
			t.Fatalf("expected 4 logs (1 polling GET, 1 detail GET, 2 PATCH), got %d", len(logRepo.logs))
		}
	})

	t.Run("Fails closed when access log repository is missing", func(t *testing.T) {
		h := middleware.AuthMiddleware(newImpersonationSessionRepo())(okHandler)

		rr := serveWithToken(h, http.MethodGet, "/api/dashboard/prospects", "impersonation_token")
		if rr.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected 503 without access log repo, got %d", rr.Code)
		}

		rr = serveWithToken(h, http.MethodGet, "/api/dashboard/prospects", "regular_token")
		if rr.Code != http.StatusOK {
			t.Fatalf("expected regular session unaffected (200), got %d", rr.Code)
		}
	})

	t.Run("Fails closed when access log write fails", func(t *testing.T) {
		logRepo := &mockAccessLogRepo{failWrite: true}
		handlerCalled := false
		h := middleware.AuthMiddleware(newImpersonationSessionRepo(), logRepo)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			handlerCalled = true
		}))

		rr := serveWithToken(h, http.MethodDelete, "/api/dashboard/prospects/9", "impersonation_token")
		if rr.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected 503 when log write fails, got %d", rr.Code)
		}
		if handlerCalled {
			t.Fatalf("SECURITY VIOLATION: handler executed without access log record")
		}
	})
}
