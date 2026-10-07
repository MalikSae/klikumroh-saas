package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/mail"
	"regexp"
	"strings"
	"time"

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

// SlugUnavailableError: the requested slug cannot be used (invalid format or reserved); Reason is the
// user-facing explanation from CheckSlug.
type SlugUnavailableError struct{ Reason string }

func (e *SlugUnavailableError) Error() string { return e.Reason }

// Subdomain rules (founder decision 6 Oct 2026): 3-30 characters, starts with a letter, lowercase letters,
// digits and single hyphens between parts.
const (
	slugMinLength = 3
	slugMaxLength = 30
)

var slugRegex = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

// slugPlatformParts may not appear anywhere in a travel subdomain (it would look like KlikUmroh itself).
var slugPlatformParts = []string{"klikumroh", "klik-umroh"}

// slugMisleading are refused as the whole subdomain: they suggest an official or verified site.
var slugMisleading = map[string]bool{
	"official": true, "resmi": true, "kemenag": true, "siskopatuh": true, "pemerintah": true,
	"verified": true, "terverifikasi": true, "asli": true, "pusat": true,
}

// slugMisleadingPart are refused as any hyphen-separated part too ("kemenag-resmi", "resmi-umroh"):
// words that only an official body would use. "official", "asli" and "pusat" stay whole-subdomain only,
// since they appear in real travel names ("official-tours" is allowed, see TestSlugProblem) (security
// audit 7 Oct 2026).
var slugMisleadingPart = map[string]bool{
	"resmi": true, "kemenag": true, "siskopatuh": true, "pemerintah": true, "verified": true, "terverifikasi": true,
}

// looksLikePlatformName catches look-alikes of "klikumroh" that a plain substring test misses: hyphens
// anywhere ("kli-kumroh"), digits for letters ("klikumr0h", "kl1kumroh") and doubled letters
// ("klikkumroh"). Security audit 7 Oct 2026: such a subdomain reads as KlikUmroh's own site.
func looksLikePlatformName(slug string) bool {
	base := strings.NewReplacer("-", "", "0", "o", "3", "e", "4", "a", "5", "s", "7", "t", "8", "b").Replace(slug)
	for _, one := range []string{"i", "l"} { // "1" stands for either
		if strings.Contains(collapseRepeats(strings.ReplaceAll(base, "1", one)), "klikumroh") {
			return true
		}
	}
	return false
}

// collapseRepeats turns runs of the same letter into one ("klikkumroh" -> "klikumroh").
func collapseRepeats(s string) string {
	var b strings.Builder
	var prev rune
	for i, r := range s {
		if i > 0 && r == prev {
			continue
		}
		b.WriteRune(r)
		prev = r
	}
	return b.String()
}

// slugGeneric are refused as the whole subdomain: industry words no single travel should own.
var slugGeneric = map[string]bool{
	"umroh": true, "umrah": true, "haji": true, "hajj": true, "travel": true, "tour": true, "tours": true,
	"umroh-murah": true, "umrah-murah": true, "umroh-haji": true, "haji-umroh": true, "umroh-plus": true,
	"promo": true, "paket": true, "paket-umroh": true, "travel-umroh": true, "jamaah": true,
}

// slugOffensive may not appear anywhere in a subdomain.
var slugOffensive = []string{"anjing", "bangsat", "kontol", "memek", "ngentot", "goblok", "tolol", "bajingan", "jancok"}

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
	// Target custom domains point their CNAME at (cname.klikumroh.id); never a travel's subdomain.
	"cname": true,
	// More technical / platform names (founder decision 6 Oct 2026).
	"cs": true, "info": true, "blog": true, "email": true, "ftp": true, "smtp": true, "webmail": true,
	"ns1": true, "ns2": true, "status": true, "test": true, "dev": true, "portal": true, "agen": true,
	"agent": true, "affiliator": true, "checkout": true, "signup": true, "daftar": true, "masuk": true,
}

// slugExampleMarker ends a refusal that gets an example subdomain appended (see CheckSlug).
const slugExampleMarker = " {contoh}"

// defaultSlugExample is the example when no subdomain can be made from the travel name.
const defaultSlugExample = "idris-tours"

var slugAccents = strings.NewReplacer(
	"à", "a", "á", "a", "â", "a", "ä", "a", "ã", "a", "è", "e", "é", "e", "ê", "e", "ë", "e",
	"ì", "i", "í", "i", "î", "i", "ï", "i", "ò", "o", "ó", "o", "ô", "o", "ö", "o", "õ", "o",
	"ù", "u", "ú", "u", "û", "u", "ü", "u", "ñ", "n", "ç", "c",
)

var slugNonAlnum = regexp.MustCompile("[^a-z0-9]+")
var slugLeading = regexp.MustCompile("^[0-9-]+")

// slugifyTravelName mirrors slugifyTravelName in web/lib/checkoutForm.ts: lowercase, accents dropped,
// anything outside a-z0-9 becomes a hyphen, leading digits dropped, at most 30 characters.
func slugifyTravelName(name string) string {
	v := slugAccents.Replace(strings.ToLower(name))
	v = strings.ReplaceAll(v, "&", " ")
	v = slugNonAlnum.ReplaceAllString(v, "-")
	v = slugLeading.ReplaceAllString(v, "")
	v = strings.Trim(v, "-")
	return strings.TrimRight(truncateRunes(v, slugMaxLength), "-")
}

func truncateRunes(v string, n int) string {
	if len(v) <= n {
		return v
	}
	return v[:n]
}

// slugProblem returns the user-facing reason a subdomain cannot be used, or "" when its format and
// wording are acceptable (availability is checked separately).
func slugProblem(cleaned string) string {
	if len(cleaned) < slugMinLength || len(cleaned) > slugMaxLength || !slugRegex.MatchString(cleaned) {
		return "Subdomain harus 3-30 karakter, diawali huruf, berisi huruf kecil, angka, dan tanda hubung (-)."
	}
	if reservedSlugs[cleaned] {
		return "Subdomain ini dicadangkan untuk sistem KlikUmroh." + slugExampleMarker
	}
	for _, part := range slugPlatformParts {
		if strings.Contains(cleaned, part) {
			return "Subdomain tidak boleh memakai nama KlikUmroh." + slugExampleMarker
		}
	}
	if looksLikePlatformName(cleaned) {
		return "Subdomain tidak boleh memakai nama KlikUmroh." + slugExampleMarker
	}
	if slugMisleading[cleaned] {
		return "Subdomain ini terkesan resmi dan bisa menyesatkan." + slugExampleMarker
	}
	for _, part := range strings.Split(cleaned, "-") {
		if slugMisleadingPart[part] {
			return "Subdomain ini terkesan resmi dan bisa menyesatkan." + slugExampleMarker
		}
	}
	if slugGeneric[cleaned] {
		return "Subdomain ini terlalu umum." + slugExampleMarker
	}
	for _, word := range slugOffensive {
		if strings.Contains(cleaned, word) {
			return "Subdomain ini tidak bisa dipakai." + slugExampleMarker
		}
	}
	return ""
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
	// ClientIP is set by the handler (never from the body), for the affiliator self-referral guard.
	ClientIP string `json:"-"`
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
	CheckSlug(ctx context.Context, slug string, travelName ...string) (bool, string, error)
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

// CheckSlug reports whether slug can be used. travelName (optional, the "Nama Travel" typed in the
// checkout) personalises the example in the refusal: a subdomain made from that name which is itself
// acceptable and still free, instead of the fixed "idris-tours" (founder request 7 Oct 2026).
func (s *publicSignupService) CheckSlug(ctx context.Context, slug string, travelName ...string) (bool, string, error) {
	cleaned := strings.ToLower(strings.TrimSpace(slug))
	name := ""
	if len(travelName) > 0 {
		name = travelName[0]
	}
	if reason := slugProblem(cleaned); reason != "" {
		if strings.HasSuffix(reason, slugExampleMarker) {
			example, err := s.suggestSlug(ctx, name, cleaned)
			if err != nil {
				return false, "", err
			}
			reason = strings.TrimSuffix(reason, slugExampleMarker) + " Gunakan nama travel Anda, contoh: " + example + "."
		}
		return false, reason, nil
	}

	taken, err := s.slugTaken(ctx, cleaned)
	if err != nil {
		return false, "", err
	}
	if taken {
		reason := "Subdomain sudah digunakan travel lain."
		if name != "" {
			example, err := s.suggestSlug(ctx, name, cleaned)
			if err != nil {
				return false, "", err
			}
			if example != defaultSlugExample {
				reason += " Coba: " + example + "."
			}
		}
		return false, reason, nil
	}

	return true, "", nil
}

func (s *publicSignupService) slugTaken(ctx context.Context, slug string) (bool, error) {
	existing, err := s.tenantRepo.GetBySlug(ctx, slug)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return false, err
	}
	return existing != nil, nil
}

// suggestSlug returns a subdomain made from the travel name that passes the wording rules, differs from
// the refused one and is not taken yet; it tries the name itself, then with -tours, -travel and -umroh.
// Without a usable name it falls back to the fixed example.
func (s *publicSignupService) suggestSlug(ctx context.Context, travelName, refused string) (string, error) {
	base := slugifyTravelName(travelName)
	if base == "" {
		return defaultSlugExample, nil
	}
	for _, suffix := range []string{"", "-tours", "-travel", "-umroh"} {
		candidate := base
		if suffix != "" {
			candidate = strings.TrimRight(truncateRunes(base, slugMaxLength-len(suffix)), "-") + suffix
		}
		if candidate == refused || slugProblem(candidate) != "" {
			continue
		}
		taken, err := s.slugTaken(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !taken {
			return candidate, nil
		}
	}
	return defaultSlugExample, nil
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
	available, reason, err := s.CheckSlug(ctx, slug, travelName)
	if err != nil {
		return nil, err
	}
	if !available {
		if reason != "" {
			return nil, &SlugUnavailableError{Reason: reason}
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

	if err := checkNewPassword(req.AdminPassword, ErrPasswordTooShort); err != nil {
		return nil, err
	}

	plan, err := s.planRepo.GetByID(ctx, req.PlanID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrPlanNotFound
		}
		return nil, err
	}
	// A hidden plan (pricing_plans.is_public = FALSE) is never offered at signup.
	if !PlanAvailableToTravel(plan, nil) {
		return nil, ErrPlanNotAvailable
	}

	var couponCodePtr *string
	// A new travel's first payment: the plan promo applies, then the coupon on the promo price.
	promo := promoForInvoice(plan, true, nil, time.Now())
	baseAmount := promoBilled(plan.Price, promo)
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
		uniqueCode = pickUniqueCode(ctx, s.pvRepo, discountedAmount, 0, 0)
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
		// Lost a race with another signup for the same slug or WhatsApp number (UNIQUE index): report
		// it cleanly instead of passing on the raw database text.
		if repository.IsDuplicateKey(err) {
			if existing, findErr := s.tenantRepo.GetBySlug(ctx, slug); findErr == nil && existing != nil {
				return nil, ErrSlugAlreadyTaken
			}
			if whatsappPtr != nil {
				if existing, findErr := s.tenantRepo.GetByWhatsAppNumber(ctx, *whatsappPtr); findErr == nil && existing != nil {
					return nil, ErrTenantWhatsAppAlreadyInUse
				}
			}
			return nil, ErrSlugAlreadyTaken
		}
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
		TenantID:     tenant.ID,
		PlanID:       plan.ID,
		CouponCode:   couponCodePtr,
		PromoPercent: promo,
		Amount:       plan.Price,
		FinalAmount:  finalAmount,
		UniqueCode:   uniqueCode,
		Status:       "pending",
		ProofURL:     nil,
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
		s.affiliators.AttributeSignup(ctx, tenant.ID, coupon, req.AffiliateCode, adminEmail, wa, req.ClientIP)
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
