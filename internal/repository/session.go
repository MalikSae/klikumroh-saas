package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Session represents the data model for the sessions table.
type Session struct {
	ID          uint64    `json:"id"`
	Token       string    `json:"token"`
	AdminUserID uint64    `json:"admin_user_id"`
	TenantID    uint64    `json:"tenant_id"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// SessionRepository defines access methods for sessions records.
// All standard methods enforce tenant_id isolation.
type SessionRepository interface {
	Create(ctx context.Context, tenantID uint64, session *Session) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Session, error)
	ListByAdminUser(ctx context.Context, tenantID uint64, adminUserID uint64) ([]Session, error)
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	DeleteByToken(ctx context.Context, token string) error

	// FindByToken searches across all tenants by raw session token without requiring a tenant_id parameter.
	// SPECIAL EXCEPTION: This function is strictly used by AuthMiddleware to authenticate incoming HTTP
	// requests and extract tenant_id and admin_user_id from the session token before injecting them
	// into the request context.
	FindByToken(ctx context.Context, token string) (*Session, error)
}

type mysqlSessionRepository struct {
	db *sql.DB
}

// NewSessionRepository creates a new SessionRepository instance.
func NewSessionRepository(db *sql.DB) SessionRepository {
	return &mysqlSessionRepository{db: db}
}

func (r *mysqlSessionRepository) Create(ctx context.Context, tenantID uint64, session *Session) error {
	query := `
		INSERT INTO sessions (
			token, admin_user_id, tenant_id, expires_at
		) VALUES (?, ?, ?, ?)
	`
	session.TenantID = tenantID

	result, err := r.db.ExecContext(ctx, query,
		session.Token,
		session.AdminUserID,
		tenantID,
		session.ExpiresAt,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	session.ID = uint64(id)
	return nil
}

func (r *mysqlSessionRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Session, error) {
	query := `
		SELECT id, token, admin_user_id, tenant_id, expires_at, created_at
		FROM sessions
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanSession(row)
}

func (r *mysqlSessionRepository) ListByAdminUser(ctx context.Context, tenantID uint64, adminUserID uint64) ([]Session, error) {
	query := `
		SELECT id, token, admin_user_id, tenant_id, expires_at, created_at
		FROM sessions
		WHERE tenant_id = ? AND admin_user_id = ?
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, adminUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(
			&s.ID,
			&s.Token,
			&s.AdminUserID,
			&s.TenantID,
			&s.ExpiresAt,
			&s.CreatedAt,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (r *mysqlSessionRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM sessions WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlSessionRepository) DeleteByToken(ctx context.Context, token string) error {
	query := `DELETE FROM sessions WHERE token = ?`
	res, err := r.db.ExecContext(ctx, query, token)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlSessionRepository) FindByToken(ctx context.Context, token string) (*Session, error) {
	// SPECIAL EXCEPTION: Used by AuthMiddleware to authenticate request token across all tenants.
	query := `
		SELECT id, token, admin_user_id, tenant_id, expires_at, created_at
		FROM sessions
		WHERE token = ?
	`
	row := r.db.QueryRowContext(ctx, query, token)
	return r.scanSession(row)
}

func (r *mysqlSessionRepository) scanSession(row *sql.Row) (*Session, error) {
	var s Session
	err := row.Scan(
		&s.ID,
		&s.Token,
		&s.AdminUserID,
		&s.TenantID,
		&s.ExpiresAt,
		&s.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}
