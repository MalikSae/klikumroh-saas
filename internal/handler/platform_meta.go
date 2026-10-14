package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// PlatformMetaHandler serves KlikUmroh's own Meta Pixel + Conversions API settings (internal dashboard)
// and the public Pixel ID for the klikumroh.id pages.
type PlatformMetaHandler struct {
	metaService service.PlatformMetaService
}

// NewPlatformMetaHandler creates the handler.
func NewPlatformMetaHandler(metaService service.PlatformMetaService) *PlatformMetaHandler {
	return &PlatformMetaHandler{metaService: metaService}
}

func (h *PlatformMetaHandler) respondError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidMetaPixelID),
		errors.Is(err, service.ErrInvalidMetaToken),
		errors.Is(err, service.ErrInvalidMetaTestCode),
		errors.Is(err, service.ErrMetaNotConfigured),
		errors.Is(err, service.ErrMetaTestCodeRequired):
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	case errors.Is(err, util.ErrEncryptionKeyMissing), errors.Is(err, util.ErrEncryptionKeyInvalid):
		respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "server belum siap menyimpan token (APP_ENCRYPTION_KEY belum dikonfigurasi)"})
	default:
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
	}
}

// GetStaff handles GET /api/staff/platform-meta. The token is never returned, only whether it is set.
func (h *PlatformMetaHandler) GetStaff(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.GetStaffUserID(r.Context()); !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	view, err := h.metaService.GetSettings(r.Context())
	if err != nil {
		h.respondError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, view)
}

// SaveStaff handles PUT /api/staff/platform-meta.
func (h *PlatformMetaHandler) SaveStaff(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.GetStaffUserID(r.Context()); !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	var input service.PlatformMetaInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}
	view, err := h.metaService.SaveSettings(r.Context(), input)
	if err != nil {
		h.respondError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, view)
}

// TestStaff handles POST /api/staff/platform-meta/test: sends a test event with the test event code.
func (h *PlatformMetaHandler) TestStaff(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.GetStaffUserID(r.Context()); !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}
	result, err := h.metaService.SendTestEvent(r.Context(), middleware.ClientIP(r), r.UserAgent())
	if err != nil {
		if errors.Is(err, service.ErrMetaNotConfigured) || errors.Is(err, service.ErrMetaTestCodeRequired) {
			h.respondError(w, err)
			return
		}
		// Meta's own answer (e.g. invalid token) is useful to staff; it contains no secret.
		respondJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, result)
}

// GetPublic handles GET /api/public/platform-meta-pixel: only the Pixel ID, "" when not configured.
func (h *PlatformMetaHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	pixelID, err := h.metaService.PublicPixelID(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"pixel_id": pixelID})
}
