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

// TeamHandler handles HTTP endpoints for team management and personal profile.
type TeamHandler struct {
	teamService service.TeamService
}

// NewTeamHandler creates a new TeamHandler instance.
func NewTeamHandler(teamService service.TeamService) *TeamHandler {
	return &TeamHandler{
		teamService: teamService,
	}
}

// RegisterDashboardRoutes mounts protected dashboard team and profile routes.
func (h *TeamHandler) RegisterDashboardRoutes(r chi.Router) {
	// Team management
	r.Get("/api/dashboard/team", h.ListTeam)
	r.Post("/api/dashboard/team", h.AddTeamMember)
	r.Patch("/api/dashboard/team/{id}/toggle-status", h.ToggleStatus)

	// Personal profile ("me")
	r.Get("/api/dashboard/me", h.GetMyProfile)
	r.Put("/api/dashboard/me", h.UpdateMyProfile)
	r.Put("/api/dashboard/me/password", h.UpdateMyPassword)
}

// AddTeamMemberPayload defines the JSON body for creating a new team member.
type AddTeamMemberPayload struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// ToggleStatusPayload defines the JSON body for toggling active/inactive status.
type ToggleStatusPayload struct {
	Action string `json:"action"`
}

// UpdateMyProfilePayload defines the JSON body for updating profile details.
type UpdateMyProfilePayload struct {
	Name  *string `json:"name"`
	Email *string `json:"email"`
}

// UpdateMyPasswordPayload defines the JSON body for changing password.
type UpdateMyPasswordPayload struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ListTeam handles GET /api/dashboard/team.
func (h *TeamHandler) ListTeam(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	members, err := h.teamService.ListTeam(r.Context(), tenantID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil data tim"})
		return
	}

	respondJSON(w, http.StatusOK, members)
}

// AddTeamMember handles POST /api/dashboard/team.
func (h *TeamHandler) AddTeamMember(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload AddTeamMemberPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format data tidak valid"})
		return
	}

	member, err := h.teamService.AddTeamMember(r.Context(), tenantID, payload.Name, payload.Email, payload.Password)
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyExists) ||
			errors.Is(err, service.ErrPasswordTooShort) ||
			errors.Is(err, service.ErrNameRequired) ||
			errors.Is(err, service.ErrEmailRequired) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal menambahkan anggota tim"})
		return
	}

	respondJSON(w, http.StatusCreated, member)
}

// ToggleStatus handles PATCH /api/dashboard/team/{id}/toggle-status.
func (h *TeamHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	currentAdminUserID, okAdmin := middleware.GetAdminUserID(r.Context())
	if !ok || !okAdmin {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	idParam := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idParam, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID anggota tidak valid"})
		return
	}

	var payload ToggleStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format data tidak valid"})
		return
	}

	updated, err := h.teamService.ToggleStatus(r.Context(), tenantID, currentAdminUserID, targetID, payload.Action)
	if err != nil {
		if errors.Is(err, service.ErrCannotDeactivateSelf) ||
			errors.Is(err, service.ErrCannotDeactivateLastActiveAdmin) ||
			errors.Is(err, service.ErrInvalidAction) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "anggota tim tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengubah status anggota"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// GetMyProfile handles GET /api/dashboard/me.
func (h *TeamHandler) GetMyProfile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	adminUserID, okAdmin := middleware.GetAdminUserID(r.Context())
	if !ok || !okAdmin {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	profile, err := h.teamService.GetMyProfile(r.Context(), tenantID, adminUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "profil tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengambil profil"})
		return
	}

	respondJSON(w, http.StatusOK, profile)
}

// UpdateMyProfile handles PUT /api/dashboard/me.
func (h *TeamHandler) UpdateMyProfile(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	adminUserID, okAdmin := middleware.GetAdminUserID(r.Context())
	if !ok || !okAdmin {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateMyProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format data tidak valid"})
		return
	}

	updated, err := h.teamService.UpdateMyProfile(r.Context(), tenantID, adminUserID, payload.Name, payload.Email)
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyExists) ||
			errors.Is(err, service.ErrNameRequired) ||
			errors.Is(err, service.ErrEmailRequired) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "profil tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal memperbarui profil"})
		return
	}

	respondJSON(w, http.StatusOK, updated)
}

// UpdateMyPassword handles PUT /api/dashboard/me/password.
func (h *TeamHandler) UpdateMyPassword(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	adminUserID, okAdmin := middleware.GetAdminUserID(r.Context())
	if !ok || !okAdmin {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var payload UpdateMyPasswordPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format data tidak valid"})
		return
	}

	if payload.CurrentPassword == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "password saat ini wajib diisi"})
		return
	}

	err := h.teamService.UpdateMyPassword(r.Context(), tenantID, adminUserID, payload.CurrentPassword, payload.NewPassword)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCurrentPassword) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrPasswordTooShort) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "profil tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengubah password"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "password berhasil diperbarui"})
}
