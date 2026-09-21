package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
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

// mockTenantRepoPublic implements repository.TenantRepository for public signup testing.
type mockTenantRepoPublic struct {
	tenants map[uint64]*repository.Tenant
	nextID  uint64
}

func newMockTenantRepoPublic() *mockTenantRepoPublic {
	return &mockTenantRepoPublic{
		tenants: make(map[uint64]*repository.Tenant),
		nextID:  100,
	}
}

func (m *mockTenantRepoPublic) Create(ctx context.Context, tenant *repository.Tenant) error {
	tenant.ID = m.nextID
	m.nextID++
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepoPublic) GetByID(ctx context.Context, id uint64) (*repository.Tenant, error) {
	if t, ok := m.tenants[id]; ok {
		return t, nil
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepoPublic) GetBySlug(ctx context.Context, slug string) (*repository.Tenant, error) {
	for _, t := range m.tenants {
		if t.Slug == slug {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepoPublic) Update(ctx context.Context, tenant *repository.Tenant) error {
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepoPublic) UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.CurrentPlanID = &planID
	t.SubscriptionExpiresAt = &expiresAt
	t.Status = status
	return nil
}

func (m *mockTenantRepoPublic) UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	return nil
}
func (m *mockTenantRepoPublic) GetSEOGeo(ctx context.Context, tenantID uint64) (*repository.TenantSEOGeoSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoPublic) UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *repository.TenantSEOGeoSettings) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error {
	return nil
}
func (m *mockTenantRepoPublic) GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*repository.Tenant, error) {
	for _, t := range m.tenants {
		if t.WhatsAppNumber != nil && *t.WhatsAppNumber == whatsappNumber {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (m *mockTenantRepoPublic) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error {
	return nil
}
func (m *mockTenantRepoPublic) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	return nil
}
func (m *mockTenantRepoPublic) GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoPublic) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error {
	return nil
}
func (m *mockTenantRepoPublic) Delete(ctx context.Context, id uint64) error {
	delete(m.tenants, id)
	return nil
}

// mockPlanRepoPublic implements repository.PricingPlanRepository
type mockPlanRepoPublic struct {
	plans map[uint64]*repository.PricingPlan
}

func newMockPlanRepoPublic() *mockPlanRepoPublic {
	return &mockPlanRepoPublic{
		plans: make(map[uint64]*repository.PricingPlan),
	}
}

func (m *mockPlanRepoPublic) List(ctx context.Context) ([]repository.PricingPlan, error) {
	var list []repository.PricingPlan
	for _, p := range m.plans {
		list = append(list, *p)
	}
	return list, nil
}
func (m *mockPlanRepoPublic) GetByID(ctx context.Context, id uint64) (*repository.PricingPlan, error) {
	if p, ok := m.plans[id]; ok {
		return p, nil
	}
	return nil, repository.ErrNotFound
}
func (m *mockPlanRepoPublic) Create(ctx context.Context, plan *repository.PricingPlan) error {
	m.plans[plan.ID] = plan
	return nil
}
func (m *mockPlanRepoPublic) Update(ctx context.Context, plan *repository.PricingPlan) error {
	m.plans[plan.ID] = plan
	return nil
}
func (m *mockPlanRepoPublic) Delete(ctx context.Context, id uint64) error {
	delete(m.plans, id)
	return nil
}
func (m *mockPlanRepoPublic) CountTenantsUsingPlan(ctx context.Context, id uint64) (int, error) {
	return 0, nil
}

func setupPublicSignupEnv() (
	*mockTenantRepoPublic,
	*mockAdminUserRepo,
	*mockPlanRepoPublic,
	*mockCouponRepo,
	*mockPVRepo,
	*mockSessionRepo,
	chi.Router,
) {
	tenantRepo := newMockTenantRepoPublic()
	adminUserRepo := &mockAdminUserRepo{users: make(map[string]*repository.AdminUser)}
	planRepo := newMockPlanRepoPublic()
	couponRepo := newMockCouponRepo()
	pvRepo := newMockPVRepo()
	sessionRepo := &mockSessionRepo{sessions: make(map[string]*repository.Session)}

	// Seed Standard Plan
	planRepo.plans[1] = &repository.PricingPlan{
		ID:           1,
		Name:         "Standard Bulanan",
		PeriodMonths: 1,
		Price:        500000,
	}

	planService := service.NewPricingPlanService(planRepo)
	couponService := service.NewCouponService(couponRepo)
	publicSignupService := service.NewPublicSignupService(tenantRepo, adminUserRepo, planRepo, couponService, pvRepo)
	subService := service.NewSubscriptionService(pvRepo, couponRepo, couponService, planRepo, tenantRepo)
	authService := service.NewAuthService(adminUserRepo, sessionRepo, tenantRepo)

	publicHandler := handler.NewPublicSignupHandler(publicSignupService, planService, couponService)
	authHandler := handler.NewAuthHandler(authService)
	pvHandler := handler.NewPaymentVerificationHandler(subService)

	r := chi.NewRouter()
	publicHandler.RegisterPublicRoutes(r)
	authHandler.RegisterRoutes(r)

	// Staff approve route
	r.Group(func(staffRouter chi.Router) {
		staffRouter.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				ctx := middleware.WithStaffUserID(req.Context(), 1)
				next.ServeHTTP(w, req.WithContext(ctx))
			})
		})
		staffRouter.Patch("/api/staff/payment-verifications/{id}/approve", pvHandler.Approve)
	})

	return tenantRepo, adminUserRepo, planRepo, couponRepo, pvRepo, sessionRepo, r
}

// 1. Signup dengan slug yang sudah dipakai tenant lain -> 400
func TestPublicSignup_DuplicateSlug(t *testing.T) {
	tenantRepo, _, _, _, _, _, r := setupPublicSignupEnv()

	// Seed existing tenant
	tenantRepo.tenants[50] = &repository.Tenant{
		ID:     50,
		Name:   "Barakah Travel",
		Slug:   "barakah-travel",
		Status: "active",
	}

	body, _ := json.Marshal(map[string]interface{}{
		"travel_name":    "Barakah Tour",
		"slug":           "barakah-travel", // Duplicate
		"admin_name":     "Ahmad",
		"admin_email":    "ahmad@barakah.com",
		"admin_password": "password123",
		"plan_id":        1,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for duplicate slug, got %d: %s", w.Code, w.Body.String())
	}
}

// 2. Signup dengan email yang sudah dipakai admin_user tenant LAIN -> 400 (unik global)
func TestPublicSignup_DuplicateEmailCrossTenant(t *testing.T) {
	_, adminUserRepo, _, _, _, _, r := setupPublicSignupEnv()

	// Seed existing admin on tenant 50
	adminUserRepo.users["existing_admin@travel.com"] = &repository.AdminUser{
		ID:           1,
		TenantID:     50,
		Email:        "existing_admin@travel.com",
		PasswordHash: "hashed",
		Name:         "Existing Admin",
		Status:       "active",
	}

	body, _ := json.Marshal(map[string]interface{}{
		"travel_name":    "New Travel",
		"slug":           "new-travel",
		"admin_name":     "New Admin",
		"admin_email":    "existing_admin@travel.com", // Duplicate global email
		"admin_password": "password123",
		"plan_id":        1,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for duplicate global email, got %d: %s", w.Code, w.Body.String())
	}
}

// 3. Signup dengan kupon 100% -> payment_verification langsung final_amount=0, TIDAK perlu proof, status pending
func TestPublicSignup_Coupon100Percent(t *testing.T) {
	_, _, _, couponRepo, pvRepo, _, r := setupPublicSignupEnv()

	// Seed 100% coupon
	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		ID:                 1,
		Code:               "GRATIS100",
		DiscountPercentage: 100,
		Status:             "active",
	})

	body, _ := json.Marshal(map[string]interface{}{
		"travel_name":    "Travel Seratus",
		"slug":           "travel-seratus",
		"admin_name":     "Admin Seratus",
		"admin_email":    "seratus@travel.com",
		"admin_password": "password123",
		"plan_id":        1,
		"coupon_code":    "GRATIS100",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	pvID := uint64(res["payment_verification_id"].(float64))
	finalAmount := res["final_amount"].(float64)

	if finalAmount != 0 {
		t.Errorf("expected final_amount 0, got %v", finalAmount)
	}

	pv, err := pvRepo.GetByID(context.Background(), pvID)
	if err != nil {
		t.Fatalf("failed to retrieve pv: %v", err)
	}
	if pv.Status != "pending" {
		t.Errorf("expected pv status 'pending', got '%s'", pv.Status)
	}
	if pv.ProofURL != nil {
		t.Errorf("expected proof_url to be nil, got %v", *pv.ProofURL)
	}
}

// 4. Upload proof ke verification_id yang statusnya sudah bukan 'pending' -> 400
func TestPublicSignup_UploadProofNonPending(t *testing.T) {
	_, _, _, _, pvRepo, _, r := setupPublicSignupEnv()

	// Seed approved verification
	pvRepo.verifications[10] = &repository.PaymentVerification{
		ID:          10,
		TenantID:    50,
		PlanID:      1,
		Amount:      500000,
		FinalAmount: 500000,
		Status:      "approved", // Not pending!
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("proof_file", "test.png")
	_, _ = io.WriteString(part, "dummy image content")
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup/10/proof", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 when uploading proof to non-pending verification, got %d: %s", w.Code, w.Body.String())
	}
}

// 5. Approve dari Master Admin -> tenant.status berubah jadi 'active', DAN subscription_expires_at/current_plan_id ter-set benar
func TestPublicSignup_MasterAdminApproval(t *testing.T) {
	tenantRepo, _, planRepo, _, pvRepo, _, r := setupPublicSignupEnv()

	// Seed pending tenant
	tenantRepo.tenants[70] = &repository.Tenant{
		ID:     70,
		Name:   "Pending Travel",
		Slug:   "pending-travel",
		Status: "pending",
	}

	// Seed 3-month plan
	planRepo.plans[2] = &repository.PricingPlan{
		ID:           2,
		Name:         "Triwulan",
		PeriodMonths: 3,
		Price:        1400000,
	}

	// Seed pending verification
	pvRepo.verifications[25] = &repository.PaymentVerification{
		ID:          25,
		TenantID:    70,
		PlanID:      2,
		Amount:      1400000,
		FinalAmount: 1400000,
		Status:      "pending",
	}

	req := httptest.NewRequest(http.MethodPatch, "/api/staff/payment-verifications/25/approve", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 on approval, got %d: %s", w.Code, w.Body.String())
	}

	tenant, _ := tenantRepo.GetByID(context.Background(), 70)
	if tenant.Status != "active" {
		t.Errorf("expected tenant status to become 'active', got '%s'", tenant.Status)
	}
	if tenant.CurrentPlanID == nil || *tenant.CurrentPlanID != 2 {
		t.Errorf("expected current_plan_id to be 2, got %v", tenant.CurrentPlanID)
	}
	if tenant.SubscriptionExpiresAt == nil {
		t.Fatalf("expected subscription_expires_at to be set")
	}
	expectedMinExpiry := time.Now().AddDate(0, 3, -1)
	if tenant.SubscriptionExpiresAt.Before(expectedMinExpiry) {
		t.Errorf("expected expiry at least 3 months ahead, got %v", *tenant.SubscriptionExpiresAt)
	}
}

// 6. Login dengan tenant status='pending' -> tetap 200 + token (BUKAN 401/403), response menyertakan tenant_status='pending'
func TestAuth_LoginPendingTenant(t *testing.T) {
	tenantRepo, adminUserRepo, _, _, _, _, r := setupPublicSignupEnv()

	// Seed pending tenant
	tenantRepo.tenants[80] = &repository.Tenant{
		ID:     80,
		Name:   "Pending Login Travel",
		Slug:   "pending-login-travel",
		Status: "pending",
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	adminUserRepo.users["pending_admin@travel.com"] = &repository.AdminUser{
		ID:           1,
		TenantID:     80,
		Email:        "pending_admin@travel.com",
		PasswordHash: string(hash),
		Name:         "Pending Admin",
		Status:       "active",
	}

	body, _ := json.Marshal(map[string]string{
		"email":    "pending_admin@travel.com",
		"password": "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 on login for pending tenant, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &res)

	token, _ := res["token"].(string)
	if token == "" {
		t.Errorf("expected token in response")
	}

	tenantStatus, _ := res["tenant_status"].(string)
	if tenantStatus != "pending" {
		t.Errorf("expected tenant_status 'pending', got '%s'", tenantStatus)
	}
}

// 7. Login dengan tenant status='active' -> response tenant_status='active', behavior tidak berubah
func TestAuth_LoginActiveTenant(t *testing.T) {
	tenantRepo, adminUserRepo, _, _, _, _, r := setupPublicSignupEnv()

	// Seed active tenant
	tenantRepo.tenants[90] = &repository.Tenant{
		ID:     90,
		Name:   "Active Travel",
		Slug:   "active-travel",
		Status: "active",
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	adminUserRepo.users["active_admin@travel.com"] = &repository.AdminUser{
		ID:           2,
		TenantID:     90,
		Email:        "active_admin@travel.com",
		PasswordHash: string(hash),
		Name:         "Active Admin",
		Status:       "active",
	}

	body, _ := json.Marshal(map[string]string{
		"email":    "active_admin@travel.com",
		"password": "password123",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 on login for active tenant, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &res)

	token, _ := res["token"].(string)
	if token == "" {
		t.Errorf("expected token in response")
	}

	tenantStatus, _ := res["tenant_status"].(string)
	if tenantStatus != "active" {
		t.Errorf("expected tenant_status 'active', got '%s'", tenantStatus)
	}
}

// 8. Kupon khusus plan tertentu: ditolak jika mendaftar dengan plan berbeda
func TestPublicSignup_CouponPlanRestriction_Mismatch(t *testing.T) {
	_, _, planRepo, couponRepo, _, _, r := setupPublicSignupEnv()

	// Seed Plan 2
	planRepo.plans[2] = &repository.PricingPlan{
		ID:           2,
		Name:         "Pro 6 Bulan",
		PeriodMonths: 6,
		Price:        2500000,
	}

	plan2ID := uint64(2)
	couponRepo.coupons[10] = &repository.Coupon{
		ID:                 10,
		Code:               "PRO6ONLY",
		DiscountPercentage: 20,
		PlanID:             &plan2ID,
		Status:             "active",
	}

	// Coba validasi kupon dengan plan 1 (mismatch)
	valBody, _ := json.Marshal(map[string]interface{}{
		"code":    "PRO6ONLY",
		"plan_id": 1,
	})
	valReq := httptest.NewRequest(http.MethodPost, "/api/public/coupons/validate", bytes.NewBuffer(valBody))
	valReq.Header.Set("Content-Type", "application/json")
	valW := httptest.NewRecorder()
	r.ServeHTTP(valW, valReq)

	if valW.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for coupon plan mismatch validation, got %d: %s", valW.Code, valW.Body.String())
	}

	// Coba signup dengan plan 1 memakai kupon PRO6ONLY
	signupBody, _ := json.Marshal(map[string]interface{}{
		"travel_name":    "Plan Mismatch Travel",
		"slug":           "mismatch-travel",
		"admin_name":     "Owner Mismatch",
		"admin_email":    "owner@mismatch.com",
		"admin_password": "password123",
		"plan_id":        1,
		"coupon_code":    "PRO6ONLY",
	})
	signupReq := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(signupBody))
	signupReq.Header.Set("Content-Type", "application/json")
	signupW := httptest.NewRecorder()
	r.ServeHTTP(signupW, signupReq)

	if signupW.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for signup with coupon plan mismatch, got %d: %s", signupW.Code, signupW.Body.String())
	}
}

// 9. Kupon khusus plan tertentu: diterima jika mendaftar dengan plan yang sesuai
func TestPublicSignup_CouponPlanRestriction_Match(t *testing.T) {
	_, _, planRepo, couponRepo, _, _, r := setupPublicSignupEnv()

	// Seed Plan 2
	planRepo.plans[2] = &repository.PricingPlan{
		ID:           2,
		Name:         "Pro 6 Bulan",
		PeriodMonths: 6,
		Price:        2500000,
	}

	plan2ID := uint64(2)
	couponRepo.coupons[10] = &repository.Coupon{
		ID:                 10,
		Code:               "PRO6ONLY",
		DiscountPercentage: 20,
		PlanID:             &plan2ID,
		Status:             "active",
	}

	// Validasi kupon dengan plan 2 (match)
	valBody, _ := json.Marshal(map[string]interface{}{
		"code":    "PRO6ONLY",
		"plan_id": 2,
	})
	valReq := httptest.NewRequest(http.MethodPost, "/api/public/coupons/validate", bytes.NewBuffer(valBody))
	valReq.Header.Set("Content-Type", "application/json")
	valW := httptest.NewRecorder()
	r.ServeHTTP(valW, valReq)

	if valW.Code != http.StatusOK {
		t.Fatalf("expected status 200 for coupon plan match validation, got %d: %s", valW.Code, valW.Body.String())
	}

	// Signup dengan plan 2 memakai kupon PRO6ONLY -> diskon 20% dari 2.500.000 = 2.000.000
	signupBody, _ := json.Marshal(map[string]interface{}{
		"travel_name":    "Plan Match Travel",
		"slug":           "match-travel",
		"admin_name":     "Owner Match",
		"admin_email":    "owner@match.com",
		"admin_password": "password123",
		"plan_id":        2,
		"coupon_code":    "PRO6ONLY",
	})
	signupReq := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(signupBody))
	signupReq.Header.Set("Content-Type", "application/json")
	signupW := httptest.NewRecorder()
	r.ServeHTTP(signupW, signupReq)

	if signupW.Code != http.StatusCreated {
		t.Fatalf("expected status 201 for signup with matching coupon, got %d: %s", signupW.Code, signupW.Body.String())
	}

	var res map[string]interface{}
	_ = json.Unmarshal(signupW.Body.Bytes(), &res)
	finalAmount, _ := res["final_amount"].(float64)
	if finalAmount < 2000100 || finalAmount > 2000999 {
		t.Errorf("expected final amount between 2000100 and 2000999 (including unique code), got %f", finalAmount)
	}
}

func TestPublicSignup_DuplicateWhatsApp(t *testing.T) {
	tenantRepo, _, _, _, _, _, r := setupPublicSignupEnv()

	existingWA := "6281234567890"
	tenantRepo.tenants[50] = &repository.Tenant{
		ID:             50,
		Name:           "Existing Travel",
		Slug:           "existing-travel",
		Status:         "active",
		WhatsAppNumber: &existingWA,
	}

	body, _ := json.Marshal(map[string]interface{}{
		"travel_name":    "Baru Travel",
		"slug":           "baru-travel",
		"admin_name":     "Owner Baru",
		"admin_email":    "owner@baru.com",
		"admin_password": "password123",
		"admin_whatsapp": "081234567890", // normalizes to 6281234567890 (duplicate)
		"plan_id":        1,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for duplicate whatsapp, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if !bytes.Contains(w.Body.Bytes(), []byte("WhatsApp")) {
		t.Errorf("expected error message to mention WhatsApp, got %s", resp["error"])
	}
}

func TestGetVerificationStatus(t *testing.T) {
	tenantRepo, _, planRepo, _, pvRepo, _, r := setupPublicSignupEnv()

	planRepo.plans[1] = &repository.PricingPlan{
		ID:           1,
		Name:         "Standard 1 Bulan",
		PeriodMonths: 1,
		Price:        500000,
	}

	tenantRepo.tenants[99] = &repository.Tenant{
		ID:     99,
		Name:   "Status Check Travel",
		Slug:   "status-check",
		Status: "pending",
	}

	pv := &repository.PaymentVerification{
		TenantID:    99,
		PublicToken: "tok-status-test",
		PlanID:      1,
		Amount:      500000,
		FinalAmount: 500123,
		UniqueCode:  123,
		Status:      "pending",
	}
	_ = pvRepo.Create(context.Background(), pv)

	// 1. Success fetch by public token
	req := httptest.NewRequest(http.MethodGet, "/api/public/tenant-signup/tok-status-test/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var res map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if res["public_token"] != "tok-status-test" {
		t.Errorf("expected public_token tok-status-test, got %v", res["public_token"])
	}
	if res["status"] != "pending" {
		t.Errorf("expected status pending, got %v", res["status"])
	}
	if res["final_amount"].(float64) != 500123 {
		t.Errorf("expected final_amount 500123, got %v", res["final_amount"])
	}

	// 2. Not found token
	reqNotFound := httptest.NewRequest(http.MethodGet, "/api/public/tenant-signup/non-existent-token/status", nil)
	wNotFound := httptest.NewRecorder()
	r.ServeHTTP(wNotFound, reqNotFound)

	if wNotFound.Code != http.StatusNotFound {
		t.Errorf("expected status 404 for unknown token, got %d", wNotFound.Code)
	}
}

