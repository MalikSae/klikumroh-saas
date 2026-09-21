package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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

// mockCouponRepo implements repository.CouponRepository in-memory for testing.
type mockCouponRepo struct {
	coupons     map[uint64]*repository.Coupon
	redemptions []repository.CouponRedemption
	nextID      uint64
}

func newMockCouponRepo() *mockCouponRepo {
	return &mockCouponRepo{
		coupons:     make(map[uint64]*repository.Coupon),
		redemptions: make([]repository.CouponRedemption, 0),
		nextID:      1,
	}
}

func (m *mockCouponRepo) List(ctx context.Context) ([]repository.Coupon, error) {
	list := make([]repository.Coupon, 0, len(m.coupons))
	for _, c := range m.coupons {
		list = append(list, *c)
	}
	return list, nil
}

func (m *mockCouponRepo) GetByID(ctx context.Context, id uint64) (*repository.Coupon, error) {
	if c, ok := m.coupons[id]; ok {
		return c, nil
	}
	return nil, repository.ErrNotFound
}

func (m *mockCouponRepo) Create(ctx context.Context, coupon *repository.Coupon) error {
	for _, c := range m.coupons {
		if strings.EqualFold(c.Code, coupon.Code) {
			return fmt.Errorf("coupon code already exists")
		}
	}
	coupon.ID = m.nextID
	m.nextID++
	m.coupons[coupon.ID] = coupon
	return nil
}

func (m *mockCouponRepo) FindByCode(ctx context.Context, code string) (*repository.Coupon, error) {
	for _, c := range m.coupons {
		if strings.EqualFold(c.Code, code) {
			return c, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockCouponRepo) Deactivate(ctx context.Context, id uint64) error {
	c, ok := m.coupons[id]
	if !ok {
		return repository.ErrNotFound
	}
	c.Status = "inactive"
	return nil
}

func (m *mockCouponRepo) IncrementUsedCount(ctx context.Context, id uint64) error {
	c, ok := m.coupons[id]
	if !ok {
		return repository.ErrNotFound
	}
	c.UsedCount++
	return nil
}

func (m *mockCouponRepo) RecordRedemption(ctx context.Context, couponID, tenantID uint64) error {
	m.redemptions = append(m.redemptions, repository.CouponRedemption{
		ID:         uint64(len(m.redemptions) + 1),
		CouponID:   couponID,
		TenantID:   tenantID,
		RedeemedAt: time.Now(),
	})
	return nil
}

// mockPVRepo implements repository.PaymentVerificationRepository in-memory for testing.
type mockPVRepo struct {
	verifications map[uint64]*repository.PaymentVerification
	nextID        uint64
}

func newMockPVRepo() *mockPVRepo {
	return &mockPVRepo{
		verifications: make(map[uint64]*repository.PaymentVerification),
		nextID:        1,
	}
}

func (m *mockPVRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.PaymentVerification, error) {
	var list []repository.PaymentVerification
	for _, pv := range m.verifications {
		if pv.TenantID == tenantID {
			list = append(list, *pv)
		}
	}
	return list, nil
}

func (m *mockPVRepo) ListAll(ctx context.Context, statusFilter string) ([]repository.PaymentVerification, error) {
	var list []repository.PaymentVerification
	for _, pv := range m.verifications {
		if statusFilter == "" || statusFilter == "all" || pv.Status == statusFilter {
			list = append(list, *pv)
		}
	}
	return list, nil
}

func (m *mockPVRepo) GetByID(ctx context.Context, id uint64) (*repository.PaymentVerification, error) {
	if pv, ok := m.verifications[id]; ok {
		return pv, nil
	}
	return nil, repository.ErrNotFound
}

func (m *mockPVRepo) GetByPublicToken(ctx context.Context, token string) (*repository.PaymentVerification, error) {
	for _, pv := range m.verifications {
		if pv.PublicToken == token {
			return pv, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockPVRepo) Create(ctx context.Context, pv *repository.PaymentVerification) error {
	pv.ID = m.nextID
	m.nextID++
	if pv.PublicToken == "" {
		pv.PublicToken = fmt.Sprintf("mock-token-%d", pv.ID)
	}
	m.verifications[pv.ID] = pv
	return nil
}

func (m *mockPVRepo) UpdateStatus(ctx context.Context, id uint64, status string, rejectionReason *string, reviewedBy *uint64, reviewedAt *time.Time) error {
	pv, ok := m.verifications[id]
	if !ok {
		return repository.ErrNotFound
	}
	pv.Status = status
	pv.RejectionReason = rejectionReason
	pv.ReviewedBy = reviewedBy
	pv.ReviewedAt = reviewedAt
	return nil
}

func (m *mockPVRepo) UpdateProofURL(ctx context.Context, id uint64, proofURL string) error {
	pv, ok := m.verifications[id]
	if !ok {
		return repository.ErrNotFound
	}
	pv.ProofURL = &proofURL
	return nil
}

func (m *mockPVRepo) ResetToPendingWithProof(ctx context.Context, id uint64, proofURL string) error {
	pv, ok := m.verifications[id]
	if !ok {
		return repository.ErrNotFound
	}
	pv.ProofURL = &proofURL
	pv.Status = "pending"
	pv.RejectionReason = nil
	pv.ReviewedBy = nil
	pv.ReviewedAt = nil
	return nil
}

func (m *mockPVRepo) UpdateDetails(ctx context.Context, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error {
	pv, ok := m.verifications[id]
	if !ok {
		return repository.ErrNotFound
	}
	pv.PlanID = planID
	pv.CouponCode = couponCode
	pv.Amount = amount
	pv.FinalAmount = finalAmount
	pv.UniqueCode = uniqueCode
	if proofURL != nil {
		pv.ProofURL = proofURL
	}
	pv.Status = "pending"
	pv.RejectionReason = nil
	pv.ReviewedBy = nil
	pv.ReviewedAt = nil
	return nil
}

// mockTenantRepoSub implements minimal repository.TenantRepository for subscription testing.
type mockTenantRepoSub struct {
	tenants map[uint64]*repository.Tenant
}

func newMockTenantRepoSub() *mockTenantRepoSub {
	return &mockTenantRepoSub{
		tenants: make(map[uint64]*repository.Tenant),
	}
}

func (m *mockTenantRepoSub) Create(ctx context.Context, tenant *repository.Tenant) error {
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepoSub) GetByID(ctx context.Context, id uint64) (*repository.Tenant, error) {
	if t, ok := m.tenants[id]; ok {
		return t, nil
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepoSub) GetBySlug(ctx context.Context, slug string) (*repository.Tenant, error) {
	for _, t := range m.tenants {
		if t.Slug == slug {
			return t, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockTenantRepoSub) Update(ctx context.Context, tenant *repository.Tenant) error {
	m.tenants[tenant.ID] = tenant
	return nil
}

func (m *mockTenantRepoSub) UpdateSubscription(ctx context.Context, tenantID uint64, planID uint64, expiresAt time.Time, status string) error {
	t, ok := m.tenants[tenantID]
	if !ok {
		return repository.ErrNotFound
	}
	t.CurrentPlanID = &planID
	t.SubscriptionExpiresAt = &expiresAt
	t.Status = status
	return nil
}

// Stubs for remaining TenantRepository methods
func (m *mockTenantRepoSub) UpdateBranding(ctx context.Context, tenantID uint64, brandPrimaryColor string) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateBrandIcon(ctx context.Context, tenantID uint64, iconURL *string) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateBrandLogo(ctx context.Context, tenantID uint64, logoURL *string) error {
	return nil
}
func (m *mockTenantRepoSub) GetSEOGeo(ctx context.Context, tenantID uint64) (*repository.TenantSEOGeoSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoSub) UpdateSEOGeo(ctx context.Context, tenantID uint64, settings *repository.TenantSEOGeoSettings) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateOGImage(ctx context.Context, tenantID uint64, ogImageURL *string) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateProfile(ctx context.Context, tenantID uint64, name string, logoURL *string, tagline *string, aboutSummary *string) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateContactAndLegal(ctx context.Context, tenantID uint64, ppiuNumber *string, address *string, phone *string, email *string, whatsapp *string, instagram *string, facebook *string, youtube *string) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateTrustMetrics(ctx context.Context, tenantID uint64, rating *string, alumniCount *string, guarantee *string) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateWhatsAppNumber(ctx context.Context, tenantID uint64, whatsappNumber string) error {
	return nil
}
func (m *mockTenantRepoSub) GetByWhatsAppNumber(ctx context.Context, whatsappNumber string) (*repository.Tenant, error) {
	return nil, repository.ErrNotFound
}
func (m *mockTenantRepoSub) UpdateCommissionSettings(ctx context.Context, tenantID uint64, enabled bool, percentage *float64) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error {
	return nil
}
func (m *mockTenantRepoSub) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	return nil
}
func (m *mockTenantRepoSub) GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error) {
	return nil, nil
}
func (m *mockTenantRepoSub) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error {
	return nil
}
func (m *mockTenantRepoSub) Delete(ctx context.Context, id uint64) error {
	delete(m.tenants, id)
	return nil
}

type mockSessionRepoSub struct {
	sessions map[string]*repository.Session
}

func newMockSessionRepoSub() *mockSessionRepoSub {
	return &mockSessionRepoSub{
		sessions: make(map[string]*repository.Session),
	}
}

func (m *mockSessionRepoSub) Create(ctx context.Context, tenantID uint64, session *repository.Session) error {
	m.sessions[session.Token] = session
	return nil
}

func (m *mockSessionRepoSub) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Session, error) {
	return nil, repository.ErrNotFound
}

func (m *mockSessionRepoSub) ListByAdminUser(ctx context.Context, tenantID uint64, adminUserID uint64) ([]repository.Session, error) {
	return nil, nil
}

func (m *mockSessionRepoSub) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}

func (m *mockSessionRepoSub) DeleteByToken(ctx context.Context, token string) error {
	delete(m.sessions, token)
	return nil
}

func (m *mockSessionRepoSub) FindByToken(ctx context.Context, token string) (*repository.Session, error) {
	s, ok := m.sessions[token]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return s, nil
}

// -------------------------------------------------------------
// Test Suite
// -------------------------------------------------------------

func setupSubTestEnv() (
	*mockCouponRepo,
	*mockPVRepo,
	*mockPricingPlanRepo,
	*mockTenantRepoSub,
	*mockStaffRepo,
	*mockSessionRepoSub,
	*chi.Mux,
) {
	couponRepo := newMockCouponRepo()
	pvRepo := newMockPVRepo()
	planRepo := newMockPricingPlanRepo()
	tenantRepo := newMockTenantRepoSub()
	staffRepo := newMockStaffRepo()
	sessionRepo := newMockSessionRepoSub()

	// Seed Staff
	staffRepo.staffUsers["staff@klikumroh.id"] = &repository.StaffUser{
		ID:     1,
		Email:  "staff@klikumroh.id",
		Name:   "Master Admin",
		Status: "active",
	}
	staffRepo.sessions["valid-staff-token"] = &repository.StaffSession{
		ID:          1,
		StaffUserID: 1,
		Token:       "valid-staff-token",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	// Seed Tenants
	tenantRepo.tenants[53] = &repository.Tenant{
		ID:     53,
		Name:   "Al-Barakah Travel",
		Slug:   "albarakah",
		Status: "pending",
	}
	tenantRepo.tenants[78] = &repository.Tenant{
		ID:     78,
		Name:   "Nur Iman Travel",
		Slug:   "nuriman",
		Status: "active",
	}

	// Seed Tenant Sessions
	sessionRepo.sessions["token-tenant-53"] = &repository.Session{
		ID:          1,
		TenantID:    53,
		AdminUserID: 101,
		Token:       "token-tenant-53",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	sessionRepo.sessions["token-tenant-78"] = &repository.Session{
		ID:          2,
		TenantID:    78,
		AdminUserID: 102,
		Token:       "token-tenant-78",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	// Seed Plans
	planRepo.plans[1] = &repository.PricingPlan{
		ID:           1,
		Name:         "Paket 3 Bulan",
		PeriodMonths: 3,
		Price:        1500000,
	}
	planRepo.plans[2] = &repository.PricingPlan{
		ID:           2,
		Name:         "Paket 6 Bulan",
		PeriodMonths: 6,
		Price:        2700000,
	}

	couponService := service.NewCouponService(couponRepo)
	pricingPlanService := service.NewPricingPlanService(planRepo)
	subscriptionService := service.NewSubscriptionService(pvRepo, couponRepo, couponService, planRepo, tenantRepo)

	couponHandler := handler.NewCouponHandler(couponService)
	subscriptionHandler := handler.NewSubscriptionHandler(subscriptionService, pricingPlanService)
	pvHandler := handler.NewPaymentVerificationHandler(subscriptionService)

	r := chi.NewRouter()

	// Staff Protected
	r.Group(func(staffProtected chi.Router) {
		staffProtected.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		staffProtected.Get("/api/staff/coupons", couponHandler.ListStaff)
		staffProtected.Post("/api/staff/coupons", couponHandler.CreateStaff)
		staffProtected.Patch("/api/staff/coupons/{id}/deactivate", couponHandler.DeactivateStaff)
		staffProtected.Get("/api/staff/payment-verifications", pvHandler.List)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/approve", pvHandler.Approve)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/reject", pvHandler.Reject)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/plan", pvHandler.UpdatePlan)
		staffProtected.Patch("/api/staff/payment-verifications/{id}/coupon", pvHandler.ApplyCoupon)
	})

	// Tenant Protected
	r.Group(func(protected chi.Router) {
		protected.Use(middleware.AuthMiddleware(sessionRepo))
		protected.Get("/api/dashboard/subscription", subscriptionHandler.GetSubscription)
		protected.Get("/api/dashboard/pricing-plans", subscriptionHandler.GetPricingPlans)
		protected.Get("/api/dashboard/coupons/validate", couponHandler.ValidateTravel)
		protected.Post("/api/dashboard/subscription/renewal-request", subscriptionHandler.CreateRenewalRequest)
		protected.Get("/api/dashboard/subscription/payment-verifications/{id}", subscriptionHandler.GetPaymentVerification)
		protected.Post("/api/dashboard/subscription/payment-verifications/{id}/proof", subscriptionHandler.UploadRenewalProof)
	})

	return couponRepo, pvRepo, planRepo, tenantRepo, staffRepo, sessionRepo, r
}

// 1. TestCouponValidation: tests coupon validation reasons
func TestCouponValidation(t *testing.T) {
	couponRepo, _, _, _, _, _, r := setupSubTestEnv()

	// Seed Coupons
	// Valid
	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		Code:               "PROMO10",
		DiscountPercentage: 10,
		Status:             "active",
	})
	// Inactive
	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		Code:               "INACTIVE20",
		DiscountPercentage: 20,
		Status:             "inactive",
	})
	// Expired yesterday
	yesterday := time.Now().Add(-24 * time.Hour)
	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		Code:               "EXPIRED30",
		DiscountPercentage: 30,
		ExpiresAt:          &yesterday,
		Status:             "active",
	})
	// Exhausted
	maxUses := 2
	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		Code:               "HABIS50",
		DiscountPercentage: 50,
		MaxUses:            &maxUses,
		UsedCount:          2,
		Status:             "active",
	})

	cases := []struct {
		name       string
		code       string
		wantStatus int
		wantError  string
		wantValid  bool
	}{
		{"Not Found", "NOTFOUND", http.StatusBadRequest, "kode kupon tidak ditemukan", false},
		{"Inactive", "INACTIVE20", http.StatusBadRequest, "kupon sudah tidak aktif", false},
		{"Expired", "EXPIRED30", http.StatusBadRequest, "kupon sudah kedaluwarsa", false},
		{"Quota Exhausted", "HABIS50", http.StatusBadRequest, "kuota pemakaian kupon sudah habis", false},
		{"Valid", "PROMO10", http.StatusOK, "", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/dashboard/coupons/validate?code="+tc.code, nil)
			req.Header.Set("Authorization", "Bearer token-tenant-53")
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Fatalf("expected status %d, got %d. Body: %s", tc.wantStatus, w.Code, w.Body.String())
			}

			if tc.wantError != "" {
				if !strings.Contains(w.Body.String(), tc.wantError) {
					t.Fatalf("expected error '%s', got: %s", tc.wantError, w.Body.String())
				}
			}
			if tc.wantValid {
				var res map[string]interface{}
				_ = json.Unmarshal(w.Body.Bytes(), &res)
				if res["valid"] != true {
					t.Fatalf("expected valid=true, got: %v", res)
				}
			}
		})
	}
}

// 2. TestRenewalRequest_CreateInvoiceWithoutProof verifies that an invoice is created without requiring proof upfront
func TestRenewalRequest_CreateInvoiceWithoutProof(t *testing.T) {
	_, _, _, _, _, _, r := setupSubTestEnv()

	// Create request without proof_file for Plan 1 (Price: 1500000)
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("plan_id", "1")
	_ = writer.Close()

	req := httptest.NewRequest("POST", "/api/dashboard/subscription/renewal-request", body)
	req.Header.Set("Authorization", "Bearer token-tenant-53")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 when creating renewal invoice without proof, got %d. Body: %s", w.Code, w.Body.String())
	}

	var res struct {
		Message             string                          `json:"message"`
		PaymentVerification *repository.PaymentVerification `json:"payment_verification"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res.PaymentVerification == nil || res.PaymentVerification.ID == 0 {
		t.Fatalf("expected valid PaymentVerification with ID, got nil or 0")
	}
	if res.PaymentVerification.Status != "pending" {
		t.Errorf("expected status 'pending', got '%s'", res.PaymentVerification.Status)
	}
	if res.PaymentVerification.FinalAmount < 1500100 || res.PaymentVerification.FinalAmount > 1500999 {
		t.Errorf("expected final_amount between 1500100 and 1500999 (including unique code), got %f", res.PaymentVerification.FinalAmount)
	}
	if res.PaymentVerification.UniqueCode < 100 || res.PaymentVerification.UniqueCode > 999 {
		t.Errorf("expected unique_code between 100 and 999, got %d", res.PaymentVerification.UniqueCode)
	}

	// Now verify Tenant 53 can fetch the verification detail via GET /api/dashboard/subscription/payment-verifications/{id}
	getReq := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/subscription/payment-verifications/%d", res.PaymentVerification.ID), nil)
	getReq.Header.Set("Authorization", "Bearer token-tenant-53")
	getW := httptest.NewRecorder()
	r.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for tenant 53 fetching their invoice, got %d. Body: %s", getW.Code, getW.Body.String())
	}

	// Verify Tenant 78 CANNOT fetch Tenant 53's verification detail (cross-tenant isolation)
	crossGetReq := httptest.NewRequest("GET", fmt.Sprintf("/api/dashboard/subscription/payment-verifications/%d", res.PaymentVerification.ID), nil)
	crossGetReq.Header.Set("Authorization", "Bearer token-tenant-78")
	crossGetW := httptest.NewRecorder()
	r.ServeHTTP(crossGetW, crossGetReq)

	if crossGetW.Code != http.StatusNotFound {
		t.Fatalf("expected 404 NotFound for cross-tenant access, got %d. Body: %s", crossGetW.Code, crossGetW.Body.String())
	}
}

// 3. TestRenewalRequest_100PercentCouponZeroProof
func TestRenewalRequest_100PercentCouponZeroProof(t *testing.T) {
	couponRepo, _, _, _, _, _, r := setupSubTestEnv()

	// Create 100% coupon
	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		Code:               "FREE100",
		DiscountPercentage: 100,
		Status:             "active",
	})

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("plan_id", "1")
	_ = writer.WriteField("coupon_code", "FREE100")
	_ = writer.Close()

	req := httptest.NewRequest("POST", "/api/dashboard/subscription/renewal-request", body)
	req.Header.Set("Authorization", "Bearer token-tenant-53")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected status 201 for 100%% discount without proof, got %d. Body: %s", w.Code, w.Body.String())
	}

	var res struct {
		PaymentVerification repository.PaymentVerification `json:"payment_verification"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res.PaymentVerification.FinalAmount != 0 {
		t.Errorf("expected FinalAmount 0, got %f", res.PaymentVerification.FinalAmount)
	}
	if res.PaymentVerification.Status != "pending" {
		t.Errorf("expected Status 'pending', got %s", res.PaymentVerification.Status)
	}
	if res.PaymentVerification.ProofURL != nil {
		t.Errorf("expected ProofURL nil, got %v", *res.PaymentVerification.ProofURL)
	}
}

// 4. TestNonGreedyExpiryCalculation: checks non-greedy expiry extension on approval
func TestNonGreedyExpiryCalculation(t *testing.T) {
	couponRepo := newMockCouponRepo()
	pvRepo := newMockPVRepo()
	planRepo := newMockPricingPlanRepo()
	tenantRepo := newMockTenantRepoSub()

	planRepo.plans[1] = &repository.PricingPlan{
		ID:           1,
		Name:         "Paket 3 Bulan",
		PeriodMonths: 3,
		Price:        1000000,
	}

	couponService := service.NewCouponService(couponRepo)
	subService := service.NewSubscriptionService(pvRepo, couponRepo, couponService, planRepo, tenantRepo)

	// Scenario A: Tenant with future expiry (e.g. 30 days from now)
	futureExpiry := time.Now().Add(30 * 24 * time.Hour)
	tenantRepo.tenants[53] = &repository.Tenant{
		ID:                    53,
		Name:                  "Al-Barakah",
		Status:                "active",
		SubscriptionExpiresAt: &futureExpiry,
	}

	pvA := &repository.PaymentVerification{
		TenantID:         53,
		PlanID:           1,
		PlanPeriodMonths: 3,
		Amount:           1000000,
		FinalAmount:      1000000,
		Status:           "pending",
	}
	_ = pvRepo.Create(context.Background(), pvA)

	if err := subService.ApproveVerification(context.Background(), pvA.ID, 1); err != nil {
		t.Fatalf("failed to approve pvA: %v", err)
	}

	tenantA, _ := tenantRepo.GetByID(context.Background(), 53)
	expectedExpiryA := futureExpiry.AddDate(0, 3, 0)
	if tenantA.SubscriptionExpiresAt.Format("2006-01-02") != expectedExpiryA.Format("2006-01-02") {
		t.Errorf("Scenario A: expected expiry %s, got %s", expectedExpiryA.Format("2006-01-02"), tenantA.SubscriptionExpiresAt.Format("2006-01-02"))
	}

	// Scenario B: Tenant with past expiry (expired 10 days ago)
	pastExpiry := time.Now().Add(-10 * 24 * time.Hour)
	tenantRepo.tenants[78] = &repository.Tenant{
		ID:                    78,
		Name:                  "Nur Iman",
		Status:                "churned",
		SubscriptionExpiresAt: &pastExpiry,
	}

	pvB := &repository.PaymentVerification{
		TenantID:         78,
		PlanID:           1,
		PlanPeriodMonths: 3,
		Amount:           1000000,
		FinalAmount:      1000000,
		Status:           "pending",
	}
	_ = pvRepo.Create(context.Background(), pvB)

	if err := subService.ApproveVerification(context.Background(), pvB.ID, 1); err != nil {
		t.Fatalf("failed to approve pvB: %v", err)
	}

	tenantB, _ := tenantRepo.GetByID(context.Background(), 78)
	expectedExpiryB := time.Now().AddDate(0, 3, 0)
	if tenantB.SubscriptionExpiresAt.Format("2006-01-02") != expectedExpiryB.Format("2006-01-02") {
		t.Errorf("Scenario B: expected expiry %s, got %s", expectedExpiryB.Format("2006-01-02"), tenantB.SubscriptionExpiresAt.Format("2006-01-02"))
	}
	if tenantB.Status != "active" {
		t.Errorf("expected tenant status 'active', got %s", tenantB.Status)
	}
}

// 5. TestCouponAuditCountOnApprove: verify used_count increments and redemption is recorded
func TestCouponAuditCountOnApprove(t *testing.T) {
	couponRepo := newMockCouponRepo()
	pvRepo := newMockPVRepo()
	planRepo := newMockPricingPlanRepo()
	tenantRepo := newMockTenantRepoSub()

	planRepo.plans[1] = &repository.PricingPlan{
		ID:           1,
		PeriodMonths: 6,
		Price:        2000000,
	}
	tenantRepo.tenants[53] = &repository.Tenant{
		ID: 53,
	}

	_ = couponRepo.Create(context.Background(), &repository.Coupon{
		Code:               "PROMOAUDIT",
		DiscountPercentage: 20,
		Status:             "active",
		UsedCount:          0,
	})

	couponCode := "PROMOAUDIT"
	pv := &repository.PaymentVerification{
		TenantID:    53,
		PlanID:      1,
		CouponCode:  &couponCode,
		Amount:      2000000,
		FinalAmount: 1600000,
		Status:      "pending",
	}
	_ = pvRepo.Create(context.Background(), pv)

	subService := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)
	if err := subService.ApproveVerification(context.Background(), pv.ID, 1); err != nil {
		t.Fatalf("failed to approve: %v", err)
	}

	// Verify used_count incremented
	coupon, _ := couponRepo.FindByCode(context.Background(), "PROMOAUDIT")
	if coupon.UsedCount != 1 {
		t.Errorf("expected UsedCount 1, got %d", coupon.UsedCount)
	}

	// Verify redemption recorded
	if len(couponRepo.redemptions) != 1 {
		t.Fatalf("expected 1 redemption logged, got %d", len(couponRepo.redemptions))
	}
	if couponRepo.redemptions[0].CouponID != coupon.ID || couponRepo.redemptions[0].TenantID != 53 {
		t.Errorf("redemption record mismatch: %+v", couponRepo.redemptions[0])
	}
}

// 6. TestRejectVerification_ReasonMandatory: rejection_reason is mandatory
func TestRejectVerification_ReasonMandatory(t *testing.T) {
	_, pvRepo, _, _, _, _, r := setupSubTestEnv()

	pv := &repository.PaymentVerification{
		TenantID:    53,
		PlanID:      1,
		Amount:      1000000,
		FinalAmount: 1000000,
		Status:      "pending",
	}
	_ = pvRepo.Create(context.Background(), pv)

	// Attempt reject with empty reason
	body := bytes.NewBufferString(`{"rejection_reason": "   "}`)
	req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/staff/payment-verifications/%d/reject", pv.ID), body)
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty rejection reason, got %d. Body: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "alasan penolakan wajib diisi") {
		t.Fatalf("expected 'alasan penolakan wajib diisi', got: %s", w.Body.String())
	}

	// Attempt reject with valid reason
	bodyValid := bytes.NewBufferString(`{"rejection_reason": "Bukti transfer tidak terbaca / buram"}`)
	reqValid := httptest.NewRequest("PATCH", fmt.Sprintf("/api/staff/payment-verifications/%d/reject", pv.ID), bodyValid)
	reqValid.Header.Set("Authorization", "Bearer valid-staff-token")
	reqValid.Header.Set("Content-Type", "application/json")
	wValid := httptest.NewRecorder()

	r.ServeHTTP(wValid, reqValid)

	if wValid.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid rejection, got %d. Body: %s", wValid.Code, wValid.Body.String())
	}

	updated, _ := pvRepo.GetByID(context.Background(), pv.ID)
	if updated.Status != "rejected" {
		t.Errorf("expected status 'rejected', got %s", updated.Status)
	}
	if updated.RejectionReason == nil || *updated.RejectionReason != "Bukti transfer tidak terbaca / buram" {
		t.Errorf("rejection reason not saved correctly: %v", updated.RejectionReason)
	}
}

// 7. TestTenantIsolation_SubscriptionHistory: Tenant A never sees Tenant B's data
func TestTenantIsolation_SubscriptionHistory(t *testing.T) {
	_, pvRepo, _, _, _, _, r := setupSubTestEnv()

	// Seed PV for Tenant 53
	pv53 := &repository.PaymentVerification{
		TenantID:    53,
		PlanID:      1,
		Amount:      1000000,
		FinalAmount: 1000000,
		Status:      "approved",
	}
	_ = pvRepo.Create(context.Background(), pv53)

	// Seed PV for Tenant 78
	pv78 := &repository.PaymentVerification{
		TenantID:    78,
		PlanID:      2,
		Amount:      2000000,
		FinalAmount: 2000000,
		Status:      "pending",
	}
	_ = pvRepo.Create(context.Background(), pv78)

	// Request as Tenant 53
	req53 := httptest.NewRequest("GET", "/api/dashboard/subscription", nil)
	req53.Header.Set("Authorization", "Bearer token-tenant-53")
	w53 := httptest.NewRecorder()
	r.ServeHTTP(w53, req53)

	if w53.Code != http.StatusOK {
		t.Fatalf("expected 200 for tenant 53, got %d", w53.Code)
	}

	var res53 struct {
		TenantID             uint64                           `json:"tenant_id"`
		PaymentVerifications []repository.PaymentVerification `json:"payment_verifications"`
	}
	_ = json.Unmarshal(w53.Body.Bytes(), &res53)

	if res53.TenantID != 53 {
		t.Errorf("expected TenantID 53, got %d", res53.TenantID)
	}
	if len(res53.PaymentVerifications) != 1 {
		t.Fatalf("expected exactly 1 payment verification for Tenant 53, got %d", len(res53.PaymentVerifications))
	}
	if res53.PaymentVerifications[0].ID != pv53.ID {
		t.Errorf("expected PV ID %d for Tenant 53, got %d", pv53.ID, res53.PaymentVerifications[0].ID)
	}
	if res53.PaymentVerifications[0].Amount != 1000000 {
		t.Errorf("expected amount 1000000 for Tenant 53, got %.0f", res53.PaymentVerifications[0].Amount)
	}
	for _, v := range res53.PaymentVerifications {
		if v.TenantID != 53 {
			t.Fatalf("CROSS-TENANT LEAK: Tenant 53 saw verification for Tenant %d (ID=%d)", v.TenantID, v.ID)
		}
	}

	// Request as Tenant 78
	req78 := httptest.NewRequest("GET", "/api/dashboard/subscription", nil)
	req78.Header.Set("Authorization", "Bearer token-tenant-78")
	w78 := httptest.NewRecorder()
	r.ServeHTTP(w78, req78)

	if w78.Code != http.StatusOK {
		t.Fatalf("expected 200 for tenant 78, got %d", w78.Code)
	}

	var res78 struct {
		TenantID             uint64                           `json:"tenant_id"`
		PaymentVerifications []repository.PaymentVerification `json:"payment_verifications"`
	}
	_ = json.Unmarshal(w78.Body.Bytes(), &res78)

	if res78.TenantID != 78 {
		t.Errorf("expected TenantID 78, got %d", res78.TenantID)
	}
	if len(res78.PaymentVerifications) != 1 {
		t.Fatalf("expected exactly 1 payment verification for Tenant 78, got %d", len(res78.PaymentVerifications))
	}
	if res78.PaymentVerifications[0].ID != pv78.ID {
		t.Errorf("expected PV ID %d for Tenant 78, got %d", pv78.ID, res78.PaymentVerifications[0].ID)
	}
	if res78.PaymentVerifications[0].Amount != 2000000 {
		t.Errorf("expected amount 2000000 for Tenant 78, got %.0f", res78.PaymentVerifications[0].Amount)
	}
	for _, v := range res78.PaymentVerifications {
		if v.TenantID != 78 {
			t.Fatalf("CROSS-TENANT LEAK: Tenant 78 saw verification for Tenant %d (ID=%d)", v.TenantID, v.ID)
		}
	}
}

// 8. TestStaffSecurity_RejectsTenantAndUnauthTokens
func TestStaffSecurity_RejectsTenantAndUnauthTokens(t *testing.T) {
	_, _, _, _, _, _, r := setupSubTestEnv()

	protectedEndpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/staff/coupons"},
		{"POST", "/api/staff/coupons"},
		{"GET", "/api/staff/payment-verifications"},
		{"PATCH", "/api/staff/payment-verifications/1/approve"},
	}

	for _, ep := range protectedEndpoints {
		t.Run(ep.method+" "+ep.path+" - No Token", func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized for no token, got %d", w.Code)
			}
		})

		t.Run(ep.method+" "+ep.path+" - Invalid Token", func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Authorization", "Bearer invalid-random-token")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401 Unauthorized for invalid token, got %d", w.Code)
			}
		})

		t.Run(ep.method+" "+ep.path+" - Tenant Token", func(t *testing.T) {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			req.Header.Set("Authorization", "Bearer token-tenant-53")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusForbidden {
				t.Fatalf("expected 403 Forbidden when accessing staff route with valid tenant token, got %d", w.Code)
			}
		})
	}
}

// 9. TestSubscription_H30_AutoInvoiceAndGracePeriod
func TestSubscription_H30_AutoInvoiceAndGracePeriod(t *testing.T) {
	_, pvRepo, planRepo, tenantRepo, _, _, _ := setupSubTestEnv()

	// Tenant 60: Expiring in 20 days (<= 30 days) -> ShouldShowRenewalInvoice = true, IsSuspended = false
	expiry20Days := time.Now().AddDate(0, 0, 20)
	tenantRepo.tenants[60] = &repository.Tenant{
		ID:                    60,
		Name:                  "Travel H-20",
		Slug:                  "travel-h20",
		Status:                "active",
		SubscriptionExpiresAt: &expiry20Days,
	}

	// Tenant 61: Expired 3 days ago (within 7 days grace period) -> ShouldShowRenewalInvoice = true, GracePeriodDaysRemaining > 0, IsSuspended = false
	expired3Days := time.Now().AddDate(0, 0, -3)
	tenantRepo.tenants[61] = &repository.Tenant{
		ID:                    61,
		Name:                  "Travel Expired 3 Days",
		Slug:                  "travel-exp3",
		Status:                "active",
		SubscriptionExpiresAt: &expired3Days,
	}

	// Tenant 62: Expired 10 days ago (> 7 days grace period) -> IsSuspended = true, GracePeriodDaysRemaining = 0
	expired10Days := time.Now().AddDate(0, 0, -10)
	tenantRepo.tenants[62] = &repository.Tenant{
		ID:                    62,
		Name:                  "Travel Expired 10 Days",
		Slug:                  "travel-exp10",
		Status:                "active",
		SubscriptionExpiresAt: &expired10Days,
	}

	// Tenant 63: Expiring in 60 days (> 30 days) -> ShouldShowRenewalInvoice = false
	expiry60Days := time.Now().AddDate(0, 0, 60)
	tenantRepo.tenants[63] = &repository.Tenant{
		ID:                    63,
		Name:                  "Travel Safe",
		Slug:                  "travel-safe",
		Status:                "active",
		SubscriptionExpiresAt: &expiry60Days,
	}

	subService := service.NewSubscriptionService(pvRepo, nil, nil, planRepo, tenantRepo)

	// Check Tenant 60 (H-20)
	info60, err := subService.GetSubscriptionInfo(context.Background(), 60)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !info60.ShouldShowRenewalInvoice {
		t.Errorf("expected ShouldShowRenewalInvoice=true for H-20 tenant")
	}
	if info60.IsSuspended {
		t.Errorf("expected IsSuspended=false for active H-20 tenant")
	}

	// Check Tenant 61 (Expired 3 days ago, in grace period)
	info61, err := subService.GetSubscriptionInfo(context.Background(), 61)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !info61.ShouldShowRenewalInvoice {
		t.Errorf("expected ShouldShowRenewalInvoice=true for expired tenant")
	}
	if info61.IsSuspended {
		t.Errorf("expected IsSuspended=false for tenant within 7 days grace period")
	}
	if info61.GracePeriodDaysRemaining <= 0 {
		t.Errorf("expected GracePeriodDaysRemaining > 0 for tenant expired 3 days ago")
	}

	// Check Tenant 62 (Expired 10 days ago, grace period ended)
	info62, err := subService.GetSubscriptionInfo(context.Background(), 62)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !info62.IsSuspended {
		t.Errorf("expected IsSuspended=true for tenant expired 10 days ago")
	}
	if info62.GracePeriodDaysRemaining != 0 {
		t.Errorf("expected GracePeriodDaysRemaining=0, got %d", info62.GracePeriodDaysRemaining)
	}

	// Check Tenant 63 (> 30 days)
	info63, err := subService.GetSubscriptionInfo(context.Background(), 63)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info63.ShouldShowRenewalInvoice {
		t.Errorf("expected ShouldShowRenewalInvoice=false for tenant with 60 days remaining")
	}
}

// 10. TestSubscription_RenewalRequest_Deduplication
func TestSubscription_RenewalRequest_Deduplication(t *testing.T) {
	_, pvRepo, planRepo, tenantRepo, _, _, _ := setupSubTestEnv()

	tenantRepo.tenants[77] = &repository.Tenant{
		ID:     77,
		Name:   "Travel Renewal Dedup",
		Slug:   "travel-dedup",
		Status: "active",
	}

	subService := service.NewSubscriptionService(pvRepo, nil, nil, planRepo, tenantRepo)

	// First renewal request (Plan 1)
	proof1 := "/uploads/77/subscription-proofs/proof1.webp"
	pv1, err := subService.CreateRenewalRequest(context.Background(), 77, 1, nil, &proof1)
	if err != nil {
		t.Fatalf("unexpected error on first renewal: %v", err)
	}
	if pv1.ID == 0 || pv1.Status != "pending" {
		t.Fatalf("expected pv1 to have valid ID and pending status")
	}

	// Second renewal request (change to Plan 2 with new proof)
	proof2 := "/uploads/77/subscription-proofs/proof2.webp"
	pv2, err := subService.CreateRenewalRequest(context.Background(), 77, 2, nil, &proof2)
	if err != nil {
		t.Fatalf("unexpected error on second renewal: %v", err)
	}

	// Must update the existing pending row instead of creating a second row
	if pv2.ID != pv1.ID {
		t.Errorf("expected deduplication to reuse ID %d, got %d", pv1.ID, pv2.ID)
	}
	if pv2.PlanID != 2 {
		t.Errorf("expected updated PlanID to be 2, got %d", pv2.PlanID)
	}

	// Total pending records in repository for tenant 77 must be exactly 1
	list, _ := pvRepo.ListByTenant(context.Background(), 77)
	if len(list) != 1 {
		t.Errorf("expected exactly 1 verification record in repo, got %d", len(list))
	}
}

func TestUpdateVerificationPlan_StaffUpsell(t *testing.T) {
	_, pvRepo, _, tenantRepo, _, _, r := setupSubTestEnv()

	tenantRepo.tenants[88] = &repository.Tenant{
		ID:     88,
		Name:   "Travel Upsell Test",
		Slug:   "travel-upsell",
		Status: "pending",
	}

	// Create initial pending verification for Plan 1
	pv := &repository.PaymentVerification{
		TenantID:    88,
		PlanID:      1,
		Amount:      1500000,
		FinalAmount: 1500321,
		UniqueCode:  321,
		Status:      "pending",
	}
	if err := pvRepo.Create(context.Background(), pv); err != nil {
		t.Fatalf("failed to create pv: %v", err)
	}

	// 1. Staff changes plan to Plan 2 (6 months upsell)
	body, _ := json.Marshal(map[string]interface{}{
		"plan_id": 2,
	})
	req := httptest.NewRequest("PATCH", fmt.Sprintf("/api/staff/payment-verifications/%d/plan", pv.ID), bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer valid-staff-token")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200 on plan update, got %d: %s", w.Code, w.Body.String())
	}

	// Verify in repo that plan_id is 2, amount is 2.700.000, unique_code is 321, final_amount is 2.700.321
	updated, err := pvRepo.GetByID(context.Background(), pv.ID)
	if err != nil {
		t.Fatalf("failed to get updated pv: %v", err)
	}
	if updated.PlanID != 2 {
		t.Errorf("expected PlanID 2, got %d", updated.PlanID)
	}
	if updated.Amount != 2700000 {
		t.Errorf("expected Amount 2700000, got %v", updated.Amount)
	}
	if updated.UniqueCode != 321 {
		t.Errorf("expected UniqueCode 321 preserved, got %d", updated.UniqueCode)
	}
	if updated.FinalAmount != 2700321 {
		t.Errorf("expected FinalAmount 2700321, got %v", updated.FinalAmount)
	}

	// 2. Staff approves the payment verification
	appReq := httptest.NewRequest("PATCH", fmt.Sprintf("/api/staff/payment-verifications/%d/approve", pv.ID), nil)
	appReq.Header.Set("Authorization", "Bearer valid-staff-token")
	appW := httptest.NewRecorder()
	r.ServeHTTP(appW, appReq)

	if appW.Code != http.StatusOK {
		t.Fatalf("expected status 200 on approve, got %d: %s", appW.Code, appW.Body.String())
	}

	// Tenant should now be active and current plan should be 2
	tenant := tenantRepo.tenants[88]
	if tenant.Status != "active" {
		t.Errorf("expected tenant status active, got %s", tenant.Status)
	}
	if tenant.CurrentPlanID == nil || *tenant.CurrentPlanID != 2 {
		t.Errorf("expected tenant current plan 2, got %v", tenant.CurrentPlanID)
	}

	// 3. Attempting to change plan after approval must fail (400)
	failReq := httptest.NewRequest("PATCH", fmt.Sprintf("/api/staff/payment-verifications/%d/plan", pv.ID), bytes.NewReader(body))
	failReq.Header.Set("Authorization", "Bearer valid-staff-token")
	failW := httptest.NewRecorder()
	r.ServeHTTP(failW, failReq)

	if failW.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 when changing plan of approved pv, got %d", failW.Code)
	}
}

