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
	"github.com/google/uuid"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"
)

// ContentHandler handles Banners, Testimonials, and FAQs endpoints.
type ContentHandler struct {
	contentService service.ContentService
}

// NewContentHandler creates a new ContentHandler.
func NewContentHandler(contentService service.ContentService) *ContentHandler {
	return &ContentHandler{contentService: contentService}
}

// RegisterDashboardRoutes mounts protected dashboard content routes (requires AuthMiddleware).
func (h *ContentHandler) RegisterDashboardRoutes(r chi.Router) {
	// Banners
	r.Get("/api/dashboard/banners", h.ListBanners)
	r.Post("/api/dashboard/banners", h.CreateBanner)
	r.Post("/api/dashboard/banners/upload", h.UploadBannerImage)
	r.Get("/api/dashboard/banners/{id}", h.GetBanner)
	r.Put("/api/dashboard/banners/{id}", h.UpdateBanner)
	r.Delete("/api/dashboard/banners/{id}", h.DeleteBanner)

	// Testimonials
	r.Get("/api/dashboard/testimonials", h.ListTestimonials)
	r.Post("/api/dashboard/testimonials", h.CreateTestimonial)
	r.Get("/api/dashboard/testimonials/{id}", h.GetTestimonial)
	r.Put("/api/dashboard/testimonials/{id}", h.UpdateTestimonial)
	r.Delete("/api/dashboard/testimonials/{id}", h.DeleteTestimonial)

	// FAQs
	r.Get("/api/dashboard/faqs", h.ListFAQs)
	r.Post("/api/dashboard/faqs", h.CreateFAQ)
	r.Get("/api/dashboard/faqs/{id}", h.GetFAQ)
	r.Put("/api/dashboard/faqs/{id}", h.UpdateFAQ)
	r.Delete("/api/dashboard/faqs/{id}", h.DeleteFAQ)
}

// RegisterPublicRoutes mounts public content routes (requires TenantResolutionMiddleware).
func (h *ContentHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/public/banners", h.PublicListBanners)
	r.Get("/api/public/testimonials", h.PublicListTestimonials)
	r.Get("/api/public/faqs", h.PublicListFAQs)
}

// -------------------------------------------------------------
// BANNER HANDLERS
// -------------------------------------------------------------

type BannerPayload struct {
	Title        string  `json:"title"`
	ImageURL     string  `json:"image_url"`
	Subtitle     *string `json:"subtitle"`
	CTAURL       *string `json:"cta_url"`
	DisplayOrder int     `json:"display_order"`
	IsActive     bool    `json:"is_active"`
}

func (h *ContentHandler) ListBanners(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	banners, err := h.contentService.ListBanners(r.Context(), tenantID, false)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if banners == nil {
		banners = []*repository.Banner{}
	}
	respondJSON(w, http.StatusOK, banners)
}

func (h *ContentHandler) CreateBanner(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload BannerPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	b := &repository.Banner{
		Title:        payload.Title,
		ImageURL:     payload.ImageURL,
		Subtitle:     payload.Subtitle,
		CTAURL:       payload.CTAURL,
		DisplayOrder: payload.DisplayOrder,
		IsActive:     payload.IsActive,
	}

	if err := h.contentService.CreateBanner(r.Context(), tenantID, b); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, b)
}

// UploadBannerImage handles POST /api/dashboard/banners/upload.
// Validates image (JPG/PNG/WebP), auto-orients, limits width to 1600px,
// and encodes to WebP using pure-Go converter to reduce storage & bandwidth.
func (h *ContentHandler) UploadBannerImage(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Limit request body to 8MB
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ukuran file maksimal 8MB atau format invalid"})
		return
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		file, _, err = r.FormFile("file")
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "file gambar banner wajib diunggah ('image' atau 'file')"})
			return
		}
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal membaca file"})
		return
	}

	fileName := uuid.New().String() + ".webp"
	relPath := fmt.Sprintf("/uploads/%d/banners/%s", tenantID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "banners", fileName)

	// Convert and save to WebP with max width 1600 and quality 82
	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 82); err != nil {
		if errors.Is(err, util.ErrInvalidImageFormat) || errors.Is(err, util.ErrCorruptImage) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengonversi gambar ke WebP"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"image_url": relPath,
	})
}

func (h *ContentHandler) GetBanner(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid banner ID"})
		return
	}

	b, err := h.contentService.GetBanner(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "banner tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, b)
}

func (h *ContentHandler) UpdateBanner(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid banner ID"})
		return
	}

	var payload BannerPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	b := &repository.Banner{
		ID:           id,
		TenantID:     tenantID,
		Title:        payload.Title,
		ImageURL:     payload.ImageURL,
		Subtitle:     payload.Subtitle,
		CTAURL:       payload.CTAURL,
		DisplayOrder: payload.DisplayOrder,
		IsActive:     payload.IsActive,
	}

	if err := h.contentService.UpdateBanner(r.Context(), tenantID, b); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "banner tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, b)
}

func (h *ContentHandler) DeleteBanner(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid banner ID"})
		return
	}

	// Retrieve existing banner to clean up local WebP file if stored locally
	existingBanner, _ := h.contentService.GetBanner(r.Context(), tenantID, id)

	if err := h.contentService.DeleteBanner(r.Context(), tenantID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "banner tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	if existingBanner != nil && strings.HasPrefix(existingBanner.ImageURL, fmt.Sprintf("/uploads/%d/banners/", tenantID)) {
		baseName := filepath.Base(existingBanner.ImageURL)
		localPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "banners", baseName)
		_ = os.Remove(localPath)
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "banner berhasil dihapus"})
}

func (h *ContentHandler) PublicListBanners(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	banners, err := h.contentService.ListBanners(r.Context(), tenantID, true)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if banners == nil {
		banners = []*repository.Banner{}
	}
	respondJSON(w, http.StatusOK, banners)
}

// -------------------------------------------------------------
// TESTIMONIAL HANDLERS
// -------------------------------------------------------------

type TestimonialPayload struct {
	Name         string  `json:"name"`
	PackageName  string  `json:"package_name"`
	Rating       int     `json:"rating"`
	Quote        string  `json:"quote"`
	AvatarURL    *string `json:"avatar_url"`
	DisplayOrder int     `json:"display_order"`
	IsActive     bool    `json:"is_active"`
}

func (h *ContentHandler) ListTestimonials(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	list, err := h.contentService.ListTestimonials(r.Context(), tenantID, false)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if list == nil {
		list = []*repository.Testimonial{}
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *ContentHandler) CreateTestimonial(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload TestimonialPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	t := &repository.Testimonial{
		Name:         payload.Name,
		PackageName:  payload.PackageName,
		Rating:       payload.Rating,
		Quote:        payload.Quote,
		AvatarURL:    payload.AvatarURL,
		DisplayOrder: payload.DisplayOrder,
		IsActive:     payload.IsActive,
	}

	if err := h.contentService.CreateTestimonial(r.Context(), tenantID, t); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, t)
}

func (h *ContentHandler) GetTestimonial(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid testimonial ID"})
		return
	}

	t, err := h.contentService.GetTestimonial(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "testimoni tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, t)
}

func (h *ContentHandler) UpdateTestimonial(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid testimonial ID"})
		return
	}

	var payload TestimonialPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	t := &repository.Testimonial{
		ID:           id,
		TenantID:     tenantID,
		Name:         payload.Name,
		PackageName:  payload.PackageName,
		Rating:       payload.Rating,
		Quote:        payload.Quote,
		AvatarURL:    payload.AvatarURL,
		DisplayOrder: payload.DisplayOrder,
		IsActive:     payload.IsActive,
	}

	if err := h.contentService.UpdateTestimonial(r.Context(), tenantID, t); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "testimoni tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, t)
}

func (h *ContentHandler) DeleteTestimonial(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid testimonial ID"})
		return
	}

	if err := h.contentService.DeleteTestimonial(r.Context(), tenantID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "testimoni tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "testimoni berhasil dihapus"})
}

func (h *ContentHandler) PublicListTestimonials(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	list, err := h.contentService.ListTestimonials(r.Context(), tenantID, true)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if list == nil {
		list = []*repository.Testimonial{}
	}
	respondJSON(w, http.StatusOK, list)
}

// -------------------------------------------------------------
// FAQ HANDLERS
// -------------------------------------------------------------

type FAQPayload struct {
	Question     string `json:"question"`
	Answer       string `json:"answer"`
	DisplayOrder int    `json:"display_order"`
	IsActive     bool   `json:"is_active"`
}

func (h *ContentHandler) ListFAQs(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	list, err := h.contentService.ListFAQs(r.Context(), tenantID, false)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if list == nil {
		list = []*repository.FAQ{}
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *ContentHandler) CreateFAQ(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload FAQPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	f := &repository.FAQ{
		Question:     payload.Question,
		Answer:       payload.Answer,
		DisplayOrder: payload.DisplayOrder,
		IsActive:     payload.IsActive,
	}

	if err := h.contentService.CreateFAQ(r.Context(), tenantID, f); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, f)
}

func (h *ContentHandler) GetFAQ(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid FAQ ID"})
		return
	}

	f, err := h.contentService.GetFAQ(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "FAQ tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, f)
}

func (h *ContentHandler) UpdateFAQ(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid FAQ ID"})
		return
	}

	var payload FAQPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	f := &repository.FAQ{
		ID:           id,
		TenantID:     tenantID,
		Question:     payload.Question,
		Answer:       payload.Answer,
		DisplayOrder: payload.DisplayOrder,
		IsActive:     payload.IsActive,
	}

	if err := h.contentService.UpdateFAQ(r.Context(), tenantID, f); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "FAQ tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, f)
}

func (h *ContentHandler) DeleteFAQ(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid FAQ ID"})
		return
	}

	if err := h.contentService.DeleteFAQ(r.Context(), tenantID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "FAQ tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "FAQ berhasil dihapus"})
}

func (h *ContentHandler) PublicListFAQs(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	list, err := h.contentService.ListFAQs(r.Context(), tenantID, true)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}
	if list == nil {
		list = []*repository.FAQ{}
	}
	respondJSON(w, http.StatusOK, list)
}
