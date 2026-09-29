package repository

import (
	"context"
	"database/sql"
	"time"
)

// ExpiringTenant is an active travel whose subscription ends soon (or ended within the grace period).
type ExpiringTenant struct {
	ID        uint64
	Name      string
	ExpiresAt time.Time
}

// SubscriptionReminderRepository supports the platform job that reminds travels to renew. It works across
// tenants by design (a platform job); every per-tenant lookup is still scoped by tenant_id.
type SubscriptionReminderRepository interface {
	// ListExpiringTenants returns active travels whose subscription ends between `from` and `until`.
	ListExpiringTenants(ctx context.Context, from, until time.Time) ([]ExpiringTenant, error)
	// HasNotificationSince reports whether the travel already got a notification of this type since `since`.
	HasNotificationSince(ctx context.Context, tenantID uint64, notifType string, since time.Time) (bool, error)
}

type mysqlSubscriptionReminderRepository struct {
	db *sql.DB
}

// NewSubscriptionReminderRepository creates the MySQL implementation.
func NewSubscriptionReminderRepository(db *sql.DB) SubscriptionReminderRepository {
	return &mysqlSubscriptionReminderRepository{db: db}
}

func (r *mysqlSubscriptionReminderRepository) ListExpiringTenants(ctx context.Context, from, until time.Time) ([]ExpiringTenant, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, name, subscription_expires_at FROM tenants
		WHERE status = 'active' AND subscription_expires_at IS NOT NULL
		  AND subscription_expires_at >= ? AND subscription_expires_at <= ?`, from, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExpiringTenant
	for rows.Next() {
		var t ExpiringTenant
		if err := rows.Scan(&t.ID, &t.Name, &t.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *mysqlSubscriptionReminderRepository) HasNotificationSince(ctx context.Context, tenantID uint64, notifType string, since time.Time) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND type = ? AND created_at >= ?`,
		tenantID, notifType, since).Scan(&n)
	return n > 0, err
}
