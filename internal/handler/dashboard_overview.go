package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
)

// DashboardOverviewHandler handles HTTP requests for the admin overview dashboard.
type DashboardOverviewHandler struct {
	overviewService service.DashboardOverviewService
}

// NewDashboardOverviewHandler creates a new DashboardOverviewHandler instance.
func NewDashboardOverviewHandler(overviewService service.DashboardOverviewService) *DashboardOverviewHandler {
	return &DashboardOverviewHandler{
		overviewService: overviewService,
	}
}

// RegisterDashboardRoutes mounts protected overview endpoints on the router.
func (h *DashboardOverviewHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/overview", h.GetOverview)
}

// GetOverview returns aggregated overview data for the authenticated tenant.
func (h *DashboardOverviewHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok || tenantID == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	overview, err := h.overviewService.GetOverview(r.Context(), tenantID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to load dashboard overview: " + err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(overview)
}
