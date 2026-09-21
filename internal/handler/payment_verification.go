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

type rejectVerificationRequest struct {
	RejectionReason string `json:"rejection_reason"`
}

// PaymentVerificationHandler handles staff payment verification approval and rejection endpoints.
type PaymentVerificationHandler struct {
	subscriptionService service.SubscriptionService
}

// NewPaymentVerificationHandler creates a new PaymentVerificationHandler instance.
func NewPaymentVerificationHandler(subscriptionService service.SubscriptionService) *PaymentVerificationHandler {
	return &PaymentVerificationHandler{subscriptionService: subscriptionService}
}

// List handles GET /api/staff/payment-verifications.
func (h *PaymentVerificationHandler) List(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	var optionalTenantID []uint64
	if tidStr := strings.TrimSpace(r.URL.Query().Get("tenant_id")); tidStr != "" {
		if tid, err := strconv.ParseUint(tidStr, 10, 64); err == nil && tid > 0 {
			optionalTenantID = append(optionalTenantID, tid)
		}
	}

	list, err := h.subscriptionService.ListStaffVerifications(r.Context(), statusFilter, optionalTenantID...)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat daftar verifikasi pembayaran"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"payment_verifications": list,
	})
}

// Approve handles PATCH /api/staff/payment-verifications/{id}/approve.
func (h *PaymentVerificationHandler) Approve(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID verifikasi tidak valid"})
		return
	}

	err = h.subscriptionService.ApproveVerification(r.Context(), id, staffUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data verifikasi tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrVerificationAlreadyDone) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menyetujui verifikasi pembayaran"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Pembayaran berhasil disetujui dan masa aktif langganan travel telah diperbarui",
	})
}

// Reject handles PATCH /api/staff/payment-verifications/{id}/reject.
func (h *PaymentVerificationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID verifikasi tidak valid"})
		return
	}

	var req rejectVerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	req.RejectionReason = strings.TrimSpace(req.RejectionReason)
	if req.RejectionReason == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Alasan penolakan wajib diisi"})
		return
	}

	err = h.subscriptionService.RejectVerification(r.Context(), id, req.RejectionReason, staffUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data verifikasi tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrVerificationAlreadyDone) || errors.Is(err, service.ErrRejectionReasonRequired) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menolak verifikasi pembayaran"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Pembayaran berhasil ditolak",
	})
}

type updatePlanRequest struct {
	PlanID uint64 `json:"plan_id"`
}

// UpdatePlan handles PATCH /api/staff/payment-verifications/{id}/plan.
func (h *PaymentVerificationHandler) UpdatePlan(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID verifikasi tidak valid"})
		return
	}

	var req updatePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PlanID == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Plan ID wajib diisi"})
		return
	}

	updatedPV, err := h.subscriptionService.UpdateVerificationPlan(r.Context(), id, req.PlanID, staffUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data verifikasi tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrVerificationAlreadyDone) || errors.Is(err, service.ErrPlanNotFound) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memperbarui paket verifikasi: " + err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":              "Paket berhasil diubah",
		"payment_verification": updatedPV,
	})
}

type applyCouponRequest struct {
	CouponCode *string `json:"coupon_code"` // null = remove coupon
}

// ApplyCoupon handles PATCH /api/staff/payment-verifications/{id}/coupon.
// Staff can apply a coupon code to a pending verification or remove it (by sending null).
func (h *PaymentVerificationHandler) ApplyCoupon(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID verifikasi tidak valid"})
		return
	}

	var req applyCouponRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	updatedPV, err := h.subscriptionService.UpdateVerificationCoupon(r.Context(), id, req.CouponCode, staffUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data verifikasi tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrVerificationAlreadyDone) ||
			errors.Is(err, service.ErrCouponNotFound) ||
			errors.Is(err, service.ErrCouponInactive) ||
			errors.Is(err, service.ErrCouponExpired) ||
			errors.Is(err, service.ErrCouponExhausted) ||
			errors.Is(err, service.ErrCouponPlanMismatch) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menerapkan kupon: " + err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":              "Kupon berhasil diterapkan",
		"payment_verification": updatedPV,
	})
}
