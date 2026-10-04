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

// IncrementUsedCount against the real database: concurrent approvals can never push used_count past
// max_uses, ReleaseUsedCount gives a use back, and an unlimited coupon keeps counting.
func TestCouponUsedCount_RespectsMaxUses(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	repo := repository.NewCouponRepository(db)

	newCoupon := func(label string, maxUses *int) *repository.Coupon {
		t.Helper()
		c := &repository.Coupon{
			Code:               fmt.Sprintf("LIM%s%d", label, time.Now().UnixNano()%1_000_000_000),
			DiscountPercentage: 10,
			MaxUses:            maxUses,
			Status:             "active",
		}
		if err := repo.Create(ctx, c); err != nil {
			t.Fatalf("create coupon %s: %v", label, err)
		}
		t.Cleanup(func() { _, _ = db.Exec("DELETE FROM coupons WHERE id = ?", c.ID) })
		return c
	}
	usedCount := func(id uint64) int {
		t.Helper()
		c, err := repo.GetByID(ctx, id)
		if err != nil {
			t.Fatalf("GetByID: %v", err)
		}
		return c.UsedCount
	}

	t.Run("concurrent increments stop exactly at max_uses", func(t *testing.T) {
		limit := 3
		c := newCoupon("A", &limit)

		var wg sync.WaitGroup
		var mu sync.Mutex
		ok, refused := 0, 0
		for i := 0; i < 10; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				err := repo.IncrementUsedCount(ctx, c.ID)
				mu.Lock()
				defer mu.Unlock()
				switch {
				case err == nil:
					ok++
				case errors.Is(err, repository.ErrCouponLimitReached):
					refused++
				default:
					t.Errorf("unexpected error: %v", err)
				}
			}()
		}
		wg.Wait()

		if ok != 3 || refused != 7 {
			t.Fatalf("expected 3 accepted / 7 refused, got %d / %d", ok, refused)
		}
		if got := usedCount(c.ID); got != 3 {
			t.Fatalf("used_count = %d, want 3", got)
		}
	})

	t.Run("release gives one use back", func(t *testing.T) {
		limit := 1
		c := newCoupon("B", &limit)
		if err := repo.IncrementUsedCount(ctx, c.ID); err != nil {
			t.Fatalf("first use: %v", err)
		}
		if err := repo.IncrementUsedCount(ctx, c.ID); !errors.Is(err, repository.ErrCouponLimitReached) {
			t.Fatalf("second use: expected ErrCouponLimitReached, got %v", err)
		}
		if err := repo.ReleaseUsedCount(ctx, c.ID); err != nil {
			t.Fatalf("release: %v", err)
		}
		if err := repo.IncrementUsedCount(ctx, c.ID); err != nil {
			t.Fatalf("use after release: %v", err)
		}
		if got := usedCount(c.ID); got != 1 {
			t.Fatalf("used_count = %d, want 1", got)
		}
	})

	t.Run("unlimited coupon keeps counting; unknown coupon is not found", func(t *testing.T) {
		c := newCoupon("C", nil)
		for i := 0; i < 5; i++ {
			if err := repo.IncrementUsedCount(ctx, c.ID); err != nil {
				t.Fatalf("use %d: %v", i, err)
			}
		}
		if got := usedCount(c.ID); got != 5 {
			t.Fatalf("used_count = %d, want 5", got)
		}
		if err := repo.IncrementUsedCount(ctx, 0); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("unknown coupon: expected ErrNotFound, got %v", err)
		}
	})
}
