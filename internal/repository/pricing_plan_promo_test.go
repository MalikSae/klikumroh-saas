package repository_test

import (
	"context"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Plan promo columns (migration 000070) round-trip through MySQL, and an invoice stores its promo snapshot.
func TestPricingPlanPromo_Persistence(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()
	plans := repository.NewPricingPlanRepository(db)

	pct := 50.0
	ends := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	plan := &repository.PricingPlan{Name: "Promo Test 12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &pct, PromoEndsAt: &ends}
	if err := plans.Create(ctx, plan); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM pricing_plans WHERE id = ?`, plan.ID) })

	got, err := plans.GetByID(ctx, plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.PromoPercent == nil || *got.PromoPercent != 50 || got.PromoEndsAt == nil || got.PromoEndsAt.Format("2006-01-02") != "2026-12-31" {
		t.Fatalf("promo not stored: %v %v", got.PromoPercent, got.PromoEndsAt)
	}
	// Last day inclusive (WIB): active on 31 Dec at 23:00 WIB, over on 1 Jan.
	wib := time.FixedZone("WIB", 7*3600)
	if got.ActivePromo(time.Date(2026, 12, 31, 23, 0, 0, 0, wib)) != 50 {
		t.Fatal("promo must still apply on its last day")
	}
	if got.ActivePromo(time.Date(2027, 1, 1, 0, 30, 0, 0, wib)) != 0 {
		t.Fatal("promo must end after its last day")
	}

	// A promo change keeps updated_at (rejected invoices of the plan can still be reopened).
	if _, err := db.Exec(`UPDATE pricing_plans SET updated_at = '2026-01-01 00:00:00' WHERE id = ?`, plan.ID); err != nil {
		t.Fatal(err)
	}
	thirty := 30.0
	if err := plans.(interface {
		UpdatePromo(context.Context, uint64, *float64, *time.Time) error
	}).UpdatePromo(ctx, plan.ID, &thirty, nil); err != nil {
		t.Fatal(err)
	}
	if after, _ := plans.GetByID(ctx, plan.ID); after.UpdatedAt.Year() != 2026 || after.UpdatedAt.Month() != 1 || after.PromoPercent == nil || *after.PromoPercent != 30 {
		t.Fatalf("UpdatePromo must write the promo and keep updated_at, got %v %v", after.PromoPercent, after.UpdatedAt)
	}

	got.PromoPercent, got.PromoEndsAt = nil, nil
	if err := plans.Update(ctx, got); err != nil {
		t.Fatal(err)
	}
	cleared, _ := plans.GetByID(ctx, plan.ID)
	if cleared.PromoPercent != nil || cleared.PromoEndsAt != nil {
		t.Fatal("promo not cleared")
	}

	e := setupBH5(t, "promo-pv", 0)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	pv := &repository.PaymentVerification{TenantID: e.tenant.ID, PlanID: plan.ID, PromoPercent: &pct, Amount: 4800000, FinalAmount: 2400123, UniqueCode: 123, Status: "pending"}
	if err := pvRepo.Create(ctx, pv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM payment_verifications WHERE id = ?`, pv.ID) })
	back, err := pvRepo.GetByID(ctx, pv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if back.PromoPercent == nil || *back.PromoPercent != 50 {
		t.Fatalf("invoice promo snapshot not stored: %v", back.PromoPercent)
	}
	if err := pvRepo.UpdateDetails(ctx, pv.ID, plan.ID, nil, nil, 4800000, 4800123, 123, nil); err != nil {
		t.Fatal(err)
	}
	if back, _ = pvRepo.GetByID(ctx, pv.ID); back.PromoPercent != nil {
		t.Fatal("UpdateDetails must write the promo given (nil clears it)")
	}
}
