package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
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
	// affiliatorCoupons decides whether a travel may use an affiliator coupon from the dashboard (only
	// its own affiliator's, before its first approved payment). Without it, affiliator coupons are refused.
	affiliatorCoupons AffiliatorCouponChecker
}

// AffiliatorCouponChecker is implemented by the subscription service.
type AffiliatorCouponChecker interface {
	AffiliatorCouponAllowedForTenant(ctx context.Context, tenantID uint64, coupon *repository.Coupon) (bool, error)
}

// CouponReuseChecker is implemented by the subscription service: a coupon counts once per travel.
type CouponReuseChecker interface {
	CouponUsableByTenant(ctx context.Context, tenantID uint64, coupon *repository.Coupon) error
}

// isCouponClientError reports coupon validation errors shown to the user as 400 (never a database error).
func isCouponClientError(err error) bool {
	return errors.Is(err, service.ErrCouponNotFound) ||
		errors.Is(err, service.ErrCouponInactive) ||
		errors.Is(err, service.ErrCouponExpired) ||
		errors.Is(err, service.ErrCouponExhausted) ||
		errors.Is(err, service.ErrCouponPlanMismatch) ||
		errors.Is(err, service.ErrEmptyCouponCode) ||
		errors.Is(err, service.ErrCouponUsedByTenant) ||
		errors.Is(err, service.ErrAffiliatorCouponSignupOnly)
}

// SetAffiliatorCouponChecker wires the subscription service in (main.go).
func (h *CouponHandler) SetAffiliatorCouponChecker(c AffiliatorCouponChecker) {
	h.affiliatorCoupons = c
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
		if errors.Is(err, service.ErrCouponOwnedByAffiliator) {
			respondJSON(w, http.StatusConflict, map[string]string{
				"error": "Kupon ini milik affiliator. Nonaktifkan affiliatornya di menu Affiliator untuk mematikan kuponnya.",
			})
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
	tenantID, ok := middleware.GetTenantID(r.Context())
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
		if isCouponClientError(err) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		log.Printf("[Coupon] tenant %d validate: %v", tenantID, err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memeriksa kupon"})
		return
	}
	// A coupon counts once per travel (keputusan pendiri 5 Okt 2026): refused when the travel already
	// paid with it, or another open invoice of the travel carries it.
	if rc, ok := h.affiliatorCoupons.(CouponReuseChecker); ok && h.affiliatorCoupons != nil {
		if err := rc.CouponUsableByTenant(r.Context(), tenantID, coupon); err != nil {
			if errors.Is(err, service.ErrCouponUsedByTenant) {
				respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			log.Printf("[Coupon] tenant %d reuse check: %v", tenantID, err)
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memeriksa kupon"})
			return
		}
	}
	// Travel dashboard: an affiliator coupon only applies to the travel's first payment, and only its own
	// affiliator's (same rule as the renewal request).
	if coupon.AffiliatorID != nil {
		allowed := false
		if h.affiliatorCoupons != nil {
			ok, err := h.affiliatorCoupons.AffiliatorCouponAllowedForTenant(r.Context(), tenantID, coupon)
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memeriksa kupon"})
				return
			}
			allowed = ok
		}
		if !allowed {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": service.ErrAffiliatorCouponSignupOnly.Error()})
			return
		}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"valid":               true,
		"code":                coupon.Code,
		"discount_percentage": coupon.DiscountPercentage,
		"plan_id":             coupon.PlanID,
		"plan_name":           coupon.PlanName,
	})
}
