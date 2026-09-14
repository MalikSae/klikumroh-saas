package service

import (
	"context"
	"errors"
	"strings"

	"klikumroh/internal/repository"
)

var (
	ErrEmptyBannerTitle     = errors.New("judul banner tidak boleh kosong")
	ErrEmptyBannerImage     = errors.New("URL gambar banner tidak boleh kosong")
	ErrEmptyTestimonialName = errors.New("nama jamaah tidak boleh kosong")
	ErrEmptyTestimonialQuote= errors.New("isi testimoni tidak boleh kosong")
	ErrInvalidRating        = errors.New("rating harus antara 1 sampai 5")
	ErrEmptyFAQQuestion     = errors.New("pertanyaan FAQ tidak boleh kosong")
	ErrEmptyFAQAnswer       = errors.New("jawaban FAQ tidak boleh kosong")
)

// ContentService handles business logic for home page content (Banners, Testimonials, FAQs).
type ContentService interface {
	// Banners
	CreateBanner(ctx context.Context, tenantID uint64, b *repository.Banner) error
	GetBanner(ctx context.Context, tenantID uint64, id uint64) (*repository.Banner, error)
	ListBanners(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.Banner, error)
	UpdateBanner(ctx context.Context, tenantID uint64, b *repository.Banner) error
	DeleteBanner(ctx context.Context, tenantID uint64, id uint64) error

	// Testimonials
	CreateTestimonial(ctx context.Context, tenantID uint64, t *repository.Testimonial) error
	GetTestimonial(ctx context.Context, tenantID uint64, id uint64) (*repository.Testimonial, error)
	ListTestimonials(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.Testimonial, error)
	UpdateTestimonial(ctx context.Context, tenantID uint64, t *repository.Testimonial) error
	DeleteTestimonial(ctx context.Context, tenantID uint64, id uint64) error

	// FAQs
	CreateFAQ(ctx context.Context, tenantID uint64, f *repository.FAQ) error
	GetFAQ(ctx context.Context, tenantID uint64, id uint64) (*repository.FAQ, error)
	ListFAQs(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.FAQ, error)
	UpdateFAQ(ctx context.Context, tenantID uint64, f *repository.FAQ) error
	DeleteFAQ(ctx context.Context, tenantID uint64, id uint64) error
}

type contentService struct {
	bannerRepo repository.BannerRepository
	testiRepo  repository.TestimonialRepository
	faqRepo    repository.FAQRepository
}

// NewContentService creates a new ContentService instance.
func NewContentService(
	bannerRepo repository.BannerRepository,
	testiRepo repository.TestimonialRepository,
	faqRepo repository.FAQRepository,
) ContentService {
	return &contentService{
		bannerRepo: bannerRepo,
		testiRepo:  testiRepo,
		faqRepo:    faqRepo,
	}
}

// Banner implementation
func (s *contentService) CreateBanner(ctx context.Context, tenantID uint64, b *repository.Banner) error {
	b.Title = strings.TrimSpace(b.Title)
	if b.Title == "" {
		return ErrEmptyBannerTitle
	}
	b.ImageURL = strings.TrimSpace(b.ImageURL)
	if b.ImageURL == "" {
		return ErrEmptyBannerImage
	}
	return s.bannerRepo.Create(ctx, tenantID, b)
}

func (s *contentService) GetBanner(ctx context.Context, tenantID uint64, id uint64) (*repository.Banner, error) {
	return s.bannerRepo.GetByID(ctx, tenantID, id)
}

func (s *contentService) ListBanners(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.Banner, error) {
	return s.bannerRepo.ListByTenantID(ctx, tenantID, activeOnly)
}

func (s *contentService) UpdateBanner(ctx context.Context, tenantID uint64, b *repository.Banner) error {
	b.Title = strings.TrimSpace(b.Title)
	if b.Title == "" {
		return ErrEmptyBannerTitle
	}
	b.ImageURL = strings.TrimSpace(b.ImageURL)
	if b.ImageURL == "" {
		return ErrEmptyBannerImage
	}
	return s.bannerRepo.Update(ctx, tenantID, b)
}

func (s *contentService) DeleteBanner(ctx context.Context, tenantID uint64, id uint64) error {
	return s.bannerRepo.Delete(ctx, tenantID, id)
}

// Testimonial implementation
func (s *contentService) CreateTestimonial(ctx context.Context, tenantID uint64, t *repository.Testimonial) error {
	t.Name = strings.TrimSpace(t.Name)
	if t.Name == "" {
		return ErrEmptyTestimonialName
	}
	t.Quote = strings.TrimSpace(t.Quote)
	if t.Quote == "" {
		return ErrEmptyTestimonialQuote
	}
	if t.Rating < 1 || t.Rating > 5 {
		return ErrInvalidRating
	}
	return s.testiRepo.Create(ctx, tenantID, t)
}

func (s *contentService) GetTestimonial(ctx context.Context, tenantID uint64, id uint64) (*repository.Testimonial, error) {
	return s.testiRepo.GetByID(ctx, tenantID, id)
}

func (s *contentService) ListTestimonials(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.Testimonial, error) {
	return s.testiRepo.ListByTenantID(ctx, tenantID, activeOnly)
}

func (s *contentService) UpdateTestimonial(ctx context.Context, tenantID uint64, t *repository.Testimonial) error {
	t.Name = strings.TrimSpace(t.Name)
	if t.Name == "" {
		return ErrEmptyTestimonialName
	}
	t.Quote = strings.TrimSpace(t.Quote)
	if t.Quote == "" {
		return ErrEmptyTestimonialQuote
	}
	if t.Rating < 1 || t.Rating > 5 {
		return ErrInvalidRating
	}
	return s.testiRepo.Update(ctx, tenantID, t)
}

func (s *contentService) DeleteTestimonial(ctx context.Context, tenantID uint64, id uint64) error {
	return s.testiRepo.Delete(ctx, tenantID, id)
}

// FAQ implementation
func (s *contentService) CreateFAQ(ctx context.Context, tenantID uint64, f *repository.FAQ) error {
	f.Question = strings.TrimSpace(f.Question)
	if f.Question == "" {
		return ErrEmptyFAQQuestion
	}
	f.Answer = strings.TrimSpace(f.Answer)
	if f.Answer == "" {
		return ErrEmptyFAQAnswer
	}
	return s.faqRepo.Create(ctx, tenantID, f)
}

func (s *contentService) GetFAQ(ctx context.Context, tenantID uint64, id uint64) (*repository.FAQ, error) {
	return s.faqRepo.GetByID(ctx, tenantID, id)
}

func (s *contentService) ListFAQs(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.FAQ, error) {
	return s.faqRepo.ListByTenantID(ctx, tenantID, activeOnly)
}

func (s *contentService) UpdateFAQ(ctx context.Context, tenantID uint64, f *repository.FAQ) error {
	f.Question = strings.TrimSpace(f.Question)
	if f.Question == "" {
		return ErrEmptyFAQQuestion
	}
	f.Answer = strings.TrimSpace(f.Answer)
	if f.Answer == "" {
		return ErrEmptyFAQAnswer
	}
	return s.faqRepo.Update(ctx, tenantID, f)
}

func (s *contentService) DeleteFAQ(ctx context.Context, tenantID uint64, id uint64) error {
	return s.faqRepo.Delete(ctx, tenantID, id)
}
