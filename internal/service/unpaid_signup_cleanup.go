package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// UnpaidSignupMaxAge: a self-signup travel still pending this long after signup, with no payment
// activity at all, is removed (keputusan pendiri 6 Okt 2026).
const UnpaidSignupMaxAge = 30 * 24 * time.Hour

// CleanupUnpaidSignups removes every self-signup travel that is still pending, was created more than
// UnpaidSignupMaxAge before now and never had any payment activity (see
// repository.UnpaidSignupRepository for the exact conditions, re-checked per tenant inside the delete
// transaction). This frees its slug, admin email and WhatsApp number. uploadsRoot is the public uploads
// folder ("" skips file removal); the travel's private uploads are removed too. Each removal is logged.
func CleanupUnpaidSignups(ctx context.Context, repo repository.UnpaidSignupRepository, uploadsRoot string, now time.Time) (int, error) {
	cutoff := now.Add(-UnpaidSignupMaxAge)
	stale, err := repo.ListStaleUnpaidSignups(ctx, cutoff)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, s := range stale {
		ok, err := repo.DeleteUnpaidSignup(ctx, s.TenantID, cutoff)
		if err != nil {
			log.Printf("[Signup cleanup] tenant %d (%s): cannot remove: %v", s.TenantID, s.Slug, err)
			continue
		}
		if !ok {
			continue // changed since the listing (paid, proof uploaded, ...): kept
		}
		removed++
		log.Printf("[Signup cleanup] removed unpaid signup: tenant id=%d slug=%s created_at=%s",
			s.TenantID, s.Slug, s.CreatedAt.In(jakartaLocation).Format(time.RFC3339))
		if uploadsRoot != "" {
			dirs := []string{
				filepath.Join(uploadsRoot, fmt.Sprintf("%d", s.TenantID)),
				filepath.Join(".", util.PrivateUploadsDir, fmt.Sprintf("%d", s.TenantID)),
			}
			for _, d := range dirs {
				if err := os.RemoveAll(d); err != nil {
					log.Printf("[Signup cleanup] tenant %d: cannot remove files in %s: %v", s.TenantID, d, err)
				}
			}
		}
	}
	return removed, nil
}

// StartUnpaidSignupCleanup runs CleanupUnpaidSignups a minute after start, then every interval (daily).
func StartUnpaidSignupCleanup(ctx context.Context, repo repository.UnpaidSignupRepository, uploadsRoot string, interval time.Duration) {
	go func() {
		timer := time.NewTimer(time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				RunJobSafely("signup-cleanup", func() {
					if n, err := CleanupUnpaidSignups(ctx, repo, uploadsRoot, time.Now()); err != nil {
						log.Printf("[Signup cleanup] failed: %v", err)
					} else if n > 0 {
						log.Printf("[Signup cleanup] removed %d unpaid signup(s)", n)
					}
				})
				timer.Reset(interval)
			}
		}
	}()
}
