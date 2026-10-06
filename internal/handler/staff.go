package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

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

type impersonateTenantRequest struct {
	Reason string `json:"reason"`
}

// StaffHandler handles staff authentication and cross-tenant platform queries.
type StaffHandler struct {
	staffService service.StaffService
	// Brute-force protection, same as admin/agent/affiliator login: failed logins per email, plus a
	// per-IP cap on login calls.
	loginFailures *middleware.LoginFailureLimiter
	loginLimiter  func(http.Handler) http.Handler
}

// NewStaffHandler creates a new StaffHandler instance.
func NewStaffHandler(staffService service.StaffService) *StaffHandler {
	return &StaffHandler{
		staffService:  staffService,
		loginFailures: middleware.NewLoginFailureLimiter(5, 15*time.Minute),
		loginLimiter:  middleware.NewIPRateLimiter(20, time.Minute),
	}
}

// RegisterPublicRoutes mounts the unauthenticated staff routes (login) behind the per-IP limiter.
func (h *StaffHandler) RegisterPublicRoutes(r chi.Router) {
	r.With(h.loginLimiter).Post("/api/staff/login", h.Login)
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

	key := middleware.LoginKey("staff", req.Email)
	attempt, allowed := h.loginFailures.Begin(key)
	if !allowed {
		respondJSON(w, http.StatusTooManyRequests, map[string]string{"error": middleware.LoginLockedMessage})
		return
	}
	defer attempt.Done()

	res, err := h.staffService.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrStaffInvalidCredentials) {
			attempt.Fail()
			respondJSON(w, http.StatusUnauthorized, map[string]string{"error": "Email atau password salah"})
			return
		}
		if errors.Is(err, service.ErrStaffInactive) {
			// Only reachable with the correct password: the service checks the password first.
			respondJSON(w, http.StatusForbidden, map[string]string{"error": "Akun staf tidak aktif"})
			return
		}
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Terjadi kesalahan pada server"})
		return
	}

	attempt.Succeed()
	respondJSON(w, http.StatusOK, res)
}

// Logout handles POST /api/staff/logout: deletes the staff session server-side, so a copied token stops
// working instead of staying valid until it expires. Mounted behind StaffAuthMiddleware.
func (h *StaffHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.staffService.Logout(r.Context(), bearerToken(r)); err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal logout"})
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
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

	detail, err := h.staffService.GetTenantDetail(r.Context(), tenantID, staffUserID)
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

	// Length is checked without surrounding spaces, but the password is stored exactly as typed
	// because login compares the raw value.
	if len(strings.TrimSpace(req.NewPassword)) < service.MinPasswordLength {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Password baru minimal 8 karakter"})
		return
	}

	if err := h.staffService.ResetTenantAdminPassword(r.Context(), tenantID, adminUserID, req.NewPassword, staffUserID); err != nil {
		if errors.Is(err, service.ErrPasswordTooLong) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
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

	var req impersonateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Alasan akses wajib diisi"})
		return
	}

	res, err := h.staffService.ImpersonateTenant(r.Context(), tenantID, staffUserID, req.Reason)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Tenant tidak ditemukan"})
			return
		}
		if errors.Is(err, service.ErrAccessReasonInvalid) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, service.ErrAccessLogNotConfigured) {
			respondJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
			return
		}
		log.Printf("staff impersonation (tenant %d): %v", tenantID, err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	// The staff browser opens the travel dashboard with a one-time code (see auth_handoff.go); the
	// impersonation token itself is not sent back, so it never lands in a URL.
	tenantName, tenantStatus := "", "active"
	if res.Tenant != nil {
		tenantName = res.Tenant.Name
		if res.Tenant.Status != "" {
			tenantStatus = res.Tenant.Status
		}
	}
	code, err := issueHandoff(w, r, handoffPayload{
		LoginResult: service.LoginResult{
			Token:        res.Token,
			ExpiresAt:    res.ExpiresAt,
			TenantStatus: tenantStatus,
			User: service.AdminUserInfo{
				ID:         res.AdminUser.ID,
				TenantID:   res.TenantID,
				TenantName: tenantName,
				Email:      res.AdminUser.Email,
				Name:       res.AdminUser.Name,
				Status:     res.AdminUser.Status,
			},
		},
		Impersonated: true,
	})
	if err != nil {
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	respondJSON(w, http.StatusOK, impersonateTenantResponse{
		HandoffCode: code,
		ExpiresAt:   res.ExpiresAt,
		TenantID:    res.TenantID,
		Tenant:      res.Tenant,
		AdminUser:   res.AdminUser,
	})
}

// impersonateTenantResponse is TenantImpersonationResult without the session token.
type impersonateTenantResponse struct {
	HandoffCode string                       `json:"handoff_code"`
	ExpiresAt   time.Time                    `json:"expires_at"`
	TenantID    uint64                       `json:"tenant_id"`
	Tenant      *repository.Tenant           `json:"tenant"`
	AdminUser   service.StaffTenantAdminItem `json:"admin_user"`
}

type updateTenantSubscriptionRequest struct {
	PlanID       uint64 `json:"plan_id"`
	PeriodMonths int    `json:"period_months,omitempty"`
}

// UpdateTenantSubscription handles PATCH /api/staff/tenants/{id}/subscription.
func (h *StaffHandler) UpdateTenantSubscription(w http.ResponseWriter, r *http.Request) {
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

	var req updateTenantSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Format request tidak valid"})
		return
	}
	if req.PlanID == 0 {
		respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Paket langganan wajib dipilih"})
		return
	}

	if err := h.staffService.UpdateTenantSubscription(r.Context(), tenantID, req.PlanID, staffUserID, req.PeriodMonths); err != nil {
		switch {
		case errors.Is(err, service.ErrPlanNotFound):
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Paket langganan tidak ditemukan"})
		case errors.Is(err, service.ErrStaffTenantNotFound):
			respondJSON(w, http.StatusNotFound, map[string]string{"error": "Travel tidak ditemukan"})
		case errors.Is(err, service.ErrInvalidManualPeriod):
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "Masa langganan harus 1-120 bulan"})
		default:
			log.Printf("staff update subscription (tenant %d): %v", tenantID, err)
			respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memperbarui langganan, coba lagi"})
		}
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
		if isStaffUserInputError(err) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		log.Printf("staff create user: %v", err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membuat akun staf"})
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

	user, err := h.staffService.UpdateStaffUser(r.Context(), targetID, req.Name, req.Email, req.Password, req.Status, currentStaffID, bearerToken(r))
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
		if isStaffUserInputError(err) {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		log.Printf("staff update user %d: %v", targetID, err)
		respondJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memperbarui akun staf"})
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// isStaffUserInputError: validation errors of the staff user form, shown to the user as 400.
func isStaffUserInputError(err error) bool {
	return errors.Is(err, service.ErrStaffNameRequired) ||
		errors.Is(err, service.ErrStaffEmailInvalid) ||
		errors.Is(err, service.ErrStaffPasswordTooShort)
}



