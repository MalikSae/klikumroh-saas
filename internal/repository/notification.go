package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Notification represents a system notification record.
type Notification struct {
	ID            uint64     `json:"id"`
	TenantID      *uint64    `json:"tenant_id,omitempty"`
	RecipientType string     `json:"recipient_type"`
	RecipientID   uint64     `json:"recipient_id"`
	Type          string     `json:"type"`
	Title         string     `json:"title"`
	Body          string     `json:"body"`
	LinkURL       *string    `json:"link_url,omitempty"`
	ReadAt        *time.Time `json:"read_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// NotificationRepository defines access methods for notifications.
//
// tenantID scopes every read and write (AGENTS.md 3.1): admin and agent recipients must pass their
// travel's id, so a notification of another travel is never visible even if a recipient id were reused.
// Only staff recipients (platform users; their notifications carry the travel they are about) pass nil.
type NotificationRepository interface {
	Create(ctx context.Context, notif *Notification) error
	ListByRecipient(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, limit int) ([]Notification, error)
	CountUnread(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64) (int, error)
	MarkAsRead(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, id uint64) error
	MarkAllAsRead(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64) error
}

// ErrNotificationTenantRequired: an admin or agent notification query without a tenant id.
var ErrNotificationTenantRequired = errors.New("notification query needs a tenant id")

// notificationScope returns the tenant clause and its args for a recipient. Staff see their
// notifications across travels (nil tenant); every other recipient must be scoped to one travel.
func notificationScope(tenantID *uint64, recipientType string) (string, []interface{}, error) {
	if tenantID == nil {
		if recipientType != "staff" {
			return "", nil, ErrNotificationTenantRequired
		}
		return "", nil, nil
	}
	return " AND tenant_id = ?", []interface{}{*tenantID}, nil
}

type mysqlNotificationRepository struct {
	db *sql.DB
}

// NewNotificationRepository creates a new NotificationRepository.
func NewNotificationRepository(db *sql.DB) NotificationRepository {
	return &mysqlNotificationRepository{db: db}
}

func (r *mysqlNotificationRepository) Create(ctx context.Context, notif *Notification) error {
	query := `
		INSERT INTO notifications (
			tenant_id, recipient_type, recipient_id, type, title, body, link_url
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	res, err := r.db.ExecContext(ctx, query,
		notif.TenantID,
		notif.RecipientType,
		notif.RecipientID,
		notif.Type,
		notif.Title,
		notif.Body,
		notif.LinkURL,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	notif.ID = uint64(id)
	return nil
}

func (r *mysqlNotificationRepository) ListByRecipient(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, limit int) ([]Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	scope, scopeArgs, err := notificationScope(tenantID, recipientType)
	if err != nil {
		return nil, err
	}
	query := `
		SELECT id, tenant_id, recipient_type, recipient_id, type, title, body, link_url, read_at, created_at
		FROM notifications
		WHERE recipient_type = ? AND recipient_id = ?` + scope + `
		ORDER BY created_at DESC
		LIMIT ?
	`
	args := append([]interface{}{recipientType, recipientID}, scopeArgs...)
	args = append(args, limit)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Notification
	for rows.Next() {
		var n Notification
		if err := rows.Scan(
			&n.ID,
			&n.TenantID,
			&n.RecipientType,
			&n.RecipientID,
			&n.Type,
			&n.Title,
			&n.Body,
			&n.LinkURL,
			&n.ReadAt,
			&n.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *mysqlNotificationRepository) CountUnread(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64) (int, error) {
	scope, scopeArgs, err := notificationScope(tenantID, recipientType)
	if err != nil {
		return 0, err
	}
	query := `
		SELECT COUNT(*)
		FROM notifications
		WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL` + scope
	var count int
	err = r.db.QueryRowContext(ctx, query, append([]interface{}{recipientType, recipientID}, scopeArgs...)...).Scan(&count)
	return count, err
}

func (r *mysqlNotificationRepository) MarkAsRead(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, id uint64) error {
	scope, scopeArgs, err := notificationScope(tenantID, recipientType)
	if err != nil {
		return err
	}
	args := append([]interface{}{id, recipientType, recipientID}, scopeArgs...)
	query := `
		UPDATE notifications
		SET read_at = CURRENT_TIMESTAMP
		WHERE id = ? AND recipient_type = ? AND recipient_id = ? AND read_at IS NULL` + scope
	res, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		chkErr := r.db.QueryRowContext(ctx, `SELECT 1 FROM notifications WHERE id = ? AND recipient_type = ? AND recipient_id = ?`+scope, args...).Scan(&exists)
		if chkErr != nil {
			return ErrNotFound
		}
	}
	return nil
}

func (r *mysqlNotificationRepository) MarkAllAsRead(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64) error {
	scope, scopeArgs, err := notificationScope(tenantID, recipientType)
	if err != nil {
		return err
	}
	query := `
		UPDATE notifications
		SET read_at = CURRENT_TIMESTAMP
		WHERE recipient_type = ? AND recipient_id = ? AND read_at IS NULL` + scope
	_, err = r.db.ExecContext(ctx, query, append([]interface{}{recipientType, recipientID}, scopeArgs...)...)
	return err
}
