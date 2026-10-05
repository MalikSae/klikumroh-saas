package repository_test

import (
	"context"
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Keputusan pendiri 5 Okt 2026: a coupon counts once per travel. Once tenant A paid with it, A cannot use
// it again (typed coupon, dashboard check, and approval of an invoice that still carries it), while
// tenant B (another travel) can still use the same coupon.
func TestCouponOncePerTravel(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	var staffID, planID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	if err := db.QueryRow(`SELECT id FROM pricing_plans WHERE price > 0 ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skipf("no paid pricing plan in test DB: %v", err)
	}

	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	couponRepo := repository.NewCouponRepository(db)

	coupon := &repository.Coupon{
		Code:               fmt.Sprintf("ONCE%d", time.Now().UnixNano()%1_000_000_000),
		DiscountPercentage: 10,
		Status:             "active",
	}
	if err := couponRepo.Create(ctx, coupon); err != nil {
		t.Fatalf("create coupon: %v", err)
	}
	// Registered first, so it runs after the tenants are purged (redemptions cascade anyway).
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM coupons WHERE id = ?`, coupon.ID) })

	tenantA := createDummyTenant(t, ctx, tenantRepo, "once-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "once-b")

	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo),
		repository.NewPricingPlanRepository(db), tenantRepo, repository.NewDomainRepository(db))
	reuse := sub.(interface {
		CouponUsableByTenant(ctx context.Context, tenantID uint64, coupon *repository.Coupon) error
	})
	code := coupon.Code

	approveWithProof := func(t *testing.T, tenantID uint64, pv *repository.PaymentVerification) error {
		t.Helper()
		proof := fmt.Sprintf("/uploads/%d/subscription-proofs/test-%d.webp", tenantID, pv.ID)
		if err := pvRepo.UpdateProofURL(ctx, tenantID, pv.ID, proof); err != nil {
			t.Fatalf("attach proof: %v", err)
		}
		return sub.ApproveVerification(ctx, pv.ID, staffID)
	}

	// First use by A: allowed, and approval records the redemption.
	pvA, err := sub.CreateRenewalRequest(ctx, tenantA.ID, planID, &code, nil)
	if err != nil {
		t.Fatalf("first use by A: %v", err)
	}
	if pvA.CouponCode == nil {
		t.Fatalf("coupon not applied on A's first invoice")
	}
	if err := approveWithProof(t, tenantA.ID, pvA); err != nil {
		t.Fatalf("approve A: %v", err)
	}
	if used, err := couponRepo.HasTenantRedeemed(ctx, tenantA.ID, coupon.ID); err != nil || !used {
		t.Fatalf("expected A's redemption recorded, got %v (%v)", used, err)
	}

	// Second use by A: refused everywhere.
	if _, err := sub.CreateRenewalRequest(ctx, tenantA.ID, planID, &code, nil); !errors.Is(err, service.ErrCouponUsedByTenant) {
		t.Fatalf("A reusing the coupon: expected ErrCouponUsedByTenant, got %v", err)
	}
	if err := reuse.CouponUsableByTenant(ctx, tenantA.ID, coupon); !errors.Is(err, service.ErrCouponUsedByTenant) {
		t.Fatalf("dashboard check for A: expected ErrCouponUsedByTenant, got %v", err)
	}
	if service.ErrCouponUsedByTenant.Error() != "Kupon ini sudah pernah dipakai travel Anda" {
		t.Fatalf("unexpected message: %q", service.ErrCouponUsedByTenant.Error())
	}

	// CRITICAL: A's redemption never blocks tenant B.
	if used, err := couponRepo.HasTenantRedeemed(ctx, tenantB.ID, coupon.ID); err != nil || used {
		t.Fatalf("tenant B must not see A's redemption, got %v (%v)", used, err)
	}
	if err := reuse.CouponUsableByTenant(ctx, tenantB.ID, coupon); err != nil {
		t.Fatalf("dashboard check for B: %v", err)
	}
	pvB, err := sub.CreateRenewalRequest(ctx, tenantB.ID, planID, &code, nil)
	if err != nil || pvB.CouponCode == nil {
		t.Fatalf("B using the coupon: %v (coupon %v)", err, pvB)
	}

	// Approval re-check: an invoice of A that already carries the coupon (made before the first approval)
	// is refused and stays pending.
	stale := &repository.PaymentVerification{
		TenantID: tenantA.ID, PlanID: planID, CouponCode: &code, Amount: pvA.Amount,
		FinalAmount: pvA.FinalAmount + 1, UniqueCode: pvA.UniqueCode + 1, Status: "pending",
	}
	if err := pvRepo.Create(ctx, stale); err != nil {
		t.Fatalf("stale invoice: %v", err)
	}
	if err := approveWithProof(t, tenantA.ID, stale); !errors.Is(err, service.ErrCouponUsedByTenant) {
		t.Fatalf("approving A's second invoice with the coupon: expected ErrCouponUsedByTenant, got %v", err)
	}
	if got, _ := pvRepo.GetByID(ctx, stale.ID); got.Status != "pending" {
		t.Fatalf("refused approval must leave the invoice pending, got %s", got.Status)
	}

	// B's first payment with the coupon is still approved.
	if err := approveWithProof(t, tenantB.ID, pvB); err != nil {
		t.Fatalf("approve B: %v", err)
	}
}

// PendingFinalAmounts lists open invoice totals in a range, leaving out the given invoice; the unique
// transfer code is picked against it.
func TestPendingFinalAmounts(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	var planID uint64
	if err := db.QueryRow(`SELECT id FROM pricing_plans ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skipf("no pricing plan in test DB: %v", err)
	}
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	tenantA := createDummyTenant(t, ctx, tenantRepo, "codes-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "codes-b")

	// An unusual base amount so rows of other tests do not fall in the range.
	base := 987654000.0 + float64(time.Now().UnixNano()%1000)*1000
	mk := func(tenantID uint64, code int, status string) *repository.PaymentVerification {
		pv := &repository.PaymentVerification{TenantID: tenantID, PlanID: planID, Amount: base, FinalAmount: base + float64(code), UniqueCode: code, Status: status}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("create invoice: %v", err)
		}
		return pv
	}
	a := mk(tenantA.ID, 101, "pending")
	mk(tenantB.ID, 202, "pending")
	mk(tenantB.ID, 303, "rejected")

	lister := pvRepo.(interface {
		PendingFinalAmounts(ctx context.Context, minAmount, maxAmount float64, excludeID uint64) ([]float64, error)
	})
	got, err := lister.PendingFinalAmounts(ctx, base+100, base+999, 0)
	if err != nil {
		t.Fatalf("PendingFinalAmounts: %v", err)
	}
	has := func(list []float64, v float64) bool {
		for _, x := range list {
			if math.Round(x*100) == math.Round(v*100) {
				return true
			}
		}
		return false
	}
	if len(got) != 2 || !has(got, base+101) || !has(got, base+202) {
		t.Fatalf("expected the two pending totals, got %v", got)
	}
	got, _ = lister.PendingFinalAmounts(ctx, base+100, base+999, a.ID)
	if len(got) != 1 || !has(got, base+202) {
		t.Fatalf("excluded invoice still listed: %v", got)
	}
}

// A payout id that does not exist is "not found" (404), not a conflict.
func TestAffiliatorPayout_UnknownIDIsNotFound(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	repo := repository.NewAffiliatorRepository(db)

	var maxID uint64
	_ = db.QueryRow(`SELECT COALESCE(MAX(id), 0) FROM affiliator_payouts`).Scan(&maxID)
	missing := maxID + 1000
	if err := repo.MarkPayoutPaid(ctx, missing, 1); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("MarkPayoutPaid unknown id: expected ErrNotFound, got %v", err)
	}
	if err := repo.RejectPayout(ctx, missing, 1, "tes"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("RejectPayout unknown id: expected ErrNotFound, got %v", err)
	}
}
