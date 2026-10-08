package service

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"klikumroh/internal/repository"
)

// Legal documents of the platform (Syarat & Ketentuan, Kebijakan Privasi): staff write them in the internal
// dashboard, publishing makes them appear on the public slug and fills the platform settings URL that
// checkout and agent signup wait for (public_signup.go requireLegalDocuments).

const (
	LegalSlugTerms   = "syarat-ketentuan"
	LegalSlugPrivacy = "kebijakan-privasi"

	// MaxLegalContentChars and MaxLegalTitleChars keep a document a document (the longest real policies are far shorter).
	MaxLegalContentChars = 200000
	MaxLegalTitleChars   = 150
)

var (
	ErrLegalSlugUnknown  = errors.New("dokumen tidak dikenal")
	ErrLegalTitleInvalid = errors.New("judul wajib diisi dan maksimal 150 karakter")
	ErrLegalTooLong      = errors.New("isi dokumen terlalu panjang (maksimal 200.000 karakter)")
	ErrLegalNotPublished = errors.New("dokumen belum diterbitkan")
)

// legalSettingKey is the platform_settings key that holds the public URL of each document.
var legalSettingKey = map[string]string{
	LegalSlugTerms:   "terms_url",
	LegalSlugPrivacy: "privacy_url",
}

// LegalDocumentService manages the legal documents.
type LegalDocumentService interface {
	List(ctx context.Context) ([]repository.LegalDocument, error)
	// Public returns the published version of a document (ErrLegalNotPublished when it is not published).
	Public(ctx context.Context, slug string) (*repository.LegalDocument, error)
	SaveDraft(ctx context.Context, slug, title, content string, staffUserID uint64) (*repository.LegalDocument, error)
	Publish(ctx context.Context, slug string, staffUserID uint64) (*repository.LegalDocument, error)
	Unpublish(ctx context.Context, slug string) (*repository.LegalDocument, error)
}

type legalDocumentService struct {
	repo     repository.LegalDocumentRepository
	settings repository.PlatformSettingsRepository
	// origin is the public site address ("https://klikumroh.id"), without a trailing slash.
	origin string
}

// NewLegalDocumentService creates a LegalDocumentService. origin is where the public slugs live; an empty value
// means https://klikumroh.id.
func NewLegalDocumentService(repo repository.LegalDocumentRepository, settings repository.PlatformSettingsRepository, origin string) LegalDocumentService {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	if origin == "" {
		origin = "https://klikumroh.id"
	}
	return &legalDocumentService{repo: repo, settings: settings, origin: origin}
}

func (s *legalDocumentService) url(slug string) string { return s.origin + "/" + slug }

func validLegalSlug(slug string) bool {
	_, ok := legalSettingKey[slug]
	return ok
}

func (s *legalDocumentService) List(ctx context.Context) ([]repository.LegalDocument, error) {
	return s.repo.List(ctx)
}

func (s *legalDocumentService) Public(ctx context.Context, slug string) (*repository.LegalDocument, error) {
	if !validLegalSlug(slug) {
		return nil, ErrLegalSlugUnknown
	}
	d, err := s.repo.Get(ctx, slug)
	if err != nil {
		return nil, err
	}
	if !d.Published {
		return nil, ErrLegalNotPublished
	}
	// The public page never sees the draft.
	d.Draft = ""
	return d, nil
}

func (s *legalDocumentService) SaveDraft(ctx context.Context, slug, title, content string, staffUserID uint64) (*repository.LegalDocument, error) {
	if !validLegalSlug(slug) {
		return nil, ErrLegalSlugUnknown
	}
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > MaxLegalTitleChars {
		return nil, ErrLegalTitleInvalid
	}
	if utf8.RuneCountInString(content) > MaxLegalContentChars {
		return nil, ErrLegalTooLong
	}
	// Line endings are stored as \n.
	content = strings.ReplaceAll(content, "\r\n", "\n")
	if err := s.repo.SaveDraft(ctx, slug, title, content, staffUserID); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, slug)
}

func (s *legalDocumentService) Publish(ctx context.Context, slug string, staffUserID uint64) (*repository.LegalDocument, error) {
	if !validLegalSlug(slug) {
		return nil, ErrLegalSlugUnknown
	}
	if err := s.repo.Publish(ctx, slug, staffUserID); err != nil {
		return nil, err
	}
	// The URL checkout and agent signup wait for. Publishing again just rewrites the same value.
	if err := s.settings.SetMany(ctx, map[string]string{legalSettingKey[slug]: s.url(slug)}); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, slug)
}

func (s *legalDocumentService) Unpublish(ctx context.Context, slug string) (*repository.LegalDocument, error) {
	if !validLegalSlug(slug) {
		return nil, ErrLegalSlugUnknown
	}
	if err := s.repo.Unpublish(ctx, slug); err != nil {
		return nil, err
	}
	// Clear the settings URL only when it is ours: a link to an external document that staff typed in
	// Pengaturan Global stays.
	key := legalSettingKey[slug]
	all, err := s.settings.GetAll(ctx)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(all[key]) == s.url(slug) {
		if err := s.settings.SetMany(ctx, map[string]string{key: ""}); err != nil {
			return nil, err
		}
	}
	return s.repo.Get(ctx, slug)
}
