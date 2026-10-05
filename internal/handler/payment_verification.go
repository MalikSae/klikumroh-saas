package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log"
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

type approveVerificationRequest struct {
	ExpectedPlanID      *uint64  `json:"expected_plan_id"`
	ExpectedFinalAmount *float64 `json:"expected_final_amount"`
}

// approveCouponUsedMessage: the travel already paid an invoice with this coupon (one coupon per travel).
const approveCouponUsedMessage = "Travel ini sudah pernah memakai kupon pada invoice ini. Hapus atau ganti kupon (harga akan dihitung ulang), atau tolak pembayaran."

const approveProofRequiredMessage = "Bukti transfer belum diunggah. Tagihan di atas Rp 0 hanya bisa disetujui setelah ada bukti transfer."

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

	// Optional body {"expected_plan_id": N, "expected_final_amount": X}: what the staff member reviewed.
	// When given and the invoice no longer matches, the approval is refused with 409.
	var body approveVerificationRequest
	if r.Body != nil {
		if err := json.NewDecoder(io.LimitReader(r.Body, 4<<10)).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
			return
		}
	}

	err = h.subscriptionService.ApproveVerificationExpecting(r.Context(), id, staffUserID, service.ApprovalExpectation{
		PlanID:      body.ExpectedPlanID,
		FinalAmount: body.ExpectedFinalAmount,
	})
	if err != nil {
		if errors.Is(err, service.ErrVerificationChanged) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": service.ErrVerificationChanged.Error()})
			return
		}
		if errors.Is(err, service.ErrProofRequired) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": approveProofRequiredMessage})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data verifikasi tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrVerificationAlreadyDone) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrCouponExhausted) {
			respondJSON(w, http.StatusConflict, map[string]string{
				"error": "Kuota kupon pada invoice ini sudah habis. Hapus atau ganti kupon (harga akan dihitung ulang), atau tolak pembayaran.",
			})
			return
		}
		if errors.Is(err, service.ErrCouponInactive) {
			respondJSON(w, http.StatusConflict, map[string]string{
				"error": "Kupon pada invoice ini sudah dinonaktifkan. Hapus atau ganti kupon (harga akan dihitung ulang), atau tolak pembayaran.",
			})
			return
		}
		if errors.Is(err, service.ErrCouponUsedByTenant) {
			respondJSON(w, http.StatusConflict, map[string]string{
				"error": approveCouponUsedMessage,
			})
			return
		}
		if errors.Is(err, service.ErrCouponExpired) {
			respondJSON(w, http.StatusConflict, map[string]string{
				"error": "Invoice ini dibuat setelah kupon kedaluwarsa. Hapus atau ganti kupon (harga akan dihitung ulang), atau tolak pembayaran.",
			})
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
		if errors.Is(err, service.ErrVerificationAlreadyDone) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrRejectionReasonRequired) {
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
		// The invoice's coupon would not apply to the new plan: the plan is not changed, staff decide.
		if errors.Is(err, service.ErrCouponPlanMismatch) || errors.Is(err, service.ErrCouponInactive) ||
			errors.Is(err, service.ErrCouponExpired) || errors.Is(err, service.ErrCouponNotFound) ||
			errors.Is(err, service.ErrCouponUsedByTenant) {
			respondJSON(w, http.StatusConflict, map[string]string{
				"error": "Paket tidak diubah: kupon pada tagihan ini (" + err.Error() + ") tidak berlaku untuk paket baru. Hapus atau ganti kuponnya dulu, lalu ubah paket.",
			})
			return
		}
		log.Printf("[Payment] staff update plan of invoice %d: %v", id, err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memperbarui paket tagihan, coba lagi"})
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
			errors.Is(err, service.ErrCouponPlanMismatch) ||
			errors.Is(err, service.ErrCouponUsedByTenant) ||
			errors.Is(err, service.ErrAffiliatorCouponSignupOnly) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		log.Printf("[Payment] staff apply coupon to invoice %d: %v", id, err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menerapkan kupon, coba lagi"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":              "Kupon berhasil diterapkan",
		"payment_verification": updatedPV,
	})
}
