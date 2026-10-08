package handler

import (
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

// AffiliatorHandler serves the Affiliator KlikUmroh portal (/api/affiliator/*), the public link click,
// and the staff management endpoints (/api/staff/affiliators*, mounted in the staff group).
type AffiliatorHandler struct {
	svc           service.AffiliatorService
	loginFailures *middleware.LoginFailureLimiter
	authLimiter   func(http.Handler) http.Handler
	clickLimiter  func(http.Handler) http.Handler
	// couponLimiters cap PUT /api/affiliator/coupon per affiliator and per IP: a taken code answers 409, so
	// unlimited tries would let a self-registered affiliator enumerate platform promo codes.
	couponLimiters []func(http.Handler) http.Handler
	// bankLimiters cap PUT /api/affiliator/bank per affiliator and per IP: it checks the current password,
	// so unlimited tries with a stolen session token would let someone guess it.
	bankLimiters []func(http.Handler) http.Handler
}

// Bank account changes allowed per minute from the affiliator portal, per affiliator and per IP.
const affiliatorBankSetPerMinute = 5

// Coupon code changes allowed per minute from the affiliator portal, per affiliator and per IP.
const affiliatorCouponSetPerMinute = 10

// NewAffiliatorHandler creates the affiliator handler.
func NewAffiliatorHandler(svc service.AffiliatorService) *AffiliatorHandler {
	return &AffiliatorHandler{
		svc:           svc,
		loginFailures: middleware.NewLoginFailureLimiter(5, 15*time.Minute),
		authLimiter:   middleware.NewIPRateLimiter(20, time.Minute),
		clickLimiter:  middleware.NewIPRateLimiter(60, time.Minute),
		couponLimiters: []func(http.Handler) http.Handler{
			middleware.NewIPRateLimiter(affiliatorCouponSetPerMinute, time.Minute),
			middleware.NewKeyedRateLimiter(affiliatorCouponSetPerMinute, time.Minute, middleware.AffiliatorRateKey),
		},
		bankLimiters: []func(http.Handler) http.Handler{
			middleware.NewIPRateLimiter(affiliatorBankSetPerMinute, time.Minute),
			middleware.NewKeyedRateLimiter(affiliatorBankSetPerMinute, time.Minute, middleware.AffiliatorRateKey),
		},
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
	r.With(h.couponLimiters...).Put("/api/affiliator/coupon", h.SetCoupon)
	r.With(h.bankLimiters...).Put("/api/affiliator/bank", h.UpdateBank)
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
	r.Post("/api/staff/affiliators/{id}/payouts", h.StaffRequestPayout)
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
		respondJSON(w, http.StatusConflict, map[string]string{"error": conflictMessage(err)})
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
	attempt, allowed := h.loginFailures.Begin(key)
	if !allowed {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": middleware.LoginLockedMessage})
		return
	}
	defer attempt.Done()
	res, err := h.svc.Login(r.Context(), req.Email, req.Password, middleware.ClientIP(r))
	if err != nil {
		if errors.Is(err, service.ErrAffiliatorInvalidCredentials) {
			attempt.Fail()
		}
		respondAffiliatorError(w, err)
		return
	}
	attempt.Succeed()
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
	out := make([]affiliatorPortalPayout, 0, len(list))
	for i := range list {
		out = append(out, toPortalPayout(&list[i]))
	}
	respondJSON(w, http.StatusOK, map[string]any{"payouts": out})
}

// affiliatorPortalPayout is the payout as the affiliator's own portal sees it. It is an explicit field list
// (not the repository struct) so staff-only data, such as which staff requested a payout on the
// affiliator's behalf, never reaches the affiliator, including fields added to the repository later.
type affiliatorPortalPayout struct {
	ID                uint64     `json:"id"`
	AffiliatorID      uint64     `json:"affiliator_id"`
	Amount            float64    `json:"amount"`
	Status            string     `json:"status"`
	BankName          string     `json:"bank_name"`
	BankAccountNumber string     `json:"bank_account_number"`
	BankAccountHolder string     `json:"bank_account_holder"`
	RejectionReason   *string    `json:"rejection_reason"`
	ReviewedAt        *time.Time `json:"reviewed_at"`
	CreatedAt         time.Time  `json:"created_at"`
}

func toPortalPayout(p *repository.AffiliatorPayout) affiliatorPortalPayout {
	return affiliatorPortalPayout{
		ID: p.ID, AffiliatorID: p.AffiliatorID, Amount: p.Amount, Status: p.Status,
		BankName: p.BankName, BankAccountNumber: p.BankAccountNumber, BankAccountHolder: p.BankAccountHolder,
		RejectionReason: p.RejectionReason, ReviewedAt: p.ReviewedAt, CreatedAt: p.CreatedAt,
	}
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
	respondJSON(w, http.StatusCreated, toPortalPayout(p))
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
		if errors.Is(err, repository.ErrStatusConflict) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": staffPayoutProcessedMessage})
			return
		}
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
		if errors.Is(err, repository.ErrStatusConflict) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": staffPayoutProcessedMessage})
			return
		}
		respondAffiliatorError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

// StaffRequestPayout creates a payout on the affiliator's behalf (active or inactive) for its whole
// available balance, to its stored bank account. No request body. 201 with the payout.
func (h *AffiliatorHandler) StaffRequestPayout(w http.ResponseWriter, r *http.Request) {
	id, ok := urlID(w, r)
	if !ok {
		return
	}
	staffID, _ := middleware.GetStaffUserID(r.Context())
	p, err := h.svc.StaffRequestPayout(r.Context(), id, staffID)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "affiliator tidak ditemukan"})
		case errors.Is(err, service.ErrStaffPayoutPending):
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
		case errors.Is(err, repository.ErrStatusConflict):
			respondJSON(w, http.StatusConflict, map[string]string{"error": affiliatorDataChangedMessage})
		case errors.Is(err, service.ErrStaffPayoutNothingAvailable), errors.Is(err, service.ErrStaffPayoutBankMissing):
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		default:
			log.Printf("[Affiliator] staff %d: payout on behalf of affiliator %d failed: %v", staffID, id, err)
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		}
		return
	}
	respondJSON(w, http.StatusCreated, p)
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

// Friendly 409 texts for repository.ErrStatusConflict ("record status changed concurrently" must
// never reach the UI).
const (
	// staffPayoutProcessedMessage: another staff member already marked the payout paid or rejected it.
	staffPayoutProcessedMessage = "Pencairan ini sudah diproses staf lain. Muat ulang halaman."
	// affiliatorDataChangedMessage: the data changed under a concurrent request (e.g. the commissions
	// of a payout being created changed); reloading shows the current state.
	affiliatorDataChangedMessage = "Data sudah berubah karena ada proses lain. Muat ulang halaman lalu coba lagi."
)

// conflictMessage is the 409 text of respondAffiliatorError.
func conflictMessage(err error) string {
	if errors.Is(err, repository.ErrStatusConflict) {
		return affiliatorDataChangedMessage
	}
	return err.Error()
}
