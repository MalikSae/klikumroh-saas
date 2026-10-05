package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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

// mockPackageRepo implements repository.PackageRepository for handler testing.
type mockPackageRepo struct {
	packages           map[uint64]*repository.Package
	referencedPackages map[uint64]bool
	nextID             uint64
}

func newMockPackageRepo() *mockPackageRepo {
	return &mockPackageRepo{
		packages:           make(map[uint64]*repository.Package),
		referencedPackages: make(map[uint64]bool),
		nextID:             1,
	}
}

func (m *mockPackageRepo) Create(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	pkg.ID = m.nextID
	m.nextID++
	pkg.TenantID = tenantID
	m.packages[pkg.ID] = pkg
	return nil
}

func (m *mockPackageRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Package, error) {
	pkg, ok := m.packages[id]
	if !ok || pkg.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return pkg, nil
}

func (m *mockPackageRepo) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Package, error) {
	var list []repository.Package
	for _, p := range m.packages {
		if p.TenantID == tenantID {
			if statusFilter == nil || *statusFilter == "" || p.Status == *statusFilter {
				list = append(list, *p)
			}
		}
	}
	return list, nil
}

func (m *mockPackageRepo) Update(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	existing, ok := m.packages[pkg.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	pkg.TenantID = tenantID
	// Like the SQL UPDATE: columns that are not part of the edit keep their stored values.
	stored := *pkg
	stored.CreatedAt = existing.CreatedAt
	stored.SeatsTaken = existing.SeatsTaken
	m.packages[pkg.ID] = &stored
	return nil
}

func (m *mockPackageRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	existing, ok := m.packages[id]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	if m.referencedPackages != nil && m.referencedPackages[id] {
		return repository.ErrForeignKeyViolation
	}
	delete(m.packages, id)
	return nil
}

func (m *mockPackageRepo) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, p := range m.packages {
		if p.TenantID == tenantID {
			count++
		}
	}
	return count, nil
}

type mockPackagePhotoRepo struct {
	photos []repository.PackagePhoto
}

func (m *mockPackagePhotoRepo) Create(ctx context.Context, tenantID uint64, photo *repository.PackagePhoto) error {
	return nil
}

// ListByPackage filters by tenant and package like the MySQL repository.
func (m *mockPackagePhotoRepo) ListByPackage(ctx context.Context, tenantID, packageID uint64) ([]repository.PackagePhoto, error) {
	var out []repository.PackagePhoto
	for _, p := range m.photos {
		if p.TenantID == tenantID && p.PackageID == packageID {
			out = append(out, p)
		}
	}
	return out, nil
}
func (m *mockPackagePhotoRepo) Delete(ctx context.Context, tenantID, id uint64) error { return nil }
func (m *mockPackagePhotoRepo) GetByID(ctx context.Context, tenantID, id uint64) (*repository.PackagePhoto, error) {
	return nil, repository.ErrNotFound
}
func (m *mockPackagePhotoRepo) UpdateSortOrder(ctx context.Context, tenantID, id uint64, sortOrder int) error {
	return nil
}

type mockPackagePhotoService struct{}

func (m *mockPackagePhotoService) Create(ctx context.Context, tenantID uint64, photo *repository.PackagePhoto) error {
	return nil
}
func (m *mockPackagePhotoService) ListByPackage(ctx context.Context, tenantID uint64, packageID uint64) ([]repository.PackagePhoto, error) {
	return nil, nil
}
func (m *mockPackagePhotoService) Delete(ctx context.Context, tenantID, photoID uint64) (*repository.PackagePhoto, error) {
	return nil, nil
}
func (m *mockPackagePhotoService) Move(ctx context.Context, tenantID, photoID uint64, direction string) error {
	return nil
}

func setupPackageRouter() (*chi.Mux, *mockPackageRepo, *mockSessionRepo, *mockDomainRepo) {
	r, pkgRepo, sessionRepo, domainRepo, _ := setupPackageRouterWithPhotos()
	return r, pkgRepo, sessionRepo, domainRepo
}

func setupPackageRouterWithPhotos() (*chi.Mux, *mockPackageRepo, *mockSessionRepo, *mockDomainRepo, *mockPackagePhotoRepo) {
	pkgRepo := newMockPackageRepo()
	photoRepo := &mockPackagePhotoRepo{}
	pkgService := service.NewPackageService(pkgRepo, photoRepo)
	photoService := &mockPackagePhotoService{}
	pkgHandler := handler.NewPackageHandler(pkgService, photoService)

	sessionRepo := &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"token_tenant_a": {
				ID:          1,
				Token:       "token_tenant_a",
				AdminUserID: 1,
				TenantID:    10,
				ExpiresAt:   time.Now().Add(24 * time.Hour),
			},
			"token_tenant_b": {
				ID:          2,
				Token:       "token_tenant_b",
				AdminUserID: 2,
				TenantID:    20,
				ExpiresAt:   time.Now().Add(24 * time.Hour),
			},
		},
	}

	domainRepo := &mockDomainRepo{
		domains: map[string]*repository.Domain{
			"travela.klikumroh.local": {
				ID:       1,
				TenantID: 10,
				Hostname: "travela.klikumroh.local",
				Status:   "active",
			},
			"travelb.klikumroh.local": {
				ID:       2,
				TenantID: 20,
				Hostname: "travelb.klikumroh.local",
				Status:   "active",
			},
		},
	}

	r := chi.NewRouter()

	// Protected Dashboard
	r.Group(func(protected chi.Router) {
		protected.Use(middleware.AuthMiddleware(sessionRepo))
		pkgHandler.RegisterDashboardRoutes(protected)
	})

	// Public Web Whitelabel
	r.Group(func(public chi.Router) {
		public.Use(middleware.TenantResolutionMiddleware(domainRepo))
		pkgHandler.RegisterPublicRoutes(public)
	})

	return r, pkgRepo, sessionRepo, domainRepo, photoRepo
}

// The dashboard list carries each package's cover photo (thumbnail), only from the caller's own tenant.
func TestPackageHandler_DashboardList_CoverPhoto_TenantScoped(t *testing.T) {
	r, pkgRepo, _, _, photoRepo := setupPackageRouterWithPhotos()
	ctx := context.Background()

	pkgA := &repository.Package{Name: "Paket A", Status: "draft"}
	_ = pkgRepo.Create(ctx, 10, pkgA)
	pkgB := &repository.Package{Name: "Paket B", Status: "draft"}
	_ = pkgRepo.Create(ctx, 20, pkgB)

	photoRepo.photos = []repository.PackagePhoto{
		{ID: 1, TenantID: 10, PackageID: pkgA.ID, FilePath: "/uploads/10/packages/a-cover.webp", SortOrder: 0},
		{ID: 2, TenantID: 10, PackageID: pkgA.ID, FilePath: "/uploads/10/packages/a-second.webp", SortOrder: 1},
		// A photo row of tenant 20 pointing at tenant 10's package id must never be attached.
		{ID: 3, TenantID: 20, PackageID: pkgA.ID, FilePath: "/uploads/20/packages/leak.webp", SortOrder: 0},
	}

	list := func(token string) []repository.Package {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/packages", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		var out []repository.Package
		_ = json.Unmarshal(rr.Body.Bytes(), &out)
		return out
	}

	a := list("token_tenant_a")
	if len(a) != 1 || len(a[0].Photos) != 1 || a[0].Photos[0].FilePath != "/uploads/10/packages/a-cover.webp" {
		t.Fatalf("tenant A: expected one package with its own cover photo only, got %+v", a)
	}
	b := list("token_tenant_b")
	if len(b) != 1 || b[0].ID != pkgB.ID || len(b[0].Photos) != 0 {
		t.Fatalf("tenant B: expected its own package without photos, got %+v", b)
	}
}

func TestPackageHandler_DashboardCRUD_And_CrossTenant(t *testing.T) {
	r, pkgRepo, _, _ := setupPackageRouter()
	ctx := context.Background()

	// Seed package for Tenant A (tenant_id = 10)
	commissionA := 1500000.0
	pkgA := &repository.Package{
		Name:             "Paket Umroh Tenant A",
		Status:           "published",
		CommissionAmount: &commissionA, // internal: must never appear on the public endpoints
	}
	_ = pkgRepo.Create(ctx, 10, pkgA)

	// Seed package for Tenant B (tenant_id = 20)
	pkgB := &repository.Package{
		Name:   "Paket Umroh Tenant B",
		Status: "draft",
	}
	_ = pkgRepo.Create(ctx, 20, pkgB)

	// 1. Positive Test: Tenant A can read its own package
	t.Run("Tenant A can read its own package via dashboard", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/packages/%d", pkgA.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rr.Code)
		}
		var res repository.Package
		_ = json.Unmarshal(rr.Body.Bytes(), &res)
		if res.ID != pkgA.ID || res.Name != pkgA.Name {
			t.Errorf("Unexpected package data: %+v", res)
		}
	})

	// 2. Cross-Tenant Isolation: Tenant B cannot GET Tenant A's package
	t.Run("Cross-Tenant: Tenant B cannot GET Tenant A's package", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/packages/%d", pkgA.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_b")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for cross-tenant package access, got %d", rr.Code)
		}
	})

	// 3. Cross-Tenant Isolation: Tenant B cannot UPDATE Tenant A's package
	t.Run("Cross-Tenant: Tenant B cannot UPDATE Tenant A's package", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":   "Hijacked Name",
			"status": "published",
			// A valid payload, so the request reaches the tenant check (a published package needs a price).
			"price": 30000000,
		})
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/packages/%d", pkgA.ID), bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer token_tenant_b")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for cross-tenant update, got %d", rr.Code)
		}
	})

	// 4. Cross-Tenant Isolation: Tenant B cannot DELETE Tenant A's package
	t.Run("Cross-Tenant: Tenant B cannot DELETE Tenant A's package", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/dashboard/packages/%d", pkgA.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_b")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for cross-tenant delete, got %d", rr.Code)
		}
	})

	// 5. Validation: Status whitelist validation
	t.Run("Invalid status rejects with 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":   "Package with Bad Status",
			"status": "invalid_status",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 for invalid status, got %d", rr.Code)
		}
	})

	// 6. Public packages list: Only returns published packages of the resolved tenant
	t.Run("Public catalog only returns published packages for resolved tenant", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/public/packages", nil)
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rr.Code)
		}
		var list []repository.Package
		_ = json.Unmarshal(rr.Body.Bytes(), &list)
		if len(list) != 1 || list[0].ID != pkgA.ID {
			t.Errorf("Expected 1 published package for Tenant A, got %+v", list)
		}

		// Check Tenant B public catalog: draft package should not appear
		reqB := httptest.NewRequest(http.MethodGet, "/api/public/packages", nil)
		reqB.Host = "travelb.klikumroh.local"
		rrB := httptest.NewRecorder()
		r.ServeHTTP(rrB, reqB)

		if rrB.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rrB.Code)
		}
		var listB []repository.Package
		_ = json.Unmarshal(rrB.Body.Bytes(), &listB)
		if len(listB) != 0 {
			t.Errorf("Expected 0 published packages for Tenant B (only draft exists), got %+v", listB)
		}
	})

	// 6a. Public GET /api/public/packages/{id} Published Package
	t.Run("Public GET published package returns 200 and correct data", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/public/packages/%d", pkgA.ID), nil)
		req.Host = "travela.klikumroh.local" // correct host for pkgA
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 when accessing a published package publicly, got %d", rr.Code)
		}
		var res repository.Package
		_ = json.Unmarshal(rr.Body.Bytes(), &res)
		if res.ID != pkgA.ID || res.Name != pkgA.Name {
			t.Errorf("Unexpected package data: %+v", res)
		}
	})

	// 6a-2. The agent commission is internal to the travel: never in the public list or detail.
	t.Run("Public package list and detail never expose commission_amount", func(t *testing.T) {
		for _, path := range []string{"/api/public/packages", fmt.Sprintf("/api/public/packages/%d", pkgA.ID)} {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Host = "travela.klikumroh.local"
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("%s: expected 200, got %d", path, rr.Code)
			}
			if strings.Contains(rr.Body.String(), "commission_amount") {
				t.Errorf("%s leaks commission_amount: %s", path, rr.Body.String())
			}
		}
	})

	// 6b. Public GET /api/public/packages/{id} Cross-Tenant
	t.Run("Cross-Tenant: Public GET package A via Host B returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/public/packages/%d", pkgA.ID), nil)
		req.Host = "travelb.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 when accessing package A from tenant B's domain, got %d", rr.Code)
		}
	})

	// 6c. Public GET /api/public/packages/{id} Draft Package
	t.Run("Public GET package draft returns 404", func(t *testing.T) {
		// Explicitly set pkgB status to 'draft' to prove the filter works
		pkgB.Status = "draft"
		_ = pkgRepo.Update(ctx, 20, pkgB)

		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/public/packages/%d", pkgB.ID), nil)
		req.Host = "travelb.klikumroh.local" // correct host for pkgB
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 when accessing a draft package publicly, got %d", rr.Code)
		}
	})

	// 7. FK Conflict Test: Deleting a package referenced by prospects returns 409 Conflict
	t.Run("Deleting package with referenced prospects returns 409 Conflict", func(t *testing.T) {
		pkgReferenced := &repository.Package{
			Name:   "Paket Umroh Aktif Berprospek",
			Status: "published",
		}
		_ = pkgRepo.Create(ctx, 10, pkgReferenced)
		pkgRepo.referencedPackages[pkgReferenced.ID] = true

		req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/dashboard/packages/%d", pkgReferenced.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusConflict {
			t.Fatalf("Expected 409 Conflict, got %d (%s)", rr.Code, rr.Body.String())
		}
		var errResp map[string]string
		_ = json.Unmarshal(rr.Body.Bytes(), &errResp)
		expectedErr := service.ErrPackageInUse.Error()
		if errResp["error"] != expectedErr {
			t.Errorf("Expected error '%s', got '%s'", expectedErr, errResp["error"])
		}
	})

	// 8. Cross-Tenant Isolation: Tenant A cannot POST photo to Tenant B's package
	t.Run("Cross-Tenant: Tenant A cannot POST photo to Tenant B's package", func(t *testing.T) {
		// Even with empty body, the handler should check tenant ownership first and return 404
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/dashboard/packages/%d/photos", pkgB.ID), bytes.NewBuffer(nil))
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		req.Header.Set("Content-Type", "multipart/form-data")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 when Tenant A tries to upload photo to Tenant B's package, got %d", rr.Code)
		}
	})

	// 9. Commission Amount & Unchanged Data Update: Can update commission_amount and does not fail when unchanged
	t.Run("Update package commission_amount and unchanged fields", func(t *testing.T) {
		commRate := 3000000.0
		updateBody, _ := json.Marshal(map[string]interface{}{
			"name":              pkgA.Name,
			"status":            pkgA.Status,
			"price":             30000000,
			"commission_amount": commRate,
		})
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/packages/%d", pkgA.ID), bytes.NewBuffer(updateBody))
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d (%s)", rr.Code, rr.Body.String())
		}
		var updatedPkg repository.Package
		_ = json.Unmarshal(rr.Body.Bytes(), &updatedPkg)
		if updatedPkg.CommissionAmount == nil || *updatedPkg.CommissionAmount != commRate {
			t.Errorf("Expected commission_amount %v, got %v", commRate, updatedPkg.CommissionAmount)
		}
	})
}

// PUT answers with the stored package (seats_taken, created_at), not an echo of the payload.
func TestPackageHandler_UpdateReturnsStoredPackage(t *testing.T) {
	r, pkgRepo, _, _ := setupPackageRouter()
	created := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	pkg := &repository.Package{Name: "Paket Lama", Status: "draft", CreatedAt: created, SeatsTaken: 4}
	_ = pkgRepo.Create(context.Background(), 10, pkg)

	body, _ := json.Marshal(map[string]interface{}{"name": "Paket Baru", "status": "draft"})
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/packages/%d", pkg.ID), bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer token_tenant_a")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var res repository.Package
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res.Name != "Paket Baru" || res.SeatsTaken != 4 || !res.CreatedAt.Equal(created) {
		t.Fatalf("expected stored package (name updated, seats_taken 4, created_at kept), got name=%q seats=%d created=%v",
			res.Name, res.SeatsTaken, res.CreatedAt)
	}
}
