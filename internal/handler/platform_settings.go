package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"klikumroh/internal/middleware"
	"klikumroh/internal/service"
)

// PlatformSettingsHandler handles HTTP endpoints for global platform settings.
type PlatformSettingsHandler struct {
	settingsService service.PlatformSettingsService
}

// NewPlatformSettingsHandler creates a new PlatformSettingsHandler instance.
func NewPlatformSettingsHandler(settingsService service.PlatformSettingsService) *PlatformSettingsHandler {
	return &PlatformSettingsHandler{settingsService: settingsService}
}

// GetPublic handles GET /api/public/platform-settings.
func (h *PlatformSettingsHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	settings, err := h.settingsService.GetSettings(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat pengaturan platform"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// GetDashboard handles GET /api/dashboard/platform-settings (travel admin).
func (h *PlatformSettingsHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	settings, err := h.settingsService.GetSettings(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat pengaturan platform"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// GetStaff handles GET /api/staff/platform-settings (master admin).
func (h *PlatformSettingsHandler) GetStaff(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	settings, err := h.settingsService.GetSettings(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat pengaturan platform"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// UpdateStaff handles PUT /api/staff/platform-settings (master admin).
func (h *PlatformSettingsHandler) UpdateStaff(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var req service.UpdatePlatformSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	updated, err := h.settingsService.UpdateSettings(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidPlatformWhatsApp) ||
			errors.Is(err, service.ErrInvalidBankName) ||
			errors.Is(err, service.ErrInvalidBankAccountNumber) ||
			errors.Is(err, service.ErrInvalidBankAccountHolder) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menyimpan pengaturan platform"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"message":  "Pengaturan platform berhasil diperbarui",
		"settings": updated,
	})
}
