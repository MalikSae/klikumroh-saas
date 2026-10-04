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
	"time"
)

type validateCouponRequest struct {
	Code   string  `json:"code"`
	PlanID *uint64 `json:"plan_id"`
}

// PublicSignupHandler handles public endpoints for marketing website checkout and onboarding.
type PublicSignupHandler struct {
	publicSignupService service.PublicSignupService
	planService         service.PricingPlanService
	couponService       service.CouponService
}

// NewPublicSignupHandler creates a new PublicSignupHandler instance.
func NewPublicSignupHandler(
	publicSignupService service.PublicSignupService,
	planService service.PricingPlanService,
	couponService service.CouponService,
) *PublicSignupHandler {
	return &PublicSignupHandler{
		publicSignupService: publicSignupService,
		planService:         planService,
		couponService:       couponService,
	}
}

// RegisterPublicRoutes mounts public signup endpoints onto the chi router.
func (h *PublicSignupHandler) RegisterPublicRoutes(r chi.Router) {
	slugLimiter := middleware.NewIPRateLimiter(30, time.Minute)
	signupLimiter := middleware.NewIPRateLimiter(10, time.Minute)

	r.Get("/api/public/pricing-plans", h.ListPricingPlans)
	r.With(slugLimiter).Get("/api/public/check-slug", h.CheckSlug)
	r.Post("/api/public/coupons/validate", h.ValidateCoupon)
	r.With(signupLimiter).Post("/api/public/tenant-signup", h.TenantSignup)
	// No public payment endpoints: after signup the travel logs in and pays from the dashboard billing page.
}

// ListPricingPlans handles GET /api/public/pricing-plans.
func (h *PublicSignupHandler) ListPricingPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.planService.List(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat daftar paket harga"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plans": plans,
	})
}

// CheckSlug handles GET /api/public/check-slug?slug=...
func (h *PublicSignupHandler) CheckSlug(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.URL.Query().Get("slug"))
	if slug == "" {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"available": false,
			"reason":    "Parameter slug wajib diisi",
		})
		return
	}

	available, reason, err := h.publicSignupService.CheckSlug(r.Context(), slug)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memeriksa ketersediaan slug"})
		return
	}

	res := map[string]interface{}{
		"available": available,
	}
	if reason != "" {
		res["reason"] = reason
	}
	respondJSON(w, http.StatusOK, res)
}

// ValidateCoupon handles POST /api/public/coupons/validate.
func (h *PublicSignupHandler) ValidateCoupon(w http.ResponseWriter, r *http.Request) {
	var req validateCouponRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Fallback to query param or form value if json decode fails
		req.Code = r.URL.Query().Get("code")
	}

	req.Code = strings.TrimSpace(req.Code)
	if req.Code == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Kode kupon wajib diisi"})
		return
	}

	var planID uint64
	if req.PlanID != nil {
		planID = *req.PlanID
	} else if pStr := strings.TrimSpace(r.URL.Query().Get("plan_id")); pStr != "" {
		if p, err := strconv.ParseUint(pStr, 10, 64); err == nil {
			planID = p
		}
	}

	var coupon *repository.Coupon
	var err error
	if planID > 0 {
		coupon, err = h.couponService.Validate(r.Context(), req.Code, planID)
	} else {
		coupon, err = h.couponService.Validate(r.Context(), req.Code)
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

// TenantSignup handles POST /api/public/tenant-signup.
func (h *PublicSignupHandler) TenantSignup(w http.ResponseWriter, r *http.Request) {
	var req service.TenantSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}
	req.ClientIP = middleware.ClientIP(r)

	res, err := h.publicSignupService.TenantSignup(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrLegalDocumentsNotConfigured) {
			respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrInvalidTravelName) ||
			errors.Is(err, service.ErrInvalidSlug) ||
			errors.Is(err, service.ErrSlugAlreadyTaken) ||
			errors.Is(err, service.ErrInvalidAdminName) ||
			errors.Is(err, service.ErrInvalidAdminEmail) ||
			errors.Is(err, service.ErrAdminEmailAlreadyInUse) ||
			errors.Is(err, service.ErrInvalidAdminWhatsApp) ||
			errors.Is(err, service.ErrTenantWhatsAppAlreadyInUse) ||
			errors.Is(err, service.ErrPasswordTooShort) ||
			errors.Is(err, service.ErrPlanNotFound) ||
			errors.Is(err, service.ErrCouponNotFound) ||
			errors.Is(err, service.ErrCouponInactive) ||
			errors.Is(err, service.ErrCouponExpired) ||
			errors.Is(err, service.ErrCouponExhausted) ||
			errors.Is(err, service.ErrCouponPlanMismatch) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		// Check for specific constraint message
		if strings.Contains(strings.ToLower(err.Error()), "slug") ||
			strings.Contains(strings.ToLower(err.Error()), "email") ||
			strings.Contains(strings.ToLower(err.Error()), "whatsapp") {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memproses pendaftaran travel"})
		return
	}

	respondJSON(w, http.StatusCreated, res)
}
