package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

type AgentHandler struct {
	agentService service.AgentService
}

func NewAgentHandler(agentService service.AgentService) *AgentHandler {
	return &AgentHandler{
		agentService: agentService,
	}
}

// RegisterPublicRoutes mounts public routes for agent onboarding on subdomains.
func (h *AgentHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/public/agent-registration-info", h.GetRegistrationInfo)
	r.Post("/api/public/agents/register", h.Register)
	r.Post("/api/agent/login", h.Login)
}

// RegisterAgentProtectedRoutes mounts protected endpoints for authenticated agents.
func (h *AgentHandler) RegisterAgentProtectedRoutes(r chi.Router) {
	r.Get("/api/agent/me", h.GetMe)
	r.Get("/api/agent/dashboard-summary", h.GetDashboardSummary)
	r.Get("/api/agent/leaderboard", h.GetLeaderboard)
	r.Post("/api/agent/payment-proof", h.UploadPaymentProof)
	r.Get("/api/agent/payout-info", h.GetPayoutInfo)
	r.Post("/api/agent/payout-requests", h.CreatePayoutRequest)
	r.Get("/api/agent/commission-history", h.GetCommissionHistory)
	r.Put("/api/agent/profile", h.UpdateProfile)
	r.Post("/api/agent/profile/photo", h.UploadProfilePhoto)
	r.Put("/api/agent/password", h.UpdatePassword)
	r.Post("/api/agent/logout", h.Logout)
}

// RegisterDashboardRoutes mounts dashboard endpoints for admin users.
func (h *AgentHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/agents", h.ListDashboardAgents)
	r.Get("/api/dashboard/agents/{id}", h.GetDashboardAgentDetail)
	r.Get("/api/dashboard/agents/{id}/commissions", h.GetDashboardAgentCommissions)
	r.Put("/api/dashboard/agents/{id}", h.UpdateDashboardAgentProfile)
	r.Patch("/api/dashboard/agents/{id}/reset-password", h.ResetAgentPassword)
	r.Patch("/api/dashboard/agents/{id}/toggle-status", h.ToggleAgentStatus)
	r.Patch("/api/dashboard/agents/{id}/approve", h.ApproveAgent)
	r.Patch("/api/dashboard/agents/{id}/reject", h.RejectAgent)
	r.Get("/api/dashboard/tenant/agent-settings", h.GetAgentSettings)
	r.Put("/api/dashboard/tenant/agent-settings", h.UpdateAgentSettings)
	r.Post("/api/dashboard/tenant/agent-settings/poster", h.UploadAgentPoster)
	r.Delete("/api/dashboard/tenant/agent-settings/poster", h.DeleteAgentPoster)
	r.Get("/api/dashboard/tenant/target-settings", h.GetTargetSettings)
	r.Put("/api/dashboard/tenant/target-settings", h.UpdateTargetSettings)
	r.Get("/api/dashboard/payout-requests", h.ListPayoutRequests)
	r.Patch("/api/dashboard/payout-requests/{id}/approve", h.ApprovePayoutRequest)
	r.Patch("/api/dashboard/payout-requests/{id}/paid", h.MarkPayoutRequestPaid)
	r.Patch("/api/dashboard/payout-requests/{id}/reject", h.RejectPayoutRequest)
}

// GET /api/public/agent-registration-info
func (h *AgentHandler) GetRegistrationInfo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	info, err := h.agentService.GetRegistrationInfo(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, info)
}

// POST /api/public/agents/register
func (h *AgentHandler) Register(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	var req service.RegisterAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "nama lengkap wajib diisi"})
		return
	}
	if strings.TrimSpace(req.Phone) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "nomor whatsapp wajib diisi"})
		return
	}
	if strings.TrimSpace(req.Email) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "email wajib diisi"})
		return
	}
	if strings.TrimSpace(req.Domisili) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "domisili wajib dipilih"})
		return
	}
	if len(req.Password) < 6 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "password minimal 6 karakter"})
		return
	}

	// Fallback to cookie 'ref_code' if referral_code is not passed in request body
	if req.ReferralCode == nil || strings.TrimSpace(*req.ReferralCode) == "" {
		if cookie, err := r.Cookie("ref_code"); err == nil && cookie.Value != "" {
			val := strings.TrimSpace(cookie.Value)
			req.ReferralCode = &val
		}
	}

	res, err := h.agentService.Register(r.Context(), tenantID, &req)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicateAgentEmail) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": "email sudah terdaftar sebagai agen"})
			return
		}
		if errors.Is(err, repository.ErrDuplicateAgentPhone) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": "nomor whatsapp sudah terdaftar sebagai agen"})
			return
		}
		if errors.Is(err, service.ErrTermsRequired) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Syarat & Ketentuan wajib disetujui"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, res)
}

// POST /api/agent/login
func (h *AgentHandler) Login(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Password) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "email dan password wajib diisi"})
		return
	}

	res, err := h.agentService.Login(r.Context(), tenantID, req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "email atau password salah"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, res)
}

// POST /api/agent/logout
func (h *AgentHandler) Logout(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		token := strings.TrimSpace(parts[1])
		if token != "" {
			_ = h.agentService.Logout(r.Context(), token)
		}
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "berhasil logout"})
}

// GET /api/agent/me
func (h *AgentHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	profile, err := h.agentService.GetProfile(r.Context(), tenantID, agentID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, profile)
}

// GET /api/agent/dashboard-summary
func (h *AgentHandler) GetDashboardSummary(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}

	summary, err := h.agentService.GetDashboardSummary(r.Context(), tenantID, agentID, host)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "Akun belum aktif"})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, summary)
}

// GET /api/agent/leaderboard
func (h *AgentHandler) GetLeaderboard(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	entries, err := h.agentService.GetLeaderboard(r.Context(), tenantID, agentID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, entries)
}

// POST /api/agent/payment-proof
func (h *AgentHandler) UploadPaymentProof(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// 1. Check current agent payment status before processing heavy upload
	profile, err := h.agentService.GetProfile(r.Context(), tenantID, agentID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	if profile.PaymentStatus != "awaiting_proof" && profile.Status != "rejected" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "hanya agen dengan status menunggu bukti transfer atau ditolak yang dapat mengunggah bukti pembayaran"})
		return
	}

	// 2. Limit request to 8MB
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ukuran file melebihi 8MB atau format tidak valid"})
		return
	}

	// Support form field named 'proof', 'photo', or 'file'
	var file io.ReadCloser
	var formErr error
	for _, fieldName := range []string{"proof", "photo", "file", "payment_proof"} {
		f, _, err := r.FormFile(fieldName)
		if err == nil {
			file = f
			break
		}
		formErr = err
	}
	if file == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("file bukti pembayaran tidak ditemukan (%v)", formErr)})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal membaca file"})
		return
	}

	relPath := fmt.Sprintf("/uploads/%d/agents/%d/bukti-transfer.webp", tenantID, agentID)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "agents", fmt.Sprintf("%d", agentID), "bukti-transfer.webp")

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menyimpan bukti pembayaran"})
		return
	}

	updated, err := h.agentService.UpdatePaymentProof(r.Context(), tenantID, agentID, relPath)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// GET /api/dashboard/agents
func (h *AgentHandler) ListDashboardAgents(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	statusFilter := r.URL.Query().Get("status")
	agents, err := h.agentService.ListAgents(r.Context(), tenantID, statusFilter)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if agents == nil {
		agents = []repository.Agent{}
	}

	respondJSON(w, http.StatusOK, agents)
}

// PATCH /api/dashboard/agents/{id}/approve
func (h *AgentHandler) ApproveAgent(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	if err := h.agentService.ApproveAgent(r.Context(), tenantID, agentID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "agen berhasil disetujui"})
}

// PATCH /api/dashboard/agents/{id}/reject
func (h *AgentHandler) RejectAgent(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if err := h.agentService.RejectAgent(r.Context(), tenantID, agentID, req.Reason); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "agen berhasil ditolak"})
}

// GET /api/dashboard/agents/{id}
func (h *AgentHandler) GetDashboardAgentDetail(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	detail, err := h.agentService.GetDashboardAgentDetail(r.Context(), tenantID, agentID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agen tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, detail)
}

// GET /api/dashboard/agents/{id}/commissions
func (h *AgentHandler) GetDashboardAgentCommissions(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	history, err := h.agentService.GetCommissionHistoryForAdmin(r.Context(), tenantID, agentID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agen tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, history)
}

// PUT /api/dashboard/agents/{id}
func (h *AgentHandler) UpdateDashboardAgentProfile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	var req service.UpdateDashboardAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	detail, err := h.agentService.UpdateDashboardAgentProfile(r.Context(), tenantID, agentID, &req)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agen tidak ditemukan"})
			return
		}
		if errors.Is(err, repository.ErrDuplicateAgentEmail) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "email sudah terdaftar di travel ini"})
			return
		}
		if errors.Is(err, repository.ErrDuplicateAgentPhone) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "nomor whatsapp sudah terdaftar di travel ini"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, detail)
}

// PATCH /api/dashboard/agents/{id}/reset-password
func (h *AgentHandler) ResetAgentPassword(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	var payload struct {
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if err := h.agentService.ResetAgentPassword(r.Context(), tenantID, agentID, payload.NewPassword); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agen tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "password berhasil direset"})
}

// PATCH /api/dashboard/agents/{id}/toggle-status
func (h *AgentHandler) ToggleAgentStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	agentID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent id"})
		return
	}

	var payload struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if err := h.agentService.ToggleAgentStatus(r.Context(), tenantID, agentID, payload.Action); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agen tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "status agen berhasil diperbarui"})
}

// GET /api/dashboard/tenant/agent-settings
func (h *AgentHandler) GetAgentSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	settings, err := h.agentService.GetAgentSettings(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// PUT /api/dashboard/tenant/agent-settings
func (h *AgentHandler) UpdateAgentSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload repository.TenantAgentSettings
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if err := h.agentService.UpdateAgentSettings(r.Context(), tenantID, &payload); err != nil {
		if errors.Is(err, service.ErrMissingBankInfo) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "pengaturan sistem agen berhasil disimpan"})
}

// POST /api/dashboard/tenant/agent-settings/poster
func (h *AgentHandler) UploadAgentPoster(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Limit request to 8MB
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ukuran file melebihi 8MB atau format tidak valid"})
		return
	}

	var file io.ReadCloser
	var formErr error
	for _, fieldName := range []string{"poster", "file", "image", "photo"} {
		f, _, err := r.FormFile(fieldName)
		if err == nil {
			file = f
			break
		}
		formErr = err
	}
	if file == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("file poster tidak ditemukan (%v)", formErr)})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal membaca file"})
		return
	}

	relPath := fmt.Sprintf("/uploads/%d/agent/poster.webp", tenantID)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "agent", "poster.webp")

	if err := util.ConvertAndSaveSquareWebP(fileBytes, absPath, 1000, 85); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memproses poster agen"})
		return
	}

	if err := h.agentService.UpdateAgentPoster(r.Context(), tenantID, &relPath); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memperbarui pengaturan poster"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"poster_url": relPath,
		"message":    "Poster promosi agen berhasil diunggah",
	})
}

// DELETE /api/dashboard/tenant/agent-settings/poster
func (h *AgentHandler) DeleteAgentPoster(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "agent", "poster.webp")
	_ = os.Remove(absPath)

	if err := h.agentService.UpdateAgentPoster(r.Context(), tenantID, nil); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menghapus poster agen"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Poster agen berhasil dihapus",
	})
}

// GET /api/dashboard/tenant/target-settings
func (h *AgentHandler) GetTargetSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	settings, err := h.agentService.GetTargetSettings(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// PUT /api/dashboard/tenant/target-settings
func (h *AgentHandler) UpdateTargetSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload repository.TenantTargetSettings
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if err := h.agentService.UpdateTargetSettings(r.Context(), tenantID, &payload); err != nil {
		if errors.Is(err, service.ErrInvalidPeriodRange) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "pengaturan target bulanan agen berhasil disimpan"})
}

// GET /api/agent/payout-info
func (h *AgentHandler) GetPayoutInfo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	info, err := h.agentService.GetPayoutInfo(r.Context(), tenantID, agentID)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "Akun belum aktif"})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, info)
}

// GET /api/agent/commission-history
func (h *AgentHandler) GetCommissionHistory(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	history, err := h.agentService.GetCommissionHistory(r.Context(), tenantID, agentID)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "Akun belum aktif"})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, history)
}

// POST /api/agent/payout-requests
func (h *AgentHandler) CreatePayoutRequest(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload struct {
		AmountRequested   float64 `json:"amount_requested"`
		BankName          string  `json:"bank_name"`
		BankAccountNumber string  `json:"bank_account_number"`
		BankAccountHolder string  `json:"bank_account_holder"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	req, err := h.agentService.CreatePayoutRequest(r.Context(), tenantID, agentID, service.AgentCreatePayoutRequestInput{
		AmountRequested:   payload.AmountRequested,
		BankName:          payload.BankName,
		BankAccountNumber: payload.BankAccountNumber,
		BankAccountHolder: payload.BankAccountHolder,
	})
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, req)
}

// GET /api/dashboard/payout-requests
func (h *AgentHandler) ListPayoutRequests(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var statusFilter *string
	if s := r.URL.Query().Get("status"); s != "" {
		statusFilter = &s
	}

	items, err := h.agentService.ListPayoutRequests(r.Context(), tenantID, statusFilter)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, items)
}

// PATCH /api/dashboard/payout-requests/{id}/approve
func (h *AgentHandler) ApprovePayoutRequest(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, ok := middleware.GetAdminUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "id tidak valid"})
		return
	}

	if err := h.agentService.ApprovePayoutRequest(r.Context(), tenantID, id, adminUserID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "pengajuan penarikan berhasil disetujui"})
}

// PATCH /api/dashboard/payout-requests/{id}/paid
func (h *AgentHandler) MarkPayoutRequestPaid(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, ok := middleware.GetAdminUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "id tidak valid"})
		return
	}

	if err := h.agentService.MarkPayoutRequestPaid(r.Context(), tenantID, id, adminUserID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "pengajuan penarikan berhasil ditandai telah dibayar"})
}

// PATCH /api/dashboard/payout-requests/{id}/reject
func (h *AgentHandler) RejectPayoutRequest(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, ok := middleware.GetAdminUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "id tidak valid"})
		return
	}

	var payload struct {
		RejectionReason string `json:"rejection_reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if strings.TrimSpace(payload.RejectionReason) == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "alasan penolakan wajib diisi"})
		return
	}

	if err := h.agentService.RejectPayoutRequest(r.Context(), tenantID, id, adminUserID, payload.RejectionReason); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "pengajuan penarikan berhasil ditolak"})
}

// PUT /api/agent/profile
func (h *AgentHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req service.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	profile, err := h.agentService.UpdateProfile(r.Context(), tenantID, agentID, &req)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicateAgentEmail) || errors.Is(err, repository.ErrDuplicateAgentPhone) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, profile)
}

// POST /api/agent/profile/photo
func (h *AgentHandler) UploadProfilePhoto(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Max 5 MB
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ukuran file maksimal 5MB"})
		return
	}

	var file io.ReadCloser
	var formErr error
	for _, fieldName := range []string{"photo", "file", "image"} {
		f, _, err := r.FormFile(fieldName)
		if err == nil {
			file = f
			break
		}
		formErr = err
	}
	if file == nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("file foto tidak ditemukan (%v)", formErr)})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal membaca file"})
		return
	}

	relPath := fmt.Sprintf("/uploads/%d/agents/%d/photo.webp", tenantID, agentID)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "agents", fmt.Sprintf("%d", agentID), "photo.webp")

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 800, 80); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menyimpan foto profil"})
		return
	}

	updated, err := h.agentService.UpdatePhoto(r.Context(), tenantID, agentID, relPath)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// PUT /api/agent/password
func (h *AgentHandler) UpdatePassword(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	agentID, ok := middleware.GetAgentID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req service.UpdatePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format JSON tidak valid"})
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "password saat ini dan password baru wajib diisi"})
		return
	}

	if err := h.agentService.UpdatePassword(r.Context(), tenantID, agentID, &req); err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "password saat ini salah"})
			return
		}
		if strings.Contains(err.Error(), "minimal 8 karakter") {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "password berhasil diubah"})
}
