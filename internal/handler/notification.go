package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// NotificationHandler manages notification endpoints across Admin, Agent, and Staff roles.
type NotificationHandler struct {
	notifService service.NotificationService
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(notifService service.NotificationService) *NotificationHandler {
	return &NotificationHandler{
		notifService: notifService,
	}
}

// RegisterDashboardRoutes mounts endpoints for Travel Admin.
func (h *NotificationHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/notifications", h.ListAdminNotifications)
	r.Patch("/api/dashboard/notifications/{id}/read", h.MarkAdminNotificationRead)
	r.Patch("/api/dashboard/notifications/read-all", h.MarkAdminAllNotificationsRead)
}

// RegisterAgentRoutes mounts endpoints for Agent.
func (h *NotificationHandler) RegisterAgentRoutes(r chi.Router) {
	r.Get("/api/agent/notifications", h.ListAgentNotifications)
	r.Patch("/api/agent/notifications/{id}/read", h.MarkAgentNotificationRead)
	r.Patch("/api/agent/notifications/read-all", h.MarkAgentAllNotificationsRead)
}

// RegisterStaffRoutes mounts endpoints for KlikUmroh Master Admin / Staff.
func (h *NotificationHandler) RegisterStaffRoutes(r chi.Router) {
	r.Get("/api/staff/notifications", h.ListStaffNotifications)
	r.Patch("/api/staff/notifications/{id}/read", h.MarkStaffNotificationRead)
	r.Patch("/api/staff/notifications/read-all", h.MarkStaffAllNotificationsRead)
}

// --- ADMIN HANDLERS ---

func (h *NotificationHandler) ListAdminNotifications(w http.ResponseWriter, r *http.Request) {
	adminUserID, ok := middleware.GetAdminUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	tenantPtr, ok := notificationTenant(r)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	resp, err := h.notifService.ListNotifications(r.Context(), tenantPtr, "admin", adminUserID, limit)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list notifications"})
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *NotificationHandler) MarkAdminNotificationRead(w http.ResponseWriter, r *http.Request) {
	adminUserID, ok := middleware.GetAdminUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	tenantPtr, ok := notificationTenant(r)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	notifID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid notification id"})
		return
	}

	if err := h.notifService.MarkAsRead(r.Context(), tenantPtr, "admin", adminUserID, notifID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "notification not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to mark notification read"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotificationHandler) MarkAdminAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	adminUserID, ok := middleware.GetAdminUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	tenantPtr, ok := notificationTenant(r)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.notifService.MarkAllAsRead(r.Context(), tenantPtr, "admin", adminUserID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to mark all notifications read"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- AGENT HANDLERS ---

func (h *NotificationHandler) ListAgentNotifications(w http.ResponseWriter, r *http.Request) {
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	tenantPtr, ok := notificationTenant(r)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	resp, err := h.notifService.ListNotifications(r.Context(), tenantPtr, "agent", agentID, limit)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list notifications"})
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *NotificationHandler) MarkAgentNotificationRead(w http.ResponseWriter, r *http.Request) {
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	tenantPtr, ok := notificationTenant(r)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	notifID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid notification id"})
		return
	}

	if err := h.notifService.MarkAsRead(r.Context(), tenantPtr, "agent", agentID, notifID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "notification not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to mark notification read"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotificationHandler) MarkAgentAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	tenantPtr, ok := notificationTenant(r)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.notifService.MarkAllAsRead(r.Context(), tenantPtr, "agent", agentID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to mark all notifications read"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// --- STAFF HANDLERS ---

func (h *NotificationHandler) ListStaffNotifications(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	resp, err := h.notifService.ListNotifications(r.Context(), nil, "staff", staffUserID, limit)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list notifications"})
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *NotificationHandler) MarkStaffNotificationRead(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	notifID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid notification id"})
		return
	}

	if err := h.notifService.MarkAsRead(r.Context(), nil, "staff", staffUserID, notifID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "notification not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to mark notification read"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *NotificationHandler) MarkStaffAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.notifService.MarkAllAsRead(r.Context(), nil, "staff", staffUserID); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to mark all notifications read"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// notificationTenant returns the travel of the signed-in admin or agent: their notifications are always
// read and updated within that travel only (AGENTS.md 3.1).
func notificationTenant(r *http.Request) (*uint64, bool) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok || tenantID == 0 {
		return nil, false
	}
	return &tenantID, true
}
