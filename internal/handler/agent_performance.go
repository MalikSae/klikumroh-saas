package handler

import (
	"net/http"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// AgentPerformanceHandler serves GET /api/dashboard/agent-performance: every agent's referral clicks,
// prospects per pipeline stage, jamaah closed and commission, for the travel's agent list.
func AgentPerformanceHandler(repo repository.AgentPerformanceRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := middleware.GetTenantID(r.Context())
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		list, err := repo.ListByTenant(r.Context(), tenantID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			return
		}
		respondJSON(w, http.StatusOK, list)
	}
}
