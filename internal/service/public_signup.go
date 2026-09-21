package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"net/mail"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"
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
}

// TenantSignupResult represents the output of a successful self-registration.
type TenantSignupResult struct {
	PaymentVerificationID uint64  `json:"payment_verification_id"`
	PublicToken           string  `json:"public_token"`
	FinalAmount           float64 `json:"final_amount"`
	UniqueCode            int     `json:"unique_code"`
	TenantID              uint64  `json:"tenant_id"`
	TravelName            string  `json:"travel_name"`
	TenantSlug            string  `json:"tenant_slug"`
	IsInstantActive       bool    `json:"is_instant_active"`
}

// VerificationStatusResult holds public verification status details for onboarding payment check.
type VerificationStatusResult struct {
	PublicToken      string  `json:"public_token"`
	TenantName       string  `json:"tenant_name"`
	TenantSlug       string  `json:"tenant_slug"`
	TenantWhatsApp   *string `json:"tenant_whatsapp,omitempty"`
	PlanID           uint64  `json:"plan_id"`
	PlanName         string  `json:"plan_name"`
	PlanPeriodMonths int     `json:"plan_period_months"`
	Amount           float64 `json:"amount"`
	FinalAmount      float64 `json:"final_amount"`
	UniqueCode       int     `json:"unique_code"`
	ProofURL         *string `json:"proof_url"`
	Status           string  `json:"status"`
	RejectionReason  *string `json:"rejection_reason,omitempty"`
}

// PublicSignupService handles public registration, slug check, and payment proof upload.
type PublicSignupService interface {
	CheckSlug(ctx context.Context, slug string) (bool, string, error)
	TenantSignup(ctx context.Context, req TenantSignupRequest) (*TenantSignupResult, error)
	UploadProof(ctx context.Context, identifier string, fileBytes []byte) (string, error)
	GetVerificationStatus(ctx context.Context, identifier string) (*VerificationStatusResult, error)
}

type publicSignupService struct {
	tenantRepo    repository.TenantRepository
	adminUserRepo repository.AdminUserRepository
	planRepo      repository.PricingPlanRepository
	couponService CouponService
	pvRepo        repository.PaymentVerificationRepository
	domainRepo    repository.DomainRepository
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

	// Buat admin user pertama untuk tenant ini dengan status 'active'
	hash, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	adminUser := &repository.AdminUser{
		TenantID:     tenant.ID,
		Email:        adminEmail,
		PasswordHash: string(hash),
		Name:         adminName,
		Status:       "active",
	}
	if err := s.adminUserRepo.Create(ctx, tenant.ID, adminUser); err != nil {
		return nil, err
	}

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

	return &TenantSignupResult{
		PaymentVerificationID: pv.ID,
		PublicToken:           pv.PublicToken,
		FinalAmount:           pv.FinalAmount,
		UniqueCode:            pv.UniqueCode,
		TenantID:              tenant.ID,
		TravelName:            tenant.Name,
		TenantSlug:            tenant.Slug,
		IsInstantActive:       false,
	}, nil
}

func (s *publicSignupService) UploadProof(ctx context.Context, identifier string, fileBytes []byte) (string, error) {
	if len(fileBytes) == 0 {
		return "", ErrEmptyProofFile
	}

	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return "", ErrVerificationNotFound
	}

	// Cari verifikasi berdasarkan public_token aman terlebih dahulu
	pv, err := s.pvRepo.GetByPublicToken(ctx, identifier)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Fallback jika berupa numeric ID (backward compatibility)
			if numID, parseErr := strconv.ParseUint(identifier, 10, 64); parseErr == nil {
				pv, err = s.pvRepo.GetByID(ctx, numID)
			}
		}
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return "", ErrVerificationNotFound
			}
			return "", err
		}
	}

	if pv.Status != "pending" && pv.Status != "rejected" {
		return "", ErrVerificationNotPending
	}

	fileName := uuid.New().String() + ".webp"
	relPath := fmt.Sprintf("/uploads/%d/subscription-proofs/%s", pv.TenantID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", pv.TenantID), "subscription-proofs", fileName)

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
		return "", err
	}

	if pv.Status == "rejected" {
		if err := s.pvRepo.ResetToPendingWithProof(ctx, pv.ID, relPath); err != nil {
			return "", err
		}
	} else {
		if err := s.pvRepo.UpdateProofURL(ctx, pv.ID, relPath); err != nil {
			return "", err
		}
	}

	return relPath, nil
}

func (s *publicSignupService) GetVerificationStatus(ctx context.Context, identifier string) (*VerificationStatusResult, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, ErrVerificationNotFound
	}

	// Cari verifikasi berdasarkan public_token aman terlebih dahulu
	pv, err := s.pvRepo.GetByPublicToken(ctx, identifier)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			// Fallback jika berupa numeric ID (backward compatibility)
			if numID, parseErr := strconv.ParseUint(identifier, 10, 64); parseErr == nil {
				pv, err = s.pvRepo.GetByID(ctx, numID)
			}
		}
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrVerificationNotFound
			}
			return nil, err
		}
	}

	return &VerificationStatusResult{
		PublicToken:      pv.PublicToken,
		TenantName:       pv.TenantName,
		TenantSlug:       pv.TenantSlug,
		TenantWhatsApp:   pv.TenantWhatsApp,
		PlanID:           pv.PlanID,
		PlanName:         pv.PlanName,
		PlanPeriodMonths: pv.PlanPeriodMonths,
		Amount:           pv.Amount,
		FinalAmount:      pv.FinalAmount,
		UniqueCode:       pv.UniqueCode,
		ProofURL:         pv.ProofURL,
		Status:           pv.Status,
		RejectionReason:  pv.RejectionReason,
	}, nil
}
