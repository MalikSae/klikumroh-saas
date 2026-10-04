package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"net/mail"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

var (
	ErrInvalidTravelName          = errors.New("nama travel wajib diisi (minimal 2 karakter)")
	ErrInvalidSlug                = errors.New("slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-) minimal 3 karakter")
	ErrSlugAlreadyTaken           = errors.New("slug travel sudah digunakan")
	ErrInvalidAdminName           = errors.New("nama PIC wajib diisi (minimal 2 karakter)")
	ErrInvalidAdminEmail          = errors.New("format email tidak valid")
	ErrAdminEmailAlreadyInUse     = errors.New("email sudah terdaftar di sistem")
	ErrInvalidAdminWhatsApp       = errors.New("nomor WhatsApp minimal 10 digit dan harus diawali '62' atau '08'")
	ErrTenantWhatsAppAlreadyInUse = errors.New("nomor WhatsApp sudah terdaftar di sistem")
	ErrVerificationNotFound       = errors.New("data verifikasi pembayaran tidak ditemukan")
	ErrVerificationNotPending     = errors.New("status verifikasi pembayaran bukan pending")
	ErrEmptyProofFile             = errors.New("berkas bukti transfer tidak boleh kosong")
	// ErrLegalDocumentsNotConfigured blocks signup while there are no Terms/Privacy documents to consent to.
	ErrLegalDocumentsNotConfigured = errors.New("pendaftaran belum dibuka: Syarat & Ketentuan dan Kebijakan Privasi belum tersedia")
)

var slugRegex = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

var reservedSlugs = map[string]bool{
	"api":       true,
	"admin":     true,
	"dashboard": true,
	"internal":  true,
	"staff":     true,
	"web":       true,
	"marketing": true,
	"demo":      true,
	"www":       true,
	"mail":      true,
	"app":       true,
	"public":    true,
	"auth":      true,
	"login":     true,
	"staging":   true,
	"cdn":       true,
	"support":   true,
	"billing":   true,
	"root":      true,
	"null":      true,
	"undefined": true,
	"static":    true,
	"assets":    true,
	"help":      true,
}

// TenantSignupRequest represents input payload for new travel self-registration.
type TenantSignupRequest struct {
	TravelName    string `json:"travel_name"`
	Slug          string `json:"slug"`
	AdminName     string `json:"admin_name"`
	AdminEmail    string `json:"admin_email"`
	AdminPassword string `json:"admin_password"`
	AdminWhatsApp string `json:"admin_whatsapp,omitempty"`
	PlanID        uint64 `json:"plan_id"`
	CouponCode    string `json:"coupon_code,omitempty"`
	// AffiliateCode is the Affiliator KlikUmroh link code (cookie ku_aff), used when no affiliator coupon is applied.
	AffiliateCode string `json:"affiliate_code,omitempty"`
}

// TenantSignupResult represents the output of a successful self-registration.
type TenantSignupResult struct {
	PaymentVerificationID uint64  `json:"payment_verification_id"`
	FinalAmount           float64 `json:"final_amount"`
	UniqueCode            int     `json:"unique_code"`
	TenantID              uint64  `json:"tenant_id"`
	TravelName            string  `json:"travel_name"`
	TenantSlug            string  `json:"tenant_slug"`
	IsInstantActive       bool    `json:"is_instant_active"`
}

// PublicSignupService handles public registration and slug check. After signup the travel logs in
// and pays from the dashboard billing page — there is no public (unauthenticated) payment endpoint.
type PublicSignupService interface {
	CheckSlug(ctx context.Context, slug string) (bool, string, error)
	TenantSignup(ctx context.Context, req TenantSignupRequest) (*TenantSignupResult, error)
	SetPlatformSettingsRepo(repo repository.PlatformSettingsRepository)
}

type publicSignupService struct {
	tenantRepo    repository.TenantRepository
	adminUserRepo repository.AdminUserRepository
	planRepo      repository.PricingPlanRepository
	couponService CouponService
	pvRepo        repository.PaymentVerificationRepository
	domainRepo    repository.DomainRepository
	settingsRepo  repository.PlatformSettingsRepository
	affiliators   AffiliatorAttributor
}

// SetAffiliatorAttributor enables linking new travels to the affiliator that brought them. Wired in main
// via a type assertion.
func (s *publicSignupService) SetAffiliatorAttributor(a AffiliatorAttributor) {
	s.affiliators = a
}

// SetPlatformSettingsRepo enables the check that Terms/Privacy URLs are configured before accepting signups.
func (s *publicSignupService) SetPlatformSettingsRepo(repo repository.PlatformSettingsRepository) {
	s.settingsRepo = repo
}

// requireLegalDocuments rejects signup while the super admin has not published Terms/Privacy URLs,
// because the checkout asks travels to agree to those documents.
func (s *publicSignupService) requireLegalDocuments(ctx context.Context) error {
	if s.settingsRepo == nil {
		return nil
	}
	data, err := s.settingsRepo.GetAll(ctx)
	if err != nil {
		return err
	}
	if strings.TrimSpace(data["terms_url"]) == "" || strings.TrimSpace(data["privacy_url"]) == "" {
		return ErrLegalDocumentsNotConfigured
	}
	return nil
}

// NewPublicSignupService creates a new PublicSignupService instance.
func NewPublicSignupService(
	tenantRepo repository.TenantRepository,
	adminUserRepo repository.AdminUserRepository,
	planRepo repository.PricingPlanRepository,
	couponService CouponService,
	pvRepo repository.PaymentVerificationRepository,
	domainRepos ...repository.DomainRepository,
) PublicSignupService {
	var dr repository.DomainRepository
	if len(domainRepos) > 0 {
		dr = domainRepos[0]
	}
	return &publicSignupService{
		tenantRepo:    tenantRepo,
		adminUserRepo: adminUserRepo,
		planRepo:      planRepo,
		couponService: couponService,
		pvRepo:        pvRepo,
		domainRepo:    dr,
	}
}

func (s *publicSignupService) CheckSlug(ctx context.Context, slug string) (bool, string, error) {
	cleaned := strings.ToLower(strings.TrimSpace(slug))
	if len(cleaned) < 3 || len(cleaned) > 50 || !slugRegex.MatchString(cleaned) {
		return false, "Slug harus berupa 3-50 karakter alfanumerik huruf kecil dan tanda hubung (-)", nil
	}

	if reservedSlugs[cleaned] {
		return false, "Slug ini telah dicadangkan untuk sistem", nil
	}

	existing, err := s.tenantRepo.GetBySlug(ctx, cleaned)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return false, "", err
	}
	if existing != nil {
		return false, "Slug sudah digunakan oleh travel lain", nil
	}

	return true, "", nil
}

func (s *publicSignupService) TenantSignup(ctx context.Context, req TenantSignupRequest) (*TenantSignupResult, error) {
	if err := s.requireLegalDocuments(ctx); err != nil {
		return nil, err
	}

	travelName := strings.TrimSpace(req.TravelName)
	if len(travelName) < 2 || len(travelName) > 100 {
		return nil, ErrInvalidTravelName
	}

	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	available, reason, err := s.CheckSlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if !available {
		if reason != "" {
			return nil, errors.New(reason)
		}
		return nil, ErrSlugAlreadyTaken
	}

	adminName := strings.TrimSpace(req.AdminName)
	if len(adminName) < 2 || len(adminName) > 100 {
		return nil, ErrInvalidAdminName
	}

	adminEmail := strings.ToLower(strings.TrimSpace(req.AdminEmail))
	if _, err := mail.ParseAddress(adminEmail); err != nil || !strings.Contains(adminEmail, "@") {
		return nil, ErrInvalidAdminEmail
	}

	// Email admin_users WAJIB unik global karena login satu pintu terpusat
	existingUser, err := s.adminUserRepo.FindByEmail(ctx, adminEmail)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	if existingUser != nil {
		return nil, ErrAdminEmailAlreadyInUse
	}

	if len(req.AdminPassword) < 8 {
		return nil, ErrPasswordTooShort
	}

	plan, err := s.planRepo.GetByID(ctx, req.PlanID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrPlanNotFound
		}
		return nil, err
	}

	var couponCodePtr *string
	baseAmount := plan.Price
	discountedAmount := baseAmount
	trimmedCoupon := strings.ToUpper(strings.TrimSpace(req.CouponCode))
	if trimmedCoupon != "" {
		coupon, err := s.couponService.Validate(ctx, trimmedCoupon, plan.ID)
		if err != nil {
			return nil, err
		}
		couponCodePtr = &coupon.Code
		discount := (coupon.DiscountPercentage / 100.0) * baseAmount
		discountedAmount = math.Round(baseAmount - discount)
		if discountedAmount < 0 {
			discountedAmount = 0
		}
	}

	uniqueCode := 0
	finalAmount := discountedAmount
	if discountedAmount > 0 {
		uniqueCode = rand.Intn(900) + 100
		finalAmount = discountedAmount + float64(uniqueCode)
	}

	var whatsappPtr *string
	adminWhatsApp := strings.TrimSpace(req.AdminWhatsApp)
	if adminWhatsApp != "" {
		normalizedWA := util.NormalizePhoneToWhatsApp(adminWhatsApp)
		if len(normalizedWA) < 10 || len(normalizedWA) > 16 || !strings.HasPrefix(normalizedWA, "62") {
			return nil, ErrInvalidAdminWhatsApp
		}

		existingTenantByWA, err := s.tenantRepo.GetByWhatsAppNumber(ctx, normalizedWA)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		if existingTenantByWA != nil {
			return nil, ErrTenantWhatsAppAlreadyInUse
		}
		whatsappPtr = &normalizedWA
	}

	// Hash before creating any row, so a hashing failure never leaves partial data behind.
	hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Buat tenant baru dengan status 'pending'
	tenant := &repository.Tenant{
		Name:             travelName,
		Slug:             slug,
		Status:           "pending",
		CommissionScheme: "flat",
		WhatsAppNumber:   whatsappPtr,
	}
	if err := s.tenantRepo.Create(ctx, tenant); err != nil {
		return nil, err
	}

	// The repositories do not share a DB transaction, so a failure after the tenant row exists is
	// compensated by deleting what was created. Otherwise an orphan tenant keeps the slug (and the
	// WhatsApp number) locked forever and the travel cannot sign up again.
	var createdAdmin *repository.AdminUser
	rollback := func() {
		if createdAdmin != nil {
			_ = s.adminUserRepo.Delete(ctx, tenant.ID, createdAdmin.ID)
		}
		_ = s.tenantRepo.Delete(ctx, tenant.ID)
	}

	// Buat admin user pertama untuk tenant ini dengan status 'active'
	adminUser := &repository.AdminUser{
		TenantID:     tenant.ID,
		Email:        adminEmail,
		PasswordHash: string(hash),
		Name:         adminName,
		Status:       "active",
	}
	if err := s.adminUserRepo.Create(ctx, tenant.ID, adminUser); err != nil {
		rollback()
		// Lost a race with another signup using the same email (UNIQUE index): report it cleanly
		// instead of leaking the raw database error.
		if existing, findErr := s.adminUserRepo.FindByEmail(ctx, adminEmail); findErr == nil && existing != nil {
			return nil, ErrAdminEmailAlreadyInUse
		}
		return nil, err
	}
	createdAdmin = adminUser

	// Buat payment_verifications dengan status 'pending'
	pv := &repository.PaymentVerification{
		TenantID:    tenant.ID,
		PlanID:      plan.ID,
		CouponCode:  couponCodePtr,
		Amount:      plan.Price,
		FinalAmount: finalAmount,
		UniqueCode:  uniqueCode,
		Status:      "pending",
		ProofURL:    nil,
	}
	if err := s.pvRepo.Create(ctx, pv); err != nil {
		rollback()
		return nil, err
	}

	// Buat default subdomain di tabel domains
	if s.domainRepo != nil {
		defaultSubdomain := &repository.Domain{
			TenantID: tenant.ID,
			Hostname: fmt.Sprintf("%s.klikumroh.id", tenant.Slug),
			Type:     "subdomain",
			Status:   "active",
		}
		_ = s.domainRepo.Create(ctx, tenant.ID, defaultSubdomain)
	}

	if s.affiliators != nil {
		wa := ""
		if whatsappPtr != nil {
			wa = *whatsappPtr
		}
		coupon := ""
		if couponCodePtr != nil {
			coupon = *couponCodePtr
		}
		s.affiliators.AttributeSignup(ctx, tenant.ID, coupon, req.AffiliateCode, adminEmail, wa)
	}

	return &TenantSignupResult{
		PaymentVerificationID: pv.ID,
		FinalAmount:           pv.FinalAmount,
		UniqueCode:            pv.UniqueCode,
		TenantID:              tenant.ID,
		TravelName:            tenant.Name,
		TenantSlug:            tenant.Slug,
		IsInstantActive:       false,
	}, nil
}
