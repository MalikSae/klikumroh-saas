package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// OnboardingHandler serves the travel onboarding checklist status (Beranda).
type OnboardingHandler struct {
	svc service.OnboardingService
}

func NewOnboardingHandler(svc service.OnboardingService) *OnboardingHandler {
	return &OnboardingHandler{svc: svc}
}

// RegisterDashboardRoutes mounts the endpoint on the protected travel dashboard router.
func (h *OnboardingHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/onboarding", h.Status)
}

// Status handles GET /api/dashboard/onboarding for the authenticated travel only.
func (h *OnboardingHandler) Status(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok || tenantID == 0 {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	status, err := h.svc.Status(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "travel tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	respondJSON(w, http.StatusOK, status)
}
