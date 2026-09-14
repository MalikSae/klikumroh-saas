package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockBannerRepo struct {
	banners map[uint64]*repository.Banner
	nextID  uint64
}

func newMockBannerRepo() *mockBannerRepo {
	return &mockBannerRepo{
		banners: make(map[uint64]*repository.Banner),
		nextID:  1,
	}
}

func (m *mockBannerRepo) Create(ctx context.Context, tenantID uint64, b *repository.Banner) error {
	b.ID = m.nextID
	m.nextID++
	b.TenantID = tenantID
	m.banners[b.ID] = b
	return nil
}

func (m *mockBannerRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Banner, error) {
	b, ok := m.banners[id]
	if !ok || b.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return b, nil
}

func (m *mockBannerRepo) ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.Banner, error) {
	var res []*repository.Banner
	for _, b := range m.banners {
		if b.TenantID == tenantID {
			if !activeOnly || b.IsActive {
				res = append(res, b)
			}
		}
	}
	return res, nil
}

func (m *mockBannerRepo) Update(ctx context.Context, tenantID uint64, b *repository.Banner) error {
	existing, ok := m.banners[b.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	b.TenantID = tenantID
	m.banners[b.ID] = b
	return nil
}

func (m *mockBannerRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	existing, ok := m.banners[id]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.banners, id)
	return nil
}

type mockTestiRepo struct {
	testis map[uint64]*repository.Testimonial
	nextID uint64
}

func newMockTestiRepo() *mockTestiRepo {
	return &mockTestiRepo{
		testis: make(map[uint64]*repository.Testimonial),
		nextID: 1,
	}
}

func (m *mockTestiRepo) Create(ctx context.Context, tenantID uint64, t *repository.Testimonial) error {
	t.ID = m.nextID
	m.nextID++
	t.TenantID = tenantID
	m.testis[t.ID] = t
	return nil
}

func (m *mockTestiRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Testimonial, error) {
	t, ok := m.testis[id]
	if !ok || t.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return t, nil
}

func (m *mockTestiRepo) ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.Testimonial, error) {
	var res []*repository.Testimonial
	for _, t := range m.testis {
		if t.TenantID == tenantID {
			if !activeOnly || t.IsActive {
				res = append(res, t)
			}
		}
	}
	return res, nil
}

func (m *mockTestiRepo) Update(ctx context.Context, tenantID uint64, t *repository.Testimonial) error {
	existing, ok := m.testis[t.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	t.TenantID = tenantID
	m.testis[t.ID] = t
	return nil
}

func (m *mockTestiRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	existing, ok := m.testis[id]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.testis, id)
	return nil
}

type mockFAQRepo struct {
	faqs   map[uint64]*repository.FAQ
	nextID uint64
}

func newMockFAQRepo() *mockFAQRepo {
	return &mockFAQRepo{
		faqs:   make(map[uint64]*repository.FAQ),
		nextID: 1,
	}
}

func (m *mockFAQRepo) Create(ctx context.Context, tenantID uint64, f *repository.FAQ) error {
	f.ID = m.nextID
	m.nextID++
	f.TenantID = tenantID
	m.faqs[f.ID] = f
	return nil
}

func (m *mockFAQRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.FAQ, error) {
	f, ok := m.faqs[id]
	if !ok || f.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return f, nil
}

func (m *mockFAQRepo) ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*repository.FAQ, error) {
	var res []*repository.FAQ
	for _, f := range m.faqs {
		if f.TenantID == tenantID {
			if !activeOnly || f.IsActive {
				res = append(res, f)
			}
		}
	}
	return res, nil
}

func (m *mockFAQRepo) Update(ctx context.Context, tenantID uint64, f *repository.FAQ) error {
	existing, ok := m.faqs[f.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	f.TenantID = tenantID
	m.faqs[f.ID] = f
	return nil
}

func (m *mockFAQRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	existing, ok := m.faqs[id]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.faqs, id)
	return nil
}

func TestContentHandler_Banners(t *testing.T) {
	bRepo := newMockBannerRepo()
	tRepo := newMockTestiRepo()
	fRepo := newMockFAQRepo()

	svc := service.NewContentService(bRepo, tRepo, fRepo)
	h := handler.NewContentHandler(svc)

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := middleware.WithTenantID(req.Context(), 10)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.RegisterDashboardRoutes(r)
	h.RegisterPublicRoutes(r)

	// 1. Create Banner
	payload := handler.BannerPayload{
		Title:        "Promo Awal Musim",
		ImageURL:     "https://example.com/banner.jpg",
		DisplayOrder: 1,
		IsActive:     true,
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboard/banners", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	// 2. List Banners
	req = httptest.NewRequest(http.MethodGet, "/api/dashboard/banners", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", rec.Code)
	}

	var banners []*repository.Banner
	_ = json.Unmarshal(rec.Body.Bytes(), &banners)
	if len(banners) != 1 || banners[0].Title != "Promo Awal Musim" {
		t.Errorf("Unexpected banners: %+v", banners)
	}

	// 3. Public List Banners
	req = httptest.NewRequest(http.MethodGet, "/api/public/banners", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for public banners, got %d", rec.Code)
	}
}

func TestContentHandler_TestimonialsAndFAQs(t *testing.T) {
	bRepo := newMockBannerRepo()
	tRepo := newMockTestiRepo()
	fRepo := newMockFAQRepo()

	svc := service.NewContentService(bRepo, tRepo, fRepo)
	h := handler.NewContentHandler(svc)

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := middleware.WithTenantID(req.Context(), 10)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.RegisterDashboardRoutes(r)
	h.RegisterPublicRoutes(r)

	// Create Testimonial
	tPayload := handler.TestimonialPayload{
		Name:        "H. Ahmad",
		PackageName: "Umroh Syawal",
		Rating:      5,
		Quote:       "Pelayanan luar biasa",
		IsActive:    true,
	}
	body, _ := json.Marshal(tPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/dashboard/testimonials", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for testimonial, got %d: %s", rec.Code, rec.Body.String())
	}

	// Create FAQ
	fPayload := handler.FAQPayload{
		Question: "Kapan manasik diadakan?",
		Answer:   "Dua minggu sebelum keberangkatan.",
		IsActive: true,
	}
	body, _ = json.Marshal(fPayload)
	req = httptest.NewRequest(http.MethodPost, "/api/dashboard/faqs", bytes.NewReader(body))
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for FAQ, got %d: %s", rec.Code, rec.Body.String())
	}

	// Public Testimonials & FAQs
	req = httptest.NewRequest(http.MethodGet, "/api/public/testimonials", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for public testimonials, got %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/public/faqs", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for public faqs, got %d", rec.Code)
	}
}

func TestContentHandler_UploadBannerImage(t *testing.T) {
	bRepo := newMockBannerRepo()
	tRepo := newMockTestiRepo()
	fRepo := newMockFAQRepo()

	svc := service.NewContentService(bRepo, tRepo, fRepo)
	h := handler.NewContentHandler(svc)

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := middleware.WithTenantID(req.Context(), 10)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.RegisterDashboardRoutes(r)

	// Clean up any test directory created
	defer os.RemoveAll("./uploads/10")

	// Create valid test image
	img := image.NewRGBA(image.Rect(0, 0, 400, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 400; x++ {
			img.Set(x, y, color.RGBA{R: 24, G: 160, B: 80, A: 255})
		}
	}

	createMultipart := func(fieldName, fileName string, img image.Image) (*bytes.Buffer, string, error) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile(fieldName, fileName)
		if err != nil {
			return nil, "", err
		}
		if err := png.Encode(part, img); err != nil {
			return nil, "", err
		}
		if err := writer.Close(); err != nil {
			return nil, "", err
		}
		return body, writer.FormDataContentType(), nil
	}

	t.Run("Valid image upload succeeds and converts to WebP with tenant isolation", func(t *testing.T) {
		body, contentType, err := createMultipart("image", "banner.png", img)
		if err != nil {
			t.Fatalf("Failed to create multipart: %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/banners/upload", body)
		req.Header.Set("Content-Type", contentType)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		imageURL, ok := resp["image_url"]
		if !ok || imageURL == "" {
			t.Fatalf("Response missing 'image_url': %v", resp)
		}

		if !strings.HasPrefix(imageURL, "/uploads/10/banners/") || !strings.HasSuffix(imageURL, ".webp") {
			t.Errorf("Expected path starting with /uploads/10/banners/ and ending with .webp, got: %s", imageURL)
		}

		// Verify physical file was created and is indeed valid
		localPath := "." + imageURL
		if stat, err := os.Stat(localPath); err != nil || stat.Size() == 0 {
			t.Errorf("Expected WebP file to exist at %s, err=%v", localPath, err)
		}
	})

	t.Run("Invalid file format is rejected with 400 Bad Request", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("image", "test.txt")
		part.Write([]byte("not an image file"))
		writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/banners/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 Bad Request for non-image file, got %d", rec.Code)
		}
	})
}
