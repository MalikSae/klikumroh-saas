package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// UpdateBrandingPayload defines the request body for PUT /api/dashboard/tenant/branding.
type UpdateBrandingPayload struct {
	BrandPrimaryColor string `json:"brand_primary_color"`
}

// UpdateWhatsAppPayload defines the request body for PUT /api/dashboard/tenant/whatsapp.
type UpdateWhatsAppPayload struct {
	WhatsAppNumber string `json:"whatsapp_number"`
}

// UpdateProfilePayload defines the request body for PUT /api/dashboard/tenant/profile.
type UpdateProfilePayload struct {
	Name         string  `json:"name"`
	BrandLogoURL *string `json:"brand_logo_url"`
	Tagline      *string `json:"tagline"`
	AboutSummary *string `json:"about_summary"`
}

// UpdateContactLegalPayload defines the request body for PUT /api/dashboard/tenant/contact-legal.
type UpdateContactLegalPayload struct {
	PPIUNumber      *string `json:"ppiu_number"`
	Address         *string `json:"address"`
	Phone           *string `json:"phone"`
	Email           *string `json:"email"`
	WhatsAppNumber  *string `json:"whatsapp_number"`
	SocialInstagram *string `json:"social_instagram"`
	SocialFacebook  *string `json:"social_facebook"`
	SocialYoutube   *string `json:"social_youtube"`
}

// UpdateTrustMetricsPayload defines the request body for PUT /api/dashboard/tenant/trust-metrics.
type UpdateTrustMetricsPayload struct {
	TrustRating      *string `json:"trust_rating"`
	TrustAlumniCount *string `json:"trust_alumni_count"`
	TrustGuarantee   *string `json:"trust_guarantee"`
}

// UpdateCommissionSettingsPayload defines the request body for PUT /api/dashboard/tenant/commission-settings.
type UpdateCommissionSettingsPayload struct {
	CommissionOverrideEnabled    bool     `json:"commission_override_enabled"`
	CommissionOverridePercentage *float64 `json:"commission_override_percentage"`
}

// UpdateSEOGeoPayload defines the request body for PUT /api/dashboard/tenant/seo-geo.
type UpdateSEOGeoPayload struct {
	City            *string `json:"city"`
	Province        *string `json:"province"`
	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`
	MetaKeywords    *string `json:"meta_keywords"`
}

// TenantHandler handles Tenant branding, profile, contact, trust metrics and public info HTTP endpoints.
type TenantHandler struct {
	tenantService service.TenantService
}

// NewTenantHandler creates a new TenantHandler.
func NewTenantHandler(tenantService service.TenantService) *TenantHandler {
	return &TenantHandler{tenantService: tenantService}
}

// RegisterDashboardRoutes mounts protected dashboard tenant routes (requires AuthMiddleware).
func (h *TenantHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Put("/api/dashboard/tenant/branding", h.UpdateBranding)
	r.Get("/api/dashboard/tenant/branding", h.GetBranding)
	r.Post("/api/dashboard/tenant/branding/icon", h.UploadBrandIcon)
	r.Delete("/api/dashboard/tenant/branding/icon", h.DeleteBrandIcon)
	r.Post("/api/dashboard/tenant/branding/logo", h.UploadBrandLogo)
	r.Delete("/api/dashboard/tenant/branding/logo", h.DeleteBrandLogo)
	r.Put("/api/dashboard/tenant/whatsapp", h.UpdateWhatsApp)
	r.Get("/api/dashboard/tenant/whatsapp", h.GetWhatsApp)
	r.Get("/api/dashboard/tenant/profile", h.GetProfile)
	r.Put("/api/dashboard/tenant/profile", h.UpdateProfile)
	r.Get("/api/dashboard/tenant/contact-legal", h.GetContactLegal)
	r.Put("/api/dashboard/tenant/contact-legal", h.UpdateContactLegal)
	r.Get("/api/dashboard/tenant/trust-metrics", h.GetTrustMetrics)
	r.Put("/api/dashboard/tenant/trust-metrics", h.UpdateTrustMetrics)
	r.Put("/api/dashboard/tenant/commission-settings", h.UpdateCommissionSettings)
	r.Get("/api/dashboard/tenant/commission-settings", h.GetCommissionSettings)
	r.Get("/api/dashboard/tenant/seo-geo", h.GetSEOGeo)
	r.Put("/api/dashboard/tenant/seo-geo", h.UpdateSEOGeo)
	r.Post("/api/dashboard/tenant/branding/og-image", h.UploadBrandOGImage)
	r.Delete("/api/dashboard/tenant/branding/og-image", h.DeleteBrandOGImage)
}

// RegisterPublicRoutes mounts public tenant routes (requires TenantResolutionMiddleware).
func (h *TenantHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/public/tenant-info", h.GetPublicInfo)
}

// UpdateBranding handles PUT /api/dashboard/tenant/branding.
func (h *TenantHandler) UpdateBranding(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateBrandingPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	branding, err := h.tenantService.UpdateBranding(r.Context(), tenantID, payload.BrandPrimaryColor)
	if err != nil {
		if errors.Is(err, service.ErrInvalidHexColor) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, branding)
}

// GetBranding handles GET /api/dashboard/tenant/branding.
func (h *TenantHandler) GetBranding(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	branding, err := h.tenantService.GetBranding(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, branding)
}

// UpdateWhatsApp handles PUT /api/dashboard/tenant/whatsapp.
func (h *TenantHandler) UpdateWhatsApp(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateWhatsAppPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	res, err := h.tenantService.UpdateWhatsApp(r.Context(), tenantID, payload.WhatsAppNumber)
	if err != nil {
		if errors.Is(err, service.ErrInvalidWhatsAppNumber) || errors.Is(err, service.ErrWhatsAppAlreadyInUse) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, res)
}

// GetWhatsApp handles GET /api/dashboard/tenant/whatsapp.
func (h *TenantHandler) GetWhatsApp(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	res, err := h.tenantService.GetWhatsApp(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, res)
}

// GetProfile handles GET /api/dashboard/tenant/profile.
func (h *TenantHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	profile, err := h.tenantService.GetProfile(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, profile)
}

// UpdateProfile handles PUT /api/dashboard/tenant/profile.
func (h *TenantHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	profile, err := h.tenantService.UpdateProfile(r.Context(), tenantID, payload.Name, payload.BrandLogoURL, payload.Tagline, payload.AboutSummary)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, profile)
}

// GetContactLegal handles GET /api/dashboard/tenant/contact-legal.
func (h *TenantHandler) GetContactLegal(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	data, err := h.tenantService.GetContactLegal(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, data)
}

// UpdateContactLegal handles PUT /api/dashboard/tenant/contact-legal.
func (h *TenantHandler) UpdateContactLegal(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateContactLegalPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	data, err := h.tenantService.UpdateContactLegal(r.Context(), tenantID,
		payload.PPIUNumber, payload.Address, payload.Phone, payload.Email,
		payload.WhatsAppNumber, payload.SocialInstagram, payload.SocialFacebook, payload.SocialYoutube,
	)
	if err != nil {
		if errors.Is(err, service.ErrInvalidWhatsAppNumber) || errors.Is(err, service.ErrWhatsAppAlreadyInUse) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, data)
}

// GetTrustMetrics handles GET /api/dashboard/tenant/trust-metrics.
func (h *TenantHandler) GetTrustMetrics(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	data, err := h.tenantService.GetTrustMetrics(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, data)
}

// UpdateTrustMetrics handles PUT /api/dashboard/tenant/trust-metrics.
func (h *TenantHandler) UpdateTrustMetrics(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateTrustMetricsPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	data, err := h.tenantService.UpdateTrustMetrics(r.Context(), tenantID, payload.TrustRating, payload.TrustAlumniCount, payload.TrustGuarantee)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, data)
}

// GetPublicInfo handles GET /api/public/tenant-info.
func (h *TenantHandler) GetPublicInfo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	info, err := h.tenantService.GetPublicInfo(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, info)
}

// UpdateCommissionSettings handles PUT /api/dashboard/tenant/commission-settings.
func (h *TenantHandler) UpdateCommissionSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateCommissionSettingsPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	settings, err := h.tenantService.UpdateCommissionSettings(r.Context(), tenantID, payload.CommissionOverrideEnabled, payload.CommissionOverridePercentage)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCommissionPercentage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// GetCommissionSettings handles GET /api/dashboard/tenant/commission-settings.
func (h *TenantHandler) GetCommissionSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	settings, err := h.tenantService.GetCommissionSettings(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, settings)
}

// UploadBrandIcon handles POST /api/dashboard/tenant/branding/icon.
func (h *TenantHandler) UploadBrandIcon(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 5<<20) // max 5MB
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "file too large (max 5MB) or invalid form"})
		return
	}

	file, _, err := r.FormFile("icon")
	if err != nil {
		file, _, err = r.FormFile("file")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'icon' field"})
			return
		}
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
		return
	}

	fileName := uuid.New().String() + ".png"
	relPath := fmt.Sprintf("/uploads/%d/branding/%s", tenantID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "branding", fileName)

	if err := util.ConvertAndSavePNGIcon(fileBytes, absPath, 256); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to process icon"})
		return
	}

	if err := h.tenantService.UpdateBrandIcon(r.Context(), tenantID, &relPath); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"brand_icon_url": relPath})
}

// DeleteBrandIcon handles DELETE /api/dashboard/tenant/branding/icon.
func (h *TenantHandler) DeleteBrandIcon(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.tenantService.UpdateBrandIcon(r.Context(), tenantID, nil); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "icon berhasil dihapus"})
}

// UploadBrandLogo handles POST /api/dashboard/tenant/branding/logo.
func (h *TenantHandler) UploadBrandLogo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 5<<20) // max 5MB
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "file too large (max 5MB) or invalid form"})
		return
	}

	file, _, err := r.FormFile("logo")
	if err != nil {
		file, _, err = r.FormFile("file")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'logo' field"})
			return
		}
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
		return
	}

	fileName := uuid.New().String() + ".png"
	relPath := fmt.Sprintf("/uploads/%d/branding/%s", tenantID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "branding", fileName)

	if err := util.ConvertAndSavePNGLogo(fileBytes, absPath, 600); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to process logo"})
		return
	}

	if err := h.tenantService.UpdateBrandLogo(r.Context(), tenantID, &relPath); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"brand_logo_url": relPath})
}

// DeleteBrandLogo handles DELETE /api/dashboard/tenant/branding/logo.
func (h *TenantHandler) DeleteBrandLogo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.tenantService.UpdateBrandLogo(r.Context(), tenantID, nil); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "logo berhasil dihapus"})
}

// GetSEOGeo handles GET /api/dashboard/tenant/seo-geo.
func (h *TenantHandler) GetSEOGeo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	data, err := h.tenantService.GetSEOGeo(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, data)
}

// UpdateSEOGeo handles PUT /api/dashboard/tenant/seo-geo.
func (h *TenantHandler) UpdateSEOGeo(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateSEOGeoPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	data, err := h.tenantService.UpdateSEOGeo(r.Context(), tenantID, payload.City, payload.Province, payload.MetaTitle, payload.MetaDescription, payload.MetaKeywords)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, data)
}

// UploadBrandOGImage handles POST /api/dashboard/tenant/branding/og-image.
func (h *TenantHandler) UploadBrandOGImage(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 5<<20) // max 5MB
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "file too large (max 5MB) or invalid form"})
		return
	}

	file, _, err := r.FormFile("og_image")
	if err != nil {
		file, _, err = r.FormFile("file")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "missing 'og_image' field"})
			return
		}
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to read file"})
		return
	}

	fileName := uuid.New().String() + ".png"
	relPath := fmt.Sprintf("/uploads/%d/branding/%s", tenantID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "branding", fileName)

	if err := util.ConvertAndSavePNGOGImage(fileBytes, absPath, 1200, 630); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to process og image"})
		return
	}

	if err := h.tenantService.UpdateOGImage(r.Context(), tenantID, &relPath); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"og_image_url": relPath})
}

// DeleteBrandOGImage handles DELETE /api/dashboard/tenant/branding/og-image.
func (h *TenantHandler) DeleteBrandOGImage(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	if err := h.tenantService.UpdateOGImage(r.Context(), tenantID, nil); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "og image berhasil dihapus"})
}

