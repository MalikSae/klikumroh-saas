package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type updateAgentJamaahStatusPayload struct {
	Status     string  `json:"status"`
	LostReason *string `json:"lost_reason"`
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

	jamaahList, err := h.prospectService.ListByAgent(r.Context(), tenantID, agentID, statusPtr)
	if err != nil {
		if errors.Is(err, service.ErrAgentNotActive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "akun agen belum aktif atau ditangguhkan"})
			return
		}
		if errors.Is(err, service.ErrInvalidProspectStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
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

	if err := h.prospectService.UpdateStatusByAgent(r.Context(), tenantID, agentID, id, payload.Status, payload.LostReason); err != nil {
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
		if errors.Is(err, service.ErrInvalidProspectStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
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
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
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
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrProspectNameRequired) || errors.Is(err, service.ErrProspectPhoneRequired) || errors.Is(err, service.ErrInvalidJumlahJamaah) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, prospect)
}
