package handler_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net"
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
	"klikumroh/internal/util"
)

// Bug hunt putaran 4, billing/security (in-memory mocks).

func withTenant(tenantID uint64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(middleware.WithTenantID(r.Context(), tenantID)))
		})
	}
}

// M1: a rejected invoice is reopened by a new proof only while its plan, price and coupon still hold today.
func TestBugHunt4_RejectedInvoiceReopen(t *testing.T) {
	ctx := context.Background()
	const affA = uint64(7)
	strp := func(s string) *string { return &s }

	type env struct {
		coupons *mockCouponRepo
		pvs     *mockPVRepo
		plans   *mockPricingPlanRepo
		tenants *mockTenantRepoSub
		svc     service.SubscriptionService
	}
	newEnv := func() env {
		e := env{coupons: newMockCouponRepo(), pvs: newMockPVRepo(), plans: newMockPricingPlanRepo(), tenants: newMockTenantRepoSub()}
		e.plans.plans[1] = &repository.PricingPlan{ID: 1, Name: "3 Bulan", PeriodMonths: 3, Price: 1500000, UpdatedAt: time.Now().Add(-48 * time.Hour)}
		e.tenants.tenants[53] = &repository.Tenant{ID: 53, Slug: "albarakah", Status: "pending"}
		e.svc = service.NewSubscriptionService(e.pvs, e.coupons, service.NewCouponService(e.coupons), e.plans, e.tenants)
		e.svc.(interface {
			SetAffiliatorRecorder(service.AffiliatorCommissionRecorder)
		}).SetAffiliatorRecorder(&fakeAffiliatorRecorder{active: map[uint64]bool{affA: true}, tenantAffiliator: map[uint64]uint64{53: affA}})
		return e
	}
	rejected := func(e env, coupon *string, final float64) *repository.PaymentVerification {
		reviewed := time.Now().Add(-time.Hour)
		pv := &repository.PaymentVerification{TenantID: 53, PlanID: 1, CouponCode: coupon, Amount: 1500000, FinalAmount: final,
			UniqueCode: 123, ProofURL: strp("/uploads/53/subscription-proofs/old.webp"), Status: "rejected", ReviewedAt: &reviewed,
			CreatedAt: time.Now().AddDate(0, -2, 0)}
		_ = e.pvs.Create(ctx, pv)
		return pv
	}
	// The re-check runs before the image is decoded: a valid invoice reaches the decoder and fails there
	// on these non-image bytes, an invalid one is refused with ErrInvoiceNoLongerValid first.
	upload := func(e env, pv *repository.PaymentVerification) error {
		return func() error { _, err := e.svc.UploadRenewalProof(ctx, 53, pv.ID, []byte("not-an-image")); return err }()
	}
	expectValid := func(t *testing.T, err error) {
		t.Helper()
		if !util.IsImageClientError(err) {
			t.Fatalf("expected the invoice to pass the re-check (image error next), got %v", err)
		}
	}
	expectRefused := func(t *testing.T, e env, pv *repository.PaymentVerification, err error) {
		t.Helper()
		if !errors.Is(err, service.ErrInvoiceNoLongerValid) {
			t.Fatalf("expected ErrInvoiceNoLongerValid, got %v", err)
		}
		if got := e.pvs.verifications[pv.ID]; got.Status != "rejected" {
			t.Fatalf("refused invoice must stay rejected, got %s", got.Status)
		}
	}

	t.Run("unchanged plan, no coupon: reopen allowed", func(t *testing.T) {
		e := newEnv()
		expectValid(t, upload(e, rejected(e, nil, 1500123)))
	})
	t.Run("plan price changed since the invoice", func(t *testing.T) {
		e := newEnv()
		pv := rejected(e, nil, 1500123)
		e.plans.plans[1].Price = 1750000
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("plan edited after the rejection (e.g. period 3 -> 12 months)", func(t *testing.T) {
		e := newEnv()
		pv := rejected(e, nil, 1500123)
		e.plans.plans[1].PeriodMonths = 12
		e.plans.plans[1].UpdatedAt = time.Now()
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("plan deleted", func(t *testing.T) {
		e := newEnv()
		pv := rejected(e, nil, 1500123)
		delete(e.plans.plans, 1)
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("plan hidden: refused unless it is the travel's current plan", func(t *testing.T) {
		e := newEnv()
		pv := rejected(e, nil, 1500123)
		e.plans.plans[1].Hidden = true
		expectRefused(t, e, pv, upload(e, pv))
		cur := uint64(1)
		e.tenants.tenants[53].CurrentPlanID = &cur
		expectValid(t, upload(e, pv))
	})
	t.Run("platform coupon expired since (WIB end of day)", func(t *testing.T) {
		e := newEnv()
		past := time.Now().AddDate(0, 0, -2)
		_ = e.coupons.Create(ctx, &repository.Coupon{Code: "PROMO10", DiscountPercentage: 10, Status: "active", ExpiresAt: &past})
		pv := rejected(e, strp("PROMO10"), 1350123)
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("platform coupon still valid: allowed", func(t *testing.T) {
		e := newEnv()
		future := time.Now().AddDate(0, 1, 0)
		_ = e.coupons.Create(ctx, &repository.Coupon{Code: "PROMO10", DiscountPercentage: 10, Status: "active", ExpiresAt: &future})
		expectValid(t, upload(e, rejected(e, strp("PROMO10"), 1350123)))
	})
	t.Run("coupon used up (max_uses)", func(t *testing.T) {
		e := newEnv()
		one := 1
		_ = e.coupons.Create(ctx, &repository.Coupon{Code: "ONCE", DiscountPercentage: 10, Status: "active", MaxUses: &one, UsedCount: 1})
		pv := rejected(e, strp("ONCE"), 1350123)
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("coupon already redeemed by this travel", func(t *testing.T) {
		e := newEnv()
		c := &repository.Coupon{Code: "PROMO10", DiscountPercentage: 10, Status: "active"}
		_ = e.coupons.Create(ctx, c)
		_ = e.coupons.RecordRedemption(ctx, c.ID, 53)
		pv := rejected(e, strp("PROMO10"), 1350123)
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("coupon discount changed since the invoice", func(t *testing.T) {
		e := newEnv()
		_ = e.coupons.Create(ctx, &repository.Coupon{Code: "PROMO10", DiscountPercentage: 25, Status: "active"})
		pv := rejected(e, strp("PROMO10"), 1350123)
		expectRefused(t, e, pv, upload(e, pv))
	})
	t.Run("exploit path: affiliator coupon after the travel's first approved payment", func(t *testing.T) {
		e := newEnv()
		a := affA
		_ = e.coupons.Create(ctx, &repository.Coupon{Code: "AFF", DiscountPercentage: 20, Status: "active", AffiliatorID: &a})
		pv := rejected(e, strp("AFF"), 1200123) // signup invoice #1 with AFF, rejected
		// Before any approved payment it is still the signup invoice: reopen allowed.
		expectValid(t, upload(e, pv))
		// Invoice #2 paid at full price and approved: #1 must not come back with the 20% discount.
		_ = e.pvs.Create(ctx, &repository.PaymentVerification{TenantID: 53, PlanID: 1, Amount: 1500000, FinalAmount: 1500456, UniqueCode: 456, Status: "approved"})
		expectRefused(t, e, pv, upload(e, pv))
	})

	t.Run("HTTP: refused reopen answers 409 with the message", func(t *testing.T) {
		e := newEnv()
		pv := rejected(e, nil, 1500123)
		e.plans.plans[1].Price = 1750000
		h := handler.NewSubscriptionHandler(e.svc, service.NewPricingPlanService(e.plans))
		r := chi.NewRouter()
		r.With(withTenant(53)).Post("/api/dashboard/subscription/payment-verifications/{id}/proof", h.UploadRenewalProof)

		body := &bytes.Buffer{}
		mw := multipart.NewWriter(body)
		fw, _ := mw.CreateFormFile("proof_file", "bukti.jpg")
		_, _ = fw.Write([]byte("not-an-image"))
		_ = mw.Close()
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/dashboard/subscription/payment-verifications/%d/proof", pv.ID), body)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		t.Logf("HTTP %d %s", rec.Code, strings.TrimSpace(rec.Body.String()))
		if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "Tagihan ini sudah tidak berlaku. Buat tagihan baru dari halaman Langganan.") {
			t.Fatalf("expected 409 with the no-longer-valid message, got %d %s", rec.Code, rec.Body.String())
		}
	})
}

// D4: hidden plans are not offered to travels and cannot be requested, except the travel's own plan.
func TestBugHunt4_PlanVisibility(t *testing.T) {
	ctx := context.Background()
	newEnv := func() (*mockPricingPlanRepo, *mockTenantRepoSub, service.SubscriptionService) {
		plans := newMockPricingPlanRepo()
		plans.plans[1] = &repository.PricingPlan{ID: 1, Name: "3 Bulan", PeriodMonths: 3, Price: 1500000}
		plans.plans[9] = &repository.PricingPlan{ID: 9, Name: "Trial Khusus", PeriodMonths: 1, Price: 0, Hidden: true}
		tenants := newMockTenantRepoSub()
		tenants.tenants[60] = &repository.Tenant{ID: 60, Slug: "travel-a", Status: "active"}
		coupons := newMockCouponRepo()
		svc := service.NewSubscriptionService(newMockPVRepo(), coupons, service.NewCouponService(coupons), plans, tenants)
		return plans, tenants, svc
	}

	t.Run("renewal request for a hidden plan is refused", func(t *testing.T) {
		_, _, svc := newEnv()
		if _, err := svc.CreateRenewalRequest(ctx, 60, 9, nil, nil); !errors.Is(err, service.ErrPlanNotAvailable) {
			t.Fatalf("expected ErrPlanNotAvailable, got %v", err)
		}
		if _, err := svc.CreateRenewalRequest(ctx, 60, 1, nil, nil); err != nil {
			t.Fatalf("public plan must stay available: %v", err)
		}
	})
	t.Run("the travel's own hidden plan can still be renewed", func(t *testing.T) {
		_, tenants, svc := newEnv()
		cur := uint64(9)
		tenants.tenants[60].CurrentPlanID = &cur
		if _, err := svc.CreateRenewalRequest(ctx, 60, 9, nil, nil); err != nil {
			t.Fatalf("own hidden plan: %v", err)
		}
	})
	t.Run("HTTP: plan list and renewal request", func(t *testing.T) {
		plans, tenants, svc := newEnv()
		h := handler.NewSubscriptionHandler(svc, service.NewPricingPlanService(plans))
		r := chi.NewRouter()
		r.With(withTenant(60)).Get("/api/dashboard/pricing-plans", h.GetPricingPlans)
		r.With(withTenant(60)).Post("/api/dashboard/subscription/renewal-request", h.CreateRenewalRequest)

		list := func() string {
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/dashboard/pricing-plans", nil))
			return rec.Body.String()
		}
		got := list()
		t.Logf("plans without the hidden one: %s", strings.TrimSpace(got))
		if strings.Contains(got, "Trial Khusus") || !strings.Contains(got, `"is_public":true`) {
			t.Fatalf("hidden plan listed or is_public missing: %s", got)
		}

		body := &bytes.Buffer{}
		mw := multipart.NewWriter(body)
		_ = mw.WriteField("plan_id", "9")
		_ = mw.Close()
		req := httptest.NewRequest(http.MethodPost, "/api/dashboard/subscription/renewal-request", body)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		t.Logf("renewal for hidden plan: HTTP %d %s", rec.Code, strings.TrimSpace(rec.Body.String()))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "Paket ini tidak tersedia.") {
			t.Fatalf("expected 400 Paket ini tidak tersedia., got %d %s", rec.Code, rec.Body.String())
		}

		cur := uint64(9)
		tenants.tenants[60].CurrentPlanID = &cur
		got = list()
		if !strings.Contains(got, "Trial Khusus") || !strings.Contains(got, `"is_public":false`) {
			t.Fatalf("own hidden plan must be listed with is_public=false: %s", got)
		}
	})
	t.Run("public signup refuses a hidden plan", func(t *testing.T) {
		plans := newMockPlanRepoPublic()
		plans.plans[9] = &repository.PricingPlan{ID: 9, Name: "Trial Khusus", PeriodMonths: 1, Price: 0, Hidden: true}
		coupons := newMockCouponRepo()
		svc := service.NewPublicSignupService(newMockTenantRepoPublic(), &mockAdminUserRepo{users: make(map[string]*repository.AdminUser)}, plans,
			service.NewCouponService(coupons), newMockPVRepo())
		_, err := svc.TenantSignup(ctx, service.TenantSignupRequest{TravelName: "Travel Baru", Slug: "travel-baru-bh4",
			AdminName: "Admin", AdminEmail: "admin-bh4@example.test", AdminPassword: "rahasia-panjang-123", PlanID: 9})
		if !errors.Is(err, service.ErrPlanNotAvailable) {
			t.Fatalf("expected ErrPlanNotAvailable, got %v", err)
		}
	})
}

// M2: coupon probing from the travel dashboard and the affiliator portal is rate limited.
func TestBugHunt4_CouponProbeRateLimit(t *testing.T) {
	coupons := newMockCouponRepo()
	ch := handler.NewCouponHandler(service.NewCouponService(coupons))
	r := chi.NewRouter()
	r.Route("/t/{tenant}", func(sub chi.Router) {
		sub.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				var id uint64
				_, _ = fmt.Sscan(chi.URLParam(req, "tenant"), &id)
				next.ServeHTTP(w, req.WithContext(middleware.WithTenantID(req.Context(), id)))
			})
		})
		sub.With(ch.TravelValidateLimiters()...).Get("/validate", ch.ValidateTravel)
	})
	call := func(tenant uint64, ip string) int {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/t/%d/validate?code=NOPE", tenant), nil)
		req.RemoteAddr = net.JoinHostPort(ip, "5000")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}

	// Per travel: 20 checks from 20 different IPs pass (400 coupon not found), the 21st is refused.
	for i := 0; i < 20; i++ {
		if code := call(70, fmt.Sprintf("198.51.100.%d", i+1)); code != http.StatusBadRequest {
			t.Fatalf("check %d: expected 400, got %d", i+1, code)
		}
	}
	if code := call(70, "198.51.100.200"); code != http.StatusTooManyRequests {
		t.Fatalf("21st check of the same travel from a new IP: expected 429, got %d", code)
	}
	if code := call(71, "198.51.100.201"); code != http.StatusBadRequest {
		t.Fatalf("another travel must not be limited, got %d", code)
	}
	// Per IP: one address rotating travels is stopped after 20.
	for i := 0; i < 20; i++ {
		if code := call(uint64(100+i), "203.0.113.9"); code != http.StatusBadRequest {
			t.Fatalf("ip check %d: expected 400, got %d", i+1, code)
		}
	}
	if code := call(200, "203.0.113.9"); code != http.StatusTooManyRequests {
		t.Fatalf("21st check from the same IP: expected 429, got %d", code)
	}

	// Affiliator portal: PUT /api/affiliator/coupon, 10 per affiliator and 10 per IP.
	ah := handler.NewAffiliatorHandler(&fakeCouponSetter{})
	ar := chi.NewRouter()
	ar.Route("/a/{aff}", func(sub chi.Router) {
		sub.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				var id uint64
				_, _ = fmt.Sscan(chi.URLParam(req, "aff"), &id)
				next.ServeHTTP(w, req.WithContext(middleware.WithAffiliatorID(req.Context(), id)))
			})
		})
		ah.RegisterProtectedRoutes(sub)
	})
	put := func(aff uint64, ip string) int {
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/a/%d/api/affiliator/coupon", aff), strings.NewReader(`{"code":"COBA"}`))
		req.RemoteAddr = net.JoinHostPort(ip, "5000")
		rec := httptest.NewRecorder()
		ar.ServeHTTP(rec, req)
		return rec.Code
	}
	for i := 0; i < 10; i++ {
		if code := put(5, fmt.Sprintf("192.0.2.%d", i+1)); code != http.StatusOK {
			t.Fatalf("affiliator try %d: expected 200, got %d", i+1, code)
		}
	}
	if code := put(5, "192.0.2.200"); code != http.StatusTooManyRequests {
		t.Fatalf("11th try of the same affiliator: expected 429, got %d", code)
	}
	for i := 0; i < 10; i++ {
		if code := put(uint64(50+i), "192.0.2.250"); code != http.StatusOK {
			t.Fatalf("ip try %d: expected 200, got %d", i+1, code)
		}
	}
	if code := put(99, "192.0.2.250"); code != http.StatusTooManyRequests {
		t.Fatalf("11th try from the same IP: expected 429, got %d", code)
	}
}

type fakeCouponSetter struct{ service.AffiliatorService }

func (f *fakeCouponSetter) SetCoupon(ctx context.Context, affiliatorID uint64, code string) (*repository.Coupon, error) {
	return &repository.Coupon{Code: code, DiscountPercentage: 10}, nil
}

// M7: the cockpit counts only invoices staff can review (proof uploaded, or nothing owed).
func TestBugHunt4_CockpitCountsReviewableOnly(t *testing.T) {
	ctx := context.Background()
	pvs := newMockPVRepo()
	proof := "/uploads/1/subscription-proofs/p.webp"
	_ = pvs.Create(ctx, &repository.PaymentVerification{TenantID: 1, PlanID: 1, FinalAmount: 1500123, ProofURL: &proof, Status: "pending"})
	_ = pvs.Create(ctx, &repository.PaymentVerification{TenantID: 2, PlanID: 1, FinalAmount: 0, Status: "pending"})
	_ = pvs.Create(ctx, &repository.PaymentVerification{TenantID: 3, PlanID: 1, FinalAmount: 2700456, Status: "pending"}) // no proof yet
	_ = pvs.Create(ctx, &repository.PaymentVerification{TenantID: 4, PlanID: 1, FinalAmount: 900000, ProofURL: &proof, Status: "approved"})
	staffRepo := newMockStaffRepo()
	svc := service.NewStaffService(staffRepo, nil, nil, newMockPricingPlanRepo(), nil, nil, nil, nil, repository.PaymentVerificationRepository(pvs))
	m, err := svc.GetPlatformOverview(ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	t.Logf("pending_verifications_count=%d total=%.0f", m.PendingVerificationsCount, m.PendingVerificationsTotal)
	if m.PendingVerificationsCount != 2 || m.PendingVerificationsTotal != 1500123 {
		t.Fatalf("expected 2 reviewable invoices totalling 1500123, got %d / %.0f", m.PendingVerificationsCount, m.PendingVerificationsTotal)
	}
}

// D5: the daily recheck takes a custom domain offline after 3 failed checks in a row, notifies the
// travel's admins and staff, and a success resets the count.
type recheckDomainRepo struct{ *mockDomainRepo }

func (m *recheckDomainRepo) ListActiveCustom(ctx context.Context) ([]repository.Domain, error) {
	var out []repository.Domain
	for _, d := range m.domains {
		if d.Type == "custom" && d.Status == "active" {
			out = append(out, *d)
		}
	}
	return out, nil
}

type recordingNotifier struct {
	service.NotificationService
	sent []string
}

func (n *recordingNotifier) CreateNotification(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, notifType, title, body, linkURL string) (*repository.Notification, error) {
	n.sent = append(n.sent, fmt.Sprintf("%s:%d:%s:%s", recipientType, recipientID, notifType, linkURL))
	return &repository.Notification{}, nil
}

type fixedAdmins struct {
	repository.AdminUserRepository
	list map[uint64][]repository.AdminUser
}

func (f *fixedAdmins) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.AdminUser, error) {
	return f.list[tenantID], nil
}

type fixedStaff []repository.StaffUser

func (f fixedStaff) ListStaffUsers(ctx context.Context) ([]repository.StaffUser, error) {
	return f, nil
}

func TestBugHunt4_DomainDailyRecheck(t *testing.T) {
	ctx := context.Background()
	repo := &recheckDomainRepo{&mockDomainRepo{domains: map[string]*repository.Domain{
		"www.travel-a.com":      {ID: 1, TenantID: 80, Hostname: "www.travel-a.com", Type: "custom", Status: "active"},
		"www.travel-b.com":      {ID: 2, TenantID: 81, Hostname: "www.travel-b.com", Type: "custom", Status: "active"},
		"travel-a.klikumroh.id": {ID: 3, TenantID: 80, Hostname: "travel-a.klikumroh.id", Type: "subdomain", Status: "active"},
	}}}
	dns := newMockDNSResolver()
	dns.responses["www.travel-b.com"] = service.ExpectedCNAMETarget + "."
	// www.travel-a.com resolves nowhere (domain expired / DNS moved).
	svc := service.NewDomainService(repo, dns)
	notif := &recordingNotifier{}
	svc.(interface {
		SetNotifier(service.NotificationService, repository.AdminUserRepository, service.StaffLister)
	}).SetNotifier(notif,
		&fixedAdmins{list: map[uint64][]repository.AdminUser{80: {{ID: 11, TenantID: 80, Status: "active"}, {ID: 12, TenantID: 80, Status: "inactive"}}}},
		fixedStaff{{ID: 501, Status: "active"}})
	clock := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	svc.(interface{ SetClock(func() time.Time) }).SetClock(func() time.Time { return clock })
	// Each run is one day later (bug hunt 5: a domain is counted at most once per ~day).
	recheck := func() { clock = clock.Add(24 * time.Hour); svc.RecheckActiveDomains(ctx) }

	for day := 1; day <= 2; day++ {
		recheck()
		a := repo.domains["www.travel-a.com"]
		t.Logf("day %d: www.travel-a.com status=%s check_failures=%d", day, a.Status, a.CheckFailures)
		if a.Status != "active" || a.CheckFailures != day || len(notif.sent) != 0 {
			t.Fatalf("day %d: must stay active with %d failures and no notification, got %s/%d/%v", day, day, a.Status, a.CheckFailures, notif.sent)
		}
	}

	// A success in between resets the count.
	dns.responses["www.travel-a.com"] = service.ExpectedCNAMETarget + "."
	recheck()
	if a := repo.domains["www.travel-a.com"]; a.CheckFailures != 0 || a.Status != "active" {
		t.Fatalf("a successful check must reset the counter, got %s/%d", a.Status, a.CheckFailures)
	}
	delete(dns.responses, "www.travel-a.com")

	for day := 1; day <= 3; day++ {
		recheck()
	}
	a := repo.domains["www.travel-a.com"]
	t.Logf("after 3 failed days: status=%s check_failures=%d reason=%v notifications=%v", a.Status, a.CheckFailures, *a.VerificationFailureReason, notif.sent)
	if a.Status != "failed" || a.CheckFailures != 3 {
		t.Fatalf("expected failed after 3 consecutive failures, got %s/%d", a.Status, a.CheckFailures)
	}
	if b := repo.domains["www.travel-b.com"]; b.Status != "active" || b.CheckFailures != 0 {
		t.Fatalf("a healthy domain of another travel must be untouched, got %s/%d", b.Status, b.CheckFailures)
	}
	want := []string{"admin:11:domain_deactivated:/website/domain", "staff:501:domain_deactivated:/internal/tenants/80"}
	if strings.Join(notif.sent, ",") != strings.Join(want, ",") {
		t.Fatalf("notifications: got %v, want %v", notif.sent, want)
	}

	// No longer served: neither its own host nor the subdomain redirect resolves to it.
	if _, err := svc.GetActiveCustomDomainByHost(ctx, "travel-a.klikumroh.id"); err == nil {
		t.Fatal("subdomain must no longer redirect to the deactivated domain")
	}
	// A later recheck does not touch it again (it is not active).
	recheck()
	if len(notif.sent) != 2 {
		t.Fatalf("deactivated domain notified again: %v", notif.sent)
	}
}
