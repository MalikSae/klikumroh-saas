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
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// -------------------------------------------------------------
// Mock Repositories for Staff Tenant Detail & Reset Password
// -------------------------------------------------------------

type mockDetailPackageRepo struct {
	packages map[uint64]*repository.Package
}

func (m *mockDetailPackageRepo) Create(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	if pkg.ID == 0 {
		pkg.ID = uint64(len(m.packages) + 1)
	}
	pkg.TenantID = tenantID
	m.packages[pkg.ID] = pkg
	return nil
}
func (m *mockDetailPackageRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Package, error) {
	if p, ok := m.packages[id]; ok && p.TenantID == tenantID {
		return p, nil
	}
	return nil, repository.ErrNotFound
}
func (m *mockDetailPackageRepo) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Package, error) {
	return nil, nil
}
func (m *mockDetailPackageRepo) Update(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	return nil
}
func (m *mockDetailPackageRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDetailPackageRepo) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, p := range m.packages {
		if p.TenantID == tenantID {
			count++
		}
	}
	return count, nil
}

type mockDetailProspectRepo struct {
	prospects map[uint64]*repository.Prospect
}

func (m *mockDetailProspectRepo) Create(ctx context.Context, tenantID uint64, p *repository.Prospect) error {
	if p.ID == 0 {
		p.ID = uint64(len(m.prospects) + 1)
	}
	p.TenantID = tenantID
	m.prospects[p.ID] = p
	return nil
}
func (m *mockDetailProspectRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Prospect, error) {
	return nil, nil
}
func (m *mockDetailProspectRepo) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Prospect, error) {
	return nil, nil
}
func (m *mockDetailProspectRepo) ListWithFilter(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]repository.Prospect, error) {
	return nil, nil
}
func (m *mockDetailProspectRepo) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]repository.AgentProspectItem, error) {
	return nil, nil
}
func (m *mockDetailProspectRepo) Update(ctx context.Context, tenantID uint64, prospect *repository.Prospect) error {
	return nil
}
func (m *mockDetailProspectRepo) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, newStatus string, lostReason *string) error {
	return nil
}
func (m *mockDetailProspectRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDetailProspectRepo) GetAgentFunnelSummary(ctx context.Context, tenantID uint64, agentID uint64) (*repository.AgentFunnelSummary, error) {
	return nil, nil
}
func (m *mockDetailProspectRepo) GetActiveAgentsClosingStats(ctx context.Context, tenantID uint64) ([]repository.AgentClosingStat, error) {
	return nil, nil
}
func (m *mockDetailProspectRepo) GetAgentPendingCommissionAndCount(ctx context.Context, tenantID uint64, agentID uint64) (float64, int, error) {
	return 0, 0, nil
}
func (m *mockDetailProspectRepo) GetAgentTargetProgress(ctx context.Context, tenantID uint64, agentID uint64, startDate string, endDate string) (int, error) {
	return 0, nil
}
func (m *mockDetailProspectRepo) GetAgentReferralClicksCount(ctx context.Context, tenantID uint64, agentID uint64) (int, error) {
	return 0, nil
}
func (m *mockDetailProspectRepo) RecordReferralClick(ctx context.Context, tenantID uint64, agentID uint64, ipAddress string) error {
	return nil
}
func (m *mockDetailProspectRepo) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, p := range m.prospects {
		if p.TenantID == tenantID {
			count++
		}
	}
	return count, nil
}

type mockDetailAgentRepo struct {
	agents map[uint64]*repository.Agent
}

func (m *mockDetailAgentRepo) Create(ctx context.Context, tenantID uint64, agent *repository.Agent) error {
	agent.ID = uint64(len(m.agents) + 1)
	agent.TenantID = tenantID
	m.agents[agent.ID] = agent
	return nil
}
func (m *mockDetailAgentRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Agent, error) {
	return nil, nil
}
func (m *mockDetailAgentRepo) GetByEmail(ctx context.Context, tenantID uint64, email string) (*repository.Agent, error) {
	return nil, nil
}
func (m *mockDetailAgentRepo) GetByReferralCode(ctx context.Context, referralCode string) (*repository.Agent, error) {
	return nil, nil
}
func (m *mockDetailAgentRepo) List(ctx context.Context, tenantID uint64, statusFilter ...string) ([]repository.Agent, error) {
	return nil, nil
}
func (m *mockDetailAgentRepo) Update(ctx context.Context, tenantID uint64, agent *repository.Agent) error {
	return nil
}
func (m *mockDetailAgentRepo) UpdateProfile(ctx context.Context, tenantID uint64, id uint64, params repository.UpdateAgentProfileParams) (*repository.Agent, error) {
	return nil, nil
}
func (m *mockDetailAgentRepo) UpdatePhotoURL(ctx context.Context, tenantID uint64, id uint64, photoURL string) error {
	return nil
}
func (m *mockDetailAgentRepo) UpdatePassword(ctx context.Context, tenantID uint64, id uint64, newPasswordHash string) error {
	return nil
}
func (m *mockDetailAgentRepo) UpdateBankInfo(ctx context.Context, tenantID uint64, id uint64, bankName, accountNumber, accountHolder string) error {
	return nil
}
func (m *mockDetailAgentRepo) Approve(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDetailAgentRepo) Reject(ctx context.Context, tenantID uint64, id uint64, reason string) error {
	return nil
}
func (m *mockDetailAgentRepo) ResetToPendingWithProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	return nil
}
func (m *mockDetailAgentRepo) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, status string) error {
	return nil
}
func (m *mockDetailAgentRepo) UpdatePaymentProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	return nil
}
func (m *mockDetailAgentRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDetailAgentRepo) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, a := range m.agents {
		if a.TenantID == tenantID && a.Status == "active" {
			count++
		}
	}
	return count, nil
}

type mockDetailDomainRepo struct {
	domains map[uint64]*repository.Domain
}

func (m *mockDetailDomainRepo) Create(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	domain.ID = uint64(len(m.domains) + 1)
	domain.TenantID = tenantID
	m.domains[domain.ID] = domain
	return nil
}
func (m *mockDetailDomainRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Domain, error) {
	return nil, nil
}
func (m *mockDetailDomainRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	var list []repository.Domain
	for _, d := range m.domains {
		if d.TenantID == tenantID {
			list = append(list, *d)
		}
	}
	return list, nil
}
func (m *mockDetailDomainRepo) Update(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	return nil
}
func (m *mockDetailDomainRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDetailDomainRepo) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error) {
	return nil, nil
}
func (m *mockDetailDomainRepo) FindByHostname(ctx context.Context, hostname string) (*repository.Domain, error) {
	return nil, nil
}

type mockDetailAdminUserRepo struct {
	users map[uint64]*repository.AdminUser
}

func (m *mockDetailAdminUserRepo) Create(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	if user.ID == 0 {
		user.ID = uint64(len(m.users) + 1)
	}
	user.TenantID = tenantID
	m.users[user.ID] = user
	return nil
}
func (m *mockDetailAdminUserRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.AdminUser, error) {
	if u, ok := m.users[id]; ok && u.TenantID == tenantID {
		return u, nil
	}
	return nil, repository.ErrNotFound
}
func (m *mockDetailAdminUserRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.AdminUser, error) {
	var list []repository.AdminUser
	for _, u := range m.users {
		if u.TenantID == tenantID {
			list = append(list, *u)
		}
	}
	return list, nil
}
func (m *mockDetailAdminUserRepo) Update(ctx context.Context, tenantID uint64, user *repository.AdminUser) error {
	if u, ok := m.users[user.ID]; ok && u.TenantID == tenantID {
		m.users[user.ID] = user
		return nil
	}
	return repository.ErrNotFound
}
func (m *mockDetailAdminUserRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDetailAdminUserRepo) FindByTenantAndEmail(ctx context.Context, tenantID uint64, email string) (*repository.AdminUser, error) {
	for _, u := range m.users {
		if u.TenantID == tenantID && u.Email == email {
			return u, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (m *mockDetailAdminUserRepo) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	return 0, nil
}
func (m *mockDetailAdminUserRepo) FindByEmail(ctx context.Context, email string) (*repository.AdminUser, error) {
	for _, u := range m.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, repository.ErrNotFound
}

// -------------------------------------------------------------
// Test Environment Setup
// -------------------------------------------------------------

type testEnv struct {
	staffRepo     *mockStaffRepo
	sessionRepo   *mockSessionRepoSub
	tenantRepo    *mockTenantRepoSub
	domainRepo    *mockDetailDomainRepo
	planRepo      *mockPricingPlanRepo
	packageRepo   *mockDetailPackageRepo
	prospectRepo  *mockDetailProspectRepo
	agentRepo     *mockDetailAgentRepo
	adminUserRepo *mockDetailAdminUserRepo
	pvRepo        *mockPVRepo
	couponRepo    *mockCouponRepo
	authService   service.AuthService
	router        *chi.Mux
}

func setupStaffTenantDetailEnv() *testEnv {
	staffRepo := newMockStaffRepo()
	sessionRepo := newMockSessionRepoSub()
	tenantRepo := newMockTenantRepoSub()
	domainRepo := &mockDetailDomainRepo{domains: make(map[uint64]*repository.Domain)}
	planRepo := newMockPricingPlanRepo()
	packageRepo := &mockDetailPackageRepo{packages: make(map[uint64]*repository.Package)}
	prospectRepo := &mockDetailProspectRepo{prospects: make(map[uint64]*repository.Prospect)}
	agentRepo := &mockDetailAgentRepo{agents: make(map[uint64]*repository.Agent)}
	adminUserRepo := &mockDetailAdminUserRepo{users: make(map[uint64]*repository.AdminUser)}
	pvRepo := newMockPVRepo()
	couponRepo := newMockCouponRepo()

	// Seed Staff
	staffRepo.staffUsers["staff@klikumroh.id"] = &repository.StaffUser{
		ID:     1,
		Email:  "staff@klikumroh.id",
		Name:   "Master Staff",
		Status: "active",
	}
	staffRepo.sessions["valid-staff-token"] = &repository.StaffSession{
		ID:          1,
		StaffUserID: 1,
		Token:       "valid-staff-token",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	// Seed Tenant 53
	planID := uint64(1)
	subExp := time.Now().Add(90 * 24 * time.Hour)
	tenantRepo.tenants[53] = &repository.Tenant{
		ID:                    53,
		Name:                  "Al-Barakah Travel",
		Slug:                  "albarakah",
		Status:                "active",
		CurrentPlanID:         &planID,
		SubscriptionExpiresAt: &subExp,
		CreatedAt:             time.Now().Add(-30 * 24 * time.Hour),
	}

	// Seed Tenant 78
	tenantRepo.tenants[78] = &repository.Tenant{
		ID:        78,
		Name:      "Nur Iman Travel",
		Slug:      "nuriman",
		Status:    "trial",
		CreatedAt: time.Now().Add(-10 * 24 * time.Hour),
	}

	// Seed Tenant Sessions
	sessionRepo.sessions["token-tenant-53"] = &repository.Session{
		ID:          1,
		TenantID:    53,
		AdminUserID: 101,
		Token:       "token-tenant-53",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	// Seed Pricing Plan
	planRepo.plans[1] = &repository.PricingPlan{
		ID:           1,
		Name:         "Paket 3 Bulan",
		PeriodMonths: 3,
		Price:        1500000,
	}

	// Build Services
	staffService := service.NewStaffService(
		staffRepo,
		tenantRepo,
		domainRepo,
		planRepo,
		packageRepo,
		prospectRepo,
		agentRepo,
		adminUserRepo,
	)
	couponService := service.NewCouponService(couponRepo)
	subscriptionService := service.NewSubscriptionService(pvRepo, couponRepo, couponService, planRepo, tenantRepo)
	authService := service.NewAuthService(adminUserRepo, sessionRepo, tenantRepo)

	staffHandler := handler.NewStaffHandler(staffService)
	pvHandler := handler.NewPaymentVerificationHandler(subscriptionService)

	r := chi.NewRouter()
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		staffProtected.Get("/api/staff/tenants/{id}", staffHandler.GetTenantDetail)
		staffProtected.Patch("/api/staff/tenants/{id}/admin-users/{admin_user_id}/reset-password", staffHandler.ResetTenantAdminPassword)
		staffProtected.Get("/api/staff/payment-verifications", pvHandler.List)
	})

	return &testEnv{
		staffRepo:     staffRepo,
		sessionRepo:   sessionRepo,
		tenantRepo:    tenantRepo,
		domainRepo:    domainRepo,
		planRepo:      planRepo,
		packageRepo:   packageRepo,
		prospectRepo:  prospectRepo,
		agentRepo:     agentRepo,
		adminUserRepo: adminUserRepo,
		pvRepo:        pvRepo,
		couponRepo:    couponRepo,
		authService:   authService,
		router:        r,
	}
}

// -------------------------------------------------------------
// Test 1: GET /api/staff/tenants/{id} with Tenant Token -> 403 Forbidden
// -------------------------------------------------------------
func TestStaffTenantDetail_TenantTokenRejectedWith403(t *testing.T) {
	env := setupStaffTenantDetailEnv()

	req := httptest.NewRequest(http.MethodGet, "/api/staff/tenants/53", nil)
	req.Header.Set("Authorization", "Bearer token-tenant-53")
	w := httptest.NewRecorder()

	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when accessing staff tenant detail with tenant token, got %d", w.Code)
	}
}

// -------------------------------------------------------------
// Test 2: Reset password for admin_user belonging to another tenant -> 404
// -------------------------------------------------------------
func TestStaffTenant_ResetPassword_CrossTenantRejectedWith404(t *testing.T) {
	env := setupStaffTenantDetailEnv()

	oldHash, _ := bcrypt.GenerateFromPassword([]byte("OldPassword123"), bcrypt.DefaultCost)

	// Admin user 201 belongs to Tenant 78
	user201 := &repository.AdminUser{
		ID:           201,
		TenantID:     78,
		Name:         "Admin Travel 78",
		Email:        "admin78@travel.com",
		PasswordHash: string(oldHash),
		Status:       "active",
	}
	_ = env.adminUserRepo.Create(context.Background(), 78, user201)

	// Staff calls reset password on URL tenant 53 for user 201 (which belongs to tenant 78!)
	body, _ := json.Marshal(map[string]string{
		"new_password": "NewSecretPassword999",
	})
	req := httptest.NewRequest(http.MethodPatch, "/api/staff/tenants/53/admin-users/201/reset-password", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for cross-tenant admin user reset attempt, got %d: %s", w.Code, w.Body.String())
	}

	// Verify user 201 password was NOT changed
	storedUser, _ := env.adminUserRepo.GetByID(context.Background(), 78, 201)
	if err := bcrypt.CompareHashAndPassword([]byte(storedUser.PasswordHash), []byte("OldPassword123")); err != nil {
		t.Fatalf("expected old password to remain valid, but compare failed: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(storedUser.PasswordHash), []byte("NewSecretPassword999")); err == nil {
		t.Fatalf("SECURITY VIOLATION: cross-tenant password reset updated the password!")
	}
}

// -------------------------------------------------------------
// Test 3: Reset password success -> new password works for login, old password fails
// -------------------------------------------------------------
func TestStaffTenant_ResetPassword_SuccessAndLoginVerification(t *testing.T) {
	env := setupStaffTenantDetailEnv()

	oldHash, _ := bcrypt.GenerateFromPassword([]byte("OldPassword123"), bcrypt.DefaultCost)
	user101 := &repository.AdminUser{
		ID:           101,
		TenantID:     53,
		Name:         "H. Ahmad",
		Email:        "ahmad@albarakah.com",
		PasswordHash: string(oldHash),
		Status:       "active",
	}
	_ = env.adminUserRepo.Create(context.Background(), 53, user101)

	// 1. Verify old password logs in before reset
	_, err := env.authService.Login(context.Background(), "ahmad@albarakah.com", "OldPassword123")
	if err != nil {
		t.Fatalf("expected old password to login successfully initially, got %v", err)
	}

	// 2. Staff resets password to "BrandNewPassword888"
	body, _ := json.Marshal(map[string]string{
		"new_password": "BrandNewPassword888",
	})
	req := httptest.NewRequest(http.MethodPatch, "/api/staff/tenants/53/admin-users/101/reset-password", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for valid reset password, got %d: %s", w.Code, w.Body.String())
	}

	// Response must NOT contain password in plain text or hash
	if bytes.Contains(w.Body.Bytes(), []byte("BrandNewPassword888")) {
		t.Fatalf("SECURITY VIOLATION: response contains plain text password")
	}

	// 3. Verify new password works for login
	loginRes, err := env.authService.Login(context.Background(), "ahmad@albarakah.com", "BrandNewPassword888")
	if err != nil {
		t.Fatalf("expected login with new password to succeed, got %v", err)
	}
	if loginRes.Token == "" {
		t.Fatalf("expected non-empty session token on successful login")
	}

	// 4. Verify old password fails login
	_, err = env.authService.Login(context.Background(), "ahmad@albarakah.com", "OldPassword123")
	if err == nil {
		t.Fatalf("expected old password to fail login after reset, but it succeeded")
	}
}

// -------------------------------------------------------------
// Test 4: GET /api/staff/payment-verifications?tenant_id=X filters strictly
// -------------------------------------------------------------
func TestStaffPaymentVerifications_FilterByTenantID(t *testing.T) {
	env := setupStaffTenantDetailEnv()

	// Seed 2 PV for Tenant 53
	pv53_1 := &repository.PaymentVerification{TenantID: 53, PlanID: 1, Amount: 1000000, FinalAmount: 1000000, Status: "approved"}
	pv53_2 := &repository.PaymentVerification{TenantID: 53, PlanID: 1, Amount: 1500000, FinalAmount: 1500000, Status: "pending"}
	_ = env.pvRepo.Create(context.Background(), pv53_1)
	_ = env.pvRepo.Create(context.Background(), pv53_2)

	// Seed 2 PV for Tenant 78
	pv78_1 := &repository.PaymentVerification{TenantID: 78, PlanID: 1, Amount: 2000000, FinalAmount: 2000000, Status: "approved"}
	pv78_2 := &repository.PaymentVerification{TenantID: 78, PlanID: 1, Amount: 2500000, FinalAmount: 2500000, Status: "pending"}
	_ = env.pvRepo.Create(context.Background(), pv78_1)
	_ = env.pvRepo.Create(context.Background(), pv78_2)

	// Request filtered for Tenant 53
	req := httptest.NewRequest(http.MethodGet, "/api/staff/payment-verifications?tenant_id=53", nil)
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	w := httptest.NewRecorder()

	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for staff payment verifications, got %d", w.Code)
	}

	var resp struct {
		PaymentVerifications []repository.PaymentVerification `json:"payment_verifications"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse JSON response: %v", err)
	}

	// Exact length match
	if len(resp.PaymentVerifications) != 2 {
		t.Fatalf("expected exactly 2 payment verifications for Tenant 53, got %d", len(resp.PaymentVerifications))
	}

	// Exact item verification
	found53_1, found53_2 := false, false
	for _, v := range resp.PaymentVerifications {
		if v.TenantID != 53 {
			t.Fatalf("CROSS-TENANT LEAK: payment verification for Tenant %d leaked in query for Tenant 53", v.TenantID)
		}
		if v.ID == pv78_1.ID || v.ID == pv78_2.ID {
			t.Fatalf("CROSS-TENANT LEAK: Tenant 78 verification ID %d present in Tenant 53 results", v.ID)
		}
		if v.ID == pv53_1.ID {
			found53_1 = true
		}
		if v.ID == pv53_2.ID {
			found53_2 = true
		}
	}

	if !found53_1 || !found53_2 {
		t.Fatalf("expected to find both pv53_1 and pv53_2 in results")
	}
}

// -------------------------------------------------------------
// Test 5: GET /api/staff/tenants/{id} returns accurate usage counts & payload
// -------------------------------------------------------------
func TestStaffTenantDetail_UsageStatsAndFullPayload(t *testing.T) {
	env := setupStaffTenantDetailEnv()

	// 1. Seed Packages: 3 for Tenant 53, 2 for Tenant 78
	_ = env.packageRepo.Create(context.Background(), 53, &repository.Package{Name: "Paket Bronze 53"})
	_ = env.packageRepo.Create(context.Background(), 53, &repository.Package{Name: "Paket Silver 53"})
	_ = env.packageRepo.Create(context.Background(), 53, &repository.Package{Name: "Paket Gold 53"})
	_ = env.packageRepo.Create(context.Background(), 78, &repository.Package{Name: "Paket Bronze 78"})
	_ = env.packageRepo.Create(context.Background(), 78, &repository.Package{Name: "Paket Silver 78"})

	// 2. Seed Prospects: 5 for Tenant 53, 4 for Tenant 78
	for i := 1; i <= 5; i++ {
		_ = env.prospectRepo.Create(context.Background(), 53, &repository.Prospect{Name: "Prospect 53"})
	}
	for i := 1; i <= 4; i++ {
		_ = env.prospectRepo.Create(context.Background(), 78, &repository.Prospect{Name: "Prospect 78"})
	}

	// 3. Seed Agents: 2 active + 1 inactive for Tenant 53, 3 active for Tenant 78
	_ = env.agentRepo.Create(context.Background(), 53, &repository.Agent{Name: "Active Agent 1", Status: "active"})
	_ = env.agentRepo.Create(context.Background(), 53, &repository.Agent{Name: "Active Agent 2", Status: "active"})
	_ = env.agentRepo.Create(context.Background(), 53, &repository.Agent{Name: "Inactive Agent", Status: "inactive"})
	_ = env.agentRepo.Create(context.Background(), 78, &repository.Agent{Name: "Active Agent 78-1", Status: "active"})
	_ = env.agentRepo.Create(context.Background(), 78, &repository.Agent{Name: "Active Agent 78-2", Status: "active"})
	_ = env.agentRepo.Create(context.Background(), 78, &repository.Agent{Name: "Active Agent 78-3", Status: "active"})

	// 4. Seed Domains
	_ = env.domainRepo.Create(context.Background(), 53, &repository.Domain{Hostname: "albarakah.klikumroh.id", Type: "subdomain", Status: "active"})
	_ = env.domainRepo.Create(context.Background(), 53, &repository.Domain{Hostname: "albarakah.com", Type: "custom", Status: "active"})

	// 5. Seed Admin Users for Tenant 53
	_ = env.adminUserRepo.Create(context.Background(), 53, &repository.AdminUser{
		Name:      "H. Ahmad",
		Email:     "ahmad@albarakah.com",
		Status:    "active",
		CreatedAt: time.Now(),
	})
	_ = env.adminUserRepo.Create(context.Background(), 53, &repository.AdminUser{
		Name:      "H. Budi",
		Email:     "budi@albarakah.com",
		Status:    "active",
		CreatedAt: time.Now(),
	})

	// Perform Request
	req := httptest.NewRequest(http.MethodGet, "/api/staff/tenants/53", nil)
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	w := httptest.NewRecorder()

	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for tenant detail, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Tenant service.StaffTenantDetail `json:"tenant"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode tenant detail JSON: %v", err)
	}

	td := resp.Tenant
	if td.ID != 53 {
		t.Errorf("expected tenant ID 53, got %d", td.ID)
	}
	if td.Name != "Al-Barakah Travel" {
		t.Errorf("expected name 'Al-Barakah Travel', got %s", td.Name)
	}
	if td.Slug != "albarakah" {
		t.Errorf("expected slug 'albarakah', got %s", td.Slug)
	}
	if td.Status != "active" {
		t.Errorf("expected status 'active', got %s", td.Status)
	}

	// Verify Domains
	if td.Domain.Subdomain != "albarakah.klikumroh.id" {
		t.Errorf("expected subdomain 'albarakah.klikumroh.id', got %s", td.Domain.Subdomain)
	}
	if td.Domain.CustomDomain == nil || *td.Domain.CustomDomain != "albarakah.com" {
		t.Errorf("expected custom domain 'albarakah.com', got %v", td.Domain.CustomDomain)
	}
	if td.Domain.CustomDomainStatus == nil || *td.Domain.CustomDomainStatus != "active" {
		t.Errorf("expected custom domain status 'active', got %v", td.Domain.CustomDomainStatus)
	}

	// Verify Usage Counts (Strictly Tenant 53 only)
	if td.TotalPackages != 3 {
		t.Errorf("expected 3 total packages for tenant 53, got %d", td.TotalPackages)
	}
	if td.TotalProspects != 5 {
		t.Errorf("expected 5 total prospects for tenant 53, got %d", td.TotalProspects)
	}
	if td.TotalActiveAgents != 2 {
		t.Errorf("expected 2 active agents for tenant 53, got %d", td.TotalActiveAgents)
	}

	// Verify Admin Users
	if len(td.DaftarAdmin) != 2 {
		t.Fatalf("expected 2 admin users in daftar_admin, got %d", len(td.DaftarAdmin))
	}
	for _, admin := range td.DaftarAdmin {
		if admin.Email == "" || admin.Name == "" {
			t.Errorf("admin user item missing name/email: %+v", admin)
		}
	}
}
