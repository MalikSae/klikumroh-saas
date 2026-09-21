package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
)

// ErrStaffInvalidCredentials is returned when staff login authentication fails.
var ErrStaffInvalidCredentials = errors.New("email atau password staf tidak valid")

// ErrStaffInactive is returned when an inactive staff account tries to log in.
var ErrStaffInactive = errors.New("akun staf tidak aktif")

// ErrStaffEmailExists is returned when attempting to register a staff email that already exists.
var ErrStaffEmailExists = errors.New("email staf sudah terdaftar")

// ErrStaffCannotDeactivateSelf is returned when an active staff user tries to deactivate their own account.
var ErrStaffCannotDeactivateSelf = errors.New("tidak dapat menonaktifkan akun sendiri yang sedang aktif")

// ErrStaffNotFound is returned when a requested staff user does not exist.
var ErrStaffNotFound = errors.New("data staf tidak ditemukan")

// StaffUserInfo holds safe, non-sensitive staff user details.
type StaffUserInfo struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// StaffLoginResult contains authentication token and staff user data.
type StaffLoginResult struct {
	Token     string        `json:"token"`
	ExpiresAt time.Time     `json:"expires_at"`
	Staff     StaffUserInfo `json:"staff"`
}

// StaffTenantAdminItem represents a safe admin user representation without password hashes.
type StaffTenantAdminItem struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// StaffTenantDomainInfo contains subdomain and custom domain status for a tenant.
type StaffTenantDomainInfo struct {
	Subdomain          string  `json:"subdomain"`
	CustomDomain       *string `json:"custom_domain"`
	CustomDomainStatus *string `json:"custom_domain_status"`
}

// StaffTenantPlanInfo holds current subscription plan details.
type StaffTenantPlanInfo struct {
	ID           *uint64 `json:"id,omitempty"`
	Name         *string `json:"name,omitempty"`
	PeriodMonths *int    `json:"period_months,omitempty"`
}

// StaffTenantUsageStats represents high-level aggregate usage metrics.
type StaffTenantUsageStats struct {
	TotalPackages     int `json:"total_packages"`
	TotalProspects    int `json:"total_prospects"`
	TotalActiveAgents int `json:"total_active_agents"`
}

// StaffTenantDetail represents comprehensive tenant details for master admin views.
type StaffTenantDetail struct {
	ID                    uint64                 `json:"id"`
	Name                  string                 `json:"name"`
	Slug                  string                 `json:"slug"`
	Status                string                 `json:"status"`
	WhatsAppNumber        *string                `json:"whatsapp_number,omitempty"`
	Phone                 *string                `json:"phone,omitempty"`
	Email                 *string                `json:"email,omitempty"`
	Address               *string                `json:"address,omitempty"`
	City                  *string                `json:"city,omitempty"`
	Province              *string                `json:"province,omitempty"`
	PPIUNumber            *string                `json:"ppiu_number,omitempty"`
	BrandPrimaryColor     *string                `json:"brand_primary_color,omitempty"`
	BrandLogoURL          *string                `json:"brand_logo_url,omitempty"`
	BrandIconURL          *string                `json:"brand_icon_url,omitempty"`
	Tagline               *string                `json:"tagline,omitempty"`
	CommissionScheme      string                 `json:"commission_scheme,omitempty"`
	CreatedAt             time.Time              `json:"created_at"`
	Domain                StaffTenantDomainInfo  `json:"domain"`
	Subdomain             string                 `json:"subdomain"`
	CustomDomain          *string                `json:"custom_domain"`
	CustomDomainStatus    *string                `json:"custom_domain_status"`
	CurrentPlan           *StaffTenantPlanInfo   `json:"current_plan"`
	CurrentPlanName       *string                `json:"current_plan_name,omitempty"`
	SubscriptionExpiresAt *time.Time             `json:"subscription_expires_at"`
	Usage                 StaffTenantUsageStats  `json:"usage"`
	RingkasanPenggunaan   StaffTenantUsageStats  `json:"ringkasan_penggunaan"`
	TotalPackages         int                    `json:"total_packages"`
	TotalProspects        int                    `json:"total_prospects"`
	TotalActiveAgents     int                    `json:"total_active_agents"`
	DaftarAdmin           []StaffTenantAdminItem `json:"daftar_admin"`
}

// PlatformOverviewMetrics holds high-level business and health KPIs for Master Admin.
type PlatformOverviewMetrics struct {
	TotalTenants              int     `json:"total_tenants"`
	ActiveTenants             int     `json:"active_tenants"`
	PendingTenants            int     `json:"pending_tenants"`
	ExpiredTenants            int     `json:"expired_tenants"`
	SuspendedTenants          int     `json:"suspended_tenants"`
	NoPlanTenants             int     `json:"no_plan_tenants"`
	EstimatedMRR              float64 `json:"estimated_mrr"`
	EstimatedARR              float64 `json:"estimated_arr"`
	UpcomingRenewals7Days     int     `json:"upcoming_renewals_7d"`
	UpcomingRenewals30Days    int     `json:"upcoming_renewals_30d"`
	PendingVerificationsCount int     `json:"pending_verifications_count"`
	PendingVerificationsTotal float64 `json:"pending_verifications_total"`
	TotalPackages             int     `json:"total_packages"`
	TotalProspects            int     `json:"total_prospects"`
	TotalActiveAgents         int     `json:"total_active_agents"`
}

// TenantImpersonationResult holds temporary session token and target tenant details.
type TenantImpersonationResult struct {
	Token     string               `json:"token"`
	ExpiresAt time.Time            `json:"expires_at"`
	TenantID  uint64               `json:"tenant_id"`
	Tenant    *repository.Tenant   `json:"tenant"`
	AdminUser StaffTenantAdminItem `json:"admin_user"`
}

// StaffService defines the business logic for staff authentication and tenant management.
type StaffService interface {
	Login(ctx context.Context, email, password string) (*StaffLoginResult, error)
	Logout(ctx context.Context, token string) error
	GetProfile(ctx context.Context, staffUserID uint64) (*StaffUserInfo, error)
	ListTenants(ctx context.Context, statusFilter ...string) ([]repository.StaffTenantItem, error)
	GetTenantDetail(ctx context.Context, tenantID uint64) (*StaffTenantDetail, error)
	ResetTenantAdminPassword(ctx context.Context, tenantID uint64, adminUserID uint64, newPassword string) error
	GetPlatformOverview(ctx context.Context) (*PlatformOverviewMetrics, error)
	ImpersonateTenant(ctx context.Context, tenantID uint64, staffUserID uint64) (*TenantImpersonationResult, error)
	UpdateTenantSubscription(ctx context.Context, tenantID uint64, planID uint64, customPeriodMonths ...int) error
	ListStaffUsers(ctx context.Context) ([]StaffUserInfo, error)
	CreateStaffUser(ctx context.Context, name, email, password, status string) (*StaffUserInfo, error)
	UpdateStaffUser(ctx context.Context, id uint64, name, email string, password *string, status string, currentStaffUserID uint64) (*StaffUserInfo, error)
}

type staffService struct {
	staffRepo     repository.StaffRepository
	tenantRepo    repository.TenantRepository
	domainRepo    repository.DomainRepository
	planRepo      repository.PricingPlanRepository
	packageRepo   repository.PackageRepository
	prospectRepo  repository.ProspectRepository
	agentRepo     repository.AgentRepository
	adminUserRepo repository.AdminUserRepository
	sessionRepo   repository.SessionRepository
	pvRepo        repository.PaymentVerificationRepository
}

// NewStaffService creates a new StaffService instance with required repository dependencies.
func NewStaffService(
	staffRepo repository.StaffRepository,
	tenantRepo repository.TenantRepository,
	domainRepo repository.DomainRepository,
	planRepo repository.PricingPlanRepository,
	packageRepo repository.PackageRepository,
	prospectRepo repository.ProspectRepository,
	agentRepo repository.AgentRepository,
	adminUserRepo repository.AdminUserRepository,
	extraRepos ...interface{},
) StaffService {
	s := &staffService{
		staffRepo:     staffRepo,
		tenantRepo:    tenantRepo,
		domainRepo:    domainRepo,
		planRepo:      planRepo,
		packageRepo:   packageRepo,
		prospectRepo:  prospectRepo,
		agentRepo:     agentRepo,
		adminUserRepo: adminUserRepo,
	}
	for _, er := range extraRepos {
		switch repo := er.(type) {
		case repository.SessionRepository:
			s.sessionRepo = repo
		case repository.PaymentVerificationRepository:
			s.pvRepo = repo
		}
	}
	return s
}

func (s *staffService) Login(ctx context.Context, email, password string) (*StaffLoginResult, error) {
	user, err := s.staffRepo.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrStaffInvalidCredentials
		}
		return nil, err
	}

	if user.Status != "active" {
		return nil, ErrStaffInactive
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrStaffInvalidCredentials
	}

	// Generate a secure 32-byte (64-char hex) session token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)

	expiresAt := time.Now().Add(30 * 24 * time.Hour) // 30-day session
	session := &repository.StaffSession{
		StaffUserID: user.ID,
		Token:       token,
		ExpiresAt:   expiresAt,
	}

	if err := s.staffRepo.CreateSession(ctx, session); err != nil {
		return nil, err
	}

	return &StaffLoginResult{
		Token:     token,
		ExpiresAt: expiresAt,
		Staff: StaffUserInfo{
			ID:        user.ID,
			Name:      user.Name,
			Email:     user.Email,
			Status:    user.Status,
			CreatedAt: user.CreatedAt,
		},
	}, nil
}

func (s *staffService) Logout(ctx context.Context, token string) error {
	return s.staffRepo.DeleteSession(ctx, token)
}

func (s *staffService) GetProfile(ctx context.Context, staffUserID uint64) (*StaffUserInfo, error) {
	user, err := s.staffRepo.FindByID(ctx, staffUserID)
	if err != nil {
		return nil, err
	}
	return &StaffUserInfo{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		Status:    user.Status,
		CreatedAt: user.CreatedAt,
	}, nil
}

func (s *staffService) ListTenants(ctx context.Context, statusFilter ...string) ([]repository.StaffTenantItem, error) {
	return s.staffRepo.ListAllTenants(ctx, statusFilter...)
}

func (s *staffService) GetTenantDetail(ctx context.Context, tenantID uint64) (*StaffTenantDetail, error) {
	if s.tenantRepo == nil {
		return nil, errors.New("tenant repository not configured")
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	detail := &StaffTenantDetail{
		ID:                    tenant.ID,
		Name:                  tenant.Name,
		Slug:                  tenant.Slug,
		Status:                tenant.Status,
		WhatsAppNumber:        tenant.WhatsAppNumber,
		Phone:                 tenant.Phone,
		Email:                 tenant.Email,
		Address:               tenant.Address,
		City:                  tenant.City,
		Province:              tenant.Province,
		PPIUNumber:            tenant.PPIUNumber,
		BrandPrimaryColor:     tenant.BrandPrimaryColor,
		BrandLogoURL:          tenant.BrandLogoURL,
		BrandIconURL:          tenant.BrandIconURL,
		Tagline:               tenant.Tagline,
		CommissionScheme:      tenant.CommissionScheme,
		CreatedAt:             tenant.CreatedAt,
		SubscriptionExpiresAt: tenant.SubscriptionExpiresAt,
		DaftarAdmin:           make([]StaffTenantAdminItem, 0),
	}

	// 1. Domains
	defaultSubdomain := fmt.Sprintf("%s.klikumroh.id", tenant.Slug)
	detail.Domain.Subdomain = defaultSubdomain
	detail.Subdomain = defaultSubdomain

	if s.domainRepo != nil {
		domains, err := s.domainRepo.ListByTenant(ctx, tenantID)
		if err == nil {
			for _, d := range domains {
				if d.Type == "subdomain" && d.Hostname != "" {
					detail.Domain.Subdomain = d.Hostname
					detail.Subdomain = d.Hostname
				} else if d.Type == "custom" {
					host := d.Hostname
					st := d.Status
					detail.Domain.CustomDomain = &host
					detail.Domain.CustomDomainStatus = &st
					detail.CustomDomain = &host
					detail.CustomDomainStatus = &st
				}
			}
		}
	}

	// 2. Plan
	if tenant.CurrentPlanID != nil && s.planRepo != nil {
		plan, err := s.planRepo.GetByID(ctx, *tenant.CurrentPlanID)
		if err == nil && plan != nil {
			detail.CurrentPlan = &StaffTenantPlanInfo{
				ID:           &plan.ID,
				Name:         &plan.Name,
				PeriodMonths: &plan.PeriodMonths,
			}
			pName := fmt.Sprintf("%s (%d Bulan)", plan.Name, plan.PeriodMonths)
			detail.CurrentPlanName = &pName
		}
	}

	// 3. Usage Stats
	if s.packageRepo != nil {
		detail.Usage.TotalPackages, _ = s.packageRepo.CountByTenant(ctx, tenantID)
		detail.TotalPackages = detail.Usage.TotalPackages
	}
	if s.prospectRepo != nil {
		detail.Usage.TotalProspects, _ = s.prospectRepo.CountByTenant(ctx, tenantID)
		detail.TotalProspects = detail.Usage.TotalProspects
	}
	if s.agentRepo != nil {
		detail.Usage.TotalActiveAgents, _ = s.agentRepo.CountActiveByTenant(ctx, tenantID)
		detail.TotalActiveAgents = detail.Usage.TotalActiveAgents
	}
	detail.RingkasanPenggunaan = detail.Usage

	// 4. Admin Users
	if s.adminUserRepo != nil {
		admins, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
		if err == nil {
			for _, a := range admins {
				detail.DaftarAdmin = append(detail.DaftarAdmin, StaffTenantAdminItem{
					ID:        a.ID,
					Name:      a.Name,
					Email:     a.Email,
					Status:    a.Status,
					CreatedAt: a.CreatedAt,
				})
			}
		}
	}

	return detail, nil
}

func (s *staffService) ResetTenantAdminPassword(ctx context.Context, tenantID uint64, adminUserID uint64, newPassword string) error {
	if s.adminUserRepo == nil {
		return errors.New("admin user repository not configured")
	}

	trimmed := strings.TrimSpace(newPassword)
	if len(trimmed) < 8 {
		return errors.New("password baru minimal 8 karakter")
	}

	// Verify that the admin user belongs to the specified tenant
	adminUser, err := s.adminUserRepo.GetByID(ctx, tenantID, adminUserID)
	if err != nil {
		return err // ErrNotFound if not belongs to tenant
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(trimmed), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	adminUser.PasswordHash = string(hashed)
	return s.adminUserRepo.Update(ctx, tenantID, adminUser)
}

func (s *staffService) GetPlatformOverview(ctx context.Context) (*PlatformOverviewMetrics, error) {
	allTenants, err := s.staffRepo.ListAllTenants(ctx)
	if err != nil {
		return nil, err
	}

	plansMap := make(map[string]repository.PricingPlan)
	if s.planRepo != nil {
		if plans, pErr := s.planRepo.List(ctx); pErr == nil {
			for _, p := range plans {
				plansMap[p.Name] = p
			}
		}
	}

	now := time.Now()
	metrics := &PlatformOverviewMetrics{
		TotalTenants: len(allTenants),
	}

	for _, t := range allTenants {
		switch t.SubscriptionStatus {
		case "active":
			metrics.ActiveTenants++
			if t.CurrentPlan != nil {
				if p, ok := plansMap[*t.CurrentPlan]; ok && p.PeriodMonths > 0 {
					monthly := p.Price / float64(p.PeriodMonths)
					metrics.EstimatedMRR += monthly
				}
			}
			if t.SubscriptionExpiresAt != nil {
				daysLeft := int(t.SubscriptionExpiresAt.Sub(now).Hours() / 24)
				if daysLeft >= 0 && daysLeft <= 7 {
					metrics.UpcomingRenewals7Days++
				}
				if daysLeft >= 0 && daysLeft <= 30 {
					metrics.UpcomingRenewals30Days++
				}
			}
			if s.packageRepo != nil {
				count, _ := s.packageRepo.CountByTenant(ctx, t.ID)
				metrics.TotalPackages += count
			}
			if s.prospectRepo != nil {
				count, _ := s.prospectRepo.CountByTenant(ctx, t.ID)
				metrics.TotalProspects += count
			}
			if s.agentRepo != nil {
				count, _ := s.agentRepo.CountActiveByTenant(ctx, t.ID)
				metrics.TotalActiveAgents += count
			}
		case "pending":
			metrics.PendingTenants++
		case "expired":
			metrics.ExpiredTenants++
		case "suspended":
			metrics.SuspendedTenants++
		case "no_plan":
			metrics.NoPlanTenants++
		default:
			if t.Status == "active" {
				metrics.ActiveTenants++
			}
		}
	}
	metrics.EstimatedARR = metrics.EstimatedMRR * 12

	if s.pvRepo != nil {
		pvs, pErr := s.pvRepo.ListAll(ctx, "pending")
		if pErr == nil {
			metrics.PendingVerificationsCount = len(pvs)
			for _, pv := range pvs {
				metrics.PendingVerificationsTotal += pv.FinalAmount
			}
		}
	}

	return metrics, nil
}

func (s *staffService) ImpersonateTenant(ctx context.Context, tenantID uint64, staffUserID uint64) (*TenantImpersonationResult, error) {
	if s.tenantRepo == nil || s.adminUserRepo == nil || s.sessionRepo == nil {
		return nil, errors.New("layanan impersonasi belum terkonfigurasi")
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	admins, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	if len(admins) == 0 {
		return nil, errors.New("tidak ada admin user terdaftar pada travel ini")
	}

	var targetAdmin repository.AdminUser
	found := false
	for _, a := range admins {
		if a.Status == "active" {
			targetAdmin = a
			found = true
			break
		}
	}
	if !found {
		targetAdmin = admins[0]
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(4 * time.Hour) // 4-hour impersonation session

	session := &repository.Session{
		Token:       token,
		AdminUserID: targetAdmin.ID,
		TenantID:    tenantID,
		ExpiresAt:   expiresAt,
	}

	if err := s.sessionRepo.Create(ctx, tenantID, session); err != nil {
		return nil, err
	}

	return &TenantImpersonationResult{
		Token:     token,
		ExpiresAt: expiresAt,
		TenantID:  tenantID,
		Tenant:    tenant,
		AdminUser: StaffTenantAdminItem{
			ID:        targetAdmin.ID,
			Name:      targetAdmin.Name,
			Email:     targetAdmin.Email,
			Status:    targetAdmin.Status,
			CreatedAt: targetAdmin.CreatedAt,
		},
	}, nil
}

func (s *staffService) UpdateTenantSubscription(ctx context.Context, tenantID uint64, planID uint64, customPeriodMonths ...int) error {
	if s.tenantRepo == nil || s.planRepo == nil {
		return errors.New("repository not configured")
	}
	plan, err := s.planRepo.GetByID(ctx, planID)
	if err != nil {
		return err
	}
	months := plan.PeriodMonths
	if len(customPeriodMonths) > 0 && customPeriodMonths[0] > 0 {
		months = customPeriodMonths[0]
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return err
	}

	// Non-greedy expiry calculation: akumulatif jika masih aktif, dari time.Now() jika sudah kedaluwarsa
	baseTime := time.Now()
	if tenant.SubscriptionExpiresAt != nil && tenant.SubscriptionExpiresAt.After(baseTime) {
		baseTime = *tenant.SubscriptionExpiresAt
	}
	expiresAt := baseTime.AddDate(0, months, 0)

	if err := s.tenantRepo.UpdateSubscription(ctx, tenantID, planID, expiresAt, "active"); err != nil {
		return err
	}

	// Pastikan subdomain default aktif
	if s.domainRepo != nil {
		defaultHostname := fmt.Sprintf("%s.klikumroh.id", tenant.Slug)
		if existing, _ := s.domainRepo.FindByHostname(ctx, defaultHostname); existing == nil {
			_ = s.domainRepo.Create(ctx, tenant.ID, &repository.Domain{
				TenantID: tenant.ID,
				Hostname: defaultHostname,
				Type:     "subdomain",
				Status:   "active",
			})
		}
	}

	return nil
}

func (s *staffService) ListStaffUsers(ctx context.Context) ([]StaffUserInfo, error) {
	users, err := s.staffRepo.ListStaffUsers(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]StaffUserInfo, 0, len(users))
	for _, u := range users {
		result = append(result, StaffUserInfo{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			Status:    u.Status,
			CreatedAt: u.CreatedAt,
		})
	}
	return result, nil
}

func (s *staffService) CreateStaffUser(ctx context.Context, name, email, password, status string) (*StaffUserInfo, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	password = strings.TrimSpace(password)
	status = strings.ToLower(strings.TrimSpace(status))

	if name == "" {
		return nil, errors.New("nama staf wajib diisi")
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, errors.New("format email tidak valid")
	}
	if len(password) < 8 {
		return nil, errors.New("password minimal 8 karakter")
	}
	if status != "active" && status != "inactive" {
		status = "active"
	}

	existing, err := s.staffRepo.FindByEmail(ctx, email)
	if err == nil && existing != nil {
		return nil, ErrStaffEmailExists
	}
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("gagal mengenkripsi password: %w", err)
	}

	newUser := &repository.StaffUser{
		Name:         name,
		Email:        email,
		PasswordHash: string(hash),
		Status:       status,
	}

	if err := s.staffRepo.Create(ctx, newUser); err != nil {
		return nil, err
	}

	return &StaffUserInfo{
		ID:        newUser.ID,
		Name:      newUser.Name,
		Email:     newUser.Email,
		Status:    newUser.Status,
		CreatedAt: newUser.CreatedAt,
	}, nil
}

func (s *staffService) UpdateStaffUser(ctx context.Context, id uint64, name, email string, password *string, status string, currentStaffUserID uint64) (*StaffUserInfo, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	status = strings.ToLower(strings.TrimSpace(status))

	if name == "" {
		return nil, errors.New("nama staf wajib diisi")
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, errors.New("format email tidak valid")
	}
	if status != "active" && status != "inactive" {
		status = "active"
	}

	if id == currentStaffUserID && status == "inactive" {
		return nil, ErrStaffCannotDeactivateSelf
	}

	existing, err := s.staffRepo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrStaffNotFound
		}
		return nil, err
	}

	if existing.Email != email {
		checkUser, err := s.staffRepo.FindByEmail(ctx, email)
		if err == nil && checkUser != nil && checkUser.ID != id {
			return nil, ErrStaffEmailExists
		}
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
	}

	existing.Name = name
	existing.Email = email
	existing.Status = status

	if password != nil && strings.TrimSpace(*password) != "" {
		pwd := strings.TrimSpace(*password)
		if len(pwd) < 8 {
			return nil, errors.New("password baru minimal 8 karakter")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("gagal mengenkripsi password: %w", err)
		}
		existing.PasswordHash = string(hash)
	}

	if err := s.staffRepo.Update(ctx, existing); err != nil {
		return nil, err
	}

	return &StaffUserInfo{
		ID:        existing.ID,
		Name:      existing.Name,
		Email:     existing.Email,
		Status:    existing.Status,
		CreatedAt: existing.CreatedAt,
	}, nil
}


