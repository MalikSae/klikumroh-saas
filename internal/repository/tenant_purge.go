package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// PurgeCandidate is a travel whose subscription expired long enough ago for the retention rules.
type PurgeCandidate struct {
	TenantID  uint64
	Slug      string
	ExpiresAt time.Time
}

// TenantPurgeRepository implements the data retention rules (founder decision 10 Oct 2026): a travel that
// stayed unrenewed past its grace period plus the retention period gets its operational data removed.
// Invoices, coupon redemptions, affiliator commissions and staff access logs are kept (bookkeeping and
// audit), and so is the tenant row (it names those invoices).
//
// SPECIAL EXCEPTION (cross-tenant): ListExpiredBefore reads every tenant because it serves a platform
// job, not a request of one travel. Every write takes one tenant_id and re-checks the condition inside
// its transaction.
type TenantPurgeRepository interface {
	// ListExpiredBefore lists non-demo, not yet purged travels whose subscription_expires_at is before cutoff
	// and that have no invoice waiting for review (a renewal in progress keeps the data).
	ListExpiredBefore(ctx context.Context, cutoff time.Time) ([]PurgeCandidate, error)
	// MarkWarned records that the warning (14 or 3 days before the purge) was sent.
	MarkWarned(ctx context.Context, tenantID uint64, days int, at time.Time) error
	// WarnedFor reports whether the warning for the travel's current expiry was already sent.
	WarnedFor(ctx context.Context, tenantID uint64, days int) (bool, error)
	// PurgeOperationalData removes the travel's operational data in one transaction when it is still
	// expired before cutoff and not purged; purged is false (nothing changes) when it no longer qualifies.
	PurgeOperationalData(ctx context.Context, tenantID uint64, cutoff time.Time, at time.Time) (purged bool, err error)
}

type mysqlTenantPurgeRepository struct {
	db *sql.DB
}

// NewTenantPurgeRepository creates the repository.
func NewTenantPurgeRepository(db *sql.DB) TenantPurgeRepository {
	return &mysqlTenantPurgeRepository{db: db}
}

// purgeCondition (on tenants t, one ? = cutoff): the tenant is a real travel that was activated once, its
// subscription expired before the cutoff, nothing was purged yet and no invoice is waiting for review.
const purgeCondition = `
	t.is_demo = 0 AND t.status <> 'pending'
	AND t.subscription_expires_at IS NOT NULL AND t.subscription_expires_at < ?
	AND t.data_purged_at IS NULL
	AND NOT EXISTS (SELECT 1 FROM payment_verifications pv WHERE pv.tenant_id = t.id AND pv.status = 'pending')`

func (r *mysqlTenantPurgeRepository) ListExpiredBefore(ctx context.Context, cutoff time.Time) ([]PurgeCandidate, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT t.id, t.slug, t.subscription_expires_at FROM tenants t WHERE `+purgeCondition+` ORDER BY t.id`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PurgeCandidate
	for rows.Next() {
		var c PurgeCandidate
		if err := rows.Scan(&c.TenantID, &c.Slug, &c.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func warnColumn(days int) (string, error) {
	switch days {
	case 14:
		return "purge_warned_14_at", nil
	case 3:
		return "purge_warned_3_at", nil
	}
	return "", fmt.Errorf("unknown warning day %d", days)
}

func (r *mysqlTenantPurgeRepository) WarnedFor(ctx context.Context, tenantID uint64, days int) (bool, error) {
	col, err := warnColumn(days)
	if err != nil {
		return false, err
	}
	// A warning sent for an earlier expiry (before a renewal) does not count: it predates this expiry.
	var warned int
	err = r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tenants WHERE id = ? AND `+col+` IS NOT NULL AND `+col+` > subscription_expires_at`, tenantID).Scan(&warned)
	return warned > 0, err
}

func (r *mysqlTenantPurgeRepository) MarkWarned(ctx context.Context, tenantID uint64, days int, at time.Time) error {
	col, err := warnColumn(days)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `UPDATE tenants SET `+col+` = ? WHERE id = ?`, at, tenantID)
	return err
}

func (r *mysqlTenantPurgeRepository) PurgeOperationalData(ctx context.Context, tenantID uint64, cutoff time.Time, at time.Time) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	// Lock the tenant row and its invoices, then re-check on current data: a renewal uploaded since the
	// listing keeps the travel.
	var locked uint64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM tenants WHERE id = ? FOR UPDATE`, tenantID).Scan(&locked); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	pvRows, err := tx.QueryContext(ctx, `SELECT id FROM payment_verifications WHERE tenant_id = ? FOR UPDATE`, tenantID)
	if err != nil {
		return false, err
	}
	_ = pvRows.Close()
	var match int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM tenants t WHERE t.id = ? AND `+purgeCondition+` FOR UPDATE`, tenantID, cutoff).Scan(&match)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	// Children before parents. Kept on purpose: payment_verifications, coupon_redemptions,
	// affiliator_commissions, access_logs and the tenants row.
	stmts := []string{
		"DELETE r FROM event_rsvps r JOIN agent_events e ON e.id = r.event_id WHERE e.tenant_id = ?",
		"DELETE FROM referral_clicks WHERE tenant_id = ?",
		"DELETE FROM commission_ledger WHERE tenant_id = ?",
		"DELETE FROM commission_payout_requests WHERE tenant_id = ?",
		"DELETE FROM prospect_payment_requests WHERE tenant_id = ?",
		"DELETE FROM prospect_notes WHERE tenant_id = ?",
		"DELETE FROM prospect_status_history WHERE tenant_id = ?",
		"DELETE FROM prospects WHERE tenant_id = ?",
		"DELETE FROM agent_target_achievements WHERE tenant_id = ?",
		"DELETE FROM agent_targets WHERE tenant_id = ?",
		"DELETE FROM agent_habit_logs WHERE tenant_id = ?",
		"DELETE FROM agent_habit_badges WHERE tenant_id = ?",
		"DELETE FROM agent_sumber_progress WHERE tenant_id = ?",
		"DELETE s FROM agent_sessions s JOIN agents a ON a.id = s.agent_id WHERE a.tenant_id = ?",
		"DELETE FROM agent_events WHERE tenant_id = ?",
		"DELETE FROM agents WHERE tenant_id = ?",
		"DELETE FROM package_photos WHERE tenant_id = ?",
		"DELETE FROM packages WHERE tenant_id = ?",
		"DELETE FROM tenant_faqs WHERE tenant_id = ?",
		"DELETE FROM tenant_banners WHERE tenant_id = ?",
		"DELETE FROM tenant_testimonials WHERE tenant_id = ?",
		"DELETE FROM playbook_checks WHERE tenant_id = ?",
		"DELETE FROM domains WHERE tenant_id = ? AND redirect_to_domain_id IS NOT NULL",
		"DELETE FROM domains WHERE tenant_id = ?",
		"DELETE FROM notifications WHERE tenant_id = ?",
		"DELETE FROM sessions WHERE tenant_id = ?",
		"DELETE FROM admin_users WHERE tenant_id = ?",
	}
	for _, q := range stmts {
		if _, err := tx.ExecContext(ctx, q, tenantID); err != nil {
			return false, fmt.Errorf("%s: %w", q, err)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE tenants SET data_purged_at = ?, status = 'inactive' WHERE id = ?`, at, tenantID); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}
