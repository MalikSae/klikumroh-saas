package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

var (
	// ErrInvalidHexColor is returned when the brand primary color is not a valid 6-digit hex string #RRGGBB.
	ErrInvalidHexColor             = errors.New("format warna harus berupa hex #RRGGBB (contoh: #2563EB)")
	ErrInvalidWhatsAppNumber       = errors.New("nomor WhatsApp minimal 10 digit dan harus diawali '62'")
	ErrWhatsAppAlreadyInUse        = errors.New("nomor WhatsApp sudah digunakan oleh travel lain")
	ErrInvalidCommissionPercentage = errors.New("persentase komisi override harus antara 0 dan 100")
	hexColorRegex                  = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
)

// PublicTenantInfo represents public whitelabel tenant information for the home page.
type PublicTenantInfo struct {
	Name              string  `json:"name"`
	BrandPrimaryColor *string `json:"brand_primary_color"`
	BrandLogoURL      *string `json:"brand_logo_url"`
	BrandIconURL      *string `json:"brand_icon_url"`
	WhatsAppNumber    *string `json:"whatsapp_number"`
	Tagline           *string `json:"tagline"`
	AboutSummary      *string `json:"about_summary"`
	PPIUNumber        *string `json:"ppiu_number"`
	Address           *string `json:"address"`
	City              *string `json:"city"`
	Province          *string `json:"province"`
	Phone             *string `json:"phone"`
	Email             *string `json:"email"`
	TrustRating       *string `json:"trust_rating"`
	TrustAlumniCount  *string `json:"trust_alumni_count"`
	TrustGuarantee    *string `json:"trust_guarantee"`
	SocialInstagram   *string `json:"social_instagram"`
	SocialFacebook    *string `json:"social_facebook"`
	SocialYoutube     *string `json:"social_youtube"`
	MetaTitle         *string `json:"meta_title"`
	MetaDescription   *string `json:"meta_description"`
	MetaKeywords      *string `json:"meta_keywords"`
	OGImageURL        *string `json:"og_image_url"`
	IsSuspended       bool    `json:"is_suspended"`
	SuspendedReason   *string `json:"suspended_reason,omitempty"`
}

// PublicAgentRegistrationInfo represents public registration settings for potential agents.
type PublicAgentRegistrationInfo struct {
	TenantName                string  `json:"tenant_name"`
	BrandLogoURL              *string `json:"brand_logo_url"`
	AgentRegistrationFee      float64 `json:"agent_registration_fee"`
	AgentRegistrationBenefits *string `json:"agent_registration_benefits"`
	AgentRegistrationTerms    *string `json:"agent_registration_terms"`
	AgentBankName             *string `json:"agent_bank_name"`
	AgentBankAccountNumber    *string `json:"agent_bank_account_number"`
	AgentBankAccountHolder    *string `json:"agent_bank_account_holder"`
}

// TenantBranding represents branding settings for dashboard.
type TenantBranding struct {
	BrandPrimaryColor *string `json:"brand_primary_color"`
}

// TenantWhatsApp represents WhatsApp number settings for dashboard.
type TenantWhatsApp struct {
	WhatsAppNumber *string `json:"whatsapp_number"`
}

// TenantProfile represents profile and branding settings for dashboard.
type TenantProfile struct {
	Name         string  `json:"name"`
	BrandLogoURL *string `json:"brand_logo_url"`
	BrandIconURL *string `json:"brand_icon_url"`
	Tagline      *string `json:"tagline"`
	AboutSummary *string `json:"about_summary"`
}

// TenantContactLegal represents contact and legality settings for dashboard.
type TenantContactLegal struct {
	PPIUNumber      *string `json:"ppiu_number"`
	Address         *string `json:"address"`
	Phone           *string `json:"phone"`
	Email           *string `json:"email"`
	WhatsAppNumber  *string `json:"whatsapp_number"`
	SocialInstagram *string `json:"social_instagram"`
	SocialFacebook  *string `json:"social_facebook"`
	SocialYoutube   *string `json:"social_youtube"`
}

// TenantTrustMetrics represents trust strip metrics settings for dashboard.
type TenantTrustMetrics struct {
	TrustRating      *string `json:"trust_rating"`
	TrustAlumniCount *string `json:"trust_alumni_count"`
	TrustGuarantee   *string `json:"trust_guarantee"`
}

// TenantSEOGeo represents SEO, GEO, and OpenGraph settings for dashboard.
type TenantSEOGeo struct {
	City            *string `json:"city"`
	Province        *string `json:"province"`
	MetaTitle       *string `json:"meta_title"`
	MetaDescription *string `json:"meta_description"`
	MetaKeywords    *string `json:"meta_keywords"`
	OGImageURL      *string `json:"og_image_url"`
}

// CommissionSettings represents tenant-wide commission settings for dashboard.
type CommissionSettings struct {
	CommissionOverrideEnabled    bool     `json:"commission_override_enabled"`
	CommissionOverridePercentage *float64 `json:"commission_override_percentage"`
}

// TenantService defines business logic operations for Tenants.
type TenantService interface {
	UpdateBranding(ctx context.Context, tenantID uint64, hexColor string) (*TenantBranding, error)
	GetBranding(ctx context.Context, tenantID uint64) (*TenantBranding, error)
	UpdateWhatsApp(ctx context.Context, tenantID uint64, rawNumber string) (*TenantWhatsApp, error)
	GetWhatsApp(ctx context.Context, tenantID uint64) (*TenantWhatsApp, error)
	GetProfile(ctx context.Context, tenantID uint64) (*TenantProfile, error)
	UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL, tagline, aboutSummary *string) (*TenantProfile, error)
	UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error
	UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error
	GetContactLegal(ctx context.Context, tenantID uint64) (*TenantContactLegal, error)
	UpdateContactLegal(ctx context.Context, tenantID uint64, ppiuNumber, address, phone, email, whatsapp, instagram, facebook, youtube *string) (*TenantContactLegal, error)
	GetTrustMetrics(ctx context.Context, tenantID uint64) (*TenantTrustMetrics, error)
	UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating, alumniCount, guarantee *string) (*TenantTrustMetrics, error)
	GetSEOGeo(ctx context.Context, tenantID uint64) (*TenantSEOGeo, error)
	UpdateSEOGeo(ctx context.Context, tenantID uint64, city, province, metaTitle, metaDescription, metaKeywords *string) (*TenantSEOGeo, error)
	UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error
	UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) (*CommissionSettings, error)
	GetCommissionSettings(ctx context.Context, tenantID uint64) (*CommissionSettings, error)
	GetAgentSettings(ctx context.Context, tenantID uint64) (*repository.TenantAgentSettings, error)
	UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) (*repository.TenantAgentSettings, error)
	GetPublicInfo(ctx context.Context, tenantID uint64) (*PublicTenantInfo, error)
	GetPublicAgentRegistrationInfo(ctx context.Context, tenantID uint64) (*PublicAgentRegistrationInfo, error)
}

type tenantService struct {
	tenantRepo repository.TenantRepository
}

// NewTenantService creates a new TenantService.
func NewTenantService(tenantRepo repository.TenantRepository) TenantService {
	return &tenantService{
		tenantRepo: tenantRepo,
	}
}

func (s *tenantService) UpdateBranding(ctx context.Context, tenantID uint64, hexColor string) (*TenantBranding, error) {
	trimmed := strings.TrimSpace(hexColor)
	if !hexColorRegex.MatchString(trimmed) {
		return nil, ErrInvalidHexColor
	}
	normalized := strings.ToUpper(trimmed)

	if err := s.tenantRepo.UpdateBranding(ctx, tenantID, normalized); err != nil {
		return nil, err
	}

	return &TenantBranding{
		BrandPrimaryColor: &normalized,
	}, nil
}

func (s *tenantService) GetBranding(ctx context.Context, tenantID uint64) (*TenantBranding, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	var color *string
	if tenant.BrandPrimaryColor != nil && strings.TrimSpace(*tenant.BrandPrimaryColor) != "" {
		c := strings.TrimSpace(*tenant.BrandPrimaryColor)
		color = &c
	}

	return &TenantBranding{
		BrandPrimaryColor: color,
	}, nil
}

func (s *tenantService) UpdateWhatsApp(ctx context.Context, tenantID uint64, rawNumber string) (*TenantWhatsApp, error) {
	normalized := NormalizePhoneToWhatsApp(rawNumber)
	if len(normalized) < 10 || !strings.HasPrefix(normalized, "62") {
		return nil, ErrInvalidWhatsAppNumber
	}

	existing, err := s.tenantRepo.GetByWhatsAppNumber(ctx, normalized)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	if existing != nil && existing.ID != tenantID {
		return nil, ErrWhatsAppAlreadyInUse
	}

	if err := s.tenantRepo.UpdateWhatsAppNumber(ctx, tenantID, normalized); err != nil {
		return nil, err
	}

	return &TenantWhatsApp{
		WhatsAppNumber: &normalized,
	}, nil
}

func (s *tenantService) GetWhatsApp(ctx context.Context, tenantID uint64) (*TenantWhatsApp, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	var wa *string
	if tenant.WhatsAppNumber != nil && strings.TrimSpace(*tenant.WhatsAppNumber) != "" {
		w := strings.TrimSpace(*tenant.WhatsAppNumber)
		wa = &w
	}

	return &TenantWhatsApp{
		WhatsAppNumber: wa,
	}, nil
}

func (s *tenantService) GetProfile(ctx context.Context, tenantID uint64) (*TenantProfile, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return &TenantProfile{
		Name:         tenant.Name,
		BrandLogoURL: tenant.BrandLogoURL,
		BrandIconURL: tenant.BrandIconURL,
		Tagline:      tenant.Tagline,
		AboutSummary: tenant.AboutSummary,
	}, nil
}

func (s *tenantService) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL, tagline, aboutSummary *string) (*TenantProfile, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, errors.New("nama travel tidak boleh kosong")
	}

	if err := s.tenantRepo.UpdateProfile(ctx, tenantID, trimmedName, logoURL, tagline, aboutSummary); err != nil {
		return nil, err
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return &TenantProfile{
		Name:         tenant.Name,
		BrandLogoURL: tenant.BrandLogoURL,
		BrandIconURL: tenant.BrandIconURL,
		Tagline:      tenant.Tagline,
		AboutSummary: tenant.AboutSummary,
	}, nil
}

func (s *tenantService) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	return s.tenantRepo.UpdateBrandIcon(ctx, tenantID, iconURL)
}

func (s *tenantService) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	return s.tenantRepo.UpdateBrandLogo(ctx, tenantID, logoURL)
}

func (s *tenantService) GetContactLegal(ctx context.Context, tenantID uint64) (*TenantContactLegal, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return &TenantContactLegal{
		PPIUNumber:      tenant.PPIUNumber,
		Address:         tenant.Address,
		Phone:           tenant.Phone,
		Email:           tenant.Email,
		WhatsAppNumber:  tenant.WhatsAppNumber,
		SocialInstagram: tenant.SocialInstagram,
		SocialFacebook:  tenant.SocialFacebook,
		SocialYoutube:   tenant.SocialYoutube,
	}, nil
}

func (s *tenantService) UpdateContactLegal(ctx context.Context, tenantID uint64, ppiuNumber, address, phone, email, whatsapp, instagram, facebook, youtube *string) (*TenantContactLegal, error) {
	var normalizedWA *string
	if whatsapp != nil && strings.TrimSpace(*whatsapp) != "" {
		cleaned := NormalizePhoneToWhatsApp(*whatsapp)
		if len(cleaned) < 10 || !strings.HasPrefix(cleaned, "62") {
			return nil, ErrInvalidWhatsAppNumber
		}
		existing, err := s.tenantRepo.GetByWhatsAppNumber(ctx, cleaned)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		if existing != nil && existing.ID != tenantID {
			return nil, ErrWhatsAppAlreadyInUse
		}
		normalizedWA = &cleaned
	}

	if err := s.tenantRepo.UpdateContactAndLegal(ctx, tenantID, ppiuNumber, address, phone, email, normalizedWA, instagram, facebook, youtube); err != nil {
		return nil, err
	}

	return &TenantContactLegal{
		PPIUNumber:      ppiuNumber,
		Address:         address,
		Phone:           phone,
		Email:           email,
		WhatsAppNumber:  normalizedWA,
		SocialInstagram: instagram,
		SocialFacebook:  facebook,
		SocialYoutube:   youtube,
	}, nil
}

func (s *tenantService) GetTrustMetrics(ctx context.Context, tenantID uint64) (*TenantTrustMetrics, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return &TenantTrustMetrics{
		TrustRating:      tenant.TrustRating,
		TrustAlumniCount: tenant.TrustAlumniCount,
		TrustGuarantee:   tenant.TrustGuarantee,
	}, nil
}

func (s *tenantService) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating, alumniCount, guarantee *string) (*TenantTrustMetrics, error) {
	if err := s.tenantRepo.UpdateTrustMetrics(ctx, tenantID, rating, alumniCount, guarantee); err != nil {
		return nil, err
	}
	return &TenantTrustMetrics{
		TrustRating:      rating,
		TrustAlumniCount: alumniCount,
		TrustGuarantee:   guarantee,
	}, nil
}

func (s *tenantService) GetPublicInfo(ctx context.Context, tenantID uint64) (*PublicTenantInfo, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	var color *string
	if tenant.BrandPrimaryColor != nil && strings.TrimSpace(*tenant.BrandPrimaryColor) != "" {
		c := strings.TrimSpace(*tenant.BrandPrimaryColor)
		color = &c
	}

	var logo *string
	if tenant.BrandLogoURL != nil && strings.TrimSpace(*tenant.BrandLogoURL) != "" {
		l := strings.TrimSpace(*tenant.BrandLogoURL)
		logo = &l
	}

	var icon *string
	if tenant.BrandIconURL != nil && strings.TrimSpace(*tenant.BrandIconURL) != "" {
		i := strings.TrimSpace(*tenant.BrandIconURL)
		icon = &i
	}

	var wa *string
	if tenant.WhatsAppNumber != nil && strings.TrimSpace(*tenant.WhatsAppNumber) != "" {
		w := strings.TrimSpace(*tenant.WhatsAppNumber)
		wa = &w
	}

	isSuspended := false
	var suspendedReason *string
	if tenant.Status == "pending" {
		isSuspended = true
		reason := "Situs web biro travel ini sedang dalam proses aktivasi lisensi. Silakan kunjungi beberapa saat lagi."
		suspendedReason = &reason
	} else if tenant.Status == "inactive" {
		isSuspended = true
		reason := "Layanan website biro travel ini sedang dinonaktifkan sementara. Silakan hubungi pihak biro travel."
		suspendedReason = &reason
	} else if tenant.SubscriptionExpiresAt != nil && time.Now().After(tenant.SubscriptionExpiresAt.AddDate(0, 0, 7)) {
		isSuspended = true
		reason := "Layanan website biro travel ini sedang dalam masa pembaruan berkala. Silakan hubungi pihak biro travel."
		suspendedReason = &reason
	}

	return &PublicTenantInfo{
		Name:              tenant.Name,
		BrandPrimaryColor: color,
		BrandLogoURL:      logo,
		BrandIconURL:      icon,
		WhatsAppNumber:    wa,
		Tagline:           tenant.Tagline,
		AboutSummary:      tenant.AboutSummary,
		PPIUNumber:        tenant.PPIUNumber,
		Address:           tenant.Address,
		Phone:             tenant.Phone,
		Email:             tenant.Email,
		TrustRating:       tenant.TrustRating,
		TrustAlumniCount:  tenant.TrustAlumniCount,
		TrustGuarantee:    tenant.TrustGuarantee,
		SocialInstagram:   tenant.SocialInstagram,
		SocialFacebook:    tenant.SocialFacebook,
		SocialYoutube:     tenant.SocialYoutube,
		City:              tenant.City,
		Province:          tenant.Province,
		MetaTitle:         tenant.MetaTitle,
		MetaDescription:   tenant.MetaDescription,
		MetaKeywords:      tenant.MetaKeywords,
		OGImageURL:        tenant.OGImageURL,
		IsSuspended:       isSuspended,
		SuspendedReason:   suspendedReason,
	}, nil
}

func (s *tenantService) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) (*CommissionSettings, error) {
	if enabled {
		if percentage == nil || *percentage < 0 || *percentage > 100 {
			return nil, ErrInvalidCommissionPercentage
		}
	} else {
		percentage = nil
	}

	if err := s.tenantRepo.UpdateCommissionSettings(ctx, tenantID, enabled, percentage); err != nil {
		return nil, err
	}

	return &CommissionSettings{
		CommissionOverrideEnabled:    enabled,
		CommissionOverridePercentage: percentage,
	}, nil
}

func (s *tenantService) GetCommissionSettings(ctx context.Context, tenantID uint64) (*CommissionSettings, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return &CommissionSettings{
		CommissionOverrideEnabled:    tenant.CommissionOverrideEnabled,
		CommissionOverridePercentage: tenant.CommissionOverridePercentage,
	}, nil
}

func (s *tenantService) GetAgentSettings(ctx context.Context, tenantID uint64) (*repository.TenantAgentSettings, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return &repository.TenantAgentSettings{
		AgentRegistrationFee:      tenant.AgentRegistrationFee,
		AgentRegistrationBenefits: tenant.AgentRegistrationBenefits,
		AgentBankName:             tenant.AgentBankName,
		AgentBankAccountNumber:    tenant.AgentBankAccountNumber,
		AgentBankAccountHolder:    tenant.AgentBankAccountHolder,
		AgentTermsConditions:      tenant.AgentTermsConditions,
		MinimumPayoutAmount:       tenant.MinimumPayoutAmount,
	}, nil
}

func (s *tenantService) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) (*repository.TenantAgentSettings, error) {
	if settings.AgentRegistrationFee != nil && *settings.AgentRegistrationFee < 0 {
		return nil, errors.New("biaya pendaftaran agen tidak boleh bernilai negatif")
	}
	if settings.MinimumPayoutAmount != nil && *settings.MinimumPayoutAmount < 0 {
		return nil, errors.New("minimum pencairan komisi tidak boleh bernilai negatif")
	}

	if err := s.tenantRepo.UpdateAgentSettings(ctx, tenantID, settings); err != nil {
		return nil, err
	}

	return settings, nil
}

func (s *tenantService) GetPublicAgentRegistrationInfo(ctx context.Context, tenantID uint64) (*PublicAgentRegistrationInfo, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	var fee float64 = 0
	if tenant.AgentRegistrationFee != nil {
		fee = *tenant.AgentRegistrationFee
	}

	return &PublicAgentRegistrationInfo{
		TenantName:                tenant.Name,
		BrandLogoURL:              tenant.BrandLogoURL,
		AgentRegistrationFee:      fee,
		AgentRegistrationBenefits: tenant.AgentRegistrationBenefits,
		AgentRegistrationTerms:    tenant.AgentTermsConditions,
		AgentBankName:             tenant.AgentBankName,
		AgentBankAccountNumber:    tenant.AgentBankAccountNumber,
		AgentBankAccountHolder:    tenant.AgentBankAccountHolder,
	}, nil
}

func (s *tenantService) GetSEOGeo(ctx context.Context, tenantID uint64) (*TenantSEOGeo, error) {
	settings, err := s.tenantRepo.GetSEOGeo(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return &TenantSEOGeo{
		City:            settings.City,
		Province:        settings.Province,
		MetaTitle:       settings.MetaTitle,
		MetaDescription: settings.MetaDescription,
		MetaKeywords:    settings.MetaKeywords,
		OGImageURL:      settings.OGImageURL,
	}, nil
}

func (s *tenantService) UpdateSEOGeo(ctx context.Context, tenantID uint64, city, province, metaTitle, metaDescription, metaKeywords *string) (*TenantSEOGeo, error) {
	settings := &repository.TenantSEOGeoSettings{
		City:            city,
		Province:        province,
		MetaTitle:       metaTitle,
		MetaDescription: metaDescription,
		MetaKeywords:    metaKeywords,
	}

	if err := s.tenantRepo.UpdateSEOGeo(ctx, tenantID, settings); err != nil {
		return nil, err
	}

	return s.GetSEOGeo(ctx, tenantID)
}

func (s *tenantService) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	return s.tenantRepo.UpdateOGImage(ctx, tenantID, ogImageURL)
}
