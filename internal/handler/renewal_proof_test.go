package handler_test

import (
	"context"
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regresi temuan audit #2: bukti transfer tidak boleh tetap menempel pada tagihan yang nominalnya diganti travel.
func TestRenewal_ProofClearedWhenTravelChangesAmount(t *testing.T) {
	ctx := context.Background()

	setup := func() (service.SubscriptionService, *mockPVRepo, *repository.PaymentVerification) {
		pvRepo := newMockPVRepo()
		couponRepo := newMockCouponRepo()
		planRepo := newMockPlanRepoPublic()
		tenantRepo := newMockTenantRepoPublic()
		planRepo.plans[1] = &repository.PricingPlan{ID: 1, Name: "3 Bulan", PeriodMonths: 3, Price: 1500000}
		planRepo.plans[3] = &repository.PricingPlan{ID: 3, Name: "12 Bulan", PeriodMonths: 12, Price: 4800000}
		tenantRepo.tenants[500] = &repository.Tenant{ID: 500, Name: "Travel Renewal", Slug: "travel-renewal", Status: "active"}

		svc := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)

		oldProof := "/uploads/500/subscription-proofs/old-proof-3bulan.webp"
		pv := &repository.PaymentVerification{
			TenantID:    500,
			PlanID:      1,
			Amount:      1500000,
			FinalAmount: 1500278,
			UniqueCode:  278,
			ProofURL:    &oldProof,
			Status:      "pending",
		}
		_ = pvRepo.Create(ctx, pv)
		return svc, pvRepo, pv
	}

	t.Run("switching to a pricier plan clears the old proof", func(t *testing.T) {
		svc, pvRepo, pv := setup()

		got, err := svc.CreateRenewalRequest(ctx, 500, 3, nil, nil)
		if err != nil {
			t.Fatalf("CreateRenewalRequest failed: %v", err)
		}
		stored := pvRepo.verifications[pv.ID]
		if got.ID != pv.ID {
			t.Fatalf("expected existing pending invoice %d reused, got %d", pv.ID, got.ID)
		}
		if stored.PlanID != 3 || stored.Amount != 4800000 {
			t.Fatalf("expected plan 3 / amount 4800000, got plan %d / amount %.0f", stored.PlanID, stored.Amount)
		}
		if stored.ProofURL != nil || got.ProofURL != nil {
			t.Fatalf("SECURITY VIOLATION: proof for Rp1.500.278 still attached to Rp%.0f invoice: %v", stored.FinalAmount, *stored.ProofURL)
		}
	})

	t.Run("re-submitting the same plan keeps unique code and proof", func(t *testing.T) {
		svc, pvRepo, pv := setup()

		got, err := svc.CreateRenewalRequest(ctx, 500, 1, nil, nil)
		if err != nil {
			t.Fatalf("CreateRenewalRequest failed: %v", err)
		}
		stored := pvRepo.verifications[pv.ID]
		if stored.UniqueCode != 278 || stored.FinalAmount != 1500278 || got.FinalAmount != 1500278 {
			t.Fatalf("expected unique code 278 / final 1500278 unchanged, got %d / %.0f", stored.UniqueCode, stored.FinalAmount)
		}
		if stored.ProofURL == nil || *stored.ProofURL != "/uploads/500/subscription-proofs/old-proof-3bulan.webp" {
			t.Fatalf("expected proof kept when amount unchanged, got %v", stored.ProofURL)
		}
	})

	t.Run("plan change with a new proof in the same request keeps only the new proof", func(t *testing.T) {
		svc, pvRepo, pv := setup()

		newProof := "/uploads/500/subscription-proofs/new-proof-12bulan.webp"
		if _, err := svc.CreateRenewalRequest(ctx, 500, 3, nil, &newProof); err != nil {
			t.Fatalf("CreateRenewalRequest failed: %v", err)
		}
		stored := pvRepo.verifications[pv.ID]
		if stored.ProofURL == nil || *stored.ProofURL != newProof {
			t.Fatalf("expected new proof attached, got %v", stored.ProofURL)
		}
	})

	t.Run("staff plan adjustment keeps the proof", func(t *testing.T) {
		svc, pvRepo, pv := setup()

		if _, err := svc.UpdateVerificationPlan(ctx, pv.ID, 3, 1); err != nil {
			t.Fatalf("UpdateVerificationPlan failed: %v", err)
		}
		stored := pvRepo.verifications[pv.ID]
		if stored.ProofURL == nil {
			t.Fatalf("expected staff plan adjustment to keep proof, got nil")
		}
	})
}
