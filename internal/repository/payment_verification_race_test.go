package repository_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Regresi temuan audit #4 di MySQL asli: conditional UPDATE harus membuat hanya satu transisi yang menang.
func TestPaymentVerification_TransitionStatusIsAtomic(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	planRepo := repository.NewPricingPlanRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)

	tenant := createDummyTenant(t, ctx, tenantRepo, "race")
	plan := &repository.PricingPlan{Name: fmt.Sprintf("Race Plan %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("create plan: %v", err)
	}
	pv := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: 1500000, FinalAmount: 1500123, UniqueCode: 123, Status: "pending"}
	if err := pvRepo.Create(ctx, pv); err != nil {
		t.Fatalf("create verification: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM payment_verifications WHERE tenant_id = ?", tenant.ID)
		_ = planRepo.Delete(ctx, plan.ID)
		_ = tenantRepo.Delete(ctx, tenant.ID)
	})

	t.Run("8 concurrent pending->approved transitions: exactly 1 wins", func(t *testing.T) {
		const n = 8
		var wg sync.WaitGroup
		results := make([]error, n)
		start := make(chan struct{})
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				<-start
				now := time.Now()
				staffID := uint64(1)
				results[i] = pvRepo.TransitionStatus(ctx, pv.ID, "pending", "approved", nil, &staffID, &now)
			}(i)
		}
		close(start)
		wg.Wait()

		wins, conflicts := 0, 0
		for _, err := range results {
			switch {
			case err == nil:
				wins++
			case errors.Is(err, repository.ErrStatusConflict):
				conflicts++
			default:
				t.Fatalf("unexpected error: %v", err)
			}
		}
		if wins != 1 || conflicts != n-1 {
			t.Fatalf("expected 1 win / %d conflicts, got %d / %d", n-1, wins, conflicts)
		}
	})

	t.Run("pending-only detail update cannot revert an approved invoice", func(t *testing.T) {
		err := pvRepo.UpdateDetails(ctx, pv.ID, plan.ID, nil, 1500000, 1500999, 999, nil)
		if !errors.Is(err, repository.ErrStatusConflict) {
			t.Fatalf("expected ErrStatusConflict, got %v", err)
		}
		got, err := pvRepo.GetByID(ctx, pv.ID)
		if err != nil {
			t.Fatalf("GetByID: %v", err)
		}
		if got.Status != "approved" || got.FinalAmount != 1500123 {
			t.Fatalf("approved invoice was modified: status=%s final=%.0f", got.Status, got.FinalAmount)
		}
	})

	t.Run("transition on missing id returns ErrNotFound", func(t *testing.T) {
		if err := pvRepo.TransitionStatus(ctx, 999999999, "pending", "approved", nil, nil, nil); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("expected ErrNotFound, got %v", err)
		}
	})
}
