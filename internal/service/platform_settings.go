package service

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"sort"
	"strings"

	"klikumroh/internal/repository"
)

var (
	ErrInvalidPlatformWhatsApp  = errors.New("nomor WhatsApp resmi wajib diisi (minimal 9 digit angka)")
	ErrInvalidBankName          = errors.New("nama bank wajib diisi")
	ErrInvalidBankAccountNumber = errors.New("nomor rekening bank wajib diisi")
	ErrInvalidBankAccountHolder = errors.New("nama pemilik rekening (atas nama) wajib diisi")
	ErrInvalidLegalURL          = errors.New("URL Syarat & Ketentuan / Kebijakan Privasi harus berupa alamat lengkap yang diawali https://")
)

var digitsOnlyRegex = regexp.MustCompile(`^[0-9]+$`)

// PlatformSettings represents the global configurations for KlikUmroh.
// Empty values mean "not configured yet": they are never replaced by placeholder data, so the UI can hide
// WhatsApp buttons / bank details instead of sending travels to a fake number or account.
type PlatformSettings struct {
	WhatsAppNumber    string `json:"whatsapp_number"`
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	TermsURL          string `json:"terms_url"`
	PrivacyURL        string `json:"privacy_url"`
	// MissingFields lists the keys above that are still empty, for the super admin warning.
	MissingFields []string `json:"missing_fields"`
}

// UpdatePlatformSettingsRequest represents the payload from Master Admin.
type UpdatePlatformSettingsRequest struct {
	WhatsAppNumber    string `json:"whatsapp_number"`
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
	TermsURL          string `json:"terms_url"`
	PrivacyURL        string `json:"privacy_url"`
}

// PlatformSettingsService defines operations on platform settings.
type PlatformSettingsService interface {
	GetSettings(ctx context.Context) (*PlatformSettings, error)
	UpdateSettings(ctx context.Context, req UpdatePlatformSettingsRequest) (*PlatformSettings, error)
}

type platformSettingsService struct {
	repo repository.PlatformSettingsRepository
}

// NewPlatformSettingsService creates a new PlatformSettingsService instance.
func NewPlatformSettingsService(repo repository.PlatformSettingsRepository) PlatformSettingsService {
	return &platformSettingsService{repo: repo}
}

func (s *platformSettingsService) GetSettings(ctx context.Context) (*PlatformSettings, error) {
	data, err := s.repo.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	return newPlatformSettings(
		data["whatsapp_number"],
		data["bank_name"],
		data["bank_account_number"],
		data["bank_account_holder"],
		data["terms_url"],
		data["privacy_url"],
	), nil
}

func newPlatformSettings(wa, bankName, accNum, accHolder, termsURL, privacyURL string) *PlatformSettings {
	s := &PlatformSettings{
		WhatsAppNumber:    strings.TrimSpace(wa),
		BankName:          strings.TrimSpace(bankName),
		BankAccountNumber: strings.TrimSpace(accNum),
		BankAccountHolder: strings.TrimSpace(accHolder),
		TermsURL:          strings.TrimSpace(termsURL),
		PrivacyURL:        strings.TrimSpace(privacyURL),
		MissingFields:     []string{},
	}
	for key, val := range map[string]string{
		"whatsapp_number":     s.WhatsAppNumber,
		"bank_name":           s.BankName,
		"bank_account_number": s.BankAccountNumber,
		"bank_account_holder": s.BankAccountHolder,
		"terms_url":           s.TermsURL,
		"privacy_url":         s.PrivacyURL,
	} {
		if val == "" {
			s.MissingFields = append(s.MissingFields, key)
		}
	}
	sort.Strings(s.MissingFields)
	return s
}

// normalizeLegalURL accepts an empty value (not configured yet) or an absolute https:// URL.
func normalizeLegalURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return "", ErrInvalidLegalURL
	}
	return u.String(), nil
}

func (s *platformSettingsService) UpdateSettings(ctx context.Context, req UpdatePlatformSettingsRequest) (*PlatformSettings, error) {
	// Normalize WhatsApp number
	cleanWA := strings.TrimSpace(req.WhatsAppNumber)
	cleanWA = strings.ReplaceAll(cleanWA, "+", "")
	cleanWA = strings.ReplaceAll(cleanWA, " ", "")
	cleanWA = strings.ReplaceAll(cleanWA, "-", "")

	if len(cleanWA) < 9 || !digitsOnlyRegex.MatchString(cleanWA) {
		return nil, ErrInvalidPlatformWhatsApp
	}

	// If starts with 08, normalize to 628
	if strings.HasPrefix(cleanWA, "08") {
		cleanWA = "628" + cleanWA[2:]
	}

	bankName := strings.TrimSpace(req.BankName)
	if bankName == "" {
		return nil, ErrInvalidBankName
	}

	accNum := strings.TrimSpace(req.BankAccountNumber)
	if accNum == "" {
		return nil, ErrInvalidBankAccountNumber
	}

	accHolder := strings.TrimSpace(req.BankAccountHolder)
	if accHolder == "" {
		return nil, ErrInvalidBankAccountHolder
	}

	termsURL, err := normalizeLegalURL(req.TermsURL)
	if err != nil {
		return nil, err
	}
	privacyURL, err := normalizeLegalURL(req.PrivacyURL)
	if err != nil {
		return nil, err
	}

	settings := map[string]string{
		"whatsapp_number":     cleanWA,
		"bank_name":           bankName,
		"bank_account_number": accNum,
		"bank_account_holder": accHolder,
		"terms_url":           termsURL,
		"privacy_url":         privacyURL,
	}

	if err := s.repo.SetMany(ctx, settings); err != nil {
		return nil, err
	}

	return newPlatformSettings(cleanWA, bankName, accNum, accHolder, termsURL, privacyURL), nil
}
