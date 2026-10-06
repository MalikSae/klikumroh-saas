package repository_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt putaran 5 (billing, domain, jobs), real database. Every test tenant is purged by
// createDummyTenant's cleanup; plans and coupons created here are removed by their own cleanup.

// bh5Plan creates a public pricing plan removed when the test ends (registered before any tenant, so it
// runs after the tenants and their invoices are purged).
func bh5Plan(t *testing.T, ctx context.Context, repo repository.PricingPlanRepository, price float64) *repository.PricingPlan {
	t.Helper()
	p := &repository.PricingPlan{Name: fmt.Sprintf("BH5 %d", time.Now().UnixNano()), PeriodMonths: 12, Price: price}
	if err := repo.Create(ctx, p); err != nil {
		t.Fatalf("plan: %v", err)
	}
	t.Cleanup(func() {
		db, err := openCleanupDB()
		if err != nil {
			return
		}
		defer db.Close()
		_, _ = db.Exec(`DELETE FROM coupons WHERE plan_id = ?`, p.ID)
		_, _ = db.Exec(`DELETE FROM pricing_plans WHERE id = ?`, p.ID)
	})
	return p
}

// P1: the unpaid-signup cleanup keeps a travel with a Rp 0 invoice, an invoice touched after creation
// (staff plan/coupon change), an invoice with review fields, or invoice activity in the last 30 days. Only
// the plain stale signup is listed and deleted.
func TestBugHunt5_UnpaidSignupCleanupKeeps(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	var staffID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	planRepo := repository.NewPricingPlanRepository(db)
	plan := bh5Plan(t, ctx, planRepo, 100000)
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	repo := repository.NewUnpaidSignupRepository(db)
	now := time.Now()
	day := 24 * time.Hour
	cutoff := now.Add(-service.UnpaidSignupMaxAge)

	// mk: a pending signup created 31 days ago with one invoice (created/updated at the given ages).
	mk := func(suffix string, finalAmount float64, invoiceCreated, invoiceUpdated time.Duration) (*repository.Tenant, uint64) {
		tn := createDummyTenant(t, ctx, tenantRepo, suffix)
		if _, err := db.Exec(`UPDATE tenants SET status = 'pending', created_at = ? WHERE id = ?`, now.Add(-31*day), tn.ID); err != nil {
			t.Fatalf("age tenant: %v", err)
		}
		uc := 0
		if finalAmount > 0 {
			uc = 123
		}
		pv := &repository.PaymentVerification{TenantID: tn.ID, PlanID: plan.ID, Amount: 100000, FinalAmount: finalAmount, UniqueCode: uc}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("invoice: %v", err)
		}
		if _, err := db.Exec(`UPDATE payment_verifications SET created_at = ?, updated_at = ? WHERE id = ?`,
			now.Add(-invoiceCreated), now.Add(-invoiceUpdated), pv.ID); err != nil {
			t.Fatalf("age invoice: %v", err)
		}
		return tn, pv.ID
	}
	stale, _ := mk("bh5-stale", 100123, 31*day, 31*day)
	free, _ := mk("bh5-rp0", 0, 31*day, 31*day)
	staffEdited, _ := mk("bh5-staffedit", 100123, 31*day, 31*day-time.Hour) // updated an hour after creation, 31 days ago
	reviewed, reviewedPV := mk("bh5-reviewed", 100123, 31*day, 31*day)
	recent, _ := mk("bh5-recent", 100123, 5*day, 5*day) // renewal invoice made 5 days ago on a 31-day-old signup
	// Review fields set (an approval claim released back to pending keeps none, but staff fields mean
	// staff handled it); timestamps kept old so only the review fields protect it.
	if _, err := db.Exec(`UPDATE payment_verifications SET reviewed_by = ?, reviewed_at = ?, updated_at = created_at WHERE id = ?`,
		staffID, now.Add(-31*day), reviewedPV); err != nil {
		t.Fatalf("review fields: %v", err)
	}

	listed := map[uint64]bool{}
	list, err := repo.ListStaleUnpaidSignups(ctx, cutoff)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, s := range list {
		listed[s.TenantID] = true
	}
	cases := []struct {
		name string
		tn   *repository.Tenant
		want bool
	}{
		{"stale unpaid (control)", stale, true},
		{"Rp0 invoice waiting for staff", free, false},
		{"invoice edited after creation (staff plan/coupon)", staffEdited, false},
		{"invoice with review fields", reviewed, false},
		{"invoice activity 5 days ago", recent, false},
	}
	for _, c := range cases {
		t.Logf("listed %-50s tenant %d: %v (want %v)", c.name, c.tn.ID, listed[c.tn.ID], c.want)
		if listed[c.tn.ID] != c.want {
			t.Fatalf("%s: listed=%v, want %v", c.name, listed[c.tn.ID], c.want)
		}
	}
	// The locked re-check inside the delete transaction applies the same rules.
	for _, c := range cases {
		removed, err := repo.DeleteUnpaidSignup(ctx, c.tn.ID, cutoff)
		if err != nil {
			t.Fatalf("%s: delete: %v", c.name, err)
		}
		t.Logf("delete %-50s tenant %d: removed=%v", c.name, c.tn.ID, removed)
		if removed != c.want {
			t.Fatalf("%s: removed=%v, want %v", c.name, removed, c.want)
		}
		var n int
		_ = db.QueryRow(`SELECT COUNT(*) FROM tenants WHERE id = ?`, c.tn.ID).Scan(&n)
		if (n == 0) != c.want {
			t.Fatalf("%s: tenant row count %d after delete", c.name, n)
		}
	}
}

// P1: another travel's claim can never delete a non-active primary that still has an ACTIVE alias (the FK
// cascade would take the live alias down). Once the alias is not active either, the unverified pair is
// released as before. Tenant A's own claim is never released.
func TestBugHunt5_DomainClaimKeepsActiveAlias(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	a := createDummyTenant(t, ctx, tenantRepo, "bh5-dom-a")
	b := createDummyTenant(t, ctx, tenantRepo, "bh5-dom-b")

	zone := fmt.Sprintf("bh5-%d.example.test", time.Now().UnixNano())
	primary := &repository.Domain{Hostname: "www." + zone, Type: "custom", Status: "failed"}
	if err := domainRepo.Create(ctx, a.ID, primary); err != nil {
		t.Fatalf("primary: %v", err)
	}
	alias := &repository.Domain{Hostname: zone, Type: "custom", Status: "active", RedirectToDomainID: &primary.ID}
	if err := domainRepo.Create(ctx, a.ID, alias); err != nil {
		t.Fatalf("alias: %v", err)
	}

	// Repository: refused with ErrDomainInUse, nothing deleted.
	err := domainRepo.ReleaseUnverifiedClaim(ctx, primary.Hostname, b.ID)
	t.Logf("B releases A's failed primary with an active alias: err=%v", err)
	if !errors.Is(err, repository.ErrDomainInUse) {
		t.Fatalf("expected ErrDomainInUse, got %v", err)
	}
	// Service + takeover scenario: travel B registers www.X.
	svc := service.NewDomainService(domainRepo, nil)
	_, err = svc.RegisterCustomDomain(ctx, b.ID, primary.Hostname, false)
	t.Logf("B registers %s: err=%v", primary.Hostname, err)
	if !errors.Is(err, service.ErrDomainStillUsed) || err.Error() != "Domain ini masih dipakai travel lain." {
		t.Fatalf("expected ErrDomainStillUsed, got %v", err)
	}
	for _, h := range []string{primary.Hostname, alias.Hostname} {
		d, err := domainRepo.FindByHostname(ctx, h)
		if err != nil || d.TenantID != a.ID {
			t.Fatalf("A's %s must survive B's claim: %v", h, err)
		}
	}
	if d, _ := domainRepo.FindByHostname(ctx, alias.Hostname); d.Status != "active" {
		t.Fatalf("A's alias must stay active, got %s", d.Status)
	}

	// The alias is no longer active: the unverified pair is released (A never proved it any more).
	alias.Status = "failed"
	if err := domainRepo.Update(ctx, a.ID, alias); err != nil {
		t.Fatalf("deactivate alias: %v", err)
	}
	if err := domainRepo.ReleaseUnverifiedClaim(ctx, primary.Hostname, a.ID); err != nil {
		t.Fatalf("own release: %v", err)
	}
	if _, err := domainRepo.FindByHostname(ctx, primary.Hostname); err != nil {
		t.Fatalf("A's own release must never delete its row: %v", err)
	}
	if err := domainRepo.ReleaseUnverifiedClaim(ctx, primary.Hostname, b.ID); err != nil {
		t.Fatalf("release without active alias: %v", err)
	}
	if _, err := domainRepo.FindByHostname(ctx, primary.Hostname); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("unverified primary must be released, got %v", err)
	}
}

// Jobs: daily_check_at is loaded by ListActiveCustom, written by Update, and kept when a manual check
// (DailyCheckAt nil) updates the row.
func TestBugHunt5_DomainDailyCheckAtRoundTrip(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	a := createDummyTenant(t, ctx, tenantRepo, "bh5-daily")
	d := &repository.Domain{Hostname: fmt.Sprintf("www.bh5-daily-%d.example.test", time.Now().UnixNano()), Type: "custom", Status: "active"}
	if err := domainRepo.Create(ctx, a.ID, d); err != nil {
		t.Fatalf("create: %v", err)
	}
	find := func() *repository.Domain {
		list, err := domainRepo.ListActiveCustom(ctx)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for i := range list {
			if list[i].ID == d.ID {
				return &list[i]
			}
		}
		t.Fatal("domain not in active list")
		return nil
	}
	if got := find(); got.DailyCheckAt != nil {
		t.Fatalf("new domain has daily_check_at %v", got.DailyCheckAt)
	}
	at := time.Date(2026, 10, 6, 3, 0, 0, 0, time.Local)
	got := find()
	got.DailyCheckAt = &at
	got.CheckFailures = 1
	if err := domainRepo.Update(ctx, a.ID, got); err != nil {
		t.Fatalf("update: %v", err)
	}
	manual, _ := domainRepo.GetByID(ctx, a.ID, d.ID) // GetByID does not load daily_check_at
	manual.CheckFailures = 2                         // a manual check writes other values; daily_check_at is not loaded (nil)
	if err := domainRepo.Update(ctx, a.ID, manual); err != nil {
		t.Fatalf("manual update: %v", err)
	}
	final := find()
	t.Logf("daily_check_at after a manual update: %v", final.DailyCheckAt)
	if final.DailyCheckAt == nil || !final.DailyCheckAt.Equal(at) {
		t.Fatalf("daily_check_at must survive a manual update, got %v", final.DailyCheckAt)
	}
}

// LOW: subscription_expires_at is DATETIME now, so an expiry after 2038-01-19 is stored and read back.
func TestBugHunt5_SubscriptionExpiryAfter2038(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	planRepo := repository.NewPricingPlanRepository(db)
	plan := bh5Plan(t, ctx, planRepo, 0)
	tenantRepo := repository.NewTenantRepository(db)
	tn := createDummyTenant(t, ctx, tenantRepo, "bh5-2038")
	loc, _ := time.LoadLocation(repository.BusinessTimeZone)
	want := time.Date(2045, 3, 15, 23, 59, 0, 0, loc)
	if err := tenantRepo.UpdateSubscription(ctx, tn.ID, plan.ID, want, "active"); err != nil {
		t.Fatalf("update subscription to 2045: %v", err)
	}
	got, err := tenantRepo.GetByID(ctx, tn.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	t.Logf("subscription_expires_at stored: %v", got.SubscriptionExpiresAt)
	if got.SubscriptionExpiresAt == nil || !got.SubscriptionExpiresAt.Equal(want) {
		t.Fatalf("expiry round trip: got %v, want %v", got.SubscriptionExpiresAt, want)
	}
}

// LOW: a rejected invoice cannot be reopened after the subscription moved on: staff changed it by hand
// after the rejection, or a later invoice was approved. Before that, the reopen check passes (the upload
// then fails only on the dummy image bytes).
func TestBugHunt5_RejectedReopenAfterManualChange(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	var staffID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	planRepo := repository.NewPricingPlanRepository(db)
	plan := bh5Plan(t, ctx, planRepo, 100000)
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)

	rejected := func(tenantID uint64, uc int) uint64 {
		pv := &repository.PaymentVerification{TenantID: tenantID, PlanID: plan.ID, Amount: 100000, FinalAmount: 100000 + float64(uc), UniqueCode: uc}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("invoice: %v", err)
		}
		reason, at := "bukti buram", time.Now() // after the plan was created (a plan edited after the rejection is refused anyway)
		if err := pvRepo.TransitionStatus(ctx, pv.ID, "pending", "rejected", &reason, &staffID, &at); err != nil {
			t.Fatalf("reject: %v", err)
		}
		return pv.ID
	}

	// Manual change after the rejection.
	a := createDummyTenant(t, ctx, tenantRepo, "bh5-reopen-a")
	rejA := rejected(a.ID, 731)
	_, err := sub.UploadRenewalProof(ctx, a.ID, rejA, []byte("not an image"))
	t.Logf("reopen before any manual change: %v", err)
	if errors.Is(err, service.ErrInvoiceNoLongerValid) || errors.Is(err, service.ErrAnotherInvoiceOpen) {
		t.Fatalf("reopen check must pass before the manual change, got %v", err)
	}
	reason := "Mengubah langganan ke paket BH5 (12 bulan)"
	if err := repository.NewAccessLogRepository(db).Create(ctx, a.ID, &repository.AccessLog{StaffID: staffID, Action: repository.AccessActionUpdateSubscription, Reason: &reason}); err != nil {
		t.Fatalf("access log: %v", err)
	}
	// The manual change happens a little after the rejection (timestamps have one-second precision).
	if _, err := db.Exec(`UPDATE access_logs SET accessed_at = NOW() + INTERVAL 5 SECOND WHERE tenant_id = ?`, a.ID); err != nil {
		t.Fatalf("age access log: %v", err)
	}
	_, err = sub.UploadRenewalProof(ctx, a.ID, rejA, []byte("not an image"))
	t.Logf("reopen after a manual change: %v", err)
	if !errors.Is(err, service.ErrInvoiceNoLongerValid) {
		t.Fatalf("expected ErrInvoiceNoLongerValid after a manual change, got %v", err)
	}

	// A later approved invoice.
	b := createDummyTenant(t, ctx, tenantRepo, "bh5-reopen-b")
	rejB := rejected(b.ID, 732)
	later := &repository.PaymentVerification{TenantID: b.ID, PlanID: plan.ID, Amount: 100000, FinalAmount: 100733, UniqueCode: 733}
	if err := pvRepo.Create(ctx, later); err != nil {
		t.Fatalf("later invoice: %v", err)
	}
	now := time.Now()
	if err := pvRepo.TransitionStatus(ctx, later.ID, "pending", "approved", nil, &staffID, &now); err != nil {
		t.Fatalf("approve later: %v", err)
	}
	_, err = sub.UploadRenewalProof(ctx, b.ID, rejB, []byte("not an image"))
	t.Logf("reopen after a newer approved invoice: %v", err)
	if !errors.Is(err, service.ErrInvoiceNoLongerValid) {
		t.Fatalf("expected ErrInvoiceNoLongerValid after a newer approval, got %v", err)
	}
	if got, _ := pvRepo.GetByID(ctx, rejB); got.Status != "rejected" {
		t.Fatalf("refused reopen must leave the invoice rejected, got %s", got.Status)
	}
}

// LOW: concurrent renewal requests of one travel leave exactly one open invoice (tenant invoice lock).
func TestBugHunt5_ConcurrentRenewalRequestsOneInvoice(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	planRepo := repository.NewPricingPlanRepository(db)
	plan := bh5Plan(t, ctx, planRepo, 100000)
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)
	tn := createDummyTenant(t, ctx, tenantRepo, "bh5-race")

	const n = 6
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = sub.CreateRenewalRequest(ctx, tn.ID, plan.ID, nil, nil)
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("request %d: %v", i, err)
		}
	}
	var pending int
	_ = db.QueryRow(`SELECT COUNT(*) FROM payment_verifications WHERE tenant_id = ? AND status = 'pending'`, tn.ID).Scan(&pending)
	t.Logf("%d concurrent renewal requests -> %d pending invoice(s)", n, pending)
	if pending != 1 {
		t.Fatalf("expected exactly 1 open invoice, got %d", pending)
	}
}

// LOW: a plan bound to an active coupon cannot be deleted (ON DELETE SET NULL would make the coupon valid
// for every plan); after the coupon is switched off the plan can go.
func TestBugHunt5_DeletePlanBoundToCoupon(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	planRepo := repository.NewPricingPlanRepository(db)
	plan := bh5Plan(t, ctx, planRepo, 100000)
	code := fmt.Sprintf("BH5%d", time.Now().UnixNano()%1000000000)
	res, err := db.Exec(`INSERT INTO coupons (code, discount_percentage, status, plan_id) VALUES (?, 10, 'active', ?)`, code, plan.ID)
	if err != nil {
		t.Fatalf("coupon: %v", err)
	}
	couponID, _ := res.LastInsertId()
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM coupons WHERE id = ?`, couponID) })

	err = planRepo.Delete(ctx, plan.ID)
	t.Logf("delete plan bound to active coupon %s: %v", code, err)
	if !errors.Is(err, repository.ErrPlanUsedByCoupon) {
		t.Fatalf("expected ErrPlanUsedByCoupon, got %v", err)
	}
	var planID *uint64
	_ = db.QueryRow(`SELECT plan_id FROM coupons WHERE id = ?`, couponID).Scan(&planID)
	if planID == nil || *planID != plan.ID {
		t.Fatal("coupon must stay bound to its plan")
	}
	if _, err := db.Exec(`UPDATE coupons SET status = 'inactive' WHERE id = ?`, couponID); err != nil {
		t.Fatalf("deactivate coupon: %v", err)
	}
	if err := planRepo.Delete(ctx, plan.ID); err != nil {
		t.Fatalf("delete after the coupon is off: %v", err)
	}
}

// LOW: the self-referral guard compares IPv6 by /64 and IPv4 exactly.
func TestBugHunt5_SameClientNetwork(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"2001:db8:1:2:aaaa::1", "2001:db8:1:2:bbbb::9", true}, // privacy address rotated inside the /64
		{"2001:db8:1:2::1", "2001:db8:1:3::1", false},          // another /64
		{"203.0.113.5", "203.0.113.5", true},
		{"203.0.113.5", "203.0.113.6", false},
		{"::ffff:203.0.113.5", "203.0.113.5", true},
		{"203.0.113.5", "2001:db8::1", false},
		{"", "", false},
	}
	for _, c := range cases {
		if got := repository.SameClientNetwork(c.a, c.b); got != c.want {
			t.Errorf("SameClientNetwork(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
