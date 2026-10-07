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

type updateAgentJamaahStatusPayload struct {
	Status             string  `json:"status"`
	LostReason         *string `json:"lost_reason"`
	LostReasonCategory *string `json:"lost_reason_category"`
	// Package and jamaah count for a prospect that has none yet (required from Tertarik on).
	PackageID    *uint64 `json:"package_id"`
	JumlahJamaah *int    `json:"jumlah_jamaah"`
}

type addAgentJamaahNotePayload struct {
	NoteText string `json:"note_text"`
}

// AgentJamaahHandler handles agent-facing endpoints for managing their own jamaah/prospects.
type AgentJamaahHandler struct {
	prospectService service.ProspectService
}

// NewAgentJamaahHandler creates a new AgentJamaahHandler.
func NewAgentJamaahHandler(prospectService service.ProspectService) *AgentJamaahHandler {
	return &AgentJamaahHandler{
		prospectService: prospectService,
	}
}

// RegisterRoutes mounts agent-protected jamaah routes.
func (h *AgentJamaahHandler) RegisterRoutes(r chi.Router) {
	r.Get("/api/agent/jamaah", h.List)
	r.Post("/api/agent/jamaah", h.CreateManual)
	r.Get("/api/agent/jamaah/{id}", h.GetDetail)
	r.Patch("/api/agent/jamaah/{id}/status", h.UpdateStatus)
	r.Post("/api/agent/jamaah/{id}/notes", h.AddNote)
}

// List handles GET /api/agent/jamaah?status=...
func (h *AgentJamaahHandler) List(w http.ResponseWriter, r *http.Request) {
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

	statusFilter := r.URL.Query().Get("status")
	var statusPtr *string
	if statusFilter != "" {
		statusPtr = &statusFilter
	}

	respondErr := func(err error) {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
			return
		}
		if errors.Is(err, service.ErrInvalidProspectStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}

	// Paged form (?page=&page_size=) for the jamaah list; without page the full list is returned
	// (used by pickers such as the WhatsApp script page).
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		page, _ := strconv.Atoi(pageStr)
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		var searchPtr *string
		if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
			searchPtr = &search
		}
		result, err := h.prospectService.ListByAgentPage(r.Context(), tenantID, agentID, statusPtr, searchPtr, page, pageSize)
		if err != nil {
			respondErr(err)
			return
		}
		respondJSON(w, http.StatusOK, result)
		return
	}

	jamaahList, err := h.prospectService.ListByAgent(r.Context(), tenantID, agentID, statusPtr)
	if err != nil {
		respondErr(err)
		return
	}

	respondJSON(w, http.StatusOK, jamaahList)
}

// GetDetail handles GET /api/agent/jamaah/{id}
func (h *AgentJamaahHandler) GetDetail(w http.ResponseWriter, r *http.Request) {
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

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid jamaah id"})
		return
	}

	detail, err := h.prospectService.GetDetailForAgent(r.Context(), tenantID, agentID, id)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			// CRITICAL: 404, not 403, to avoid leaking existence of cross-agent records
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "jamaah tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, detail)
}

// UpdateStatus handles PATCH /api/agent/jamaah/{id}/status
func (h *AgentJamaahHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
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

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid jamaah id"})
		return
	}

	var payload updateAgentJamaahStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	if err := h.prospectService.UpdateStatusByAgent(r.Context(), tenantID, agentID, id, payload.Status, payload.LostReason, payload.LostReasonCategory, service.StatusDetails{PackageID: payload.PackageID, JumlahJamaah: payload.JumlahJamaah}); err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
			return
		}
		if errors.Is(err, service.ErrProspectAlreadyClosed) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrAgentCannotClose) {
			// CRITICAL: 403 Forbidden with exact clear message
			respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		if isProspectInputError(err) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if isProspectConflictError(err) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "jamaah tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "status jamaah berhasil diperbarui"})
}

// AddNote handles POST /api/agent/jamaah/{id}/notes
func (h *AgentJamaahHandler) AddNote(w http.ResponseWriter, r *http.Request) {
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

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid jamaah id"})
		return
	}

	var payload addAgentJamaahNotePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	note, err := h.prospectService.AddNoteByAgent(r.Context(), tenantID, agentID, id, payload.NoteText)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "jamaah tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrProspectAnonymized) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		if isProspectInputError(err) || strings.Contains(err.Error(), "catatan tidak boleh kosong") {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, note)
}

// CreateManual handles POST /api/agent/jamaah
func (h *AgentJamaahHandler) CreateManual(w http.ResponseWriter, r *http.Request) {
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

	var input service.AgentCreateProspectInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	prospect, err := h.prospectService.CreateManualByAgent(r.Context(), tenantID, agentID, input)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
			return
		}
		if errors.Is(err, service.ErrPackageNotFound) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "paket tidak ditemukan atau sudah tidak tersedia"})
			return
		}
		if isProspectConflictError(err) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		if isProspectInputError(err) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, prospect)
}
