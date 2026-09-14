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
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockTenantRepo struct {
	tenants map[uint64]*repository.Tenant
	nextID  uint64
}

func newMockTenantRepo() *mockTenantRepo {
	return &mockTenantRepo{
		tenants: make(map[uint64]*repository.Tenant),
		nextID:  1,
	}
}

func (m *mockTenantRepo) Create(ctx context.Context, tenant *repository.Tenant) error {
	if tenant.ID == 0 {
		tenant.ID = m.nextID
		m.nextID++
	}
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepo) GetByID(ctx context.Context, id uint64) (*repository.Tenant, error) {
	t, ok := m.tenants[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return t, nil
}

func (m *mockTenantRepo) GetBySlug(ctx context.Context, slug string) (*repository.Tenant, error) {
	for _, t := range m.tenants {
		if t.Slug == slug {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepo) Update(ctx context.Context, tenant *repository.Tenant) error {
	if _, ok := m.tenants[tenant.ID]; !ok {
		return repository.ErrNotFound
	}
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepo) UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.BrandPrimaryColor = &brandPrimaryColor
	return nil
}

func (m *mockTenantRepo) UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.WhatsAppNumber = &whatsappNumber
	return nil
}

func (m *mockTenantRepo) GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*repository.Tenant, error) {
	for _, t := range m.tenants {
		if t.WhatsAppNumber != nil && *t.WhatsAppNumber == whatsappNumber {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepo) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.CommissionOverrideEnabled = enabled
	t.CommissionOverridePercentage = percentage
	return nil
}

func (m *mockTenantRepo) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.Name = name
	t.BrandLogoURL = logoURL
	t.Tagline = tagline
	t.AboutSummary = aboutSummary
	return nil
}

func (m *mockTenantRepo) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.BrandIconURL = iconURL
	return nil
}

func (m *mockTenantRepo) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.BrandLogoURL = logoURL
	return nil
}

func (m *mockTenantRepo) GetSEOGeo(ctx context.Context, tenantID uint64) (*repository.TenantSEOGeoSettings, error) {
	t, ok := m.tenants[tenantID]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return &repository.TenantSEOGeoSettings{
		City:            t.City,
		Province:        t.Province,
		MetaTitle:       t.MetaTitle,
		MetaDescription: t.MetaDescription,
		MetaKeywords:    t.MetaKeywords,
		OGImageURL:      t.OGImageURL,
	}, nil
}

func (m *mockTenantRepo) UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *repository.TenantSEOGeoSettings) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.City = settings.City
	t.Province = settings.Province
	t.MetaTitle = settings.MetaTitle
	t.MetaDescription = settings.MetaDescription
	t.MetaKeywords = settings.MetaKeywords
	return nil
}

func (m *mockTenantRepo) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.OGImageURL = ogImageURL
	return nil
}

func (m *mockTenantRepo) UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.PPIUNumber = ppiuNumber
	t.Address = address
	t.Phone = phone
	t.Email = email
	t.WhatsAppNumber = whatsapp
	t.SocialInstagram = instagram
	t.SocialFacebook = facebook
	t.SocialYoutube = youtube
	return nil
}

func (m *mockTenantRepo) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.TrustRating = rating
	t.TrustAlumniCount = alumniCount
	t.TrustGuarantee = guarantee
	return nil
}

func (m *mockTenantRepo) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.AgentRegistrationFee = settings.AgentRegistrationFee
	t.AgentRegistrationBenefits = settings.AgentRegistrationBenefits
	t.AgentBankName = settings.AgentBankName
	t.AgentBankAccountNumber = settings.AgentBankAccountNumber
	t.AgentBankAccountHolder = settings.AgentBankAccountHolder
	t.AgentTermsConditions = settings.AgentTermsConditions
	t.AgentPosterURL = settings.AgentPosterURL
	t.MinimumPayoutAmount = settings.MinimumPayoutAmount
	return nil
}

func (m *mockTenantRepo) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.AgentPosterURL = posterURL
	return nil
}

func (m *mockTenantRepo) GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error) {
	t, ok := m.tenants[tenantID]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return &repository.TenantTargetSettings{
		TargetPeriodStart: t.TargetPeriodStart,
		TargetPeriodEnd:   t.TargetPeriodEnd,
		TargetJamaah:      t.TargetJamaah,
	}, nil
}

func (m *mockTenantRepo) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.TargetPeriodStart = settings.TargetPeriodStart
	t.TargetPeriodEnd = settings.TargetPeriodEnd
	t.TargetJamaah = settings.TargetJamaah
	return nil
}

func (m *mockTenantRepo) UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error {
	for _, t := range m.tenants {
		if t.ID == tenantID {
			t.CurrentPlanID = &planID
			t.SubscriptionExpiresAt = &expiresAt
			t.Status = status
			return nil
		}
	}
	return repository.ErrNotFound
}

func (m *mockTenantRepo) Delete(ctx context.Context, id uint64) error {
	if _, ok := m.tenants[id]; !ok {
		return repository.ErrNotFound
	}
	delete(m.tenants, id)
	return nil
}

func TestTenantHandler_UpdateBranding(t *testing.T) {
	mockRepo := newMockTenantRepo()
	tenantA := &repository.Tenant{
		Name:   "Travel A",
		Slug:   "travela",
		Status: "active",
	}
	_ = mockRepo.Create(context.Background(), tenantA)

	tenantB := &repository.Tenant{
		Name:   "Travel B",
		Slug:   "travelb",
		Status: "active",
	}
	_ = mockRepo.Create(context.Background(), tenantB)

	tenantService := service.NewTenantService(mockRepo)
	tenantHandler := handler.NewTenantHandler(tenantService)

	r := chi.NewRouter()
	r.Put("/api/dashboard/tenant/branding", tenantHandler.UpdateBranding)

	t.Run("Valid hex color returns 200 and updates color", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"brand_primary_color": "#2563EB",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/branding", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if resp["brand_primary_color"] != "#2563EB" {
			t.Errorf("Expected brand_primary_color #2563EB, got %v", resp["brand_primary_color"])
		}

		// Verify repository updated for tenant A
		updatedA, _ := mockRepo.GetByID(context.Background(), tenantA.ID)
		if updatedA.BrandPrimaryColor == nil || *updatedA.BrandPrimaryColor != "#2563EB" {
			t.Errorf("Expected tenant A color #2563EB, got %v", updatedA.BrandPrimaryColor)
		}

		// Verify tenant B is completely untouched
		updatedB, _ := mockRepo.GetByID(context.Background(), tenantB.ID)
		if updatedB.BrandPrimaryColor != nil {
			t.Errorf("Expected tenant B color nil, got %v", *updatedB.BrandPrimaryColor)
		}
	})

	t.Run("Invalid hex formats return 400 Bad Request", func(t *testing.T) {
		invalidColors := []string{
			"#fff",       // 3-digit hex
			"2563EB",     // missing #
			"#GGGGGG",    // invalid hex characters
			"blue",       // named color
			"#1234567",   // 7 digits
			"",           // empty
			"#12 456",    // space
			"#fff",     // 3-digit hex
			"2563EB",   // missing #
			"#GGGGGG",  // invalid hex characters
			"blue",     // named color
			"#1234567", // 7 digits
			"",         // empty
			"#12 456",  // space
		}

		for _, invalid := range invalidColors {
			body, _ := json.Marshal(map[string]string{
				"brand_primary_color": invalid,
			})
			req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/branding", bytes.NewReader(body))
			req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("For invalid color %q, expected status 400, got %d: %s", invalid, w.Code, w.Body.String())
			}
		}
	})

	t.Run("Unauthorized request (missing tenant in context) returns 401", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"brand_primary_color": "#2563EB",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/branding", bytes.NewReader(body))
		// No tenant ID attached to context

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("Expected status 401, got %d", w.Code)
		}
	})
}

func TestTenantHandler_GetPublicInfo(t *testing.T) {
	mockRepo := newMockTenantRepo()
	colorA := "#7C3AED"
	logoA := "https://example.com/logo.png"
	tenantA := &repository.Tenant{
		Name:              "Nur Iman Travel",
		Slug:              "nuriman",
		Status:            "active",
		CommissionScheme:  "flat",
		BrandPrimaryColor: &colorA,
		BrandLogoURL:      &logoA,
	}
	_ = mockRepo.Create(context.Background(), tenantA)

	tenantB := &repository.Tenant{
		Name:   "Empty Brand Travel",
		Slug:   "empty",
		Status: "active",
	}
	_ = mockRepo.Create(context.Background(), tenantB)

	tenantService := service.NewTenantService(mockRepo)
	tenantHandler := handler.NewTenantHandler(tenantService)

	r := chi.NewRouter()
	r.Get("/api/public/tenant-info", tenantHandler.GetPublicInfo)

	t.Run("Returns only public fields (name, brand_primary_color, brand_logo_url)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/public/tenant-info", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var rawMap map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &rawMap); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if rawMap["name"] != "Nur Iman Travel" {
			t.Errorf("Expected name 'Nur Iman Travel', got %v", rawMap["name"])
		}
		if rawMap["brand_primary_color"] != "#7C3AED" {
			t.Errorf("Expected brand_primary_color '#7C3AED', got %v", rawMap["brand_primary_color"])
		}
		if rawMap["brand_logo_url"] != "https://example.com/logo.png" {
			t.Errorf("Expected brand_logo_url 'https://example.com/logo.png', got %v", rawMap["brand_logo_url"])
		}

		// Assert that sensitive / non-public fields are NEVER returned
		for _, forbiddenKey := range []string{"id", "slug", "status", "commission_scheme", "current_plan_id", "subscription_expires_at", "created_at", "updated_at"} {
			if _, exists := rawMap[forbiddenKey]; exists {
				t.Errorf("Public endpoint leaked forbidden field: %s", forbiddenKey)
			}
		}
	})

	t.Run("Returns null for brand_primary_color when empty/nil in database", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/public/tenant-info", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantB.ID))

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var rawMap map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &rawMap); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if rawMap["brand_primary_color"] != nil {
			t.Errorf("Expected brand_primary_color null, got %v", rawMap["brand_primary_color"])
		}
	})
}

func TestTenantHandler_GetBranding(t *testing.T) {
	mockRepo := newMockTenantRepo()
	colorA := "#2563EB"
	tenantA := &repository.Tenant{
		Name:              "Al-Barakah Travel",
		Slug:              "albarakah",
		Status:            "active",
		BrandPrimaryColor: &colorA,
	}
	_ = mockRepo.Create(context.Background(), tenantA)

	tenantService := service.NewTenantService(mockRepo)
	tenantHandler := handler.NewTenantHandler(tenantService)

	r := chi.NewRouter()
	r.Get("/api/dashboard/tenant/branding", tenantHandler.GetBranding)

	t.Run("Returns 200 with branding when authorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/tenant/branding", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if resp["brand_primary_color"] != "#2563EB" {
			t.Errorf("Expected brand_primary_color #2563EB, got %v", resp["brand_primary_color"])
		}
	})

	t.Run("Returns 401 Unauthorized when missing tenant in context", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/tenant/branding", nil)
		// No tenant ID attached to context

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("Expected status 401, got %d", w.Code)
		}
	})
}

func TestTenantHandler_UpdateWhatsApp(t *testing.T) {
	mockRepo := newMockTenantRepo()
	tenantA := &repository.Tenant{
		Name:   "Travel A",
		Slug:   "travela",
		Status: "active",
	}
	_ = mockRepo.Create(context.Background(), tenantA)

	tenantB := &repository.Tenant{
		Name:   "Travel B",
		Slug:   "travelb",
		Status: "active",
	}
	_ = mockRepo.Create(context.Background(), tenantB)

	tenantService := service.NewTenantService(mockRepo)
	tenantHandler := handler.NewTenantHandler(tenantService)

	r := chi.NewRouter()
	r.Put("/api/dashboard/tenant/whatsapp", tenantHandler.UpdateWhatsApp)
	r.Get("/api/dashboard/tenant/whatsapp", tenantHandler.GetWhatsApp)

	t.Run("PUT with 081234567890 stores as 6281234567890 (normalization test)", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"whatsapp_number": "081234567890",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/whatsapp", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		if resp["whatsapp_number"] != "6281234567890" {
			t.Errorf("Expected whatsapp_number 6281234567890, got %v", resp["whatsapp_number"])
		}

		stored, _ := mockRepo.GetByID(context.Background(), tenantA.ID)
		if stored.WhatsAppNumber == nil || *stored.WhatsAppNumber != "6281234567890" {
			t.Errorf("Expected repo to store 6281234567890, got %v", stored.WhatsAppNumber)
		}
	})

	t.Run("PUT from Tenant A does not affect Tenant B whatsapp_number (cross-tenant test)", func(t *testing.T) {
		// Set Tenant B initially
		initialB := "6289999999999"
		_ = mockRepo.UpdateWhatsAppNumber(context.Background(), tenantB.ID, initialB)

		// Update Tenant A
		body, _ := json.Marshal(map[string]string{
			"whatsapp_number": "081233334444",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/whatsapp", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		storedA, _ := mockRepo.GetByID(context.Background(), tenantA.ID)
		storedB, _ := mockRepo.GetByID(context.Background(), tenantB.ID)

		if storedA.WhatsAppNumber == nil || *storedA.WhatsAppNumber != "6281233334444" {
			t.Errorf("Expected Tenant A to be 6281233334444, got %v", *storedA.WhatsAppNumber)
		}
		if storedB.WhatsAppNumber == nil || *storedB.WhatsAppNumber != initialB {
			t.Errorf("Expected Tenant B to remain %s, got %v", initialB, *storedB.WhatsAppNumber)
		}
	})

	t.Run("PUT with already used whatsapp_number by Tenant B returns 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"whatsapp_number": "089999999999",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/whatsapp", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 for duplicate whatsapp, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("PUT with invalid phone (<10 digits) returns 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"whatsapp_number": "08123",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/whatsapp", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("GET returns currently stored WhatsApp number", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/tenant/whatsapp", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}
		if resp["whatsapp_number"] != "6281233334444" {
			t.Errorf("Expected 6281233334444, got %v", resp["whatsapp_number"])
		}
	})
}

func createMultipartPNG(fieldName, fileName string, img image.Image) (*bytes.Buffer, string, error) {
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

func TestBrandIconAndLogoUpload(t *testing.T) {
	repo := newMockTenantRepo()
	svc := service.NewTenantService(repo)
	h := handler.NewTenantHandler(svc)

	r := chi.NewRouter()
	h.RegisterDashboardRoutes(r)

	tenantA := &repository.Tenant{ID: 1, Name: "Travel A", Slug: "travel-a"}
	tenantB := &repository.Tenant{ID: 2, Name: "Travel B", Slug: "travel-b"}
	_ = repo.Create(context.Background(), tenantA)
	_ = repo.Create(context.Background(), tenantB)

	// Create test PNG image
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	for y := 0; y < 100; y++ {
		for x := 0; x < 100; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}

	t.Run("Upload icon successfully and verify cross-tenant isolation", func(t *testing.T) {
		body, contentType, err := createMultipartPNG("icon", "icon.png", img)
		if err != nil {
			t.Fatalf("Failed to create multipart body: %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/tenant/branding/icon", body)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", contentType)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}
		if !strings.HasPrefix(resp["brand_icon_url"], "/uploads/1/branding/") {
			t.Errorf("Unexpected brand_icon_url: %v", resp["brand_icon_url"])
		}

		// Verify tenant A updated
		storedA, _ := repo.GetByID(context.Background(), tenantA.ID)
		if storedA.BrandIconURL == nil || *storedA.BrandIconURL != resp["brand_icon_url"] {
			t.Errorf("Tenant A icon not updated properly")
		}

		// Verify tenant B isolation
		storedB, _ := repo.GetByID(context.Background(), tenantB.ID)
		if storedB.BrandIconURL != nil {
			t.Errorf("Tenant B icon should remain nil, got %v", *storedB.BrandIconURL)
		}
	})

	t.Run("Upload invalid image format returns 400", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("icon", "test.txt")
		_, _ = part.Write([]byte("not an image"))
		_ = writer.Close()

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/tenant/branding/icon", body)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", writer.FormDataContentType())

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 for invalid format, got %d", w.Code)
		}
	})

	t.Run("Delete icon removes brand_icon_url", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/dashboard/tenant/branding/icon", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", w.Code)
		}

		storedA, _ := repo.GetByID(context.Background(), tenantA.ID)
		if storedA.BrandIconURL != nil {
			t.Errorf("Expected BrandIconURL to be nil after deletion")
		}
	})

	t.Run("Upload logo successfully", func(t *testing.T) {
		body, contentType, err := createMultipartPNG("logo", "logo.png", img)
		if err != nil {
			t.Fatalf("Failed to create multipart body: %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/tenant/branding/logo", body)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", contentType)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}
		if !strings.HasPrefix(resp["brand_logo_url"], "/uploads/1/branding/") {
			t.Errorf("Unexpected brand_logo_url: %v", resp["brand_logo_url"])
		}

		storedA, _ := repo.GetByID(context.Background(), tenantA.ID)
		if storedA.BrandLogoURL == nil || *storedA.BrandLogoURL != resp["brand_logo_url"] {
			t.Errorf("Tenant A logo not updated properly")
		}
	})

	t.Run("Delete logo removes brand_logo_url", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/dashboard/tenant/branding/logo", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", w.Code)
		}

		storedA, _ := repo.GetByID(context.Background(), tenantA.ID)
		if storedA.BrandLogoURL != nil {
			t.Errorf("Expected BrandLogoURL to be nil after deletion")
		}
	})
}

func TestSEOGeoAndOGImage(t *testing.T) {
	repo := newMockTenantRepo()
	svc := service.NewTenantService(repo)
	h := handler.NewTenantHandler(svc)

	r := chi.NewRouter()
	h.RegisterDashboardRoutes(r)

	tenantA := &repository.Tenant{ID: 1, Name: "Travel A", Slug: "travel-a"}
	tenantB := &repository.Tenant{ID: 2, Name: "Travel B", Slug: "travel-b"}
	_ = repo.Create(context.Background(), tenantA)
	_ = repo.Create(context.Background(), tenantB)

	t.Run("Update and Get SEO & GEO with cross-tenant isolation", func(t *testing.T) {
		payload := map[string]string{
			"city":             "Kota Bandung",
			"province":         "Jawa Barat",
			"meta_title":       "Travel A — Umroh Terbaik Bandung",
			"meta_description": "Pendaftaran umroh resmi Travel A di Bandung.",
			"meta_keywords":    "umroh bandung, travel a",
		}
		body, _ := json.Marshal(payload)

		req := httptest.NewRequest(http.MethodPut, "/api/dashboard/tenant/seo-geo", bytes.NewReader(body))
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		// Verify Tenant A updated
		storedA, _ := repo.GetByID(context.Background(), tenantA.ID)
		if storedA.City == nil || *storedA.City != "Kota Bandung" {
			t.Errorf("Expected City to be 'Kota Bandung', got %v", storedA.City)
		}

		// Verify Tenant B untouched
		storedB, _ := repo.GetByID(context.Background(), tenantB.ID)
		if storedB.City != nil {
			t.Errorf("Tenant B city should be nil, got %v", storedB.City)
		}

		// GET SEO/GEO for Tenant A
		getReq := httptest.NewRequest(http.MethodGet, "/api/dashboard/tenant/seo-geo", nil)
		getReq = getReq.WithContext(middleware.WithTenantID(getReq.Context(), tenantA.ID))

		getW := httptest.NewRecorder()
		r.ServeHTTP(getW, getReq)

		if getW.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", getW.Code, getW.Body.String())
		}
	})

	t.Run("Upload and delete OG image", func(t *testing.T) {
		img := image.NewRGBA(image.Rect(0, 0, 1200, 630))
		for y := 0; y < 630; y++ {
			for x := 0; x < 1200; x++ {
				img.Set(x, y, color.RGBA{R: 20, G: 80, B: 150, A: 255})
			}
		}

		body, contentType, err := createMultipartPNG("og_image", "og.png", img)
		if err != nil {
			t.Fatalf("Failed to create multipart: %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/tenant/branding/og-image", body)
		req = req.WithContext(middleware.WithTenantID(req.Context(), tenantA.ID))
		req.Header.Set("Content-Type", contentType)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]string
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if !strings.HasPrefix(resp["og_image_url"], "/uploads/1/branding/") {
			t.Errorf("Unexpected og_image_url: %v", resp["og_image_url"])
		}

		// Delete OG Image
		delReq := httptest.NewRequest(http.MethodDelete, "/api/dashboard/tenant/branding/og-image", nil)
		delReq = delReq.WithContext(middleware.WithTenantID(delReq.Context(), tenantA.ID))

		delW := httptest.NewRecorder()
		r.ServeHTTP(delW, delReq)

		if delW.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", delW.Code)
		}

		storedA, _ := repo.GetByID(context.Background(), tenantA.ID)
		if storedA.OGImageURL != nil {
			t.Errorf("Expected OGImageURL to be nil after deletion")
		}
	})
}
