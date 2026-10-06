package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// StaleSignup is a self-signup travel that never paid (see UnpaidSignupRepository).
type StaleSignup struct {
	TenantID  uint64
	Slug      string
	CreatedAt time.Time
}

// UnpaidSignupRepository finds and removes self-signup travels that stayed pending without any payment
// activity (keputusan pendiri 6 Okt 2026: a pending signup that never paid is removed after 30 days, so
// it stops holding its slug, admin email and WhatsApp number).
//
// SPECIAL EXCEPTION (cross-tenant): ListStaleUnpaidSignups reads every tenant because it is a platform
// job, not a request of one travel. DeleteUnpaidSignup works on one tenant_id and re-checks every
// condition inside its transaction.
type UnpaidSignupRepository interface {
	ListStaleUnpaidSignups(ctx context.Context, createdBefore time.Time) ([]StaleSignup, error)
	// DeleteUnpaidSignup removes the tenant and its dependent rows in one transaction when it still
	// matches the stale-unpaid conditions; removed is false (and nothing changes) when it no longer does.
	DeleteUnpaidSignup(ctx context.Context, tenantID uint64, createdBefore time.Time) (removed bool, err error)
}

type mysqlUnpaidSignupRepository struct {
	db *sql.DB
}

// NewUnpaidSignupRepository creates the repository.
func NewUnpaidSignupRepository(db *sql.DB) UnpaidSignupRepository {
	return &mysqlUnpaidSignupRepository{db: db}
}

// staleUnpaidCondition is the safety predicate on tenants t (two ? placeholders, both the cutoff):
//   - still pending, not the demo, never activated (no plan, no expiry) and created before the cutoff;
//   - no payment activity: every invoice is still pending without a transfer proof (an approved,
//     rejected or cancelled invoice means a proof or staff action happened), no coupon redemption and no
//     affiliator commission;
//   - no invoice that needs no transfer (final_amount <= 0, e.g. a 100% coupon): it waits for staff
//     approval, not for the travel, so the travel already did everything it had to do;
//   - no invoice touched after it was created (bug hunt putaran 5): a plan or coupon change by the travel
//     or by staff (PATCH .../payment-verifications/{id}/plan|coupon, which writes no access log) bumps
//     updated_at, and any review field set means staff handled it;
//   - no invoice activity since the cutoff: the latest of the tenant's created_at and every invoice's
//     updated_at must be older than the cutoff, so the 30 days count from the last activity;
//   - nothing a travel or KlikUmroh staff built on it: no agents, prospects, referral clicks, and no staff
//     access log (staff who opened the travel may be helping it).
const staleUnpaidCondition = `
	t.status = 'pending' AND t.is_demo = 0
	AND t.current_plan_id IS NULL AND t.subscription_expires_at IS NULL
	AND t.created_at < ?
	AND NOT EXISTS (SELECT 1 FROM payment_verifications pv WHERE pv.tenant_id = t.id
		AND (pv.status <> 'pending' OR (pv.proof_url IS NOT NULL AND pv.proof_url <> '')
			OR pv.final_amount <= 0
			OR pv.updated_at > pv.created_at
			OR pv.reviewed_by IS NOT NULL OR pv.reviewed_at IS NOT NULL
			OR (pv.rejection_reason IS NOT NULL AND pv.rejection_reason <> '')
			OR pv.updated_at >= ?))
	AND NOT EXISTS (SELECT 1 FROM coupon_redemptions cr WHERE cr.tenant_id = t.id)
	AND NOT EXISTS (SELECT 1 FROM affiliator_commissions ac WHERE ac.tenant_id = t.id)
	AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.tenant_id = t.id)
	AND NOT EXISTS (SELECT 1 FROM prospects p WHERE p.tenant_id = t.id)
	AND NOT EXISTS (SELECT 1 FROM referral_clicks rc WHERE rc.tenant_id = t.id)
	AND NOT EXISTS (SELECT 1 FROM access_logs al WHERE al.tenant_id = t.id)`

func (r *mysqlUnpaidSignupRepository) ListStaleUnpaidSignups(ctx context.Context, createdBefore time.Time) ([]StaleSignup, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT t.id, t.slug, t.created_at
		FROM tenants t
		WHERE `+staleUnpaidCondition+`
		ORDER BY t.id`, createdBefore, createdBefore)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StaleSignup{}
	for rows.Next() {
		var s StaleSignup
		if err := rows.Scan(&s.TenantID, &s.Slug, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *mysqlUnpaidSignupRepository) DeleteUnpaidSignup(ctx context.Context, tenantID uint64, createdBefore time.Time) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	// Lock the tenant row and its invoices first, then re-check every condition on current data: a proof
	// uploaded or a payment approved since the listing keeps the travel.
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
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM tenants t WHERE t.id = ? AND `+staleUnpaidCondition+` FOR UPDATE`,
		tenantID, createdBefore, createdBefore).Scan(&match)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	// Children before parents. Tables with ON DELETE CASCADE (invoices, notifications, FAQs, banners,
	// testimonials, package photos, targets, ...) are listed too so the order never depends on it.
	stmts := []string{
		"DELETE FROM sessions WHERE tenant_id = ?",
		"DELETE FROM notifications WHERE tenant_id = ?",
		"DELETE FROM payment_verifications WHERE tenant_id = ?",
		"DELETE r FROM event_rsvps r JOIN agent_events e ON e.id = r.event_id WHERE e.tenant_id = ?",
		"DELETE FROM agent_events WHERE tenant_id = ?",
		"DELETE FROM agent_targets WHERE tenant_id = ?",
		"DELETE FROM package_photos WHERE tenant_id = ?",
		"DELETE FROM packages WHERE tenant_id = ?",
		"DELETE FROM tenant_faqs WHERE tenant_id = ?",
		"DELETE FROM tenant_banners WHERE tenant_id = ?",
		"DELETE FROM tenant_testimonials WHERE tenant_id = ?",
		"DELETE FROM domains WHERE tenant_id = ? AND redirect_to_domain_id IS NOT NULL",
		"DELETE FROM domains WHERE tenant_id = ?",
		"DELETE FROM admin_users WHERE tenant_id = ?",
	}
	for _, q := range stmts {
		if _, err := tx.ExecContext(ctx, q, tenantID); err != nil {
			return false, fmt.Errorf("%s: %w", q, err)
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM tenants WHERE id = ? AND status = 'pending' AND is_demo = 0`, tenantID)
	if err != nil {
		return false, err
	}
	if n, err := res.RowsAffected(); err != nil || n != 1 {
		if err == nil {
			err = fmt.Errorf("tenant %d not deleted", tenantID)
		}
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}
