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

// Validation errors of the staff user and manual subscription forms (shown to staff as 400).
var (
	ErrStaffNameRequired     = errors.New("nama staf wajib diisi")
	ErrStaffEmailInvalid     = errors.New("format email tidak valid")
	ErrStaffPasswordTooShort = errors.New("password minimal 8 karakter")
	// ErrStaffTenantNotFound: the travel of a staff action does not exist.
	ErrStaffTenantNotFound = errors.New("travel tidak ditemukan")
	ErrInvalidManualPeriod = errors.New("masa langganan manual harus 1-120 bulan")
)

// MaxManualPeriodMonths caps a manual subscription change by staff (10 years).
const MaxManualPeriodMonths = 120

// ErrAccessReasonInvalid is returned when staff impersonates a tenant without a sufficiently descriptive reason.
var ErrAccessReasonInvalid = errors.New("alasan akses wajib diisi minimal 10 karakter dan maksimal 255 karakter")

// ErrAccessLogNotConfigured is returned when a staff action on tenant data cannot be audited.
// Staff access to tenant data is always rejected without an audit record (fail closed).
var ErrAccessLogNotConfigured = errors.New("pencatatan akses staf belum terkonfigurasi")

const (
	minAccessReasonLength = 10
	maxAccessReasonLength = 255
)

// StaffUserInfo holds safe, non-sensitive staff user details.
type StaffUserInfo struct {
	ID     uint64 `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Status string `json:"status"`
	// Role: owner | admin, display only (sidebar OWNER / ADMIN badge); grants no permission.
	Role      string    `json:"role"`
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
	SubscriptionStatus    string                 `json:"subscription_status"`
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
	GetTenantDetail(ctx context.Context, tenantID uint64, staffUserID uint64) (*StaffTenantDetail, error)
	ResetTenantAdminPassword(ctx context.Context, tenantID uint64, adminUserID uint64, newPassword string, staffUserID uint64) error
	GetPlatformOverview(ctx context.Context) (*PlatformOverviewMetrics, error)
	ImpersonateTenant(ctx context.Context, tenantID uint64, staffUserID uint64, reason string) (*TenantImpersonationResult, error)
	UpdateTenantSubscription(ctx context.Context, tenantID uint64, planID uint64, staffUserID uint64, customPeriodMonths ...int) error
	ListStaffUsers(ctx context.Context) ([]StaffUserInfo, error)
	CreateStaffUser(ctx context.Context, name, email, password, status string) (*StaffUserInfo, error)
	// UpdateStaffUser revokes the target's sessions when its password changes or it is deactivated;
	// currentToken (the caller's own session) is kept when staff change their own password.
	UpdateStaffUser(ctx context.Context, id uint64, name, email string, password *string, status string, currentStaffUserID uint64, currentToken string) (*StaffUserInfo, error)
}

// ManualSubscriptionHook runs the effects of a manual subscription change (cancel open invoices,
// starter content, notify the travel); implemented by the subscription service.
type ManualSubscriptionHook interface {
	HandleManualSubscriptionChange(ctx context.Context, tenantID uint64, wasPending bool, planName string, expiresAt time.Time, staffUserID uint64)
}

// SetManualSubscriptionHook wires the subscription side effects into manual changes by staff.
func (s *staffService) SetManualSubscriptionHook(h ManualSubscriptionHook) {
	s.manualHook = h
}

type staffService struct {
	manualHook    ManualSubscriptionHook
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
	accessLogRepo repository.AccessLogRepository
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
		case repository.AccessLogRepository:
			s.accessLogRepo = repo
		}
	}
	return s
}

// logTenantAccess writes an audit record of a staff action on tenant data. Callers must abort the action
// when it returns an error, so no staff access happens without a matching access_logs row.
func (s *staffService) logTenantAccess(ctx context.Context, tenantID, staffUserID uint64, action, reason string, sessionID *uint64) error {
	if s.accessLogRepo == nil {
		return ErrAccessLogNotConfigured
	}
	return s.accessLogRepo.Create(ctx, tenantID, &repository.AccessLog{
		StaffID:   staffUserID,
		Action:    action,
		SessionID: sessionID,
		Reason:    &reason,
	})
}

func (s *staffService) Login(ctx context.Context, email, password string) (*StaffLoginResult, error) {
	user, err := s.staffRepo.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrStaffInvalidCredentials
		}
		return nil, err
	}

	// Password first, then status: checking status first would reveal which emails belong to a
	// deactivated staff account to anyone, without the password.
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrStaffInvalidCredentials
	}

	if user.Status != "active" {
		return nil, ErrStaffInactive
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
			Role:      user.Role,
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
		Role:      user.Role,
		CreatedAt: user.CreatedAt,
	}, nil
}

func (s *staffService) ListTenants(ctx context.Context, statusFilter ...string) ([]repository.StaffTenantItem, error) {
	return s.staffRepo.ListAllTenants(ctx, statusFilter...)
}

func (s *staffService) GetTenantDetail(ctx context.Context, tenantID uint64, staffUserID uint64) (*StaffTenantDetail, error) {
	if s.tenantRepo == nil {
		return nil, errors.New("tenant repository not configured")
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	if err := s.logTenantAccess(ctx, tenantID, staffUserID, repository.AccessActionViewTenantDetail,
		"Melihat detail travel dari panel internal", nil); err != nil {
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
				}
			}
			if d := pickPrimaryCustomDomain(domains); d != nil {
				host := d.Hostname
				st := d.Status
				detail.Domain.CustomDomain = &host
				detail.Domain.CustomDomainStatus = &st
				detail.CustomDomain = &host
				detail.CustomDomainStatus = &st
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

	// Same derived subscription status as the tenant list (repository.DeriveSubscriptionStatus).
	hasPlan := detail.CurrentPlan != nil || (s.planRepo == nil && tenant.CurrentPlanID != nil)
	detail.SubscriptionStatus = repository.DeriveSubscriptionStatus(tenant.IsDemo, tenant.Status, hasPlan, tenant.SubscriptionExpiresAt, time.Now())

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

func (s *staffService) ResetTenantAdminPassword(ctx context.Context, tenantID uint64, adminUserID uint64, newPassword string, staffUserID uint64) error {
	if s.adminUserRepo == nil || s.sessionRepo == nil {
		return errors.New("admin user or session repository not configured")
	}

	if !passwordLongEnough(newPassword) {
		return errors.New("password baru minimal 8 karakter")
	}

	// Verify that the admin user belongs to the specified tenant
	adminUser, err := s.adminUserRepo.GetByID(ctx, tenantID, adminUserID)
	if err != nil {
		return err // ErrNotFound if not belongs to tenant
	}

	if err := s.logTenantAccess(ctx, tenantID, staffUserID, repository.AccessActionResetAdminPassword,
		fmt.Sprintf("Reset password admin travel %s", adminUser.Email), nil); err != nil {
		return err
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	adminUser.PasswordHash = string(hashed)
	if err := s.adminUserRepo.Update(ctx, tenantID, adminUser); err != nil {
		return err
	}

	// A reset is often incident response: whoever holds an old token must be signed out too.
	return s.sessionRepo.DeleteByAdminUser(ctx, tenantID, adminUserID, "")
}

func (s *staffService) GetPlatformOverview(ctx context.Context) (*PlatformOverviewMetrics, error) {
	allTenants, err := s.staffRepo.ListAllTenants(ctx)
	if err != nil {
		return nil, err
	}

	// Keyed by plan id: plan names are not unique (e.g. "Premium" for 1 and 12 months).
	plansMap := make(map[uint64]repository.PricingPlan)
	if s.planRepo != nil {
		if plans, pErr := s.planRepo.List(ctx); pErr == nil {
			for _, p := range plans {
				plansMap[p.ID] = p
			}
		}
	}

	now := time.Now()
	metrics := &PlatformOverviewMetrics{}

	for _, t := range allTenants {
		// The demo travel is a showcase, not a customer: no tenant count, revenue, prospects or agents.
		if t.IsDemo {
			continue
		}
		metrics.TotalTenants++
		switch t.SubscriptionStatus {
		case "active":
			metrics.ActiveTenants++
			if t.CurrentPlanID != nil {
				if p, ok := plansMap[*t.CurrentPlanID]; ok && p.PeriodMonths > 0 {
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
		// The demo travel's invoices are not customer payments (its billing writes are blocked by DemoGuard;
		// older rows may still exist).
		demoTenants := map[uint64]bool{}
		for _, t := range allTenants {
			if t.IsDemo {
				demoTenants[t.ID] = true
			}
		}
		pvs, pErr := s.pvRepo.ListAll(ctx, "pending")
		if pErr == nil {
			for _, pv := range pvs {
				if demoTenants[pv.TenantID] {
					continue
				}
				// Only invoices staff can act on now, like the Payments "Perlu Verifikasi" tab: a transfer proof
				// was uploaded, or nothing is owed. An invoice still waiting for the travel to pay is not a review.
				if !InvoiceReviewable(&pv) {
					continue
				}
				metrics.PendingVerificationsCount++
				metrics.PendingVerificationsTotal += pv.FinalAmount
			}
		}
	}

	return metrics, nil
}

func (s *staffService) ImpersonateTenant(ctx context.Context, tenantID uint64, staffUserID uint64, reason string) (*TenantImpersonationResult, error) {
	if s.tenantRepo == nil || s.adminUserRepo == nil || s.sessionRepo == nil {
		return nil, errors.New("layanan impersonasi belum terkonfigurasi")
	}
	if s.accessLogRepo == nil {
		return nil, ErrAccessLogNotConfigured
	}

	reason = strings.TrimSpace(reason)
	if reasonLen := len([]rune(reason)); reasonLen < minAccessReasonLength || reasonLen > maxAccessReasonLength {
		return nil, ErrAccessReasonInvalid
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

	impersonatingStaffID := staffUserID
	session := &repository.Session{
		Token:                 token,
		AdminUserID:           targetAdmin.ID,
		TenantID:              tenantID,
		ExpiresAt:             expiresAt,
		ImpersonatedByStaffID: &impersonatingStaffID,
		ImpersonationReason:   &reason,
	}

	if err := s.sessionRepo.Create(ctx, tenantID, session); err != nil {
		return nil, err
	}

	sessionID := session.ID
	if err := s.logTenantAccess(ctx, tenantID, staffUserID, repository.AccessActionImpersonateStart, reason, &sessionID); err != nil {
		// Never hand out an impersonation token that has no audit record.
		_ = s.sessionRepo.DeleteByToken(ctx, token)
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

func (s *staffService) UpdateTenantSubscription(ctx context.Context, tenantID uint64, planID uint64, staffUserID uint64, customPeriodMonths ...int) error {
	if s.tenantRepo == nil || s.planRepo == nil {
		return errors.New("repository not configured")
	}
	if len(customPeriodMonths) > 0 && (customPeriodMonths[0] < 0 || customPeriodMonths[0] > MaxManualPeriodMonths) {
		return ErrInvalidManualPeriod
	}
	plan, err := s.planRepo.GetByID(ctx, planID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrPlanNotFound
		}
		return err
	}
	months := plan.PeriodMonths
	if len(customPeriodMonths) > 0 && customPeriodMonths[0] > 0 {
		months = customPeriodMonths[0]
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrStaffTenantNotFound
		}
		return err
	}

	// Non-greedy expiry calculation: akumulatif jika masih aktif, dari time.Now() jika sudah kedaluwarsa
	baseTime := time.Now().In(jakartaLocation) // month arithmetic is in WIB (see addMonthsClamped)
	if tenant.SubscriptionExpiresAt != nil && tenant.SubscriptionExpiresAt.After(baseTime) {
		baseTime = *tenant.SubscriptionExpiresAt
	}
	expiresAt := addMonthsClamped(baseTime, months)

	if err := s.logTenantAccess(ctx, tenantID, staffUserID, repository.AccessActionUpdateSubscription,
		fmt.Sprintf("Mengubah langganan ke paket %s (%d bulan)", plan.Name, months), nil); err != nil {
		return err
	}

	if err := s.tenantRepo.UpdateSubscription(ctx, tenantID, planID, expiresAt, "active"); err != nil {
		return err
	}
	if s.manualHook != nil {
		s.manualHook.HandleManualSubscriptionChange(ctx, tenantID, tenant.Status == "pending", plan.Name, expiresAt, staffUserID)
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
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
		})
	}
	return result, nil
}

func (s *staffService) CreateStaffUser(ctx context.Context, name, email, password, status string) (*StaffUserInfo, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	status = strings.ToLower(strings.TrimSpace(status))

	if name == "" {
		return nil, ErrStaffNameRequired
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, ErrStaffEmailInvalid
	}
	if !passwordLongEnough(password) {
		return nil, ErrStaffPasswordTooShort
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
		if repository.IsDuplicateKey(err) {
			return nil, ErrStaffEmailExists // lost a race with another request for the same email
		}
		return nil, err
	}

	return &StaffUserInfo{
		ID:        newUser.ID,
		Name:      newUser.Name,
		Email:     newUser.Email,
		Status:    newUser.Status,
		Role:      newUser.Role,
		CreatedAt: newUser.CreatedAt,
	}, nil
}

func (s *staffService) UpdateStaffUser(ctx context.Context, id uint64, name, email string, password *string, status string, currentStaffUserID uint64, currentToken string) (*StaffUserInfo, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	status = strings.ToLower(strings.TrimSpace(status))

	if name == "" {
		return nil, ErrStaffNameRequired
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, ErrStaffEmailInvalid
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

	passwordChanged := false
	if password != nil && strings.TrimSpace(*password) != "" {
		pwd := *password
		if !passwordLongEnough(pwd) {
			return nil, ErrStaffPasswordTooShort
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("gagal mengenkripsi password: %w", err)
		}
		existing.PasswordHash = string(hash)
		passwordChanged = true
	}

	// A password change or deactivation is often incident response: whoever holds an old staff token
	// (or an impersonation session opened with it) must lose access now, and must not get it back if
	// the account is reactivated later. Changing your own password keeps the session you are using.
	// The save and the revocation are one transaction: a new password never lands while old sessions live.
	if passwordChanged || status == "inactive" {
		keep := ""
		if id == currentStaffUserID {
			keep = currentToken
		}
		if err := s.staffRepo.UpdateAndRevokeSessions(ctx, existing, keep); err != nil {
			if repository.IsDuplicateKey(err) {
				return nil, ErrStaffEmailExists
			}
			return nil, err
		}
	} else if err := s.staffRepo.Update(ctx, existing); err != nil {
		if repository.IsDuplicateKey(err) {
			return nil, ErrStaffEmailExists
		}
		return nil, err
	}

	return &StaffUserInfo{
		ID:        existing.ID,
		Name:      existing.Name,
		Email:     existing.Email,
		Status:    existing.Status,
		Role:      existing.Role,
		CreatedAt: existing.CreatedAt,
	}, nil
}

// pickPrimaryCustomDomain is the custom domain shown on the staff tenant detail: the primary one (no
// RedirectToDomainID, e.g. www.namatravel.com) over its redirecting alias (namatravel.com), whatever the
// list order. The alias is shown only when the travel has no primary custom domain.
func pickPrimaryCustomDomain(domains []repository.Domain) *repository.Domain {
	var alias *repository.Domain
	for i := range domains {
		d := &domains[i]
		if d.Type != "custom" {
			continue
		}
		if d.RedirectToDomainID == nil {
			return d
		}
		if alias == nil {
			alias = d
		}
	}
	return alias
}

// InvoiceReviewable: a pending invoice staff can verify now (proof uploaded, or a final total of Rp 0 or
// less, which needs no proof). Same rule as the super admin Payments "Perlu Verifikasi" tab.
func InvoiceReviewable(pv *repository.PaymentVerification) bool {
	if pv == nil {
		return false
	}
	return pv.FinalAmount <= 0 || (pv.ProofURL != nil && strings.TrimSpace(*pv.ProofURL) != "")
}
