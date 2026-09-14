package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// CreatePackagePayload defines allowed request body fields for POST /api/dashboard/packages.
// Strictly contains only package attributes; tenant_id and id are never accepted from body.
type CreatePackagePayload struct {
	Name               string   `json:"name"`
	Description        *string  `json:"description"`
	Price              *float64 `json:"price"`
	CommissionAmount   *float64 `json:"commission_amount"`
	DepartureDate      *string  `json:"departure_date"` // YYYY-MM-DD or RFC3339
	Quota              *int     `json:"quota"`
	Status             string   `json:"status"`
	Itinerary          *string  `json:"itinerary"`
	FacilitiesIncluded *string  `json:"facilities_included"`
	FacilitiesExcluded *string  `json:"facilities_excluded"`
	HotelInfo          *string  `json:"hotel_info"`
	FlightInfo         *string  `json:"flight_info"`
	TermsConditions    *string  `json:"terms_conditions"`
}

// UpdatePackagePayload defines allowed request body fields for PUT /api/dashboard/packages/{id}.
// Strictly contains only package attributes; tenant_id and id cannot be supplied or modified from body.
type UpdatePackagePayload struct {
	Name               string   `json:"name"`
	Description        *string  `json:"description"`
	Price              *float64 `json:"price"`
	CommissionAmount   *float64 `json:"commission_amount"`
	DepartureDate      *string  `json:"departure_date"` // YYYY-MM-DD or RFC3339
	Quota              *int     `json:"quota"`
	Status             string   `json:"status"`
	Itinerary          *string  `json:"itinerary"`
	FacilitiesIncluded *string  `json:"facilities_included"`
	FacilitiesExcluded *string  `json:"facilities_excluded"`
	HotelInfo          *string  `json:"hotel_info"`
	FlightInfo         *string  `json:"flight_info"`
	TermsConditions    *string  `json:"terms_conditions"`
}

// PackageHandler handles Package endpoints.
type PackageHandler struct {
	packageService service.PackageService
	photoService   service.PackagePhotoService
}

// NewPackageHandler creates a new PackageHandler.
func NewPackageHandler(packageService service.PackageService, photoService service.PackagePhotoService) *PackageHandler {
	return &PackageHandler{packageService: packageService, photoService: photoService}
}

// RegisterDashboardRoutes mounts dashboard routes (requires AuthMiddleware).
func (h *PackageHandler) RegisterDashboardRoutes(r chi.Router) {
	r.Post("/api/dashboard/packages", h.Create)
	r.Get("/api/dashboard/packages", h.List)
	r.Get("/api/dashboard/packages/{id}", h.GetByID)
	r.Put("/api/dashboard/packages/{id}", h.Update)
	r.Delete("/api/dashboard/packages/{id}", h.Delete)

	// Photo endpoints
	r.Post("/api/dashboard/packages/{id}/photos", h.UploadPhoto)
	r.Delete("/api/dashboard/packages/{id}/photos/{photoId}", h.DeletePhoto)
	r.Put("/api/dashboard/packages/{id}/photos/{photoId}/move", h.MovePhoto)
}

// RegisterPublicRoutes mounts public routes (requires TenantResolutionMiddleware).
func (h *PackageHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/public/packages", h.ListPublic)
	r.Get("/api/public/packages/{id}", h.GetPublic)
}

// Create handles POST /api/dashboard/packages.
func (h *PackageHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload CreatePackagePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	var departureDate *time.Time
	if payload.DepartureDate != nil && *payload.DepartureDate != "" {
		if t, err := time.Parse("2006-01-02", *payload.DepartureDate); err == nil {
			departureDate = &t
		} else if t, err := time.Parse(time.RFC3339, *payload.DepartureDate); err == nil {
			departureDate = &t
		} else {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid departure_date format, use YYYY-MM-DD"})
			return
		}
	}

	pkg := &repository.Package{
		Name:               payload.Name,
		Description:        payload.Description,
		Price:              payload.Price,
		CommissionAmount:   payload.CommissionAmount,
		DepartureDate:      departureDate,
		Quota:              payload.Quota,
		Status:             payload.Status,
		Itinerary:          payload.Itinerary,
		FacilitiesIncluded: payload.FacilitiesIncluded,
		FacilitiesExcluded: payload.FacilitiesExcluded,
		HotelInfo:          payload.HotelInfo,
		FlightInfo:         payload.FlightInfo,
		TermsConditions:    payload.TermsConditions,
	}

	if err := h.packageService.Create(r.Context(), tenantID, pkg); err != nil {
		if errors.Is(err, service.ErrPackageNameRequired) || errors.Is(err, service.ErrInvalidPackageStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusCreated, pkg)
}

// GetByID handles GET /api/dashboard/packages/{id}.
func (h *PackageHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid package id"})
		return
	}

	pkg, err := h.packageService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, pkg)
}

// List handles GET /api/dashboard/packages.
func (h *PackageHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	statusFilter := r.URL.Query().Get("status")
	var statusPtr *string
	if statusFilter != "" {
		statusPtr = &statusFilter
	}

	packages, err := h.packageService.List(r.Context(), tenantID, statusPtr)
	if err != nil {
		if errors.Is(err, service.ErrInvalidPackageStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, packages)
}

// ListPublic handles GET /api/public/packages (strictly published packages).
func (h *PackageHandler) ListPublic(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	packages, err := h.packageService.ListPublished(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, packages)
}

// GetPublic handles GET /api/public/packages/{id} (strictly published packages).
func (h *PackageHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "tenant not found"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid package id"})
		return
	}

	pkg, err := h.packageService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	if pkg.Status != "published" {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
		return
	}

	respondJSON(w, http.StatusOK, pkg)
}

// Update handles PUT /api/dashboard/packages/{id}.
func (h *PackageHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid package id"})
		return
	}

	var payload UpdatePackagePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
		return
	}

	var departureDate *time.Time
	if payload.DepartureDate != nil && *payload.DepartureDate != "" {
		if t, err := time.Parse("2006-01-02", *payload.DepartureDate); err == nil {
			departureDate = &t
		} else if t, err := time.Parse(time.RFC3339, *payload.DepartureDate); err == nil {
			departureDate = &t
		} else {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid departure_date format, use YYYY-MM-DD"})
			return
		}
	}

	pkg := &repository.Package{
		ID:                 id,
		Name:               payload.Name,
		Description:        payload.Description,
		Price:              payload.Price,
		CommissionAmount:   payload.CommissionAmount,
		DepartureDate:      departureDate,
		Quota:              payload.Quota,
		Status:             payload.Status,
		Itinerary:          payload.Itinerary,
		FacilitiesIncluded: payload.FacilitiesIncluded,
		FacilitiesExcluded: payload.FacilitiesExcluded,
		HotelInfo:          payload.HotelInfo,
		FlightInfo:         payload.FlightInfo,
		TermsConditions:    payload.TermsConditions,
	}

	if err := h.packageService.Update(r.Context(), tenantID, pkg); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrPackageNameRequired) || errors.Is(err, service.ErrInvalidPackageStatus) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, pkg)
}

// Delete handles DELETE /api/dashboard/packages/{id}.
func (h *PackageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid package id"})
		return
	}

	if err := h.packageService.Delete(r.Context(), tenantID, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "paket tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrPackageInUse) || errors.Is(err, repository.ErrForeignKeyViolation) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": service.ErrPackageInUse.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "paket berhasil dihapus"})
}
