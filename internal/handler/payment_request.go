package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// PaymentRequestHandler serves jamaah payment proofs (closing DP, pelunasan): the agent sends one, the
// travel admin approves or rejects it (founder decision 7 Oct 2026).
type PaymentRequestHandler struct {
	svc service.ProspectService
}

func NewPaymentRequestHandler(svc service.ProspectService) *PaymentRequestHandler {
	return &PaymentRequestHandler{svc: svc}
}

// RegisterAgentRoutes mounts the agent endpoint (behind agent auth).
func (h *PaymentRequestHandler) RegisterAgentRoutes(r chi.Router) {
	r.Post("/api/agent/jamaah/{id}/payment-requests", h.Submit)
}

// RegisterDashboardRoutes mounts the travel admin endpoints (behind dashboard auth).
func (h *PaymentRequestHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/payment-requests", h.ListPending)
	r.Post("/api/dashboard/payment-requests/{id}/approve", h.Approve)
	r.Post("/api/dashboard/payment-requests/{id}/reject", h.Reject)
}

func paymentRequestError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "data tidak ditemukan"})
	case errors.Is(err, service.ErrAgentNotActive):
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
	case errors.Is(err, service.ErrPaymentRequestPending), errors.Is(err, service.ErrPaymentRequestDecided), isProspectConflictError(err):
		respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	case errors.Is(err, service.ErrPaymentRequestKind), errors.Is(err, service.ErrPaymentProofRequired),
		errors.Is(err, service.ErrPaymentRequestClosingNA), errors.Is(err, service.ErrPaymentRequestPaidOffNA),
		errors.Is(err, service.ErrPaymentRejectReason), errors.Is(err, service.ErrPaymentRequestNoteLong),
		errors.Is(err, service.ErrPaymentRequestAmount), errors.Is(err, service.ErrProspectAlreadyClosed),
		isProspectInputError(err):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	case util.IsImageBusyError(err):
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "server sedang sibuk memproses gambar, coba lagi sebentar"})
	case util.IsImageClientError(err):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "gambar tidak valid atau terlalu besar, unggah foto JPG, PNG, atau WebP"})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// Submit handles POST /api/agent/jamaah/{id}/payment-requests (multipart: kind, proof_file, amount, note,
// package_id, jumlah_jamaah).
func (h *PaymentRequestHandler) Submit(w http.ResponseWriter, r *http.Request) {
	tenantID, ok1 := middleware.GetTenantID(r.Context())
	agentID, ok2 := middleware.GetAgentID(r.Context())
	if !ok1 || !ok2 {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	prospectID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "id jamaah tidak valid"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ukuran berkas maksimal 10 MB"})
		return
	}
	file, _, err := r.FormFile("proof_file")
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": service.ErrPaymentProofRequired.Error()})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "berkas tidak dapat dibaca"})
		return
	}

	input := service.PaymentRequestInput{Kind: r.FormValue("kind"), ProofBytes: data}
	if v := strings.TrimSpace(r.FormValue("amount")); v != "" {
		amount, err := strconv.ParseFloat(v, 64)
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": service.ErrPaymentRequestAmount.Error()})
			return
		}
		input.Amount = &amount
	}
	if v := r.FormValue("note"); strings.TrimSpace(v) != "" {
		input.Note = &v
	}
	if v := strings.TrimSpace(r.FormValue("package_id")); v != "" {
		if id, err := strconv.ParseUint(v, 10, 64); err == nil {
			input.Details.PackageID = &id
		}
	}
	if v := strings.TrimSpace(r.FormValue("jumlah_jamaah")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			input.Details.JumlahJamaah = &n
		}
	}

	req, err := h.svc.SubmitPaymentRequestByAgent(r.Context(), tenantID, agentID, prospectID, input)
	if err != nil {
		paymentRequestError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, req)
}

// ListPending handles GET /api/dashboard/payment-requests: proofs waiting for this travel's admin.
func (h *PaymentRequestHandler) ListPending(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok || tenantID == 0 {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	list, err := h.svc.ListPendingPaymentRequests(r.Context(), tenantID)
	if err != nil {
		paymentRequestError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *PaymentRequestHandler) decide(w http.ResponseWriter, r *http.Request, approve bool) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	// 0 for a staff member viewing the travel (impersonation): no admin reviewer is recorded then.
	adminID, _ := middleware.GetAdminUserID(r.Context())
	if !ok || tenantID == 0 {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "id pengajuan tidak valid"})
		return
	}
	if approve {
		err = h.svc.ApprovePaymentRequest(r.Context(), tenantID, adminID, id)
	} else {
		var body struct {
			Reason string `json:"reason"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		err = h.svc.RejectPaymentRequest(r.Context(), tenantID, adminID, id, body.Reason)
	}
	if err != nil {
		paymentRequestError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "pengajuan diproses"})
}

func (h *PaymentRequestHandler) Approve(w http.ResponseWriter, r *http.Request) { h.decide(w, r, true) }
func (h *PaymentRequestHandler) Reject(w http.ResponseWriter, r *http.Request)  { h.decide(w, r, false) }
