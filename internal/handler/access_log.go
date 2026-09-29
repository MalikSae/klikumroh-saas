package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
)

// AccessLogHandler lets a travel audit every access KlikUmroh staff made to its data.
type AccessLogHandler struct {
	accessLogService service.AccessLogService
}

// NewAccessLogHandler creates a new AccessLogHandler instance.
func NewAccessLogHandler(accessLogService service.AccessLogService) *AccessLogHandler {
	return &AccessLogHandler{accessLogService: accessLogService}
}

// RegisterDashboardRoutes mounts protected travel dashboard access log routes.
func (h *AccessLogHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/access-logs", h.List)
}

// List handles GET /api/dashboard/access-logs.
func (h *AccessLogHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	logs, err := h.accessLogService.ListForTenant(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat riwayat akses staf"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"access_logs": logs,
	})
}
