package handler

import (
	"net/http"

	"klikumroh/internal/service"
)

// DemoLeadHandler lets KlikUmroh staff read who opened the demo.
type DemoLeadHandler struct {
	service *service.DemoLeadService
}

// NewDemoLeadHandler creates the handler.
func NewDemoLeadHandler(svc *service.DemoLeadService) *DemoLeadHandler {
	return &DemoLeadHandler{service: svc}
}

// List handles GET /api/staff/demo-leads.
func (h *DemoLeadHandler) List(w http.ResponseWriter, r *http.Request) {
	leads, err := h.service.List(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memuat lead demo"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"leads": leads})
}
