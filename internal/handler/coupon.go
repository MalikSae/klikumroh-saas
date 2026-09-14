package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type createCouponRequest struct {
	Code               string  `json:"code"`
	DiscountPercentage float64 `json:"discount_percentage"`
	MaxUses            *int    `json:"max_uses"`
	ExpiresAt          *string `json:"expires_at"` // format "YYYY-MM-DD"
	PlanID             *uint64 `json:"plan_id"`
}

// CouponHandler handles HTTP endpoints for coupons management and validation.
type CouponHandler struct {
	couponService service.CouponService
}

// NewCouponHandler creates a new CouponHandler instance.
func NewCouponHandler(couponService service.CouponService) *CouponHandler {
	return &CouponHandler{couponService: couponService}
}

// ListStaff handles GET /api/staff/coupons.
func (h *CouponHandler) ListStaff(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	coupons, err := h.couponService.List(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat daftar kupon"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"coupons": coupons,
	})
}

// CreateStaff handles POST /api/staff/coupons.
func (h *CouponHandler) CreateStaff(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var req createCouponRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil && strings.TrimSpace(*req.ExpiresAt) != "" {
		parsed, err := time.Parse("2006-01-02", strings.TrimSpace(*req.ExpiresAt))
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format tanggal kedaluwarsa tidak valid (gunakan YYYY-MM-DD)"})
			return
		}
		expiresAt = &parsed
	}

	coupon, err := h.couponService.Create(r.Context(), req.Code, req.DiscountPercentage, req.MaxUses, expiresAt, req.PlanID)
	if err != nil {
		if errors.Is(err, service.ErrEmptyCouponCode) ||
			errors.Is(err, service.ErrInvalidDiscount) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "already exists") {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Kode kupon sudah pernah digunakan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membuat kupon baru"})
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"coupon": coupon,
	})
}

// DeactivateStaff handles PATCH /api/staff/coupons/{id}/deactivate.
func (h *CouponHandler) DeactivateStaff(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID kupon tidak valid"})
		return
	}

	err = h.couponService.Deactivate(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Kupon tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menonaktifkan kupon"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Kupon berhasil dinonaktifkan",
	})
}

// ValidateTravel handles GET /api/dashboard/coupons/validate?code=...&plan_id=...
func (h *CouponHandler) ValidateTravel(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Kode kupon wajib diisi"})
		return
	}

	var planID uint64
	if pStr := strings.TrimSpace(r.URL.Query().Get("plan_id")); pStr != "" {
		if p, err := strconv.ParseUint(pStr, 10, 64); err == nil {
			planID = p
		}
	}

	var coupon *repository.Coupon
	var err error
	if planID > 0 {
		coupon, err = h.couponService.Validate(r.Context(), code, planID)
	} else {
		coupon, err = h.couponService.Validate(r.Context(), code)
	}
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"valid":               true,
		"code":                coupon.Code,
		"discount_percentage": coupon.DiscountPercentage,
		"plan_id":             coupon.PlanID,
		"plan_name":           coupon.PlanName,
	})
}
