package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Plan promo (founder decision 7 Oct 2026): a percent off a plan for a new travel's first payment; a coupon
// comes off the promo price (50% + 20% = 60% off), renewals pay the normal price, and an invoice keeps the
// promo it was billed with.
func TestPlanPromo_Billing(t *testing.T) {
	fifty := 50.0

	signup := func(t *testing.T, plan *repository.PricingPlan, coupon string) (*mockPVRepo, float64) {
		t.Helper()
		_, _, planRepo, couponRepo, pvRepo, _, r := setupPublicSignupEnv()
		planRepo.plans[plan.ID] = plan
		couponRepo.coupons[20] = &repository.Coupon{ID: 20, Code: "AFF20", DiscountPercentage: 20, Status: "active"}
		body := map[string]interface{}{
			"travel_name": "Travel Promo", "slug": "travel-promo", "admin_name": "Owner Promo",
			"admin_email": "owner@promo.id", "admin_password": "password123", "plan_id": plan.ID,
		}
		if coupon != "" {
			body["coupon_code"] = coupon
		}
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/public/tenant-signup", bytes.NewBuffer(b))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("signup: %d %s", w.Code, w.Body.String())
		}
		var res map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		final, _ := res["final_amount"].(float64)
		return pvRepo, final
	}
	inRange := func(t *testing.T, got, base float64) {
		t.Helper()
		if got < base+100 || got > base+999 {
			t.Fatalf("final amount %.0f, want %.0f plus a unique code (100-999)", got, base)
		}
	}

	t.Run("promo 50% then coupon 20%: 4.800.000 -> 1.920.000", func(t *testing.T) {
		plan := &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty}
		pvRepo, final := signup(t, plan, "AFF20")
		inRange(t, final, 1920000)
		for _, pv := range pvRepo.verifications {
			if pv.Amount != 4800000 || pv.PromoPercent == nil || *pv.PromoPercent != 50 {
				t.Fatalf("invoice must keep the normal price and the promo snapshot, got amount %.0f promo %v", pv.Amount, pv.PromoPercent)
			}
		}
	})

	t.Run("promo alone: 2.400.000", func(t *testing.T) {
		plan := &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty}
		_, final := signup(t, plan, "")
		inRange(t, final, 2400000)
	})

	t.Run("promo whose last day has passed is not applied", func(t *testing.T) {
		ended := time.Now().AddDate(0, 0, -2)
		plan := &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty, PromoEndsAt: &ended}
		pvRepo, final := signup(t, plan, "AFF20")
		inRange(t, final, 3840000)
		for _, pv := range pvRepo.verifications {
			if pv.PromoPercent != nil {
				t.Fatalf("an ended promo must not be stored on the invoice, got %v", *pv.PromoPercent)
			}
		}
	})

	t.Run("renewal of a travel that already paid: normal price", func(t *testing.T) {
		planRepo := newMockPlanRepoPublic()
		planRepo.plans[3] = &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty}
		pvRepo := newMockPVRepo()
		pvRepo.verifications[99] = &repository.PaymentVerification{ID: 99, TenantID: 7, PlanID: 3, Amount: 4800000, FinalAmount: 2400123, Status: "approved"}
		couponRepo := newMockCouponRepo()
		sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, newMockTenantRepoPublic())
		pv, err := sub.CreateRenewalRequest(context.Background(), 7, 3, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if pv.PromoPercent != nil || pv.FinalAmount < 4800100 || pv.FinalAmount > 4800999 {
			t.Fatalf("renewal must be billed at the normal price without promo, got %.0f promo %v", pv.FinalAmount, pv.PromoPercent)
		}
	})

	t.Run("unpaid signup changing plan gets the promo; the invoice keeps it after the promo ends", func(t *testing.T) {
		planRepo := newMockPlanRepoPublic()
		planRepo.plans[1] = &repository.PricingPlan{ID: 1, Name: "3 Bulan", PeriodMonths: 3, Price: 1500000}
		planRepo.plans[3] = &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty}
		pvRepo := newMockPVRepo()
		pvRepo.verifications[5] = &repository.PaymentVerification{ID: 5, TenantID: 8, PlanID: 1, Amount: 1500000, FinalAmount: 1500321, UniqueCode: 321, Status: "pending"}
		pvRepo.nextID = 6
		couponRepo := newMockCouponRepo()
		sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, newMockTenantRepoPublic())
		pv, err := sub.CreateRenewalRequest(context.Background(), 8, 3, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if pv.PromoPercent == nil || pv.FinalAmount < 2400100 || pv.FinalAmount > 2400999 {
			t.Fatalf("first payment switching to the promo plan must get the promo, got %.0f promo %v", pv.FinalAmount, pv.PromoPercent)
		}
		before := pv.FinalAmount
		planRepo.plans[3].PromoPercent = nil // promo switched off
		again, err := sub.CreateRenewalRequest(context.Background(), 8, 3, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if again.FinalAmount != before || again.PromoPercent == nil {
			t.Fatalf("the open invoice must keep its promo price, got %.0f (was %.0f)", again.FinalAmount, before)
		}
	})
}

// Audit 7 Oct 2026: a travel activated by hand by staff (no approved invoice) is not a new travel, and an
// open invoice billed without a promo stays without one when a promo starts later.
func TestPlanPromo_AuditFixes(t *testing.T) {
	fifty := 50.0
	newSub := func(planRepo *mockPlanRepoPublic, pvRepo *mockPVRepo, tenants *mockTenantRepoPublic) service.SubscriptionService {
		couponRepo := newMockCouponRepo()
		return service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenants)
	}

	t.Run("travel activated by staff renews at the normal price", func(t *testing.T) {
		planRepo := newMockPlanRepoPublic()
		planRepo.plans[3] = &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty}
		tenants := newMockTenantRepoPublic()
		planID := uint64(3)
		expires := time.Now().AddDate(0, 1, 0)
		tenants.tenants[9] = &repository.Tenant{ID: 9, Name: "Manual", Status: "active", CurrentPlanID: &planID, SubscriptionExpiresAt: &expires}
		pv, err := newSub(planRepo, newMockPVRepo(), tenants).CreateRenewalRequest(context.Background(), 9, 3, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if pv.PromoPercent != nil || pv.FinalAmount < 4800100 {
			t.Fatalf("a hand-activated travel must not get the new-travel promo, got %.0f promo %v", pv.FinalAmount, pv.PromoPercent)
		}
	})

	t.Run("open invoice without promo is not repriced when a promo starts", func(t *testing.T) {
		planRepo := newMockPlanRepoPublic()
		planRepo.plans[3] = &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000, PromoPercent: &fifty}
		pvRepo := newMockPVRepo()
		proof := "/uploads/payment_proofs/x.webp"
		pvRepo.verifications[5] = &repository.PaymentVerification{ID: 5, TenantID: 8, PlanID: 3, Amount: 4800000, FinalAmount: 4800321, UniqueCode: 321, ProofURL: &proof, Status: "pending"}
		pvRepo.nextID = 6
		pv, err := newSub(planRepo, pvRepo, newMockTenantRepoPublic()).CreateRenewalRequest(context.Background(), 8, 3, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if pv.PromoPercent != nil || pv.FinalAmount != 4800321 || pv.ProofURL == nil {
			t.Fatalf("the open invoice must keep its amount and proof, got %.0f promo %v proof %v", pv.FinalAmount, pv.PromoPercent, pv.ProofURL)
		}
	})
}

func TestPlanPromo_SetPromoValidation(t *testing.T) {
	planRepo := newMockPlanRepoPublic()
	planRepo.plans[3] = &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000}
	svc := service.NewPricingPlanService(planRepo)
	ctx := context.Background()
	pct := func(v float64) *float64 { return &v }

	if _, err := svc.SetPromo(ctx, 3, pct(100), nil); !errors.Is(err, service.ErrInvalidPlanPromo) {
		t.Fatalf("100%% must be refused, got %v", err)
	}
	past := time.Now().AddDate(0, 0, -3)
	if _, err := svc.SetPromo(ctx, 3, pct(50), &past); !errors.Is(err, service.ErrPlanPromoEnded) {
		t.Fatalf("a past end date must be refused, got %v", err)
	}
	p, err := svc.SetPromo(ctx, 3, pct(50), nil)
	if err != nil || p.PromoPercent == nil || *p.PromoPercent != 50 || p.ActivePromo(time.Now()) != 50 {
		t.Fatalf("50%% without end date must be active, got %v %v", p, err)
	}
	// Editing the plan keeps its promo.
	if _, err := svc.Update(ctx, 3, "12 Bulan Hemat", 12, 4800000, nil); err != nil {
		t.Fatal(err)
	}
	if planRepo.plans[3].PromoPercent == nil {
		t.Fatal("updating the plan must keep the promo")
	}
	if p, err := svc.SetPromo(ctx, 3, pct(0), nil); err != nil || p.PromoPercent != nil {
		t.Fatalf("0 must clear the promo, got %v %v", p, err)
	}
}
