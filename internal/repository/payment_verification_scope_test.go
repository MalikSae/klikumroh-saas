package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Isolation audit I5 (30 Sep 2026) against real MySQL: travel-side writes to payment_verifications are
// scoped by tenant_id in the repository, so tenant B can never touch tenant A's invoice.
func TestPaymentVerification_TravelWritesAreTenantScoped(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)

	a := createDummyTenant(t, ctx, tenantRepo, "pv-a")
	b := createDummyTenant(t, ctx, tenantRepo, "pv-b")
	plan := &repository.PricingPlan{Name: fmt.Sprintf("Scope Plan %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("create plan: %v", err)
	}
	pv := &repository.PaymentVerification{TenantID: a.ID, PlanID: plan.ID, Amount: 1500000, FinalAmount: 1500123, UniqueCode: 123, Status: "pending"}
	if err := pvRepo.Create(ctx, pv); err != nil {
		t.Fatalf("create verification: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM payment_verifications WHERE tenant_id IN (?, ?)", a.ID, b.ID)
		_ = planRepo.Delete(ctx, plan.ID)
	})

	proof := fmt.Sprintf("/uploads/%d/subscription-proofs/x.webp", b.ID)
	if err := pvRepo.UpdateProofURL(ctx, b.ID, pv.ID, proof); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("UpdateProofURL from tenant B: expected ErrNotFound, got %v", err)
	}
	if err := pvRepo.ResetToPendingWithProof(ctx, b.ID, pv.ID, proof); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("ResetToPendingWithProof from tenant B: expected ErrNotFound, got %v", err)
	}
	if err := pvRepo.ReplaceDetails(ctx, b.ID, pv.ID, plan.ID, nil, nil, 1, 1, 1, &proof); err == nil {
		t.Fatal("ReplaceDetails from tenant B must fail")
	}
	got, err := pvRepo.GetByID(ctx, pv.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ProofURL != nil || got.Amount != 1500000 {
		t.Fatalf("tenant A's invoice was modified by tenant B: proof=%v amount=%.0f", got.ProofURL, got.Amount)
	}

	own := fmt.Sprintf("/uploads/%d/subscription-proofs/y.webp", a.ID)
	if err := pvRepo.UpdateProofURL(ctx, a.ID, pv.ID, own); err != nil {
		t.Fatalf("UpdateProofURL by owner: %v", err)
	}

	// ResetToPendingWithProof reopens only a rejected invoice: a pending or approved one is never
	// flipped back (bug hunt 5 Oct 2026).
	if err := pvRepo.ResetToPendingWithProof(ctx, a.ID, pv.ID, own); !errors.Is(err, repository.ErrStatusConflict) {
		t.Fatalf("reset of a pending invoice: expected ErrStatusConflict, got %v", err)
	}
	reason := "Nominal tidak sesuai"
	if err := pvRepo.TransitionStatus(ctx, pv.ID, "pending", "rejected", &reason, nil, nil); err != nil {
		t.Fatalf("reject: %v", err)
	}
	if err := pvRepo.ResetToPendingWithProof(ctx, a.ID, pv.ID, own); err != nil {
		t.Fatalf("reset of a rejected invoice: %v", err)
	}
	now := time.Now()
	if err := pvRepo.TransitionStatus(ctx, pv.ID, "pending", "approved", nil, nil, &now); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if err := pvRepo.ResetToPendingWithProof(ctx, a.ID, pv.ID, own); !errors.Is(err, repository.ErrStatusConflict) {
		t.Fatalf("reset of an approved invoice: expected ErrStatusConflict, got %v", err)
	}
	if got, _ := pvRepo.GetByID(ctx, pv.ID); got.Status != "approved" {
		t.Fatalf("approved invoice was flipped to %q", got.Status)
	}
}
