package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// mockSessionRepo implements repository.SessionRepository for testing middleware.
type mockSessionRepo struct {
	sessions map[string]*repository.Session
}

func (m *mockSessionRepo) Create(ctx context.Context, tenantID uint64, session *repository.Session) error {
	m.sessions[session.Token] = session
	return nil
}

func (m *mockSessionRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Session, error) {
	return nil, repository.ErrNotFound
}

func (m *mockSessionRepo) ListByAdminUser(ctx context.Context, tenantID uint64, adminUserID uint64) ([]repository.Session, error) {
	return nil, nil
}

func (m *mockSessionRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}

func (m *mockSessionRepo) DeleteByToken(ctx context.Context, token string) error {
	delete(m.sessions, token)
	return nil
}

func (m *mockSessionRepo) FindByToken(ctx context.Context, token string) (*repository.Session, error) {
	s, ok := m.sessions[token]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return s, nil
}

// mockDomainRepo implements repository.DomainRepository for testing middleware.
type mockDomainRepo struct {
	domains map[string]*repository.Domain
}

func (m *mockDomainRepo) Create(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	m.domains[domain.Hostname] = domain
	return nil
}

func (m *mockDomainRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Domain, error) {
	return nil, repository.ErrNotFound
}

func (m *mockDomainRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	return nil, nil
}

func (m *mockDomainRepo) Update(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	return nil
}

func (m *mockDomainRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}

func (m *mockDomainRepo) FindByHostname(ctx context.Context, hostname string) (*repository.Domain, error) {
	d, ok := m.domains[hostname]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return d, nil
}

func (m *mockDomainRepo) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error) {
	for _, d := range m.domains {
		if d.TenantID == tenantID && d.Type == "custom" && d.Status == "active" {
			return d, nil
		}
	}
	return nil, repository.ErrNotFound
}

func TestAuthMiddleware(t *testing.T) {
	sessionRepo := &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"valid_token_tenant_a": {
				ID:          1,
				Token:       "valid_token_tenant_a",
				AdminUserID: 10,
				TenantID:    100,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"expired_token": {
				ID:          2,
				Token:       "expired_token",
				AdminUserID: 20,
				TenantID:    200,
				ExpiresAt:   time.Now().Add(-1 * time.Hour),
			},
		},
	}

	authMw := middleware.AuthMiddleware(sessionRepo)

	// Dummy protected handler
	var capturedTenantID uint64
	var capturedAdminUserID uint64
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tID, _ := middleware.GetTenantID(r.Context())
		uID, _ := middleware.GetAdminUserID(r.Context())
		capturedTenantID = tID
		capturedAdminUserID = uID
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	protected := authMw(dummyHandler)

	t.Run("Missing Authorization Header returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", rr.Code)
		}
	})

	t.Run("Invalid Authorization format returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
		req.Header.Set("Authorization", "Basic 12345")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", rr.Code)
		}
	})

	t.Run("Unregistered token returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
		req.Header.Set("Authorization", "Bearer non_existent_token")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", rr.Code)
		}
	})

	t.Run("Expired token returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
		req.Header.Set("Authorization", "Bearer expired_token")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 for expired token, got %d", rr.Code)
		}
	})

	t.Run("Valid token sets tenant_id and admin_user_id in context", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
		req.Header.Set("Authorization", "Bearer valid_token_tenant_a")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rr.Code)
		}
		if capturedTenantID != 100 {
			t.Errorf("Expected tenantID 100 in context, got %d", capturedTenantID)
		}
		if capturedAdminUserID != 10 {
			t.Errorf("Expected adminUserID 10 in context, got %d", capturedAdminUserID)
		}
	})

	t.Run("Token session Tenant A cannot access Tenant B data via AuthMiddleware context", func(t *testing.T) {
		// Mock resource map where resources belong to specific tenant IDs
		// Resource 999 belongs to Tenant 200 (Tenant B)
		tenantResources := map[uint64]uint64{
			999: 200, // resourceID -> tenantID
		}

		// Handler that queries data using tenant_id strictly extracted from context
		resourceHandler := authMw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tID, ok := middleware.GetTenantID(r.Context())
			if !ok {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}

			targetResourceID := uint64(999)
			ownerTenantID, exists := tenantResources[targetResourceID]
			// Strict tenant isolation check as performed by repository layer
			if !exists || ownerTenantID != tID {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":"not found"}`))
				return
			}

			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"data":"secret data"}`))
		}))

		// Tenant A (token tenant_id=100) attempts to access Tenant B's resource (999)
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/resource/999", nil)
		req.Header.Set("Authorization", "Bearer valid_token_tenant_a")
		rr := httptest.NewRecorder()
		resourceHandler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 (data hidden across tenants), got status %d (%s)", rr.Code, rr.Body.String())
		}
	})
}

func TestTenantResolutionMiddleware(t *testing.T) {
	domainRepo := &mockDomainRepo{
		domains: map[string]*repository.Domain{
			"travela.klikumroh.id": {
				ID:       1,
				TenantID: 50,
				Hostname: "travela.klikumroh.id",
				Type:     "subdomain",
				Status:   "active",
			},
			"pending.klikumroh.id": {
				ID:       2,
				TenantID: 60,
				Hostname: "pending.klikumroh.id",
				Type:     "subdomain",
				Status:   "pending",
			},
			"failed.klikumroh.id": {
				ID:       3,
				TenantID: 70,
				Hostname: "failed.klikumroh.id",
				Type:     "subdomain",
				Status:   "failed",
			},
		},
	}

	tenantMw := middleware.TenantResolutionMiddleware(domainRepo)

	var capturedTenantID uint64
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tID, _ := middleware.GetTenantID(r.Context())
		capturedTenantID = tID
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	handler := tenantMw(dummyHandler)

	t.Run("Empty hostname returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = ""
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for empty host, got %d", rr.Code)
		}
	})

	t.Run("Unknown hostname returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = "unknown.klikumroh.id"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for unknown host, got %d", rr.Code)
		}
	})

	t.Run("Pending domain returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = "pending.klikumroh.id"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for pending domain, got %d", rr.Code)
		}
	})

	t.Run("Failed domain returns 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = "failed.klikumroh.id"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for failed domain, got %d", rr.Code)
		}
	})

	t.Run("Active domain sets tenant_id in context (and handles host port)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = "travela.klikumroh.id:8080"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rr.Code)
		}
		if capturedTenantID != 50 {
			t.Errorf("Expected tenantID 50 in context, got %d", capturedTenantID)
		}
	})

	t.Run("X-Forwarded-Host takes precedence over r.Host", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = "localhost:8080"                                     // r.Host is generic internal address
		req.Header.Set("X-Forwarded-Host", "travela.klikumroh.id:3000") // X-Forwarded-Host is tenant domain
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 via X-Forwarded-Host, got %d", rr.Code)
		}
		if capturedTenantID != 50 {
			t.Errorf("Expected tenantID 50 resolved from X-Forwarded-Host, got %d", capturedTenantID)
		}
	})

	t.Run("Without X-Forwarded-Host falls back to r.Host", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Host = "travela.klikumroh.id" // Valid tenant in r.Host
		// No X-Forwarded-Host header
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 via r.Host fallback, got %d", rr.Code)
		}
		if capturedTenantID != 50 {
			t.Errorf("Expected tenantID 50 from r.Host, got %d", capturedTenantID)
		}
	})
}

type mockStaffRepoMw struct {
	sessions map[string]*repository.StaffSession
	users    map[uint64]*repository.StaffUser
}

func (m *mockStaffRepoMw) Create(ctx context.Context, user *repository.StaffUser) error { return nil }
func (m *mockStaffRepoMw) FindByEmail(ctx context.Context, email string) (*repository.StaffUser, error) {
	return nil, repository.ErrNotFound
}
func (m *mockStaffRepoMw) FindByID(ctx context.Context, id uint64) (*repository.StaffUser, error) {
	if u, ok := m.users[id]; ok {
		return u, nil
	}
	return nil, repository.ErrNotFound
}
func (m *mockStaffRepoMw) CreateSession(ctx context.Context, session *repository.StaffSession) error {
	m.sessions[session.Token] = session
	return nil
}
func (m *mockStaffRepoMw) FindSessionByToken(ctx context.Context, token string) (*repository.StaffSession, *repository.StaffUser, error) {
	s, ok := m.sessions[token]
	if !ok {
		return nil, nil, repository.ErrNotFound
	}
	u, ok := m.users[s.StaffUserID]
	if !ok {
		return nil, nil, repository.ErrNotFound
	}
	return s, u, nil
}
func (m *mockStaffRepoMw) DeleteSession(ctx context.Context, token string) error { return nil }
func (m *mockStaffRepoMw) ListAllTenants(ctx context.Context, statusFilter ...string) ([]repository.StaffTenantItem, error) {
	return nil, nil
}
func (m *mockStaffRepoMw) ListStaffUsers(ctx context.Context) ([]repository.StaffUser, error) {
	return nil, nil
}
func (m *mockStaffRepoMw) Update(ctx context.Context, user *repository.StaffUser) error {
	return nil
}

func TestStaffAuthMiddleware(t *testing.T) {
	staffRepo := &mockStaffRepoMw{
		sessions: map[string]*repository.StaffSession{
			"valid_staff_token": {
				ID:          1,
				StaffUserID: 1,
				Token:       "valid_staff_token",
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"expired_staff_token": {
				ID:          2,
				StaffUserID: 1,
				Token:       "expired_staff_token",
				ExpiresAt:   time.Now().Add(-1 * time.Hour),
			},
		},
		users: map[uint64]*repository.StaffUser{
			1: {
				ID:     1,
				Email:  "admin@klikumroh.id",
				Name:   "Admin Staff",
				Status: "active",
			},
		},
	}

	sessionRepo := &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"valid_tenant_admin_token": {
				ID:          10,
				TenantID:    55,
				AdminUserID: 100,
				Token:       "valid_tenant_admin_token",
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"expired_tenant_token": {
				ID:          11,
				TenantID:    55,
				AdminUserID: 100,
				Token:       "expired_tenant_token",
				ExpiresAt:   time.Now().Add(-1 * time.Hour),
			},
		},
	}

	staffMw := middleware.StaffAuthMiddleware(staffRepo, sessionRepo)

	var capturedStaffUserID uint64
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sID, _ := middleware.GetStaffUserID(r.Context())
		capturedStaffUserID = sID
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	protected := staffMw(dummyHandler)

	t.Run("Missing Authorization Header returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/staff/me", nil)
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401, got %d", rr.Code)
		}
	})

	t.Run("Invalid/Unregistered token returns 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/staff/me", nil)
		req.Header.Set("Authorization", "Bearer totally_bogus_token")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 for unknown token, got %d", rr.Code)
		}
	})

	t.Run("Expired tenant admin token returns 401 (not valid session)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/staff/me", nil)
		req.Header.Set("Authorization", "Bearer expired_tenant_token")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("Expected 401 for expired tenant token, got %d", rr.Code)
		}
	})

	t.Run("Valid tenant admin token returns 403 Forbidden (wrong system)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/staff/me", nil)
		req.Header.Set("Authorization", "Bearer valid_tenant_admin_token")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for valid tenant admin token, got %d", rr.Code)
		}
	})

	t.Run("Valid staff token returns 200 OK and injects staff_user_id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/staff/me", nil)
		req.Header.Set("Authorization", "Bearer valid_staff_token")
		rr := httptest.NewRecorder()
		protected.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for valid staff token, got %d", rr.Code)
		}
		if capturedStaffUserID != 1 {
			t.Errorf("Expected staffUserID 1, got %d", capturedStaffUserID)
		}
	})
}

// mockTenantRepoForMiddleware provides mock TenantRepository for middleware testing.
type mockTenantRepoForMiddleware struct {
	tenants map[uint64]*repository.Tenant
}

func (m *mockTenantRepoForMiddleware) Create(ctx context.Context, tenant *repository.Tenant) error {
	m.tenants[tenant.ID] = tenant
	return nil
}
func (m *mockTenantRepoForMiddleware) GetByID(ctx context.Context, id uint64) (*repository.Tenant, error) {
	if t, ok := m.tenants[id]; ok {
		return t, nil
	}
	return nil, repository.ErrNotFound
}
func (m *mockTenantRepoForMiddleware) GetBySlug(ctx context.Context, slug string) (*repository.Tenant, error) {
	return nil, repository.ErrNotFound
}
func (m *mockTenantRepoForMiddleware) Update(ctx context.Context, tenant *repository.Tenant) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) GetSEOGeo(ctx context.Context, tenantID uint64) (*repository.TenantSEOGeoSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoForMiddleware) UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *repository.TenantSEOGeoSettings) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*repository.Tenant, error) {
	return nil, repository.ErrNotFound
}
func (m *mockTenantRepoForMiddleware) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoForMiddleware) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error {
	return nil
}
func (m *mockTenantRepoForMiddleware) Delete(ctx context.Context, id uint64) error {
	return nil
}

func TestSubscriptionEnforcementMiddleware(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	future := time.Now().Add(10 * 24 * time.Hour)

	tenantRepo := &mockTenantRepoForMiddleware{
		tenants: map[uint64]*repository.Tenant{
			1: {ID: 1, Name: "Expired", SubscriptionExpiresAt: &past},
			2: {ID: 2, Name: "Legacy Null", SubscriptionExpiresAt: nil},
			3: {ID: 3, Name: "Active Future", SubscriptionExpiresAt: &future},
		},
	}

	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	mw := middleware.SubscriptionEnforcementMiddleware(tenantRepo)(dummyHandler)

	t.Run("Expired tenant GET request allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/packages", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), 1))
		rr := httptest.NewRecorder()
		mw.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected 200, got %d", rr.Code)
		}
	})

	t.Run("Expired tenant POST request blocked with 402", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), 1))
		rr := httptest.NewRecorder()
		mw.ServeHTTP(rr, req)

		if rr.Code != http.StatusPaymentRequired {
			t.Errorf("Expected 402, got %d", rr.Code)
		}
	})

	t.Run("Expired tenant POST to /subscription path allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/subscription/renewal-request", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), 1))
		rr := httptest.NewRecorder()
		mw.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected 200, got %d", rr.Code)
		}
	})

	t.Run("Legacy tenant with NULL expiry POST request allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), 2))
		rr := httptest.NewRecorder()
		mw.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected 200, got %d", rr.Code)
		}
	})

	t.Run("Active tenant with future expiry POST request allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", nil)
		req = req.WithContext(middleware.WithTenantID(req.Context(), 3))
		rr := httptest.NewRecorder()
		mw.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected 200, got %d", rr.Code)
		}
	})
}
