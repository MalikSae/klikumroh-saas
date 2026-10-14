package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// TenantAdAttribution is the ad click context of a travel's signup, used for KlikUmroh's own Meta
// Conversions API events. It holds only browser identifiers and UTM values, no personal data.
type TenantAdAttribution struct {
	TenantID       uint64
	Fbp            *string
	Fbc            *string
	Fbclid         *string
	UTMSource      *string
	UTMMedium      *string
	UTMCampaign    *string
	UTMContent     *string
	UTMTerm        *string
	EventSourceURL *string
	ClientIP       *string
	UserAgent      *string
	LeadEventID    *string
	// PurchaseEventSentAt is set when the Purchase event was claimed for sending (nil = not yet).
	PurchaseEventSentAt *time.Time
	CreatedAt           time.Time
}

// TenantAdAttributionRepository stores signup ad attribution. Every call is scoped by tenant_id.
type TenantAdAttributionRepository interface {
	// Save inserts the row once; a second save for the same tenant keeps the first (first touch wins).
	Save(ctx context.Context, a *TenantAdAttribution) error
	// Get returns ErrNotFound when the travel signed up without ad context.
	Get(ctx context.Context, tenantID uint64) (*TenantAdAttribution, error)
	// ClaimPurchaseSend marks the Purchase event as sent. It returns true for exactly one caller.
	ClaimPurchaseSend(ctx context.Context, tenantID uint64) (bool, error)
	// ReleasePurchaseSend undoes the claim after a failed delivery so the event can be retried.
	ReleasePurchaseSend(ctx context.Context, tenantID uint64) error
	// ListUnsentPurchases returns, for every travel whose Purchase was never delivered, its FIRST approved
	// paid invoice. Platform-level staff operation: it spans tenants on purpose (like the staff payment list).
	ListUnsentPurchases(ctx context.Context, limit int) ([]UnsentPurchase, error)
}

// UnsentPurchase is a confirmed first payment whose Purchase event was not delivered to Meta.
type UnsentPurchase struct {
	TenantID              uint64
	PaymentVerificationID uint64
	// ConfirmedAt is when staff approved the invoice (nil when not recorded).
	ConfirmedAt *time.Time
}

type mysqlTenantAdAttributionRepository struct {
	db *sql.DB
}

// NewTenantAdAttributionRepository creates a MySQL-backed TenantAdAttributionRepository.
func NewTenantAdAttributionRepository(db *sql.DB) TenantAdAttributionRepository {
	return &mysqlTenantAdAttributionRepository{db: db}
}

func nullableString(p *string) interface{} {
	if p == nil || *p == "" {
		return nil
	}
	return *p
}

func (r *mysqlTenantAdAttributionRepository) Save(ctx context.Context, a *TenantAdAttribution) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO tenant_ad_attribution
		   (tenant_id, fbp, fbc, fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
		    event_source_url, client_ip, user_agent, lead_event_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE tenant_id = tenant_id`,
		a.TenantID, nullableString(a.Fbp), nullableString(a.Fbc), nullableString(a.Fbclid),
		nullableString(a.UTMSource), nullableString(a.UTMMedium), nullableString(a.UTMCampaign),
		nullableString(a.UTMContent), nullableString(a.UTMTerm), nullableString(a.EventSourceURL),
		nullableString(a.ClientIP), nullableString(a.UserAgent), nullableString(a.LeadEventID),
	)
	return err
}

func (r *mysqlTenantAdAttributionRepository) Get(ctx context.Context, tenantID uint64) (*TenantAdAttribution, error) {
	var fbp, fbc, fbclid, src, med, camp, content, term, srcURL, ip, ua, leadID sql.NullString
	var sentAt sql.NullTime
	a := &TenantAdAttribution{TenantID: tenantID}
	err := r.db.QueryRowContext(ctx,
		`SELECT fbp, fbc, fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
		        event_source_url, client_ip, user_agent, lead_event_id, purchase_event_sent_at, created_at
		 FROM tenant_ad_attribution WHERE tenant_id = ?`, tenantID,
	).Scan(&fbp, &fbc, &fbclid, &src, &med, &camp, &content, &term, &srcURL, &ip, &ua, &leadID, &sentAt, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	a.Fbp, a.Fbc, a.Fbclid = nullStringPtr(fbp), nullStringPtr(fbc), nullStringPtr(fbclid)
	a.UTMSource, a.UTMMedium, a.UTMCampaign = nullStringPtr(src), nullStringPtr(med), nullStringPtr(camp)
	a.UTMContent, a.UTMTerm = nullStringPtr(content), nullStringPtr(term)
	a.EventSourceURL, a.ClientIP, a.UserAgent = nullStringPtr(srcURL), nullStringPtr(ip), nullStringPtr(ua)
	a.LeadEventID = nullStringPtr(leadID)
	if sentAt.Valid {
		t := sentAt.Time
		a.PurchaseEventSentAt = &t
	}
	return a, nil
}

func (r *mysqlTenantAdAttributionRepository) ClaimPurchaseSend(ctx context.Context, tenantID uint64) (bool, error) {
	res, err := r.db.ExecContext(ctx,
		`UPDATE tenant_ad_attribution SET purchase_event_sent_at = NOW()
		 WHERE tenant_id = ? AND purchase_event_sent_at IS NULL`, tenantID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func (r *mysqlTenantAdAttributionRepository) ReleasePurchaseSend(ctx context.Context, tenantID uint64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE tenant_ad_attribution SET purchase_event_sent_at = NULL WHERE tenant_id = ?`, tenantID)
	return err
}

func (r *mysqlTenantAdAttributionRepository) ListUnsentPurchases(ctx context.Context, limit int) ([]UnsentPurchase, error) {
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.tenant_id, pv.id, pv.reviewed_at
		FROM tenant_ad_attribution a
		JOIN payment_verifications pv ON pv.id = (
			SELECT p2.id FROM payment_verifications p2
			WHERE p2.tenant_id = a.tenant_id AND p2.status = 'approved'
			ORDER BY p2.reviewed_at ASC, p2.id ASC LIMIT 1)
		WHERE a.purchase_event_sent_at IS NULL
		  AND pv.final_amount - pv.unique_code > 0
		ORDER BY pv.id ASC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UnsentPurchase
	for rows.Next() {
		var u UnsentPurchase
		var confirmed sql.NullTime
		if err := rows.Scan(&u.TenantID, &u.PaymentVerificationID, &confirmed); err != nil {
			return nil, err
		}
		if confirmed.Valid {
			t := confirmed.Time
			u.ConfirmedAt = &t
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
