package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

type fakeUnpaidRepo struct {
	stale    []repository.StaleSignup
	keep     map[uint64]bool // changed since the listing: DeleteUnpaidSignup reports false
	fail     map[uint64]bool
	cutoffs  []time.Time
	attempts []uint64
}

func (f *fakeUnpaidRepo) ListStaleUnpaidSignups(ctx context.Context, createdBefore time.Time) ([]repository.StaleSignup, error) {
	f.cutoffs = append(f.cutoffs, createdBefore)
	return f.stale, nil
}

func (f *fakeUnpaidRepo) DeleteUnpaidSignup(ctx context.Context, tenantID uint64, createdBefore time.Time) (bool, error) {
	f.attempts = append(f.attempts, tenantID)
	if f.fail[tenantID] {
		return false, errors.New("db down")
	}
	return !f.keep[tenantID], nil
}

// D3: the job uses a 30-day cutoff, deletes each listed tenant through the repository (which re-checks),
// counts only real removals and keeps going after one failure.
func TestCleanupUnpaidSignups(t *testing.T) {
	now := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	repo := &fakeUnpaidRepo{
		stale: []repository.StaleSignup{{TenantID: 1, Slug: "a"}, {TenantID: 2, Slug: "b"}, {TenantID: 3, Slug: "c"}},
		keep:  map[uint64]bool{2: true},
		fail:  map[uint64]bool{3: true},
	}
	n, err := CleanupUnpaidSignups(context.Background(), repo, "", now)
	if err != nil {
		t.Fatalf("cleanup: %v", err)
	}
	if n != 1 || len(repo.attempts) != 3 {
		t.Fatalf("expected 1 removal out of 3 attempts, got %d / %v", n, repo.attempts)
	}
	if want := now.Add(-30 * 24 * time.Hour); !repo.cutoffs[0].Equal(want) {
		t.Fatalf("cutoff %s, want %s", repo.cutoffs[0], want)
	}
}
