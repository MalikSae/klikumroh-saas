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

// TenantDataRetentionDays is how long after its suspension (end of the grace period) an unrenewed travel
// keeps its data before the operational data is removed (founder decision 10 Oct 2026).
const TenantDataRetentionDays = 90

// Warnings go out this many days before the purge.
const (
	retentionWarnEarlyDays = 14
	retentionWarnLateDays  = 3
)

// retainedUploadDir is the one folder kept when a travel's files are removed: the transfer proofs of its
// invoices, which are bookkeeping records and stay together with the invoices.
const retainedUploadDir = "subscription-proofs"

// RetentionSummary counts what one run did.
type RetentionSummary struct {
	Warned int
	Purged int
}

// purgeAfter is the day the travel's data goes: subscription expiry + grace period + retention period.
func purgeAfter(expiresAt time.Time) time.Time {
	return expiresAt.AddDate(0, 0, util.SubscriptionGraceDays+TenantDataRetentionDays)
}

// RunTenantRetention warns travels 14 and 3 days before their purge and purges those past it.
// A travel is only purged once its 3-day warning exists (at least a day of notice even when the job was
// down for a while). Invoices, coupon redemptions, affiliator commissions and access logs are never
// touched. uploadsRoot is the public uploads folder ("" skips file removal).
func RunTenantRetention(
	ctx context.Context,
	purgeRepo repository.TenantPurgeRepository,
	adminRepo repository.AdminUserRepository,
	notifRepo repository.NotificationRepository,
	uploadsRoot string,
	now time.Time,
) (RetentionSummary, error) {
	var sum RetentionSummary
	// A travel is a candidate from 14 days before its purge date on (or past it): its expiry is older than
	// grace + retention - 14 days.
	windowStart := now.AddDate(0, 0, -(util.SubscriptionGraceDays + TenantDataRetentionDays - retentionWarnEarlyDays))
	candidates, err := purgeRepo.ListExpiredBefore(ctx, windowStart)
	if err != nil {
		return sum, err
	}
	for _, c := range candidates {
		due := purgeAfter(c.ExpiresAt)

		if !now.Before(due) {
			warned, err := purgeRepo.WarnedFor(ctx, c.TenantID, retentionWarnLateDays)
			if err != nil {
				log.Printf("[Retention] tenant %d: cannot check warning: %v", c.TenantID, err)
				continue
			}
			if !warned {
				// Never purge without notice: send the last warning now, purge on a later run.
				if sendRetentionWarning(ctx, purgeRepo, adminRepo, notifRepo, c, retentionWarnLateDays, now) {
					sum.Warned++
				}
				continue
			}
			// The purge re-checks inside its transaction that the expiry is still before this cutoff.
			purgeCutoff := now.AddDate(0, 0, -(util.SubscriptionGraceDays + TenantDataRetentionDays))
			purged, err := purgeRepo.PurgeOperationalData(ctx, c.TenantID, purgeCutoff, now)
			if err != nil {
				log.Printf("[Retention] tenant %d (%s): cannot purge: %v", c.TenantID, c.Slug, err)
				continue
			}
			if !purged {
				continue // renewed or changed since the listing: kept
			}
			sum.Purged++
			log.Printf("[Retention] purged operational data: tenant id=%d slug=%s expired_at=%s",
				c.TenantID, c.Slug, c.ExpiresAt.In(jakartaLocation).Format(time.RFC3339))
			if uploadsRoot != "" {
				removeTenantFiles(uploadsRoot, c.TenantID)
			}
			continue
		}

		daysLeft := int(due.Sub(now).Hours() / 24)
		step := 0
		switch {
		case daysLeft <= retentionWarnLateDays:
			step = retentionWarnLateDays
		case daysLeft <= retentionWarnEarlyDays:
			step = retentionWarnEarlyDays
		}
		if step == 0 {
			continue
		}
		warned, err := purgeRepo.WarnedFor(ctx, c.TenantID, step)
		if err != nil {
			log.Printf("[Retention] tenant %d: cannot check warning: %v", c.TenantID, err)
			continue
		}
		if warned {
			continue
		}
		if sendRetentionWarning(ctx, purgeRepo, adminRepo, notifRepo, c, step, now) {
			sum.Warned++
		}
	}
	return sum, nil
}

// sendRetentionWarning notifies the travel's active PICs and records the warning. The warning is recorded
// even when the travel has no active PIC, so it is not retried every day. Returns false when it could not
// be recorded.
func sendRetentionWarning(
	ctx context.Context,
	purgeRepo repository.TenantPurgeRepository,
	adminRepo repository.AdminUserRepository,
	notifRepo repository.NotificationRepository,
	c repository.PurgeCandidate,
	days int,
	now time.Time,
) bool {
	users, err := adminRepo.ListByTenant(ctx, c.TenantID)
	if err != nil {
		log.Printf("[Retention] tenant %d: cannot list admins: %v", c.TenantID, err)
		return false
	}
	date := purgeAfter(c.ExpiresAt).In(jakartaLocation).Format("2 January 2006")
	title := "Data travel akan dihapus"
	body := fmt.Sprintf("Langganan sudah berakhir. Bila tidak diperpanjang, data travel (prospek, agen, paket, dan berkas) dihapus pada %s. "+
		"Unduh CSV prospek dari dashboard bila diperlukan, atau perpanjang langganan.", date)
	link := "/settings/subscription"
	tenantID := c.TenantID
	created := 0
	for _, u := range users {
		if u.Role != repository.RolePIC || u.Status != "active" {
			continue
		}
		n := &repository.Notification{
			TenantID:      &tenantID,
			RecipientType: "admin",
			RecipientID:   u.ID,
			Type:          "retention_warning",
			Title:         title,
			Body:          body,
			LinkURL:       &link,
		}
		if err := notifRepo.Create(ctx, n); err != nil {
			log.Printf("[Retention] tenant %d: cannot notify admin %d: %v", c.TenantID, u.ID, err)
			continue
		}
		created++
	}
	if err := purgeRepo.MarkWarned(ctx, c.TenantID, days, now); err != nil {
		log.Printf("[Retention] tenant %d: cannot record warning: %v", c.TenantID, err)
		return false
	}
	log.Printf("[Retention] warned (%d days): tenant id=%d slug=%s notified=%d purge_on=%s", days, c.TenantID, c.Slug, created, date)
	return true
}

// removeTenantFiles removes a purged travel's uploaded files from the public and the private folder,
// except the invoice transfer proofs.
func removeTenantFiles(uploadsRoot string, tenantID uint64) {
	roots := []string{
		filepath.Join(uploadsRoot, fmt.Sprintf("%d", tenantID)),
		filepath.Join(".", util.PrivateUploadsDir, fmt.Sprintf("%d", tenantID)),
	}
	for _, root := range roots {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue // nothing there
		}
		for _, e := range entries {
			if e.Name() == retainedUploadDir {
				continue
			}
			if err := os.RemoveAll(filepath.Join(root, e.Name())); err != nil {
				log.Printf("[Retention] tenant %d: cannot remove %s: %v", tenantID, filepath.Join(root, e.Name()), err)
			}
		}
	}
}

// StartTenantRetention runs RunTenantRetention two minutes after start, then every interval (daily).
func StartTenantRetention(
	ctx context.Context,
	purgeRepo repository.TenantPurgeRepository,
	adminRepo repository.AdminUserRepository,
	notifRepo repository.NotificationRepository,
	uploadsRoot string,
	interval time.Duration,
) {
	go func() {
		timer := time.NewTimer(2 * time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				RunJobSafely("tenant-retention", func() {
					if sum, err := RunTenantRetention(ctx, purgeRepo, adminRepo, notifRepo, uploadsRoot, time.Now()); err != nil {
						log.Printf("[Retention] failed: %v", err)
					} else if sum.Warned > 0 || sum.Purged > 0 {
						log.Printf("[Retention] warned=%d purged=%d", sum.Warned, sum.Purged)
					}
				})
				timer.Reset(interval)
			}
		}
	}()
}
