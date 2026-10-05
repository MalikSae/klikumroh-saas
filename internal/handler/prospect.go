package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type updateProspectStatusPayload struct {
	Status             string  `json:"status"`
	LostReason         *string `json:"lost_reason"`
	LostReasonCategory *string `json:"lost_reason_category"`
}

type addNotePayload struct {
	NoteText string `json:"note_text"`
}

// ProspectHandler handles Prospect endpoints.
type ProspectHandler struct {
	prospectService service.ProspectService
	// Public endpoints are rate limited per visitor IP (the Next.js proxy forwards X-Forwarded-For).
	publicProspectLimiter func(http.Handler) http.Handler
	referralClickLimiter  func(http.Handler) http.Handler
}

// NewProspectHandler creates a new ProspectHandler.
func NewProspectHandler(prospectService service.ProspectService) *ProspectHandler {
	return &ProspectHandler{
		prospectService:       prospectService,
		publicProspectLimiter: middleware.NewIPRateLimiter(10, 10*time.Minute),
		referralClickLimiter:  middleware.NewIPRateLimiter(30, time.Minute),
	}
}

// RegisterDashboardRoutes mounts dashboard routes (requires AuthMiddleware).
func (h *ProspectHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/prospects", h.List)
	r.Get("/api/dashboard/prospects/summary", h.Summary)
	r.Get("/api/dashboard/prospects/export", h.ExportCSV)
	r.Get("/api/dashboard/prospects/{id}", h.GetByID)
	r.Put("/api/dashboard/prospects/{id}", h.Update)
	r.Delete("/api/dashboard/prospects/{id}", h.Delete)
	r.Patch("/api/dashboard/prospects/{id}/status", h.UpdateStatus)
	r.Post("/api/dashboard/prospects/{id}/notes", h.AddNote)
	r.Patch("/api/dashboard/prospects/{id}/paid-off", h.MarkPaidOff)
	r.Post("/api/dashboard/prospects/{id}/cancel-closing", h.CancelClosing)
	r.Post("/api/dashboard/prospects/{id}/anonymize", h.Anonymize)
	r.Get("/api/dashboard/commission-release-policy", h.GetReleasePolicy)
	r.Put("/api/dashboard/commission-release-policy", h.SetReleasePolicy)
}

// RegisterPublicRoutes mounts public routes (requires TenantResolutionMiddleware).
func (h *ProspectHandler) RegisterPublicRoutes(r chi.Router) {
	r.With(h.publicProspectLimiter).Post("/api/public/prospects", h.CreatePublic)
	r.With(h.referralClickLimiter).Post("/api/public/referral-clicks", h.RecordReferralClick)
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

	ip := middleware.ClientIP(r)

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

	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var input service.PublicProspectInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	// Honeypot: the hidden "website" field is only filled in by bots. Answer like a normal success so
	// the bot learns nothing, but store nothing and notify nobody.
	if strings.TrimSpace(input.Website) != "" {
		respondJSON(w, http.StatusCreated, service.PublicProspectResponse{
			Message: "Terima kasih, tim kami akan segera menghubungi Anda",
		})
		return
	}

	input.ClientIP = middleware.ClientIP(r)
	input.UserAgent = r.UserAgent()
	res, err := h.prospectService.CreatePublic(r.Context(), tenantID, input)
	if err != nil {
		if errors.Is(err, service.ErrPackageNotFound) {
			// CRITICAL: Reject cross-tenant or missing package with 400 Bad Request
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		if isProspectInputError(err) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrTenantServiceSuspended) {
			respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, res)
}

var departurePlanParam = regexp.MustCompile(`^[0-9]{4}-(0[1-9]|1[0-2])$`)

// parseProspectFilter reads the list/export filters from the query string.
func parseProspectFilter(r *http.Request) repository.ProspectFilter {
	q := r.URL.Query()
	var filter repository.ProspectFilter

	if v := q.Get("status"); v != "" && v != "all" {
		filter.Status = &v
	}
	if v := q.Get("source"); v != "" && v != "all" {
		filter.Source = &v
	}
	if v := strings.TrimSpace(q.Get("search")); v != "" {
		filter.Search = &v
	}
	pkg := q.Get("package_id")
	if pkg == "" {
		pkg = q.Get("package")
	}
	if pkg != "" && pkg != "all" {
		if pid, err := strconv.ParseUint(pkg, 10, 64); err == nil && pid > 0 {
			filter.PackageID = &pid
		}
	}
	if v := q.Get("agent_id"); v != "" && v != "all" {
		if aid, err := strconv.ParseUint(v, 10, 64); err == nil && aid > 0 {
			filter.AgentID = &aid
		}
	}
	if v := q.Get("payoff"); v == "pending" || v == "done" {
		filter.Payoff = &v
	}
	if v := strings.TrimSpace(q.Get("departure_plan")); v == "none" || departurePlanParam.MatchString(v) {
		filter.DeparturePlan = &v
	}
	return filter
}

// List handles GET /api/dashboard/prospects (paginated: page, page_size).
func (h *ProspectHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))

	result, err := h.prospectService.ListPage(r.Context(), tenantID, parseProspectFilter(r), page, pageSize)
	if err != nil {
		if errors.Is(err, service.ErrInvalidProspectStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// Summary handles GET /api/dashboard/prospects/summary (pipeline counters for the whole tenant).
func (h *ProspectHandler) Summary(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	summary, err := h.prospectService.Summary(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

func parseProspectID(w http.ResponseWriter, r *http.Request) (uint64, bool) {
	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid prospect id"})
		return 0, false
	}
	return id, true
}

// GetByID handles GET /api/dashboard/prospects/{id}.
func (h *ProspectHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, ok := parseProspectID(w, r)
	if !ok {
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

// respondProspectError maps service errors of dashboard write endpoints to HTTP responses.
func respondProspectError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "prospek tidak ditemukan"})
	case isProspectInputError(err):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	case isProspectConflictError(err):
		respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// Update handles PUT /api/dashboard/prospects/{id}.
func (h *ProspectHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, _ := middleware.GetAdminUserID(r.Context())
	id, ok := parseProspectID(w, r)
	if !ok {
		return
	}

	var input service.UpdateProspectInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	if err := h.prospectService.UpdateDetail(r.Context(), tenantID, id, adminUserID, input); err != nil {
		respondProspectError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "prospek berhasil diperbarui"})
}

// Delete handles DELETE /api/dashboard/prospects/{id} (spam/test entries; closed prospects are kept).
func (h *ProspectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, ok := parseProspectID(w, r)
	if !ok {
		return
	}

	if err := h.prospectService.Delete(r.Context(), tenantID, id); err != nil {
		respondProspectError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "prospek berhasil dihapus"})
}

// UpdateStatus handles PATCH /api/dashboard/prospects/{id}/status.
func (h *ProspectHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, _ := middleware.GetAdminUserID(r.Context())
	id, ok := parseProspectID(w, r)
	if !ok {
		return
	}

	var payload updateProspectStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	if err := h.prospectService.UpdateStatus(r.Context(), tenantID, id, adminUserID, payload.Status, payload.LostReason, payload.LostReasonCategory); err != nil {
		respondProspectError(w, err)
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
	id, ok := parseProspectID(w, r)
	if !ok {
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
		if isProspectInputError(err) || strings.Contains(err.Error(), "catatan tidak boleh kosong") {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
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

	csvData, err := h.prospectService.ExportCSV(r.Context(), tenantID, parseProspectFilter(r))
	if err != nil {
		if errors.Is(err, service.ErrInvalidProspectStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to export CSV"})
		return
	}

	filename := fmt.Sprintf("prospek-%s.csv", service.TodayWIB())
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(csvData)
}

// MarkPaidOff handles PATCH /api/dashboard/prospects/{id}/paid-off (jamaah lunas: release commission).
func (h *ProspectHandler) MarkPaidOff(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, _ := middleware.GetAdminUserID(r.Context())
	id, ok := parseProspectID(w, r)
	if !ok {
		return
	}
	if err := h.prospectService.MarkPaidOff(r.Context(), tenantID, id, adminUserID); err != nil {
		respondProspectError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "jamaah ditandai lunas, komisi agen dapat dicairkan"})
}

// Anonymize handles POST /api/dashboard/prospects/{id}/anonymize: removes the jamaah's personal data
// on their request (UU PDP), keeping the status and commission history.
func (h *ProspectHandler) Anonymize(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, _ := middleware.GetAdminUserID(r.Context())
	id, ok := parseProspectID(w, r)
	if !ok {
		return
	}
	if err := h.prospectService.Anonymize(r.Context(), tenantID, id, adminUserID); err != nil {
		respondProspectError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "data pribadi jamaah sudah dihapus"})
}

type cancelClosingPayload struct {
	Reason string `json:"reason"`
}

// CancelClosing handles POST /api/dashboard/prospects/{id}/cancel-closing (jamaah batal setelah DP).
func (h *ProspectHandler) CancelClosing(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	adminUserID, _ := middleware.GetAdminUserID(r.Context())
	id, ok := parseProspectID(w, r)
	if !ok {
		return
	}
	var payload cancelClosingPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}
	result, err := h.prospectService.CancelClosing(r.Context(), tenantID, id, adminUserID, payload.Reason)
	if err != nil {
		respondProspectError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

type releasePolicyPayload struct {
	CommissionReleaseOn string `json:"commission_release_on"`
}

// GetReleasePolicy handles GET /api/dashboard/commission-release-policy.
func (h *ProspectHandler) GetReleasePolicy(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	v, err := h.prospectService.GetCommissionReleaseOn(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	respondJSON(w, http.StatusOK, releasePolicyPayload{CommissionReleaseOn: v})
}

// SetReleasePolicy handles PUT /api/dashboard/commission-release-policy ('lunas' or 'dp').
func (h *ProspectHandler) SetReleasePolicy(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var payload releasePolicyPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}
	if err := h.prospectService.SetCommissionReleaseOn(r.Context(), tenantID, payload.CommissionReleaseOn); err != nil {
		respondProspectError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, payload)
}
