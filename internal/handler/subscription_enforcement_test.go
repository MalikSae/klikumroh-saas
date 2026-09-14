package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
)

// mockTenantRepoEnforce provides in-memory mock for TenantRepository
type mockTenantRepoEnforce struct {
	tenants map[uint64]*repository.Tenant
}

func (m *mockTenantRepoEnforce) Create(ctx context.Context, tenant *repository.Tenant) error {
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepoEnforce) GetByID(ctx context.Context, id uint64) (*repository.Tenant, error) {
	if t, ok := m.tenants[id]; ok {
		return t, nil
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepoEnforce) GetBySlug(ctx context.Context, slug string) (*repository.Tenant, error) {
	for _, t := range m.tenants {
		if t.Slug == slug {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepoEnforce) Update(ctx context.Context, tenant *repository.Tenant) error {
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepoEnforce) UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error {
	if t, ok := m.tenants[tenantID]; ok {
		t.CurrentPlanID = &planID
		t.SubscriptionExpiresAt = &expiresAt
		t.Status = status
		return nil
	}
	return repository.ErrNotFound
}

func (m *mockTenantRepoEnforce) UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) GetSEOGeo(ctx context.Context, tenantID uint64) (*repository.TenantSEOGeoSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoEnforce) UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *repository.TenantSEOGeoSettings) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error {
	return nil
}
func (m *mockTenantRepoEnforce) GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*repository.Tenant, error) {
	return nil, repository.ErrNotFound
}
func (m *mockTenantRepoEnforce) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error {
	return nil
}
func (m *mockTenantRepoEnforce) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	return nil
}
func (m *mockTenantRepoEnforce) GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoEnforce) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error {
	return nil
}
func (m *mockTenantRepoEnforce) Delete(ctx context.Context, id uint64) error {
	delete(m.tenants, id)
	return nil
}

func TestSubscriptionEnforcement_CrossContextAndValidation(t *testing.T) {
	pastExpiry := time.Now().Add(-24 * time.Hour)
	futureExpiry := time.Now().Add(30 * 24 * time.Hour)

	tenantRepo := &mockTenantRepoEnforce{
		tenants: map[uint64]*repository.Tenant{
			1: {
				ID:                    1,
				Name:                  "Travel Expired",
				Slug:                  "expired-travel",
				Status:                "active",
				SubscriptionExpiresAt: &pastExpiry,
			},
			2: {
				ID:                    2,
				Name:                  "Travel Legacy (Null Expiry)",
				Slug:                  "legacy-travel",
				Status:                "active",
				SubscriptionExpiresAt: nil,
			},
			3: {
				ID:                    3,
				Name:                  "Travel Active (Future Expiry)",
				Slug:                  "active-travel",
				Status:                "active",
				SubscriptionExpiresAt: &futureExpiry,
			},
			4: {
				ID:                    4,
				Name:                  "Pending Travel",
				Slug:                  "pending-travel",
				Status:                "pending",
				SubscriptionExpiresAt: nil,
			},
			5: {
				ID:                    5,
				Name:                  "Inactive Travel",
				Slug:                  "inactive-travel",
				Status:                "inactive",
				SubscriptionExpiresAt: nil,
			},
		},
	}

	sessionRepo := &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"token_expired_tenant": {
				ID:          1,
				Token:       "token_expired_tenant",
				AdminUserID: 11,
				TenantID:    1,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"token_legacy_tenant": {
				ID:          2,
				Token:       "token_legacy_tenant",
				AdminUserID: 12,
				TenantID:    2,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"token_active_tenant": {
				ID:          3,
				Token:       "token_active_tenant",
				AdminUserID: 13,
				TenantID:    3,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"token_pending_tenant": {
				ID:          4,
				Token:       "token_pending_tenant",
				AdminUserID: 14,
				TenantID:    4,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
			"token_inactive_tenant": {
				ID:          5,
				Token:       "token_inactive_tenant",
				AdminUserID: 15,
				TenantID:    5,
				ExpiresAt:   time.Now().Add(1 * time.Hour),
			},
		},
	}

	agentSessionRepo := &mockAgentSessionRepo{
		sessions: map[string]*repository.AgentSession{
			"agent_token_expired_tenant": {
				ID:        1,
				AgentID:   101,
				TenantID:  1,
				Token:     "agent_token_expired_tenant",
				ExpiresAt: time.Now().Add(24 * time.Hour),
			},
		},
	}

	domainRepo := &mockDomainRepo{
		domains: map[string]*repository.Domain{
			"expired.klikumroh.id": {
				ID:       1,
				TenantID: 1,
				Hostname: "expired.klikumroh.id",
				Type:     "subdomain",
				Status:   "active",
			},
		},
	}

	staffRepo := &mockStaffRepo{
		staffUsers: map[string]*repository.StaffUser{
			"staff@klikumroh.id": {ID: 1, Name: "Master Admin", Email: "staff@klikumroh.id", Status: "active"},
		},
		sessions: map[string]*repository.StaffSession{
			"staff_token": {
				ID:          1,
				StaffUserID: 1,
				Token:       "staff_token",
				ExpiresAt:   time.Now().Add(24 * time.Hour),
			},
		},
	}

	// Build Chi router identical to main.go route structure
	r := chi.NewRouter()

	// 1. Staff group
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		staffProtected.Get("/api/staff/tenants", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"id":1,"name":"Travel Expired"}]`))
		})
	})

	// 2. Protected Admin Dashboard API Routes
	r.Group(func(protected chi.Router) {
		protected.Use(middleware.AuthMiddleware(sessionRepo))
		protected.Use(middleware.SubscriptionEnforcementMiddleware(tenantRepo))

		// Subscription & Renewal Routes (Allowed even when expired)
		protected.Get("/api/dashboard/subscription", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"success"}`))
		})
		protected.Post("/api/dashboard/subscription/renewal-request", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"message":"Permohonan perpanjangan berhasil diajukan"}`))
		})

		// Normal dashboard endpoints
		protected.Get("/api/dashboard/packages", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"id":1,"name":"Paket Umroh Reguler"}]`))
		})
		protected.Post("/api/dashboard/packages", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":2,"name":"Paket Baru"}`))
		})
		protected.Put("/api/dashboard/packages/{id}", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"updated"}`))
		})
		protected.Patch("/api/dashboard/packages/{id}/publish", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"published"}`))
		})
		protected.Delete("/api/dashboard/packages/{id}", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"deleted"}`))
		})
	})

	// 3. Protected Agent API Group
	r.Group(func(agentProtected chi.Router) {
		agentProtected.Use(middleware.AgentAuthMiddleware(agentSessionRepo))
		agentProtected.Get("/api/agent/jamaah", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"id":1,"name":"Jamaah A"}]`))
		})
		agentProtected.Post("/api/agent/jamaah", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":2,"name":"Jamaah Baru"}`))
		})
	})

	// 4. Public Web Whitelabel Routes
	r.Group(func(public chi.Router) {
		public.Use(middleware.TenantResolutionMiddleware(domainRepo))
		public.Get("/api/public/tenant-info", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"name":"Travel Expired"}`))
		})
		public.Post("/api/public/prospects", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":1,"status":"baru"}`))
		})
	})

	// -------------------------------------------------------------------------
	// 1. Tenant dengan subscription_expires_at di masa lalu -> POST/PUT/PATCH/DELETE -> 402
	// -------------------------------------------------------------------------
	t.Run("Scenario 1: Expired tenant write actions blocked with 402 Payment Required", func(t *testing.T) {
		writeCases := []struct {
			method string
			path   string
		}{
			{http.MethodPost, "/api/dashboard/packages"},
			{http.MethodPut, "/api/dashboard/packages/1"},
			{http.MethodPatch, "/api/dashboard/packages/1/publish"},
			{http.MethodDelete, "/api/dashboard/packages/1"},
		}

		for _, wc := range writeCases {
			req := httptest.NewRequest(wc.method, wc.path, bytes.NewReader([]byte(`{"name":"Test"}`)))
			req.Header.Set("Authorization", "Bearer token_expired_tenant")
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, req)

			if rr.Code != http.StatusPaymentRequired {
				t.Fatalf("[%s %s] Expected status 402 Payment Required, got %d. Body: %s", wc.method, wc.path, rr.Code, rr.Body.String())
			}

			var respBody map[string]string
			if err := json.NewDecoder(rr.Body).Decode(&respBody); err != nil {
				t.Fatalf("Failed to parse JSON response: %v", err)
			}
			expectedErrMsg := "Langganan Anda telah berakhir. Perpanjang untuk melanjutkan mengelola data."
			if respBody["error"] != expectedErrMsg {
				t.Errorf("Expected error message %q, got %q", expectedErrMsg, respBody["error"])
			}
		}
	})

	// -------------------------------------------------------------------------
	// 2. Tenant yang sama -> GET ke endpoint /api/dashboard/* -> tetap 200 normal
	// -------------------------------------------------------------------------
	t.Run("Scenario 2: Expired tenant read actions (GET) succeed with 200 OK", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/packages", nil)
		req.Header.Set("Authorization", "Bearer token_expired_tenant")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for GET on expired tenant, got %d. Body: %s", rr.Code, rr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// 3. Tenant yang sama -> POST /api/dashboard/subscription/renewal-request -> TETAP BERHASIL (bukan 402)
	// -------------------------------------------------------------------------
	t.Run("Scenario 3: Expired tenant POST to /api/dashboard/subscription/* succeeds (not 402)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/subscription/renewal-request", bytes.NewReader([]byte(`{}`)))
		req.Header.Set("Authorization", "Bearer token_expired_tenant")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created for renewal-request on expired tenant, got %d. Body: %s", rr.Code, rr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// 4. Tenant dengan subscription_expires_at NULL (legacy) -> semua endpoint normal
	// -------------------------------------------------------------------------
	t.Run("Scenario 4: Legacy tenant with NULL expiry is never blocked (200/201 OK)", func(t *testing.T) {
		// GET
		reqGet := httptest.NewRequest(http.MethodGet, "/api/dashboard/packages", nil)
		reqGet.Header.Set("Authorization", "Bearer token_legacy_tenant")
		rrGet := httptest.NewRecorder()
		r.ServeHTTP(rrGet, reqGet)
		if rrGet.Code != http.StatusOK {
			t.Errorf("Expected 200 OK for GET on legacy tenant, got %d", rrGet.Code)
		}

		// POST
		reqPost := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", bytes.NewReader([]byte(`{"name":"New Package"}`)))
		reqPost.Header.Set("Authorization", "Bearer token_legacy_tenant")
		reqPost.Header.Set("Content-Type", "application/json")
		rrPost := httptest.NewRecorder()
		r.ServeHTTP(rrPost, reqPost)
		if rrPost.Code != http.StatusCreated {
			t.Errorf("Expected 201 Created for POST on legacy tenant, got %d", rrPost.Code)
		}
	})

	// -------------------------------------------------------------------------
	// 5. Tenant dengan subscription_expires_at di masa depan -> semua endpoint normal
	// -------------------------------------------------------------------------
	t.Run("Scenario 5: Active tenant with future expiry has full write access", func(t *testing.T) {
		reqPost := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", bytes.NewReader([]byte(`{"name":"New Package"}`)))
		reqPost.Header.Set("Authorization", "Bearer token_active_tenant")
		reqPost.Header.Set("Content-Type", "application/json")
		rrPost := httptest.NewRecorder()
		r.ServeHTTP(rrPost, reqPost)
		if rrPost.Code != http.StatusCreated {
			t.Errorf("Expected 201 Created for POST on active tenant, got %d", rrPost.Code)
		}
	})

	// -------------------------------------------------------------------------
	// 6. REGRESSION: /api/public/*, /api/agent/*, /api/staff/* TIDAK terpengaruh sama sekali
	// -------------------------------------------------------------------------
	t.Run("Scenario 6: Regression check - Public, Agent, and Staff endpoints remain 100% functional for expired tenant", func(t *testing.T) {
		// 6a. Public endpoint (GET tenant info)
		reqPubGet := httptest.NewRequest(http.MethodGet, "/api/public/tenant-info", nil)
		reqPubGet.Host = "expired.klikumroh.id"
		rrPubGet := httptest.NewRecorder()
		r.ServeHTTP(rrPubGet, reqPubGet)
		if rrPubGet.Code != http.StatusOK {
			t.Errorf("Public GET endpoint failed on expired tenant: expected 200, got %d", rrPubGet.Code)
		}

		// 6b. Public endpoint (POST prospect interest form)
		reqPubPost := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewReader([]byte(`{"name":"Calon Jamaah"}`)))
		reqPubPost.Host = "expired.klikumroh.id"
		reqPubPost.Header.Set("Content-Type", "application/json")
		rrPubPost := httptest.NewRecorder()
		r.ServeHTTP(rrPubPost, reqPubPost)
		if rrPubPost.Code != http.StatusCreated {
			t.Errorf("Public POST prospect form failed on expired tenant: expected 201, got %d", rrPubPost.Code)
		}

		// 6c. Agent endpoint (GET jamaah list)
		reqAgentGet := httptest.NewRequest(http.MethodGet, "/api/agent/jamaah", nil)
		reqAgentGet.Header.Set("Authorization", "Bearer agent_token_expired_tenant")
		rrAgentGet := httptest.NewRecorder()
		r.ServeHTTP(rrAgentGet, reqAgentGet)
		if rrAgentGet.Code != http.StatusOK {
			t.Errorf("Agent GET jamaah failed on expired tenant: expected 200, got %d", rrAgentGet.Code)
		}

		// 6d. Agent endpoint (POST manual jamaah add)
		reqAgentPost := httptest.NewRequest(http.MethodPost, "/api/agent/jamaah", bytes.NewReader([]byte(`{"name":"Jamaah Manual"}`)))
		reqAgentPost.Header.Set("Authorization", "Bearer agent_token_expired_tenant")
		reqAgentPost.Header.Set("Content-Type", "application/json")
		rrAgentPost := httptest.NewRecorder()
		r.ServeHTTP(rrAgentPost, reqAgentPost)
		if rrAgentPost.Code != http.StatusCreated {
			t.Errorf("Agent POST jamaah failed on expired tenant: expected 201, got %d", rrAgentPost.Code)
		}

		// 6e. Staff endpoint (GET tenants list)
		reqStaffGet := httptest.NewRequest(http.MethodGet, "/api/staff/tenants", nil)
		reqStaffGet.Header.Set("Authorization", "Bearer staff_token")
		rrStaffGet := httptest.NewRecorder()
		r.ServeHTTP(rrStaffGet, reqStaffGet)
		if rrStaffGet.Code != http.StatusOK {
			t.Errorf("Staff GET tenants failed: expected 200, got %d", rrStaffGet.Code)
		}
	})

	// -------------------------------------------------------------------------
	// 7. Tenant dengan status='pending' -> POST/PUT/PATCH/DELETE -> 402
	// -------------------------------------------------------------------------
	t.Run("Scenario 7: Pending tenant write actions blocked with 402 Payment Required", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", bytes.NewReader([]byte(`{"name":"New Package"}`)))
		req.Header.Set("Authorization", "Bearer token_pending_tenant")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusPaymentRequired {
			t.Fatalf("Expected 402 for pending tenant POST, got %d. Body: %s", rr.Code, rr.Body.String())
		}
	})

	// -------------------------------------------------------------------------
	// 8. Tenant dengan status='inactive' -> POST/PUT/PATCH/DELETE -> 402
	// -------------------------------------------------------------------------
	t.Run("Scenario 8: Inactive tenant write actions blocked with 402 Payment Required", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/packages", bytes.NewReader([]byte(`{"name":"New Package"}`)))
		req.Header.Set("Authorization", "Bearer token_inactive_tenant")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusPaymentRequired {
			t.Fatalf("Expected 402 for inactive tenant POST, got %d. Body: %s", rr.Code, rr.Body.String())
		}
	})
}
