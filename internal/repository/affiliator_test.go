package repository_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// Affiliator KlikUmroh against the real database: attribution, commissions, isolation between
// affiliators (also through HTTP), payouts, and coupons. All rows are removed when the test ends.
func TestAffiliator_Program(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	settingsRepo := repository.NewPlatformSettingsRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	svc := service.NewAffiliatorService(affRepo, couponRepo, pvRepo, settingsRepo)

	// Pin the program settings for this test and restore the real values afterwards.
	original, err := svc.GetSettings(ctx)
	if err != nil {
		t.Fatalf("GetSettings: %v", err)
	}
	t.Cleanup(func() { _, _ = svc.UpdateSettings(context.Background(), *original) })
	if _, err := svc.UpdateSettings(ctx, service.AffiliatorSettings{FirstRate: 30, RenewalRate: 10, CouponDiscount: 20, HoldDays: 14, MinPayout: 100000}); err != nil {
		t.Fatalf("UpdateSettings: %v", err)
	}

	plan := &repository.PricingPlan{Name: fmt.Sprintf("Plan aff test %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("create plan: %v", err)
	}
	// Registered before the tenants so it runs after their cleanup (payment_verifications reference the plan).
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM pricing_plans WHERE id = ?", plan.ID) })

	var affiliatorIDs []uint64
	t.Cleanup(func() {
		for _, id := range affiliatorIDs {
			_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", id)
		}
	})
	register := func(label, wa string) *service.AffiliatorLoginResult {
		t.Helper()
		res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{
			Name: "Affiliator " + label, Email: fmt.Sprintf("aff-%s-%d@klikumroh.test", label, time.Now().UnixNano()),
			Password: "rahasia-test-123", WhatsApp: wa,
		})
		if err != nil {
			t.Fatalf("register %s: %v", label, err)
		}
		affiliatorIDs = append(affiliatorIDs, res.Affiliator.ID)
		return res
	}
	affA := register("a", "")
	affB := register("b", "")
	affSelf := register("self", fmt.Sprintf("0812%08d", time.Now().UnixNano()%100000000))

	couponB, err := svc.SetCoupon(ctx, affB.Affiliator.ID, fmt.Sprintf("BTEST%d", time.Now().UnixNano()%1000000))
	if err != nil {
		t.Fatalf("SetCoupon B: %v", err)
	}

	tenantLink := createDummyTenant(t, ctx, tenantRepo, "aff-link")
	tenantCoupon := createDummyTenant(t, ctx, tenantRepo, "aff-coupon")
	tenantSelf := createDummyTenant(t, ctx, tenantRepo, "aff-self")
	tenantNone := createDummyTenant(t, ctx, tenantRepo, "aff-none")

	t.Run("Attribution: link, coupon wins over link, no self-referral, set once", func(t *testing.T) {
		svc.AttributeSignup(ctx, tenantLink.ID, "", affA.Affiliator.LinkCode, "travel-link@klikumroh.test", "", "")
		svc.AttributeSignup(ctx, tenantCoupon.ID, couponB.Code, affA.Affiliator.LinkCode, "travel-coupon@klikumroh.test", "", "")
		svc.AttributeSignup(ctx, tenantSelf.ID, "", affSelf.Affiliator.LinkCode, "someone@klikumroh.test", *affSelf.Affiliator.WhatsApp, "")
		svc.AttributeSignup(ctx, tenantNone.ID, "", "", "nobody@klikumroh.test", "", "")
		// A second attribution never moves a travel to another affiliator.
		svc.AttributeSignup(ctx, tenantLink.ID, couponB.Code, "", "travel-link@klikumroh.test", "", "")

		check := func(tenantID uint64, wantAffiliator uint64) {
			t.Helper()
			a, err := affRepo.TenantAffiliator(ctx, tenantID)
			if wantAffiliator == 0 {
				if !errors.Is(err, repository.ErrNotFound) {
					t.Fatalf("tenant %d: expected no affiliator, got %+v err=%v", tenantID, a, err)
				}
				return
			}
			if err != nil || a.ID != wantAffiliator {
				t.Fatalf("tenant %d: expected affiliator %d, got %+v err=%v", tenantID, wantAffiliator, a, err)
			}
		}
		check(tenantLink.ID, affA.Affiliator.ID)
		check(tenantCoupon.ID, affB.Affiliator.ID)
		check(tenantSelf.ID, 0)
		check(tenantNone.ID, 0)
	})

	approve := func(tenantID uint64, finalAmount float64, uniqueCode int) *repository.PaymentVerification {
		t.Helper()
		pv := &repository.PaymentVerification{TenantID: tenantID, PlanID: plan.ID, Amount: plan.Price,
			FinalAmount: finalAmount, UniqueCode: uniqueCode, Status: "pending"}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("create pv: %v", err)
		}
		now := time.Now()
		if err := pvRepo.TransitionStatus(ctx, pv.ID, "pending", "approved", nil, nil, &now); err != nil {
			t.Fatalf("approve pv: %v", err)
		}
		pv.Status = "approved"
		svc.RecordCommission(ctx, pv, now)
		return pv
	}

	t.Run("Commission: first 30%, renewal 10%, base without unique code, once per payment", func(t *testing.T) {
		first := approve(tenantLink.ID, 1200000+345, 345) // 1.2jt after discount + unique code
		svc.RecordCommission(ctx, first, time.Now())       // duplicate call: still one commission
		approve(tenantLink.ID, 1500000+111, 111)
		approve(tenantNone.ID, 1500000+222, 222) // no affiliator: no commission

		list, err := svc.ListCommissions(ctx, affA.Affiliator.ID)
		if err != nil {
			t.Fatalf("ListCommissions: %v", err)
		}
		if len(list) != 2 {
			t.Fatalf("expected 2 commissions for A, got %d", len(list))
		}
		byKind := map[string]repository.AffiliatorCommission{}
		for _, c := range list {
			byKind[c.Kind] = c
		}
		if c := byKind["first"]; c.BaseAmount != 1200000 || c.Rate != 30 || c.Amount != 360000 {
			t.Fatalf("first commission wrong: %+v", c)
		}
		if c := byKind["renewal"]; c.BaseAmount != 1500000 || c.Rate != 10 || c.Amount != 150000 {
			t.Fatalf("renewal commission wrong: %+v", c)
		}
		if d := time.Until(byKind["first"].AvailableAt); d < 13*24*time.Hour || d > 15*24*time.Hour {
			t.Fatalf("expected commission held ~14 days, available in %v", d)
		}
	})

	t.Run("Per-affiliator override rate", func(t *testing.T) {
		first, renewal := 40.0, 15.0
		if err := svc.SetRates(ctx, affB.Affiliator.ID, &first, &renewal); err != nil {
			t.Fatalf("SetRates: %v", err)
		}
		approve(tenantCoupon.ID, 1000000+500, 500)
		list, _ := svc.ListCommissions(ctx, affB.Affiliator.ID)
		if len(list) != 1 || list[0].Rate != 40 || list[0].Amount != 400000 {
			t.Fatalf("expected one 40%% commission of 400000 for B, got %+v", list)
		}
	})

	// HTTP: affiliator portal behind its own middleware, staff and travel routes behind theirs.
	r := chi.NewRouter()
	h := handler.NewAffiliatorHandler(svc)
	h.RegisterPublicRoutes(r)
	r.Group(func(g chi.Router) {
		g.Use(middleware.AffiliatorAuthMiddleware(affRepo))
		h.RegisterProtectedRoutes(g)
	})
	r.Group(func(g chi.Router) {
		g.Use(middleware.StaffAuthMiddleware(staffRepo, sessionRepo))
		h.RegisterStaffRoutes(g)
	})
	r.Group(func(g chi.Router) {
		g.Use(middleware.AuthMiddleware(sessionRepo))
		g.Get("/api/dashboard/ping", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	})
	get := func(path, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	t.Run("Isolation: an affiliator only sees its own travels and commissions", func(t *testing.T) {
		var tenants struct {
			Tenants []repository.AffiliatorTenant `json:"tenants"`
		}
		w := get("/api/affiliator/tenants", affA.Token)
		if w.Code != http.StatusOK {
			t.Fatalf("A tenants: %d %s", w.Code, w.Body.String())
		}
		_ = json.Unmarshal(w.Body.Bytes(), &tenants)
		if len(tenants.Tenants) != 1 || tenants.Tenants[0].TenantID != tenantLink.ID {
			t.Fatalf("CROSS-AFFILIATOR LEAK: A should see only tenant %d, got %+v", tenantLink.ID, tenants.Tenants)
		}

		var comms struct {
			Commissions []repository.AffiliatorCommission `json:"commissions"`
		}
		w = get("/api/affiliator/commissions", affB.Token)
		_ = json.Unmarshal(w.Body.Bytes(), &comms)
		for _, c := range comms.Commissions {
			if c.AffiliatorID != affB.Affiliator.ID || c.TenantID == tenantLink.ID {
				t.Fatalf("CROSS-AFFILIATOR LEAK: B received commission %+v", c)
			}
		}
		if len(comms.Commissions) != 1 {
			t.Fatalf("expected 1 commission for B, got %d", len(comms.Commissions))
		}
	})

	t.Run("Isolation: tokens only open their own portal", func(t *testing.T) {
		if w := get("/api/staff/affiliators", affA.Token); w.Code != http.StatusUnauthorized {
			t.Fatalf("SECURITY VIOLATION: affiliator token on staff endpoint returned %d", w.Code)
		}
		if w := get("/api/dashboard/ping", affA.Token); w.Code != http.StatusUnauthorized {
			t.Fatalf("SECURITY VIOLATION: affiliator token on travel dashboard returned %d", w.Code)
		}
		if w := get("/api/affiliator/me", "not-a-token"); w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for unknown token, got %d", w.Code)
		}
	})

	t.Run("Logout ends only that session, on the server", func(t *testing.T) {
		second, err := svc.Login(ctx, affA.Affiliator.Email, "rahasia-test-123", "")
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		if w := get("/api/affiliator/me", second.Token); w.Code != http.StatusOK {
			t.Fatalf("token before logout: expected 200, got %d", w.Code)
		}
		req := httptest.NewRequest(http.MethodPost, "/api/affiliator/logout", nil)
		req.Header.Set("Authorization", "Bearer "+second.Token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("logout: expected 200, got %d", w.Code)
		}
		if w := get("/api/affiliator/me", second.Token); w.Code != http.StatusUnauthorized {
			t.Fatalf("copied token after logout: expected 401, got %d", w.Code)
		}
		if w := get("/api/affiliator/me", affA.Token); w.Code != http.StatusOK {
			t.Fatalf("other session of the same affiliator must stay valid, got %d", w.Code)
		}
	})

	t.Run("Payout: held commissions wait, request claims only own, reject releases, paid closes", func(t *testing.T) {
		staff := &repository.StaffUser{Name: "Staff aff test", Email: fmt.Sprintf("staff-aff-%d@klikumroh.test", time.Now().UnixNano()),
			PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
		if err := staffRepo.Create(ctx, staff); err != nil {
			t.Fatalf("create staff: %v", err)
		}
		t.Cleanup(func() { _, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID) })
		if err := svc.UpdateBank(ctx, affA.Affiliator.ID, service.AffiliatorBankRequest{
			BankName: "BSI", BankAccountNumber: "123", BankAccountHolder: "Affiliator A"}); err != nil {
			t.Fatalf("UpdateBank: %v", err)
		}
		if _, err := svc.RequestPayout(ctx, affA.Affiliator.ID); !errors.Is(err, repository.ErrPayoutBelowMinimum) {
			t.Fatalf("expected held commissions to block payout, got %v", err)
		}

		later := time.Now().Add(15 * 24 * time.Hour)
		p, err := affRepo.RequestPayout(ctx, affA.Affiliator.ID, 100000, later, "BSI", "123", "Affiliator A")
		if err != nil {
			t.Fatalf("RequestPayout: %v", err)
		}
		if p.Amount != 510000 {
			t.Fatalf("expected payout of A's 360000+150000, got %v", p.Amount)
		}
		if _, err := affRepo.RequestPayout(ctx, affA.Affiliator.ID, 100000, later, "BSI", "123", "Affiliator A"); !errors.Is(err, repository.ErrPayoutPending) {
			t.Fatalf("expected second request to be refused while one is pending, got %v", err)
		}
		balB, _ := affRepo.Balance(ctx, affB.Affiliator.ID, later)
		if balB.Available != 400000 || balB.Requested != 0 {
			t.Fatalf("CROSS-AFFILIATOR LEAK: A's payout touched B's balance: %+v", balB)
		}

		if err := svc.RejectPayout(ctx, p.ID, staff.ID, "Rekening tidak cocok"); err != nil {
			t.Fatalf("RejectPayout: %v", err)
		}
		bal, _ := affRepo.Balance(ctx, affA.Affiliator.ID, later)
		if bal.Available != 510000 || bal.Requested != 0 {
			t.Fatalf("expected rejected payout to return 510000 to available, got %+v", bal)
		}

		p2, err := affRepo.RequestPayout(ctx, affA.Affiliator.ID, 100000, later, "BSI", "123", "Affiliator A")
		if err != nil {
			t.Fatalf("RequestPayout again: %v", err)
		}
		if err := svc.MarkPayoutPaid(ctx, p2.ID, staff.ID); err != nil {
			t.Fatalf("MarkPayoutPaid: %v", err)
		}
		if err := svc.MarkPayoutPaid(ctx, p2.ID, staff.ID); !errors.Is(err, repository.ErrStatusConflict) {
			t.Fatalf("expected paying twice to conflict, got %v", err)
		}
		bal, _ = affRepo.Balance(ctx, affA.Affiliator.ID, later)
		if bal.Paid != 510000 || bal.Available != 0 {
			t.Fatalf("expected 510000 paid, got %+v", bal)
		}
	})

	t.Run("Coupon: one active per affiliator, codes unique, discount follows settings", func(t *testing.T) {
		code1 := fmt.Sprintf("AONE%d", time.Now().UnixNano()%1000000)
		code2 := fmt.Sprintf("ATWO%d", time.Now().UnixNano()%1000000)
		if _, err := svc.SetCoupon(ctx, affA.Affiliator.ID, code1); err != nil {
			t.Fatalf("SetCoupon 1: %v", err)
		}
		if _, err := svc.SetCoupon(ctx, affA.Affiliator.ID, code2); err != nil {
			t.Fatalf("SetCoupon 2: %v", err)
		}
		old, _ := couponRepo.FindByCode(ctx, code1)
		if old == nil || old.Status != "inactive" {
			t.Fatalf("expected the replaced coupon to be inactive, got %+v", old)
		}
		if _, err := svc.SetCoupon(ctx, affA.Affiliator.ID, couponB.Code); !errors.Is(err, service.ErrAffiliatorCouponTaken) {
			t.Fatalf("expected B's code to be refused for A, got %v", err)
		}
		if _, err := svc.SetCoupon(ctx, affA.Affiliator.ID, "ab"); !errors.Is(err, service.ErrAffiliatorCouponFormat) {
			t.Fatalf("expected format error, got %v", err)
		}
		if _, err := svc.UpdateSettings(ctx, service.AffiliatorSettings{FirstRate: 30, RenewalRate: 10, CouponDiscount: 25, HoldDays: 14, MinPayout: 100000}); err != nil {
			t.Fatalf("UpdateSettings: %v", err)
		}
		active, _ := couponRepo.FindByCode(ctx, code2)
		if active == nil || active.DiscountPercentage != 25 {
			t.Fatalf("expected active affiliator coupon to follow the 25%% setting, got %+v", active)
		}
		staffList, _ := couponRepo.List(ctx)
		for _, c := range staffList {
			if c.AffiliatorID != nil {
				t.Fatalf("affiliator coupon %s must not appear in the staff coupon list", c.Code)
			}
		}
	})

	t.Run("Inactive affiliator: cannot log in, coupon off, no new commission", func(t *testing.T) {
		if err := svc.SetStatus(ctx, affB.Affiliator.ID, "inactive"); err != nil {
			t.Fatalf("SetStatus: %v", err)
		}
		if w := get("/api/affiliator/me", affB.Token); w.Code != http.StatusUnauthorized {
			t.Fatalf("expected inactive affiliator session to be refused, got %d", w.Code)
		}
		c, _ := couponRepo.FindByCode(ctx, couponB.Code)
		if c == nil || c.Status != "inactive" {
			t.Fatalf("expected B's coupon inactive, got %+v", c)
		}
		approve(tenantCoupon.ID, 1000000+600, 600)
		list, _ := svc.ListCommissions(ctx, affB.Affiliator.ID)
		if len(list) != 1 {
			t.Fatalf("expected no new commission for inactive B, got %d", len(list))
		}
		var body bytes.Buffer
		_ = json.NewEncoder(&body).Encode(map[string]string{"email": affB.Affiliator.Email, "password": "rahasia-test-123"})
		req := httptest.NewRequest(http.MethodPost, "/api/affiliator/login", &body)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected inactive affiliator login to fail, got %d", w.Code)
		}
	})
}

// The real approval path records the commission, and a renewal cannot use an affiliator coupon.
func TestAffiliator_ApprovalHookAndRenewalCoupon(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	settingsRepo := repository.NewPlatformSettingsRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	affSvc := service.NewAffiliatorService(affRepo, couponRepo, pvRepo, settingsRepo)
	subSvc := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)
	rec, ok := subSvc.(interface {
		SetAffiliatorRecorder(service.AffiliatorCommissionRecorder)
	})
	if !ok {
		t.Fatal("subscription service does not accept an affiliator recorder")
	}
	rec.SetAffiliatorRecorder(affSvc)

	plan := &repository.PricingPlan{Name: fmt.Sprintf("Plan aff hook %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("create plan: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM pricing_plans WHERE id = ?", plan.ID) })

	staff := &repository.StaffUser{Name: "Staff aff hook", Email: fmt.Sprintf("staff-affhook-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
	if err := staffRepo.Create(ctx, staff); err != nil {
		t.Fatalf("create staff: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID) })

	aff, err := affSvc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator hook",
		Email: fmt.Sprintf("aff-hook-%d@klikumroh.test", time.Now().UnixNano()), Password: "rahasia-test-123"})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", aff.Affiliator.ID)
		_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", aff.Affiliator.ID)
	})
	coupon, err := affSvc.SetCoupon(ctx, aff.Affiliator.ID, fmt.Sprintf("HOOK%d", time.Now().UnixNano()%1000000))
	if err != nil {
		t.Fatalf("SetCoupon: %v", err)
	}

	tenant := createDummyTenant(t, ctx, tenantRepo, "aff-hook")
	affSvc.AttributeSignup(ctx, tenant.ID, coupon.Code, "", "travel-hook@klikumroh.test", "", "")

	proofURL := "/uploads/test/proof.webp"
	pv := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: plan.Price,
		FinalAmount: 1200000 + 250, UniqueCode: 250, Status: "pending", CouponCode: &coupon.Code, ProofURL: &proofURL}
	if err := pvRepo.Create(ctx, pv); err != nil {
		t.Fatalf("create pv: %v", err)
	}

	t.Run("ApproveVerification records the first-payment commission", func(t *testing.T) {
		if err := subSvc.ApproveVerification(ctx, pv.ID, staff.ID); err != nil {
			t.Fatalf("ApproveVerification: %v", err)
		}
		list, err := affSvc.ListCommissions(ctx, aff.Affiliator.ID)
		if err != nil {
			t.Fatalf("ListCommissions: %v", err)
		}
		if len(list) != 1 || list[0].PaymentVerificationID != pv.ID || list[0].Kind != "first" || list[0].BaseAmount != 1200000 {
			t.Fatalf("expected one first commission on base 1200000 for payment %d, got %+v", pv.ID, list)
		}
	})

	t.Run("Renewal request refuses an affiliator coupon", func(t *testing.T) {
		code := coupon.Code
		if _, err := subSvc.CreateRenewalRequest(ctx, tenant.ID, plan.ID, &code, nil); !errors.Is(err, service.ErrAffiliatorCouponSignupOnly) {
			t.Fatalf("expected ErrAffiliatorCouponSignupOnly, got %v", err)
		}
	})
}

// The public program page reads the published terms without any login.
func TestAffiliator_PublicProgram(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	svc := service.NewAffiliatorService(repository.NewAffiliatorRepository(db), repository.NewCouponRepository(db),
		repository.NewPaymentVerificationRepository(db), repository.NewPlatformSettingsRepository(db))
	r := chi.NewRouter()
	handler.NewAffiliatorHandler(svc).RegisterPublicRoutes(r)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/public/affiliator-program", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 without login, got %d", w.Code)
	}
	var got service.AffiliatorSettings
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("parse: %v", err)
	}
	want, _ := svc.GetSettings(context.Background())
	if got != *want {
		t.Fatalf("public program %+v differs from settings %+v", got, *want)
	}
}

// Staff reset a forgotten password: the new one works, the old one and every old session stop working,
// and only staff can call it.
func TestAffiliator_StaffResetPassword(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db),
		repository.NewPaymentVerificationRepository(db), repository.NewPlatformSettingsRepository(db))

	res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator reset",
		Email: fmt.Sprintf("aff-reset-%d@klikumroh.test", time.Now().UnixNano()), Password: "sandi-lama-123"})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", res.Affiliator.ID) })

	r := chi.NewRouter()
	r.Group(func(g chi.Router) {
		g.Use(middleware.StaffAuthMiddleware(repository.NewStaffRepository(db), repository.NewSessionRepository(db)))
		handler.NewAffiliatorHandler(svc).RegisterStaffRoutes(g)
	})
	body, _ := json.Marshal(map[string]string{"new_password": "sandi-baru-456"})
	req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/staff/affiliators/%d/password", res.Affiliator.ID), bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+res.Token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("SECURITY VIOLATION: affiliator token reset a password through the staff endpoint (%d)", w.Code)
	}

	if err := svc.ResetPassword(ctx, res.Affiliator.ID, "pendek", 0); !errors.Is(err, service.ErrPasswordTooShort) {
		t.Fatalf("expected short password to be refused, got %v", err)
	}
	if err := svc.ResetPassword(ctx, res.Affiliator.ID, "sandi-baru-456", 0); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	if _, _, err := affRepo.FindSessionByToken(ctx, res.Token); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected the old session to end after reset, got %v", err)
	}
	if _, err := svc.Login(ctx, res.Affiliator.Email, "sandi-lama-123", ""); !errors.Is(err, service.ErrAffiliatorInvalidCredentials) {
		t.Fatalf("expected the old password to stop working, got %v", err)
	}
	if _, err := svc.Login(ctx, res.Affiliator.Email, "sandi-baru-456", ""); err != nil {
		t.Fatalf("expected the new password to work, got %v", err)
	}
	if err := svc.ResetPassword(ctx, 0, "sandi-baru-456", 0); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected unknown affiliator to be ErrNotFound, got %v", err)
	}
}

// The affiliator changes its own password: the current password is required, this session stays, other
// sessions end, and only the new password works afterwards.
func TestAffiliator_ChangeOwnPassword(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db),
		repository.NewPaymentVerificationRepository(db), repository.NewPlatformSettingsRepository(db))

	email := fmt.Sprintf("aff-change-%d@klikumroh.test", time.Now().UnixNano())
	here, err := svc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator ganti sandi", Email: email, Password: "sandi-lama-123"})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", here.Affiliator.ID) })
	other, err := svc.Login(ctx, email, "sandi-lama-123", "")
	if err != nil {
		t.Fatalf("second login: %v", err)
	}

	r := chi.NewRouter()
	r.Group(func(g chi.Router) {
		g.Use(middleware.AffiliatorAuthMiddleware(affRepo))
		handler.NewAffiliatorHandler(svc).RegisterProtectedRoutes(g)
	})
	change := func(current, next string) int {
		body, _ := json.Marshal(map[string]string{"current_password": current, "new_password": next})
		req := httptest.NewRequest(http.MethodPut, "/api/affiliator/password", bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer "+here.Token)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	if code := change("salah-sandi-000", "sandi-baru-456"); code != http.StatusBadRequest {
		t.Fatalf("wrong current password: expected 400, got %d", code)
	}
	if code := change("sandi-lama-123", "pendek"); code != http.StatusBadRequest {
		t.Fatalf("short new password: expected 400, got %d", code)
	}
	if code := change("sandi-lama-123", "sandi-baru-456"); code != http.StatusOK {
		t.Fatalf("change: expected 200, got %d", code)
	}
	if _, _, err := affRepo.FindSessionByToken(ctx, here.Token); err != nil {
		t.Fatalf("expected the session that changed the password to stay, got %v", err)
	}
	if _, _, err := affRepo.FindSessionByToken(ctx, other.Token); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected other sessions to end, got %v", err)
	}
	if _, err := svc.Login(ctx, email, "sandi-lama-123", ""); !errors.Is(err, service.ErrAffiliatorInvalidCredentials) {
		t.Fatalf("expected the old password to stop working, got %v", err)
	}
	if _, err := svc.Login(ctx, email, "sandi-baru-456", ""); err != nil {
		t.Fatalf("expected the new password to work, got %v", err)
	}
}

// Reactivating an affiliator does not bring its coupon back by itself (the affiliator sets it again
// deliberately), but setting its own old code again must work: the inactive row of that same
// affiliator is reactivated instead of colliding with the unique code. Another affiliator still
// cannot take that code.
func TestAffiliator_ReactivatedAffiliatorReusesOwnCoupon(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db),
		repository.NewPaymentVerificationRepository(db), repository.NewPlatformSettingsRepository(db))

	var ids []uint64
	t.Cleanup(func() {
		for _, id := range ids {
			_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", id)
			_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", id)
		}
	})
	register := func(label string) uint64 {
		t.Helper()
		res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator " + label,
			Email: fmt.Sprintf("aff-%s-%d@klikumroh.test", label, time.Now().UnixNano()), Password: "rahasia-test-123"})
		if err != nil {
			t.Fatalf("register %s: %v", label, err)
		}
		ids = append(ids, res.Affiliator.ID)
		return res.Affiliator.ID
	}
	affA := register("reuse-a")
	affB := register("reuse-b")

	code := fmt.Sprintf("REUSE%d", time.Now().UnixNano()%1000000)
	first, err := svc.SetCoupon(ctx, affA, code)
	if err != nil {
		t.Fatalf("SetCoupon: %v", err)
	}

	if err := svc.SetStatus(ctx, affA, "inactive"); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	if err := svc.SetStatus(ctx, affA, "active"); err != nil {
		t.Fatalf("reactivate: %v", err)
	}
	if _, err := affRepo.ActiveCoupon(ctx, affA); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("reactivation must not bring the coupon back by itself, got %v", err)
	}

	// Another affiliator cannot take A's (inactive) code.
	if _, err := svc.SetCoupon(ctx, affB, code); !errors.Is(err, service.ErrAffiliatorCouponTaken) {
		t.Fatalf("affiliator B must not take A's code, got %v", err)
	}

	again, err := svc.SetCoupon(ctx, affA, code)
	if err != nil {
		t.Fatalf("SetCoupon with own old code after reactivation: %v", err)
	}
	if again.ID != first.ID || again.Status != "active" {
		t.Fatalf("expected the same coupon row %d reactivated, got %+v", first.ID, again)
	}
	active, err := affRepo.ActiveCoupon(ctx, affA)
	if err != nil || active.Code != code {
		t.Fatalf("expected active coupon %s, got %+v err=%v", code, active, err)
	}
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM coupons WHERE code = ?", code).Scan(&n); err != nil || n != 1 {
		t.Fatalf("expected exactly one row for the code, got %d (%v)", n, err)
	}
}
