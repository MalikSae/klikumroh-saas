package service

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"klikumroh/internal/repository"
)

var (
	ErrInvalidPlatformWhatsApp = errors.New("nomor WhatsApp resmi wajib diisi (minimal 9 digit angka)")
	ErrInvalidBankName         = errors.New("nama bank wajib diisi")
	ErrInvalidBankAccountNumber = errors.New("nomor rekening bank wajib diisi")
	ErrInvalidBankAccountHolder = errors.New("nama pemilik rekening (atas nama) wajib diisi")
)

var digitsOnlyRegex = regexp.MustCompile(`^[0-9]+$`)

// PlatformSettings represents the global configurations for KlikUmroh.
type PlatformSettings struct {
	WhatsAppNumber   string `json:"whatsapp_number"`
	BankName         string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
}

// UpdatePlatformSettingsRequest represents the payload from Master Admin.
type UpdatePlatformSettingsRequest struct {
	WhatsAppNumber   string `json:"whatsapp_number"`
	BankName         string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
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

	wa := data["whatsapp_number"]
	if wa == "" {
		wa = "6281234567890"
	}
	bankName := data["bank_name"]
	if bankName == "" {
		bankName = "Bank Syariah Indonesia (BSI)"
	}
	accNum := data["bank_account_number"]
	if accNum == "" {
		accNum = "7123456789"
	}
	accHolder := data["bank_account_holder"]
	if accHolder == "" {
		accHolder = "PT Klik Umroh Digital"
	}

	return &PlatformSettings{
		WhatsAppNumber:   wa,
		BankName:         bankName,
		BankAccountNumber: accNum,
		BankAccountHolder: accHolder,
	}, nil
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

	settings := map[string]string{
		"whatsapp_number":    cleanWA,
		"bank_name":          bankName,
		"bank_account_number": accNum,
		"bank_account_holder": accHolder,
	}

	if err := s.repo.SetMany(ctx, settings); err != nil {
		return nil, err
	}

	return &PlatformSettings{
		WhatsAppNumber:   cleanWA,
		BankName:         bankName,
		BankAccountNumber: accNum,
		BankAccountHolder: accHolder,
	}, nil
}
