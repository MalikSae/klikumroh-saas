package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type staffLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type resetAdminPasswordRequest struct {
	NewPassword string `json:"new_password"`
}

// StaffHandler handles staff authentication and cross-tenant platform queries.
type StaffHandler struct {
	staffService service.StaffService
}

// NewStaffHandler creates a new StaffHandler instance.
func NewStaffHandler(staffService service.StaffService) *StaffHandler {
	return &StaffHandler{staffService: staffService}
}

// Login handles POST /api/staff/login.
func (h *StaffHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req staffLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Email dan password wajib diisi"})
		return
	}

	res, err := h.staffService.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrStaffInvalidCredentials) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Email atau password salah"})
			return
		}
		if errors.Is(err, service.ErrStaffInactive) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "Akun staf tidak aktif"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Terjadi kesalahan pada server"})
		return
	}

	respondJSON(w, http.StatusOK, res)
}

// Me handles GET /api/staff/me.
func (h *StaffHandler) Me(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	profile, err := h.staffService.GetProfile(r.Context(), staffUserID)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mengambil data profil staf"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"staff": profile,
	})
}

// ListTenants handles GET /api/staff/tenants.
func (h *StaffHandler) ListTenants(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	tenants, err := h.staffService.ListTenants(r.Context(), statusFilter)
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat daftar travel"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"tenants": tenants,
	})
}

// GetTenantDetail handles GET /api/staff/tenants/{id}.
func (h *StaffHandler) GetTenantDetail(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	tenantID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tenant tidak valid"})
		return
	}

	detail, err := h.staffService.GetTenantDetail(r.Context(), tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mengambil data detail tenant"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"tenant": detail,
	})
}

// ResetTenantAdminPassword handles PATCH /api/staff/tenants/{id}/admin-users/{admin_user_id}/reset-password.
func (h *StaffHandler) ResetTenantAdminPassword(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	tenantID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tenant tidak valid"})
		return
	}

	adminUserIDStr := chi.URLParam(r, "admin_user_id")
	adminUserID, err := strconv.ParseUint(adminUserIDStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID admin user tidak valid"})
		return
	}

	var req resetAdminPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format JSON tidak valid"})
		return
	}

	trimmedPassword := strings.TrimSpace(req.NewPassword)
	if len(trimmedPassword) < 8 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Password baru minimal 8 karakter"})
		return
	}

	if err := h.staffService.ResetTenantAdminPassword(r.Context(), tenantID, adminUserID, trimmedPassword); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Admin user tidak ditemukan pada tenant ini"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mereset password admin user"})
		return
	}

	// Never return password in response!
	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Password admin user berhasil direset",
	})
}

// GetOverview handles GET /api/staff/overview.
func (h *StaffHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	overview, err := h.staffService.GetPlatformOverview(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat ringkasan performa platform"})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"overview": overview,
	})
}

// ImpersonateTenant handles POST /api/staff/tenants/{id}/impersonate.
func (h *StaffHandler) ImpersonateTenant(w http.ResponseWriter, r *http.Request) {
	staffUserID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	tenantID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tenant tidak valid"})
		return
	}

	res, err := h.staffService.ImpersonateTenant(r.Context(), tenantID, staffUserID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Tenant tidak ditemukan"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, res)
}

type updateTenantSubscriptionRequest struct {
	PlanID       uint64 `json:"plan_id"`
	PeriodMonths int    `json:"period_months,omitempty"`
}

// UpdateTenantSubscription handles PATCH /api/staff/tenants/{id}/subscription.
func (h *StaffHandler) UpdateTenantSubscription(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	tenantID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID tenant tidak valid"})
		return
	}

	var req updateTenantSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}
	if req.PlanID == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Paket langganan wajib dipilih"})
		return
	}

	if err := h.staffService.UpdateTenantSubscription(r.Context(), tenantID, req.PlanID, req.PeriodMonths); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memperbarui langganan: " + err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "Paket langganan travel berhasil diperbarui",
	})
}

type createStaffUserRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Status   string `json:"status"`
}

type updateStaffUserRequest struct {
	Name     string  `json:"name"`
	Email    string  `json:"email"`
	Password *string `json:"password,omitempty"`
	Status   string  `json:"status"`
}

// ListStaffUsers handles GET /api/staff/users.
func (h *StaffHandler) ListStaffUsers(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	users, err := h.staffService.ListStaffUsers(r.Context())
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memuat daftar staf"})
		return
	}

	respondJSON(w, http.StatusOK, users)
}

// CreateStaffUser handles POST /api/staff/users.
func (h *StaffHandler) CreateStaffUser(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	var req createStaffUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	user, err := h.staffService.CreateStaffUser(r.Context(), req.Name, req.Email, req.Password, req.Status)
	if err != nil {
		if errors.Is(err, service.ErrStaffEmailExists) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusCreated, user)
}

// UpdateStaffUser handles PUT /api/staff/users/{id}.
func (h *StaffHandler) UpdateStaffUser(w http.ResponseWriter, r *http.Request) {
	currentStaffID, ok := middleware.GetStaffUserID(r.Context())
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
		return
	}

	idStr := chi.URLParam(r, "id")
	targetID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "ID staf tidak valid"})
		return
	}

	var req updateStaffUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}

	user, err := h.staffService.UpdateStaffUser(r.Context(), targetID, req.Name, req.Email, req.Password, req.Status, currentStaffID)
	if err != nil {
		if errors.Is(err, service.ErrStaffCannotDeactivateSelf) {
			respondJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrStaffNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrStaffEmailExists) {
			respondJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	respondJSON(w, http.StatusOK, user)
}



