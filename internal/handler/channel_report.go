package handler

import (
	"net/http"
	"strconv"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// allowedReportDays are the periods the Kanal page offers.
var allowedReportDays = map[int]bool{7: true, 30: true, 90: true, 365: true}

// ChannelReportHandler serves GET /api/dashboard/channel-report?days=7|30|90|365 (default 30): prospects
// per channel for the period and the one before it, ad prospects per UTM campaign, and a daily series.
func ChannelReportHandler(repo repository.ChannelReportRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := middleware.GetTenantID(r.Context())
		if !ok {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		days := 30
		if v := r.URL.Query().Get("days"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || !allowedReportDays[n] {
				respondJSON(w, http.StatusBadRequest, map[string]string{"error": "periode harus 7, 30, 90, atau 365 hari"})
				return
			}
			days = n
		}
		rep, err := repo.Report(r.Context(), tenantID, days)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			return
		}
		respondJSON(w, http.StatusOK, rep)
	}
}
