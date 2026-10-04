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

// AffiliatorHandler serves the Affiliator KlikUmroh portal (/api/affiliator/*), the public link click,
// and the staff management endpoints (/api/staff/affiliators*, mounted in the staff group).
type AffiliatorHandler struct {
	svc           service.AffiliatorService
	loginFailures *middleware.LoginFailureLimiter
	authLimiter   func(http.Handler) http.Handler
	clickLimiter  func(http.Handler) http.Handler
}

// NewAffiliatorHandler creates the affiliator handler.
func NewAffiliatorHandler(svc service.AffiliatorService) *AffiliatorHandler {
	return &AffiliatorHandler{
		svc:           svc,
		loginFailures: middleware.NewLoginFailureLimiter(5, 15*time.Minute),
		authLimiter:   middleware.NewIPRateLimiter(20, time.Minute),
		clickLimiter:  middleware.NewIPRateLimiter(60, time.Minute),
	}
}

// RegisterPublicRoutes mounts signup, login, logout, and the link click (no auth).
func (h *AffiliatorHandler) RegisterPublicRoutes(r chi.Router) {
	r.With(h.authLimiter).Post("/api/affiliator/register", h.Register)
	r.With(h.authLimiter).Post("/api/affiliator/login", h.Login)
	r.Post("/api/affiliator/logout", h.Logout)
	r.With(h.clickLimiter).Post("/api/public/affiliator-clicks", h.RecordClick)
	r.Get("/api/public/affiliator-program", h.PublicProgram)
}

// RegisterProtectedRoutes mounts the portal endpoints; the router must use AffiliatorAuthMiddleware.
func (h *AffiliatorHandler) RegisterProtectedRoutes(r chi.Router) {
	r.Get("/api/affiliator/me", h.Overview)
	r.Put("/api/affiliator/coupon", h.SetCoupon)
	r.Put("/api/affiliator/bank", h.UpdateBank)
	r.With(h.authLimiter).Put("/api/affiliator/password", h.ChangePassword)
	r.Get("/api/affiliator/tenants", h.ListTenants)
	r.Get("/api/affiliator/commissions", h.ListCommissions)
	r.Get("/api/affiliator/payouts", h.ListPayouts)
	r.Post("/api/affiliator/payouts", h.RequestPayout)
}

// RegisterStaffRoutes mounts staff management; the router must use StaffAuthMiddleware.
func (h *AffiliatorHandler) RegisterStaffRoutes(r chi.Router) {
	r.Get("/api/staff/affiliators", h.StaffList)
	r.Get("/api/staff/affiliators/{id}", h.StaffDetail)
	r.Patch("/api/staff/affiliators/{id}/status", h.StaffSetStatus)
	r.Patch("/api/staff/affiliators/{id}/rates", h.StaffSetRates)
	r.Patch("/api/staff/affiliators/{id}/password", h.StaffResetPassword)
	r.Get("/api/staff/affiliator-payouts", h.StaffListPayouts)
	r.Patch("/api/staff/affiliator-payouts/{id}/paid", h.StaffMarkPaid)
	r.Patch("/api/staff/affiliator-payouts/{id}/reject", h.StaffRejectPayout)
	r.Get("/api/staff/affiliator-settings", h.StaffGetSettings)
	r.Put("/api/staff/affiliator-settings", h.StaffUpdateSettings)
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return false
	}
	return true
}

// respondAffiliatorError maps service errors: validation errors are shown to the user as-is.
func respondAffiliatorError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrAffiliatorInvalidCredentials):
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
	case errors.Is(err, service.ErrAffiliatorEmailInUse), errors.Is(err, service.ErrAffiliatorCouponTaken),
		errors.Is(err, repository.ErrPayoutPending), errors.Is(err, repository.ErrStatusConflict):
		respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	case errors.Is(err, repository.ErrNotFound):
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "data tidak ditemukan"})
	case errors.Is(err, service.ErrAffiliatorNameRequired), errors.Is(err, service.ErrAffiliatorInvalidEmail),
		errors.Is(err, service.ErrAffiliatorInvalidWhatsApp), errors.Is(err, service.ErrPasswordTooShort),
		errors.Is(err, service.ErrAffiliatorCouponFormat), errors.Is(err, service.ErrAffiliatorBankRequired),
		errors.Is(err, service.ErrAffiliatorBankMissing), errors.Is(err, service.ErrAffiliatorInvalidSettings),
		errors.Is(err, service.ErrAffiliatorInvalidStatus), errors.Is(err, service.ErrRejectionReasonRequired), errors.Is(err, service.ErrAffiliatorWrongPassword),
		errors.Is(err, repository.ErrPayoutBelowMinimum):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

func bearerToken(r *http.Request) string {
	parts := strings.SplitN(r.Header.Get("Authorization"), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func (h *AffiliatorHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req service.AffiliatorRegisterRequest
	if !decodeBody(w, r, &req) {
		return
	}
	req.ClientIP = middleware.ClientIP(r)
	res, err := h.svc.Register(r.Context(), req)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, res)
}

func (h *AffiliatorHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	key := middleware.LoginKey("affiliator", strings.ToLower(strings.TrimSpace(req.Email)))
	if h.loginFailures.Blocked(key) {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": middleware.LoginLockedMessage})
		return
	}
	res, err := h.svc.Login(r.Context(), req.Email, req.Password, middleware.ClientIP(r))
	if err != nil {
		if errors.Is(err, service.ErrAffiliatorInvalidCredentials) {
			h.loginFailures.Fail(key)
		}
		respondAffiliatorError(w, err)
		return
	}
	h.loginFailures.Reset(key)
	respondJSON(w, http.StatusOK, res)
}

func (h *AffiliatorHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.Logout(r.Context(), bearerToken(r)); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// PublicProgram serves the program terms (rates, coupon discount, holding period, minimum payout) for
// the public affiliator page. These are published terms, not secrets.
func (h *AffiliatorHandler) PublicProgram(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.GetSettings(r.Context())
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, s)
}

// RecordClick is called by the web when a visitor arrives with ?aff=CODE. Always 204: the response
// never reveals whether a code exists.
func (h *AffiliatorHandler) RecordClick(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	_ = h.svc.RecordClick(r.Context(), req.Code, middleware.ClientIP(r))
	w.WriteHeader(http.StatusNoContent)
}

func affiliatorID(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	id, ok := middleware.GetAffiliatorID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
	}
	return id, ok
}

func (h *AffiliatorHandler) Overview(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Overview(r.Context(), id)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, res)
}

func (h *AffiliatorHandler) SetCoupon(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	c, err := h.svc.SetCoupon(r.Context(), id, req.Code)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"code": c.Code, "discount_percentage": c.DiscountPercentage})
}

func (h *AffiliatorHandler) UpdateBank(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	var req service.AffiliatorBankRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if err := h.svc.UpdateBank(r.Context(), id, req); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "rekening disimpan"})
}

// ChangePassword lets the affiliator change its own password; the current password is required.
func (h *AffiliatorHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if err := h.svc.ChangePassword(r.Context(), id, bearerToken(r), req.CurrentPassword, req.NewPassword); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "kata sandi diganti"})
}

func (h *AffiliatorHandler) ListTenants(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	list, err := h.svc.ListTenants(r.Context(), id)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"tenants": list})
}

func (h *AffiliatorHandler) ListCommissions(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	list, err := h.svc.ListCommissions(r.Context(), id)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"commissions": list})
}

func (h *AffiliatorHandler) ListPayouts(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	list, err := h.svc.ListPayouts(r.Context(), id)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"payouts": list})
}

func (h *AffiliatorHandler) RequestPayout(w http.ResponseWriter, r *http.Request) {
	id, ok := affiliatorID(w, r)
	if !ok {
		return
	}
	p, err := h.svc.RequestPayout(r.Context(), id)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, p)
}

// ---- Staff ----

func urlID(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tidak valid"})
		return 0, false
	}
	return id, true
}

func (h *AffiliatorHandler) StaffList(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListAffiliators(r.Context())
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"affiliators": list})
}

func (h *AffiliatorHandler) StaffDetail(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	d, err := h.svc.GetDetail(r.Context(), id)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, d)
}

func (h *AffiliatorHandler) StaffSetStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if err := h.svc.SetStatus(r.Context(), id, req.Status); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

// StaffSetRates sets the per-affiliator override; null clears it back to the platform default.
func (h *AffiliatorHandler) StaffSetRates(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	var req struct {
		FirstRate   *float64 `json:"first_rate"`
		RenewalRate *float64 `json:"renewal_rate"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if err := h.svc.SetRates(r.Context(), id, req.FirstRate, req.RenewalRate); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, req)
}

// StaffResetPassword sets a new password for an affiliator who forgot it (staff tell it to the affiliator).
func (h *AffiliatorHandler) StaffResetPassword(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	var req struct {
		NewPassword string `json:"new_password"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	staffID, _ := middleware.GetStaffUserID(r.Context())
	if err := h.svc.ResetPassword(r.Context(), id, req.NewPassword, staffID); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "password affiliator direset"})
}

func (h *AffiliatorHandler) StaffListPayouts(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.ListAllPayouts(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"payouts": list})
}

func (h *AffiliatorHandler) StaffMarkPaid(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	staffID, _ := middleware.GetStaffUserID(r.Context())
	if err := h.svc.MarkPayoutPaid(r.Context(), id, staffID); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "paid"})
}

func (h *AffiliatorHandler) StaffRejectPayout(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	staffID, _ := middleware.GetStaffUserID(r.Context())
	if err := h.svc.RejectPayout(r.Context(), id, staffID, req.Reason); err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *AffiliatorHandler) StaffGetSettings(w http.ResponseWriter, r *http.Request) {
	s, err := h.svc.GetSettings(r.Context())
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, s)
}

func (h *AffiliatorHandler) StaffUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req service.AffiliatorSettings
	if !decodeBody(w, r, &req) {
		return
	}
	s, err := h.svc.UpdateSettings(r.Context(), req)
	if err != nil {
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, s)
}
