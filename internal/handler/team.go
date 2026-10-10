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

// TeamHandler handles HTTP endpoints for team management and personal profile.
type TeamHandler struct {
	teamService service.TeamService
	// passwordFailures locks PUT /api/dashboard/me/password for an admin after repeated wrong current
	// passwords, so a stolen session token cannot brute-force the password online.
	passwordFailures *middleware.LoginFailureLimiter
}

// NewTeamHandler creates a new TeamHandler instance.
func NewTeamHandler(teamService service.TeamService) *TeamHandler {
	return &TeamHandler{
		teamService:      teamService,
		passwordFailures: middleware.NewLoginFailureLimiter(5, 15*time.Minute),
	}
}

// RegisterDashboardRoutes mounts protected dashboard team and profile routes.
// Adding, deactivating and re-roling members need the PIC role: pass middleware.RequirePIC(...) as requirePIC.
func (h *TeamHandler) RegisterDashboardRoutes(r chi.Router, requirePIC ...func(http.Handler) http.Handler) {
	// Team management: everyone in the team can see it, only the PIC changes it.
	managed := r.With(requirePIC...)
	r.Get("/api/dashboard/team", h.ListTeam)
	managed.Post("/api/dashboard/team", h.AddTeamMember)
	managed.Patch("/api/dashboard/team/{id}/toggle-status", h.ToggleStatus)
	managed.Patch("/api/dashboard/team/{id}/role", h.SetRole)

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
	Role     string `json:"role"`
}

// SetRolePayload defines the JSON body for changing a member's role.
type SetRolePayload struct {
	Role string `json:"role"`
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

	member, err := h.teamService.AddTeamMember(r.Context(), tenantID, payload.Name, payload.Email, payload.Password, payload.Role)
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyExists) ||
			errors.Is(err, service.ErrPasswordTooShort) ||
			errors.Is(err, service.ErrNameRequired) ||
			errors.Is(err, service.ErrEmailRequired) ||
			errors.Is(err, service.ErrInvalidRole) {
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
			errors.Is(err, service.ErrCannotRemoveLastPIC) ||
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

// SetRole handles PATCH /api/dashboard/team/{id}/role.
func (h *TeamHandler) SetRole(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	targetID, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID anggota tidak valid"})
		return
	}
	var payload SetRolePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "format data tidak valid"})
		return
	}
	updated, err := h.teamService.SetRole(r.Context(), tenantID, targetID, payload.Role)
	if err != nil {
		if errors.Is(err, service.ErrInvalidRole) || errors.Is(err, service.ErrCannotRemoveLastPIC) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "anggota tim tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "gagal mengubah peran anggota"})
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

	// Keyed by the account, not the IP: changing IP does not reset it.
	failKey := middleware.LoginKey("me-password", strconv.FormatUint(tenantID, 10), strconv.FormatUint(adminUserID, 10))
	attempt, allowed := h.passwordFailures.Begin(failKey)
	if !allowed {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": PasswordChangeLockedMessage})
		return
	}
	defer attempt.Done()

	err := h.teamService.UpdateMyPassword(r.Context(), tenantID, adminUserID, payload.CurrentPassword, payload.NewPassword, bearerToken(r))
	if err != nil {
		if errors.Is(err, service.ErrInvalidCurrentPassword) {
			attempt.Fail()
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

	attempt.Succeed()
	respondJSON(w, http.StatusOK, map[string]string{"message": "password berhasil diperbarui"})
}

// PasswordChangeLockedMessage is returned (HTTP 429) after 5 wrong current passwords in 15 minutes.
const PasswordChangeLockedMessage = "Terlalu banyak percobaan dengan password saat ini yang salah. Silakan coba lagi dalam 15 menit."
