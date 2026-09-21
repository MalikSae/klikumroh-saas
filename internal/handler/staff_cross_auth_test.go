package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// mockStaffRepo implements repository.StaffRepository for cross-auth tests.
type mockStaffRepo struct {
	staffUsers   map[string]*repository.StaffUser
	sessions     map[string]*repository.StaffSession
	allTenants   []repository.StaffTenantItem
}

func newMockStaffRepo() *mockStaffRepo {
	return &mockStaffRepo{
		staffUsers: make(map[string]*repository.StaffUser),
		sessions:   make(map[string]*repository.StaffSession),
		allTenants: make([]repository.StaffTenantItem, 0),
	}
}

func (m *mockStaffRepo) Create(ctx context.Context, user *repository.StaffUser) error {
	m.staffUsers[user.Email] = user
	return nil
}

func (m *mockStaffRepo) FindByEmail(ctx context.Context, email string) (*repository.StaffUser, error) {
	if u, ok := m.staffUsers[email]; ok {
		return u, nil
	}
	return nil, repository.ErrNotFound
}

func (m *mockStaffRepo) FindByID(ctx context.Context, id uint64) (*repository.StaffUser, error) {
	for _, u := range m.staffUsers {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockStaffRepo) CreateSession(ctx context.Context, session *repository.StaffSession) error {
	m.sessions[session.Token] = session
	return nil
}

func (m *mockStaffRepo) FindSessionByToken(ctx context.Context, token string) (*repository.StaffSession, *repository.StaffUser, error) {
	session, ok := m.sessions[token]
	if !ok {
		return nil, nil, repository.ErrNotFound
	}
	user, ok := m.staffUsers["staff@klikumroh.id"]
	if !ok {
		return nil, nil, repository.ErrNotFound
	}
	return session, user, nil
}

func (m *mockStaffRepo) DeleteSession(ctx context.Context, token string) error {
	delete(m.sessions, token)
	return nil
}

func (m *mockStaffRepo) ListAllTenants(ctx context.Context, statusFilter ...string) ([]repository.StaffTenantItem, error) {
	return m.allTenants, nil
}

func (m *mockStaffRepo) ListStaffUsers(ctx context.Context) ([]repository.StaffUser, error) {
	list := make([]repository.StaffUser, 0, len(m.staffUsers))
	for _, u := range m.staffUsers {
		list = append(list, *u)
	}
	return list, nil
}

func (m *mockStaffRepo) Update(ctx context.Context, user *repository.StaffUser) error {
	for k, u := range m.staffUsers {
		if u.ID == user.ID {
			delete(m.staffUsers, k)
			break
		}
	}
	m.staffUsers[user.Email] = user
	return nil
}

// mockPricingPlanRepo implements repository.PricingPlanRepository for cross-auth tests.
type mockPricingPlanRepo struct {
	plans           map[uint64]*repository.PricingPlan
	tenantsUsingPlan map[uint64]int
}

func newMockPricingPlanRepo() *mockPricingPlanRepo {
	return &mockPricingPlanRepo{
		plans:           make(map[uint64]*repository.PricingPlan),
		tenantsUsingPlan: make(map[uint64]int),
	}
}

func (m *mockPricingPlanRepo) List(ctx context.Context) ([]repository.PricingPlan, error) {
	list := make([]repository.PricingPlan, 0, len(m.plans))
	for _, p := range m.plans {
		list = append(list, *p)
	}
	return list, nil
}

func (m *mockPricingPlanRepo) GetByID(ctx context.Context, id uint64) (*repository.PricingPlan, error) {
	p, ok := m.plans[id]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return p, nil
}

func (m *mockPricingPlanRepo) Create(ctx context.Context, plan *repository.PricingPlan) error {
	plan.ID = uint64(len(m.plans) + 1)
	m.plans[plan.ID] = plan
	return nil
}

func (m *mockPricingPlanRepo) Update(ctx context.Context, plan *repository.PricingPlan) error {
	if _, ok := m.plans[plan.ID]; !ok {
		return repository.ErrNotFound
	}
	m.plans[plan.ID] = plan
	return nil
}

func (m *mockPricingPlanRepo) CountTenantsUsingPlan(ctx context.Context, id uint64) (int, error) {
	return m.tenantsUsingPlan[id], nil
}

func (m *mockPricingPlanRepo) Delete(ctx context.Context, id uint64) error {
	if count := m.tenantsUsingPlan[id]; count > 0 {
		return repository.ErrPlanInUse
	}
	if _, ok := m.plans[id]; !ok {
		return repository.ErrNotFound
	}
	delete(m.plans, id)
	return nil
}

func setupCrossAuthRouter(
	sessionRepo repository.SessionRepository,
	staffRepo repository.StaffRepository,
	pricingPlanRepo repository.PricingPlanRepository,
) *chi.Mux {
	r := chi.NewRouter()

	staffService := service.NewStaffService(staffRepo, nil, nil, pricingPlanRepo, nil, nil, nil, nil)
	pricingPlanService := service.NewPricingPlanService(pricingPlanRepo)

	staffHandler := handler.NewStaffHandler(staffService)
	pricingPlanHandler := handler.NewPricingPlanHandler(pricingPlanService)

	// Protected Admin Dashboard API Routes
	r.Group(func(protected chi.Router) {
		protected.Use(middleware.AuthMiddleware(sessionRepo))
		protected.Get("/api/dashboard/prospects", func(w http.ResponseWriter, req *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"data":"admin dashboard ok"}`))
		})
	})

	// Protected Staff API Routes
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		staffProtected.Get("/api/staff/me", staffHandler.Me)
		staffProtected.Get("/api/staff/tenants", staffHandler.ListTenants)
		staffProtected.Get("/api/staff/pricing-plans", pricingPlanHandler.List)
		staffProtected.Delete("/api/staff/pricing-plans/{id}", pricingPlanHandler.Delete)
	})

	return r
}

func TestCrossContextIsolation(t *testing.T) {
	mockSessionRepo := &mockSessionRepo{sessions: make(map[string]*repository.Session)}
	mockStaff := newMockStaffRepo()
	mockPlan := newMockPricingPlanRepo()

	// Seed staff user & session
	staffUser := &repository.StaffUser{
		ID:     1,
		Name:   "Staff KlikUmroh",
		Email:  "staff@klikumroh.id",
		Status: "active",
	}
	mockStaff.staffUsers[staffUser.Email] = staffUser
	staffToken := "valid-staff-token-xyz-123"
	mockStaff.sessions[staffToken] = &repository.StaffSession{
		ID:          1,
		StaffUserID: staffUser.ID,
		Token:       staffToken,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	// Seed admin user session
	adminToken := "valid-admin-token-abc-456"
	mockSessionRepo.sessions[adminToken] = &repository.Session{
		ID:          10,
		Token:       adminToken,
		AdminUserID: 1,
		TenantID:    53,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	// Seed multiple tenants for staff listing
	planNameA := "3 Bulan"
	planNameB := "12 Bulan"
	subExpires := time.Now().Add(60 * 24 * time.Hour)
	mockStaff.allTenants = []repository.StaffTenantItem{
		{
			ID:                    1,
			Name:                  "Al-Barakah Travel",
			Slug:                  "albarakah",
			CurrentPlan:           &planNameA,
			SubscriptionExpiresAt: &subExpires,
			CreatedAt:             time.Now(),
		},
		{
			ID:                    2,
			Name:                  "Nur Iman Travel",
			Slug:                  "nuriman",
			CurrentPlan:           &planNameB,
			SubscriptionExpiresAt: &subExpires,
			CreatedAt:             time.Now(),
		},
		{
			ID:                    3,
			Name:                  "Baitullah Mandiri Travel",
			Slug:                  "baitullah-mandiri",
			CurrentPlan:           nil, // No active plan (null)
			SubscriptionExpiresAt: nil,
			CreatedAt:             time.Now(),
		},
	}

	// Seed pricing plans (Plan 1 is used by 2 tenants, Plan 2 is unused)
	mockPlan.plans[1] = &repository.PricingPlan{
		ID:           1,
		Name:         "3 Bulan",
		PeriodMonths: 3,
		Price:        1500000,
	}
	mockPlan.tenantsUsingPlan[1] = 2 // in use!

	mockPlan.plans[2] = &repository.PricingPlan{
		ID:           2,
		Name:         "Promo Early Bird",
		PeriodMonths: 1,
		Price:        500000,
	}
	mockPlan.tenantsUsingPlan[2] = 0 // not in use

	router := setupCrossAuthRouter(mockSessionRepo, mockStaff, mockPlan)

	// 1. Staff Token cannot access Admin Dashboard routes
	t.Run("Valid staff token CANNOT access /api/dashboard/* endpoints", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/prospects", nil)
		req.Header.Set("Authorization", "Bearer "+staffToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("Expected status 401 Unauthorized for staff token accessing dashboard, got %d", w.Code)
		}
	})

	// 2. Admin Tenant Token cannot access Staff endpoints (403 Forbidden: valid token, wrong system)
	t.Run("Valid admin tenant token CANNOT access /api/staff/* endpoints", func(t *testing.T) {
		endpoints := []string{"/api/staff/me", "/api/staff/tenants", "/api/staff/pricing-plans"}
		for _, ep := range endpoints {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			req.Header.Set("Authorization", "Bearer "+adminToken)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Fatalf("Expected status 403 Forbidden for admin token accessing staff endpoint %s, got %d", ep, w.Code)
			}
		}
	})

	// 3. GET /api/staff/tenants returns all tenants across multiple different tenant IDs
	t.Run("GET /api/staff/tenants returns multiple tenants across different tenant IDs", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/staff/tenants", nil)
		req.Header.Set("Authorization", "Bearer "+staffToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200 OK for staff tenants, got %d", w.Code)
		}

		var resp struct {
			Tenants []repository.StaffTenantItem `json:"tenants"`
		}
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if len(resp.Tenants) != 3 {
			t.Fatalf("Expected 3 tenants in response, got %d", len(resp.Tenants))
		}

		// Verify multiple distinct tenant IDs exist in the same response
		tenantIDs := make(map[uint64]bool)
		for _, item := range resp.Tenants {
			tenantIDs[item.ID] = true
		}
		if len(tenantIDs) < 2 {
			t.Fatalf("Expected multiple different tenant IDs in response, got %d unique IDs", len(tenantIDs))
		}

		// Verify tenant without plan displays null
		var foundNullPlan bool
		for _, item := range resp.Tenants {
			if item.Slug == "baitullah-mandiri" {
				if item.CurrentPlan != nil {
					t.Errorf("Expected CurrentPlan to be null for tenant without plan, got %v", *item.CurrentPlan)
				}
				foundNullPlan = true
			}
		}
		if !foundNullPlan {
			t.Errorf("Tenant baitullah-mandiri not found in response")
		}
	})

	// 4. DELETE pricing plan in use by a tenant is rejected
	t.Run("DELETE pricing plan currently used by a tenant is REJECTED", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/staff/pricing-plans/1", nil)
		req.Header.Set("Authorization", "Bearer "+staffToken)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected status 400 Bad Request when deleting in-use plan, got %d", w.Code)
		}

		var errResp map[string]string
		_ = json.NewDecoder(w.Body).Decode(&errResp)
		if errResp["error"] != "Plan harga sedang digunakan oleh travel dan tidak dapat dihapus" {
			t.Errorf("Expected specific plan in use error message, got: %v", errResp["error"])
		}

		// Unused plan can be deleted successfully
		req2 := httptest.NewRequest(http.MethodDelete, "/api/staff/pricing-plans/2", nil)
		req2.Header.Set("Authorization", "Bearer "+staffToken)
		w2 := httptest.NewRecorder()

		router.ServeHTTP(w2, req2)

		if w2.Code != http.StatusOK {
			t.Fatalf("Expected status 200 OK when deleting unused plan, got %d", w2.Code)
		}
	})
}
