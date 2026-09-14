package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// SubscriptionHandler handles travel tenant subscription and renewal endpoints.
type SubscriptionHandler struct {
	subscriptionService service.SubscriptionService
	planService         service.PricingPlanService
}

// NewSubscriptionHandler creates a new SubscriptionHandler instance.
func NewSubscriptionHandler(
	subscriptionService service.SubscriptionService,
	planService service.PricingPlanService,
) *SubscriptionHandler {
	return &SubscriptionHandler{
		subscriptionService: subscriptionService,
		planService:         planService,
	}
}

// GetSubscription handles GET /api/dashboard/subscription.
func (h *SubscriptionHandler) GetSubscription(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	info, err := h.subscriptionService.GetSubscriptionInfo(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mengambil data langganan"})
		return
	}

	respondJSON(w, http.StatusOK, info)
}

// GetPricingPlans handles GET /api/dashboard/pricing-plans.
func (h *SubscriptionHandler) GetPricingPlans(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	plans, err := h.planService.List(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat daftar paket langganan"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"plans": plans,
	})
}

// CreateRenewalRequest handles POST /api/dashboard/subscription/renewal-request.
func (h *SubscriptionHandler) CreateRenewalRequest(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	// Parse multipart form up to 10MB
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Ukuran payload terlalu besar"})
		return
	}

	planIDStr := strings.TrimSpace(r.FormValue("plan_id"))
	if planIDStr == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID paket langganan wajib diisi"})
		return
	}

	planID, err := strconv.ParseUint(planIDStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID paket langganan tidak valid"})
		return
	}

	var couponCodePtr *string
	couponCode := strings.TrimSpace(r.FormValue("coupon_code"))
	if couponCode != "" {
		couponCodePtr = &couponCode
	}

	var savedProofRelPath *string
	var savedProofAbsPath string

	file, _, fileErr := r.FormFile("proof_file")
	if fileErr == nil {
		defer file.Close()

		fileBytes, err := io.ReadAll(file)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membaca berkas bukti transfer"})
			return
		}

		fileName := uuid.New().String() + ".webp"
		relPath := fmt.Sprintf("/uploads/%d/subscription-proofs/%s", tenantID, fileName)
		absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "subscription-proofs", fileName)

		if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
			if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
				respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mengonversi bukti transfer"})
			return
		}

		savedProofRelPath = &relPath
		savedProofAbsPath = absPath
	}

	pv, err := h.subscriptionService.CreateRenewalRequest(r.Context(), tenantID, planID, couponCodePtr, savedProofRelPath)
	if err != nil {
		if savedProofAbsPath != "" {
			_ = os.Remove(savedProofAbsPath)
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"message":              "Permohonan perpanjangan berhasil diajukan dan sedang menunggu verifikasi",
		"payment_verification": pv,
	})
}

// GetPaymentVerification handles GET /api/dashboard/subscription/payment-verifications/{id}.
func (h *SubscriptionHandler) GetPaymentVerification(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tagihan tidak valid"})
		return
	}

	pv, err := h.subscriptionService.GetPaymentVerificationByID(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, service.ErrVerificationNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data tagihan tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mengambil data tagihan"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"payment_verification": pv,
	})
}

// UploadRenewalProof handles POST /api/dashboard/subscription/payment-verifications/{id}/proof.
func (h *SubscriptionHandler) UploadRenewalProof(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tagihan tidak valid"})
		return
	}

	// Limit upload size to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Ukuran berkas melebihi batas 10MB"})
		return
	}

	file, _, err := r.FormFile("proof_file")
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Berkas bukti transfer wajib diunggah (field: proof_file)"})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membaca berkas bukti transfer"})
		return
	}

	proofURL, err := h.subscriptionService.UploadRenewalProof(r.Context(), tenantID, id, fileBytes)
	if err != nil {
		if errors.Is(err, service.ErrVerificationNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Data tagihan tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrVerificationNotPending) ||
			errors.Is(err, service.ErrEmptyProofFile) ||
			errors.Is(err, util.ErrInvalidImageFormat) ||
			errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memproses bukti transfer"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":   "Bukti transfer berhasil diunggah",
		"proof_url": proofURL,
	})
}
