package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// MetaIntegrationHandler serves a travel's Meta Pixel + Conversions API settings.
type MetaIntegrationHandler struct {
	metaService service.MetaService
}

// NewMetaIntegrationHandler creates the handler.
func NewMetaIntegrationHandler(metaService service.MetaService) *MetaIntegrationHandler {
	return &MetaIntegrationHandler{metaService: metaService}
}

// RegisterDashboardRoutes registers the admin (travel) routes; tenant comes from the admin session.
func (h *MetaIntegrationHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Get("/api/dashboard/meta-integration", h.Get)
	r.Put("/api/dashboard/meta-integration", h.Save)
	r.Post("/api/dashboard/meta-integration/test", h.Test)
}

// RegisterPublicRoutes registers the public route; tenant comes from the hostname.
func (h *MetaIntegrationHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/public/meta-pixel", h.PublicPixel)
}

func (h *MetaIntegrationHandler) respondError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "travel tidak ditemukan"})
	case errors.Is(err, service.ErrInvalidMetaPixelID),
		errors.Is(err, service.ErrInvalidMetaToken),
		errors.Is(err, service.ErrInvalidMetaTestCode),
		errors.Is(err, service.ErrMetaNotConfigured),
		errors.Is(err, service.ErrMetaTestCodeRequired):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	case errors.Is(err, util.ErrEncryptionKeyMissing), errors.Is(err, util.ErrEncryptionKeyInvalid):
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "server belum siap menyimpan token (kunci enkripsi belum dikonfigurasi), hubungi tim KlikUmroh"})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// Get handles GET /api/dashboard/meta-integration. The token is never returned, only whether it is set.
func (h *MetaIntegrationHandler) Get(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	view, err := h.metaService.GetSettings(r.Context(), tenantID)
	if err != nil {
		h.respondError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, view)
}

// Save handles PUT /api/dashboard/meta-integration.
func (h *MetaIntegrationHandler) Save(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	var input service.MetaSettingsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}
	view, err := h.metaService.SaveSettings(r.Context(), tenantID, input)
	if err != nil {
		h.respondError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, view)
}

// Test handles POST /api/dashboard/meta-integration/test: sends a test event with the test event code.
func (h *MetaIntegrationHandler) Test(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	result, err := h.metaService.SendTestEvent(r.Context(), tenantID, middleware.ClientIP(r), r.UserAgent())
	if err != nil {
		if errors.Is(err, service.ErrMetaNotConfigured) || errors.Is(err, service.ErrMetaTestCodeRequired) {
			h.respondError(w, err)
			return
		}
		// Meta's own answer (e.g. invalid token) is useful to the admin; it contains no secret.
		respondJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, result)
}

// PublicPixel handles GET /api/public/meta-pixel for the public site of the resolved tenant.
func (h *MetaIntegrationHandler) PublicPixel(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}
	pixelID, err := h.metaService.PublicPixelID(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"pixel_id": pixelID})
}
