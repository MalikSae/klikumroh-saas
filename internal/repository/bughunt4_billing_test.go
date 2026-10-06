package repository_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt putaran 4 (billing), real database. Every test tenant is purged by createDummyTenant's cleanup.

// M1: a manual activation by staff cancels rejected invoices too (a new proof could otherwise reopen an
// old invoice with its old price and coupon); another travel's rejected invoice is untouched.
func TestBugHunt4_ManualChangeCancelsRejectedInvoices(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	var staffID, planID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	if err := db.QueryRow(`SELECT id FROM pricing_plans ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skipf("no pricing plan in test DB: %v", err)
	}
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	a := createDummyTenant(t, ctx, tenantRepo, "bh4-rej-a")
	b := createDummyTenant(t, ctx, tenantRepo, "bh4-rej-b")

	reject := func(tenantID uint64) uint64 {
		proof := fmt.Sprintf("/uploads/%d/subscription-proofs/x.webp", tenantID)
		pv := &repository.PaymentVerification{TenantID: tenantID, PlanID: planID, Amount: 1000, FinalAmount: 1123, UniqueCode: 123, ProofURL: &proof}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("invoice: %v", err)
		}
		reason, now := "bukti buram", time.Now()
		if err := pvRepo.TransitionStatus(ctx, pv.ID, "pending", "rejected", &reason, &staffID, &now); err != nil {
			t.Fatalf("reject: %v", err)
		}
		return pv.ID
	}
	rejA, rejB := reject(a.ID), reject(b.ID)

	couponRepo := repository.NewCouponRepository(db)
	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo),
		repository.NewPricingPlanRepository(db), tenantRepo)
	sub.(service.ManualSubscriptionHook).HandleManualSubscriptionChange(ctx, a.ID, false, "Paket", time.Now().AddDate(0, 3, 0), staffID)

	gotA, _ := pvRepo.GetByID(ctx, rejA)
	gotB, _ := pvRepo.GetByID(ctx, rejB)
	t.Logf("tenant A invoice %d: status=%s reason=%v; tenant B invoice %d: status=%s", rejA, gotA.Status, *gotA.RejectionReason, rejB, gotB.Status)
	if gotA.Status != "cancelled" || *gotA.RejectionReason != service.ManualCancelReason {
		t.Fatalf("rejected invoice of the activated travel must be cancelled, got %s %v", gotA.Status, *gotA.RejectionReason)
	}
	if gotB.Status != "rejected" {
		t.Fatalf("CROSS-TENANT: another travel's rejected invoice changed to %s", gotB.Status)
	}
}

// D4: is_public round trip (column default TRUE, hidden plan stored and read back, JSON field).
func TestBugHunt4_PricingPlanIsPublic(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	repo := repository.NewPricingPlanRepository(db)
	svc := service.NewPricingPlanService(repo)

	hidden, err := svc.Create(ctx, fmt.Sprintf("BH4 hidden %d", time.Now().UnixNano()), 1, 0, false)
	if err != nil {
		t.Fatalf("create hidden: %v", err)
	}
	public, err := svc.Create(ctx, fmt.Sprintf("BH4 public %d", time.Now().UnixNano()), 1, 100000, true)
	if err != nil {
		t.Fatalf("create public: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM pricing_plans WHERE id IN (?, ?)`, hidden.ID, public.ID)
	})

	var raw int
	_ = db.QueryRow(`SELECT is_public FROM pricing_plans WHERE id = ?`, hidden.ID).Scan(&raw)
	t.Logf("raw is_public of hidden plan %d = %d", hidden.ID, raw)
	if raw != 0 {
		t.Fatalf("hidden plan stored is_public=%d", raw)
	}
	got, _ := repo.GetByID(ctx, hidden.ID)
	if !got.Hidden {
		t.Fatal("hidden plan read back as public")
	}
	js, _ := json.Marshal(got)
	if !strings.Contains(string(js), `"is_public":false`) {
		t.Fatalf("plan JSON must carry is_public=false: %s", js)
	}

	// The travel list: public plans only, plus its own current plan.
	list, _ := svc.ListForTravel(ctx, nil)
	for _, p := range list {
		if p.ID == hidden.ID {
			t.Fatal("hidden plan offered to a travel without it")
		}
	}
	current := hidden.ID
	list, _ = svc.ListForTravel(ctx, &current)
	found := false
	for _, p := range list {
		found = found || p.ID == hidden.ID
	}
	if !found {
		t.Fatal("the travel's own hidden plan must stay in its list (renewal)")
	}

	// Update without is_public keeps visibility; with it, changes it.
	if _, err := svc.Update(ctx, hidden.ID, got.Name, 1, 0, nil); err != nil {
		t.Fatalf("update: %v", err)
	}
	if again, _ := repo.GetByID(ctx, hidden.ID); !again.Hidden {
		t.Fatal("update without is_public must keep the plan hidden")
	}
	yes := true
	if _, err := svc.Update(ctx, hidden.ID, got.Name, 1, 0, &yes); err != nil {
		t.Fatalf("update: %v", err)
	}
	if again, _ := repo.GetByID(ctx, hidden.ID); again.Hidden {
		t.Fatal("is_public=true must publish the plan")
	}
}

// D3: unpaid self-signups older than 30 days are removed with their dependent rows; anything with payment
// activity, younger than 30 days, not pending, the demo, or with prospects/agents is kept. Only this test's
// tenants are deleted (DeleteUnpaidSignup per id); the listing is only inspected for them.
func TestBugHunt4_UnpaidSignupCleanup(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	var planID uint64
	if err := db.QueryRow(`SELECT id FROM pricing_plans ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skipf("no pricing plan in test DB: %v", err)
	}
	tenantRepo := repository.NewTenantRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	repo := repository.NewUnpaidSignupRepository(db)
	now := time.Now()
	cutoff := now.Add(-service.UnpaidSignupMaxAge)

	mk := func(suffix string, age time.Duration, status string) *repository.Tenant {
		tn := createDummyTenant(t, ctx, tenantRepo, suffix)
		if _, err := db.Exec(`UPDATE tenants SET status = ?, created_at = ? WHERE id = ?`, status, now.Add(-age), tn.ID); err != nil {
			t.Fatalf("age tenant: %v", err)
		}
		admin := &repository.AdminUser{Email: fmt.Sprintf("bh4-%s-%d@example.test", suffix, now.UnixNano()), PasswordHash: "x", Name: "Admin", Status: "active"}
		if err := adminRepo.Create(ctx, tn.ID, admin); err != nil {
			t.Fatalf("admin: %v", err)
		}
		pv := &repository.PaymentVerification{TenantID: tn.ID, PlanID: planID, Amount: 1000, FinalAmount: 1123, UniqueCode: 123}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("invoice: %v", err)
		}
		if err := domainRepo.Create(ctx, tn.ID, &repository.Domain{TenantID: tn.ID, Hostname: tn.Slug + ".klikumroh.id", Type: "subdomain", Status: "active"}); err != nil {
			t.Fatalf("domain: %v", err)
		}
		return tn
	}
	day := 24 * time.Hour
	oldUnpaid := mk("bh4-old", 31*day, "pending")
	withProof := mk("bh4-proof", 31*day, "pending")
	young := mk("bh4-young", 29*day, "pending")
	active := mk("bh4-active", 31*day, "active")
	rejected := mk("bh4-rejected", 31*day, "pending")
	demo := mk("bh4-demo", 31*day, "pending")
	withProspect := mk("bh4-prospect", 31*day, "pending")
	_, _ = db.Exec(`UPDATE payment_verifications SET proof_url = '/uploads/x/subscription-proofs/p.webp' WHERE tenant_id = ?`, withProof.ID)
	_, _ = db.Exec(`UPDATE payment_verifications SET status = 'rejected' WHERE tenant_id = ?`, rejected.ID)
	_, _ = db.Exec(`UPDATE tenants SET is_demo = 1 WHERE id = ?`, demo.ID)
	if _, err := db.Exec(`INSERT INTO prospects (tenant_id, name, phone, source_channel, entry_method, status) VALUES (?, 'Jamaah', '6281200000000', 'organik', 'web_form', 'Baru')`, withProspect.ID); err != nil {
		t.Fatalf("prospect: %v", err)
	}

	stale, err := repo.ListStaleUnpaidSignups(ctx, cutoff)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	listed := map[uint64]bool{}
	for _, s := range stale {
		listed[s.TenantID] = true
	}
	ours := map[string]*repository.Tenant{"old unpaid": oldUnpaid, "with proof": withProof, "29 days": young, "active": active,
		"rejected invoice": rejected, "demo": demo, "with prospect": withProspect}
	for name, tn := range ours {
		want := tn.ID == oldUnpaid.ID
		t.Logf("listed %-16s tenant %d: %v", name, tn.ID, listed[tn.ID])
		if listed[tn.ID] != want {
			t.Fatalf("%s: listed=%v, want %v", name, listed[tn.ID], want)
		}
	}

	// Delete is attempted on every test tenant: only the stale unpaid one may go.
	for name, tn := range ours {
		removed, err := repo.DeleteUnpaidSignup(ctx, tn.ID, cutoff)
		if err != nil {
			t.Fatalf("%s: delete: %v", name, err)
		}
		if removed != (tn.ID == oldUnpaid.ID) {
			t.Fatalf("%s: removed=%v", name, removed)
		}
	}

	for _, q := range []string{"tenants WHERE id", "admin_users WHERE tenant_id", "payment_verifications WHERE tenant_id", "domains WHERE tenant_id"} {
		var n int
		_ = db.QueryRow(`SELECT COUNT(*) FROM `+q+` = ?`, oldUnpaid.ID).Scan(&n)
		t.Logf("removed tenant %d: COUNT(*) FROM %s = %d", oldUnpaid.ID, q, n)
		if n != 0 {
			t.Fatalf("removed tenant still has rows in %s: %d", q, n)
		}
	}
	if _, err := tenantRepo.GetBySlug(ctx, oldUnpaid.Slug); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("slug must be free again, got %v", err)
	}
	for name, tn := range ours {
		if tn.ID == oldUnpaid.ID {
			continue
		}
		var n int
		_ = db.QueryRow(`SELECT (SELECT COUNT(*) FROM tenants WHERE id = ?) + (SELECT COUNT(*) FROM admin_users WHERE tenant_id = ?)`, tn.ID, tn.ID).Scan(&n)
		if n != 2 {
			t.Fatalf("%s: kept tenant lost rows (tenant+admin count %d)", name, n)
		}
	}
}
