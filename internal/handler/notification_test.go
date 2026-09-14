package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockNotifRepo struct {
	mu     sync.Mutex
	notifs []repository.Notification
}

func (m *mockNotifRepo) Create(ctx context.Context, n *repository.Notification) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	n.ID = uint64(len(m.notifs) + 1)
	n.CreatedAt = time.Now()
	m.notifs = append(m.notifs, *n)
	return nil
}

func (m *mockNotifRepo) ListByRecipient(ctx context.Context, recipientType string, recipientID uint64, limit int) ([]repository.Notification, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var res []repository.Notification
	for _, n := range m.notifs {
		if n.RecipientType == recipientType && n.RecipientID == recipientID {
			res = append(res, n)
		}
	}
	return res, nil
}

func (m *mockNotifRepo) CountUnread(ctx context.Context, recipientType string, recipientID uint64) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cnt := 0
	for _, n := range m.notifs {
		if n.RecipientType == recipientType && n.RecipientID == recipientID && n.ReadAt == nil {
			cnt++
		}
	}
	return cnt, nil
}

func (m *mockNotifRepo) MarkAsRead(ctx context.Context, recipientType string, recipientID uint64, id uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, n := range m.notifs {
		if n.ID == id && n.RecipientType == recipientType && n.RecipientID == recipientID {
			now := time.Now()
			m.notifs[i].ReadAt = &now
			return nil
		}
	}
	return repository.ErrNotFound
}

func (m *mockNotifRepo) MarkAllAsRead(ctx context.Context, recipientType string, recipientID uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for i, n := range m.notifs {
		if n.RecipientType == recipientType && n.RecipientID == recipientID && n.ReadAt == nil {
			m.notifs[i].ReadAt = &now
		}
	}
	return nil
}

func TestNotificationHandler_DashboardAndAgentEndpoints(t *testing.T) {
	repo := &mockNotifRepo{}
	svc := service.NewNotificationService(repo)
	h := handler.NewNotificationHandler(svc)

	// Seed notification for Admin 101 and Agent 202
	tID := uint64(1)
	_, _ = svc.CreateNotification(context.Background(), &tID, "admin", 101, "prospect_new", "Admin Notif", "Body", "/link")
	_, _ = svc.CreateNotification(context.Background(), &tID, "agent", 202, "commission_earned", "Agent Notif", "Body", "/link")

	// 1. Dashboard Routes with injected context
	dashRouter := chi.NewRouter()
	dashRouter.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), middleware.AdminUserIDKey, uint64(101))
			ctx = context.WithValue(ctx, middleware.TenantIDKey, uint64(1))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	h.RegisterDashboardRoutes(dashRouter)

	// GET /api/dashboard/notifications
	req := httptest.NewRequest("GET", "/api/dashboard/notifications", nil)
	rr := httptest.NewRecorder()
	dashRouter.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var dashResp service.NotificationListResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &dashResp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if len(dashResp.Notifications) != 1 || dashResp.UnreadCount != 1 {
		t.Errorf("Expected 1 notif and 1 unread, got %d notifs and %d unread", len(dashResp.Notifications), dashResp.UnreadCount)
	}

	// PATCH /api/dashboard/notifications/{id}/read
	notifID := dashResp.Notifications[0].ID
	patchReq := httptest.NewRequest("PATCH", fmt.Sprintf("/api/dashboard/notifications/%d/read", notifID), nil)
	patchRR := httptest.NewRecorder()
	dashRouter.ServeHTTP(patchRR, patchReq)
	if patchRR.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", patchRR.Code, patchRR.Body.String())
	}

	// PATCH /api/dashboard/notifications/read-all
	readAllReq := httptest.NewRequest("PATCH", "/api/dashboard/notifications/read-all", nil)
	readAllRR := httptest.NewRecorder()
	dashRouter.ServeHTTP(readAllRR, readAllReq)
	if readAllRR.Code != http.StatusOK {
		t.Fatalf("Expected 200 on read-all, got %d: %s", readAllRR.Code, readAllRR.Body.String())
	}

	// 2. Agent Routes with injected context
	agentRouter := chi.NewRouter()
	agentRouter.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), middleware.AgentIDKey, uint64(202))
			ctx = context.WithValue(ctx, middleware.TenantIDKey, uint64(1))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	h.RegisterAgentRoutes(agentRouter)

	// GET /api/agent/notifications
	agReq := httptest.NewRequest("GET", "/api/agent/notifications", nil)
	agRR := httptest.NewRecorder()
	agentRouter.ServeHTTP(agRR, agReq)
	if agRR.Code != http.StatusOK {
		t.Fatalf("Expected 200 for agent, got %d: %s", agRR.Code, agRR.Body.String())
	}
	var agResp service.NotificationListResponse
	if err := json.Unmarshal(agRR.Body.Bytes(), &agResp); err != nil {
		t.Fatalf("Failed to parse agent response: %v", err)
	}
	if len(agResp.Notifications) != 1 || agResp.UnreadCount != 1 {
		t.Errorf("Expected 1 notif and 1 unread for agent, got %d notifs and %d unread", len(agResp.Notifications), agResp.UnreadCount)
	}

	// Cross-tenant / unauthorized check: Agent 202 cannot mark Admin's notif
	badReq := httptest.NewRequest("PATCH", fmt.Sprintf("/api/agent/notifications/%d/read", notifID), nil)
	badRR := httptest.NewRecorder()
	agentRouter.ServeHTTP(badRR, badReq)
	if badRR.Code != http.StatusNotFound {
		t.Errorf("Expected 404 on unauthorized mark read, got %d", badRR.Code)
	}
}
