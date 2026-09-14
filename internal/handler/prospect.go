package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type updateProspectStatusPayload struct {
	Status     string  `json:"status"`
	LostReason *string `json:"lost_reason"`
}

type addNotePayload struct {
	NoteText string `json:"note_text"`
}

// ProspectHandler handles Prospect endpoints.
type ProspectHandler struct {
	prospectService service.ProspectService
}

// NewProspectHandler creates a new ProspectHandler.
func NewProspectHandler(prospectService service.ProspectService) *ProspectHandler {
	return &ProspectHandler{prospectService: prospectService}
}

// RegisterDashboardRoutes mounts dashboard routes (requires AuthMiddleware).
func (h *ProspectHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/prospects", h.List)
	r.Get("/api/dashboard/prospects/export", h.ExportCSV)
	r.Get("/api/dashboard/prospects/{id}", h.GetByID)
	r.Put("/api/dashboard/prospects/{id}", h.Update)
	r.Patch("/api/dashboard/prospects/{id}/status", h.UpdateStatus)
	r.Post("/api/dashboard/prospects/{id}/notes", h.AddNote)
}

// RegisterPublicRoutes mounts public routes (requires TenantResolutionMiddleware).
func (h *ProspectHandler) RegisterPublicRoutes(r chi.Router) {
	r.Post("/api/public/prospects", h.CreatePublic)
	r.Post("/api/public/referral-clicks", h.RecordReferralClick)
}

type recordReferralClickPayload struct {
	ReferralCode string `json:"referral_code"`
}

// RecordReferralClick handles POST /api/public/referral-clicks.
func (h *ProspectHandler) RecordReferralClick(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	var payload recordReferralClickPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	trimmedCode := strings.TrimSpace(payload.ReferralCode)
	if trimmedCode == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "referral_code is required"})
		return
	}

	ip := r.Header.Get("X-Forwarded-For")
	if ip != "" {
		parts := strings.Split(ip, ",")
		ip = strings.TrimSpace(parts[0])
	} else {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			ip = host
		} else {
			ip = r.RemoteAddr
		}
	}

	if err := h.prospectService.RecordReferralClick(r.Context(), tenantID, trimmedCode, ip); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "agent with referral code not found"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, map[string]bool{"success": true})
}

// CreatePublic handles POST /api/public/prospects.
func (h *ProspectHandler) CreatePublic(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	var input service.PublicProspectInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	res, err := h.prospectService.CreatePublic(r.Context(), tenantID, input)
	if err != nil {
		if errors.Is(err, service.ErrPackageNotFound) {
			// CRITICAL: Reject cross-tenant or missing package with 400 Bad Request
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

	respondJSON(w, http.StatusCreated, res)
}

// List handles GET /api/dashboard/prospects.
func (h *ProspectHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	statusFilter := r.URL.Query().Get("status")
	sourceFilter := r.URL.Query().Get("source")
	searchFilter := r.URL.Query().Get("search")
	packageIDFilter := r.URL.Query().Get("package_id")
	if packageIDFilter == "" {
		packageIDFilter = r.URL.Query().Get("package")
	}

	var statusPtr, sourcePtr, searchPtr *string
	var packageIDPtr *uint64
	if statusFilter != "" && statusFilter != "all" {
		statusPtr = &statusFilter
	}
	if sourceFilter != "" && sourceFilter != "all" {
		sourcePtr = &sourceFilter
	}
	if searchFilter != "" {
		searchPtr = &searchFilter
	}
	if packageIDFilter != "" && packageIDFilter != "all" {
		if pid, err := strconv.ParseUint(packageIDFilter, 10, 64); err == nil && pid > 0 {
			packageIDPtr = &pid
		}
	}

	prospects, err := h.prospectService.List(r.Context(), tenantID, repository.ProspectFilter{
		Status:    statusPtr,
		Source:    sourcePtr,
		Search:    searchPtr,
		PackageID: packageIDPtr,
	})
	if err != nil {
		if errors.Is(err, service.ErrInvalidProspectStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, prospects)
}

// GetByID handles GET /api/dashboard/prospects/{id}.
func (h *ProspectHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid prospect id"})
		return
	}

	detail, err := h.prospectService.GetDetail(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "prospek tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, detail)
}

// Update handles PUT /api/dashboard/prospects/{id}.
func (h *ProspectHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	adminUserID, _ := middleware.GetAdminUserID(r.Context())

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid prospect id"})
		return
	}

	var input service.UpdateProspectInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	if err := h.prospectService.UpdateDetail(r.Context(), tenantID, id, adminUserID, input); err != nil {
		if errors.Is(err, service.ErrProspectNameRequired) || errors.Is(err, service.ErrProspectPhoneRequired) || errors.Is(err, service.ErrInvalidJumlahJamaah) || errors.Is(err, service.ErrPackageNotFound) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "prospek tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "prospek berhasil diperbarui"})
}

// UpdateStatus handles PATCH /api/dashboard/prospects/{id}/status.
func (h *ProspectHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	adminUserID, _ := middleware.GetAdminUserID(r.Context())

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid prospect id"})
		return
	}

	var payload updateProspectStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	if err := h.prospectService.UpdateStatus(r.Context(), tenantID, id, adminUserID, payload.Status, payload.LostReason); err != nil {
		if errors.Is(err, service.ErrInvalidProspectStatus) || errors.Is(err, service.ErrProspectAlreadyClosed) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "prospek tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "status prospek berhasil diperbarui"})
}

// AddNote handles POST /api/dashboard/prospects/{id}/notes.
func (h *ProspectHandler) AddNote(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	adminUserID, _ := middleware.GetAdminUserID(r.Context())

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid prospect id"})
		return
	}

	var payload addNotePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	note, err := h.prospectService.AddNote(r.Context(), tenantID, id, adminUserID, payload.NoteText)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "prospek tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, note)
}

// ExportCSV handles GET /api/dashboard/prospects/export.
func (h *ProspectHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	statusFilter := r.URL.Query().Get("status")
	sourceFilter := r.URL.Query().Get("source")
	searchFilter := r.URL.Query().Get("search")
	packageIDFilter := r.URL.Query().Get("package_id")
	if packageIDFilter == "" {
		packageIDFilter = r.URL.Query().Get("package")
	}

	var statusPtr, sourcePtr, searchPtr *string
	var packageIDPtr *uint64
	if statusFilter != "" && statusFilter != "all" {
		statusPtr = &statusFilter
	}
	if sourceFilter != "" && sourceFilter != "all" {
		sourcePtr = &sourceFilter
	}
	if searchFilter != "" {
		searchPtr = &searchFilter
	}
	if packageIDFilter != "" && packageIDFilter != "all" {
		if pid, err := strconv.ParseUint(packageIDFilter, 10, 64); err == nil && pid > 0 {
			packageIDPtr = &pid
		}
	}

	csvData, err := h.prospectService.ExportCSV(r.Context(), tenantID, repository.ProspectFilter{
		Status:    statusPtr,
		Source:    sourcePtr,
		Search:    searchPtr,
		PackageID: packageIDPtr,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to export CSV"})
		return
	}

	filename := fmt.Sprintf("prospek-%s.csv", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(csvData)
}
