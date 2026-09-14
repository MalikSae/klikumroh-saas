package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type createPricingPlanRequest struct {
	Name         string  `json:"name"`
	PeriodMonths int     `json:"period_months"`
	Price        float64 `json:"price"`
}

type updatePricingPlanRequest struct {
	Name         string  `json:"name"`
	PeriodMonths int     `json:"period_months"`
	Price        float64 `json:"price"`
}

// PricingPlanHandler handles HTTP endpoints for managing subscription pricing plans.
type PricingPlanHandler struct {
	service service.PricingPlanService
}

// NewPricingPlanHandler creates a new PricingPlanHandler instance.
func NewPricingPlanHandler(service service.PricingPlanService) *PricingPlanHandler {
	return &PricingPlanHandler{service: service}
}

// List handles GET /api/staff/pricing-plans.
func (h *PricingPlanHandler) List(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	plans, err := h.service.List(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat plan harga"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plans": plans,
	})
}

// Create handles POST /api/staff/pricing-plans.
func (h *PricingPlanHandler) Create(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var req createPricingPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Nama plan tidak boleh kosong"})
		return
	}
	if req.PeriodMonths <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Durasi periode harus lebih dari 0 bulan"})
		return
	}
	if req.Price < 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Harga tidak boleh negatif"})
		return
	}

	plan, err := h.service.Create(r.Context(), req.Name, req.PeriodMonths, req.Price)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membuat plan harga baru"})
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"plan": plan,
	})
}

// Update handles PUT /api/staff/pricing-plans/{id}.
func (h *PricingPlanHandler) Update(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID plan tidak valid"})
		return
	}

	var req updatePricingPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Nama plan tidak boleh kosong"})
		return
	}
	if req.PeriodMonths <= 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Durasi periode harus lebih dari 0 bulan"})
		return
	}
	if req.Price < 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Harga tidak boleh negatif"})
		return
	}

	plan, err := h.service.Update(r.Context(), id, req.Name, req.PeriodMonths, req.Price)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Plan harga tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memperbarui plan harga"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plan": plan,
	})
}

// Delete handles DELETE /api/staff/pricing-plans/{id}.
func (h *PricingPlanHandler) Delete(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID plan tidak valid"})
		return
	}

	err = h.service.Delete(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrPlanInUse) {
			respondJSON(w, http.StatusBadRequest, map[string]string{
				"error": "Plan harga sedang digunakan oleh travel dan tidak dapat dihapus",
			})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Plan harga tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menghapus plan harga"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Plan harga berhasil dihapus",
	})
}
