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

// StaffService defines the business logic for staff authentication and tenant management.
type StaffService interface {
	Login(ctx context.Context, email, password string) (*StaffLoginResult, error)
	Logout(ctx context.Context, token string) error
	GetProfile(ctx context.Context, staffUserID uint64) (*StaffUserInfo, error)
	ListTenants(ctx context.Context) ([]repository.StaffTenantItem, error)
	GetTenantDetail(ctx context.Context, tenantID uint64) (*StaffTenantDetail, error)
	ResetTenantAdminPassword(ctx context.Context, tenantID uint64, adminUserID uint64, newPassword string) error
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
) StaffService {
	return &staffService{
		staffRepo:     staffRepo,
		tenantRepo:    tenantRepo,
		domainRepo:    domainRepo,
		planRepo:      planRepo,
		packageRepo:   packageRepo,
		prospectRepo:  prospectRepo,
		agentRepo:     agentRepo,
		adminUserRepo: adminUserRepo,
	}
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

func (s *staffService) ListTenants(ctx context.Context) ([]repository.StaffTenantItem, error) {
	return s.staffRepo.ListAllTenants(ctx)
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

