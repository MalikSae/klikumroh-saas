package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// AdminUser represents the data model for the admin_users table.
type AdminUser struct {
	ID           uint64    `json:"id"`
	TenantID     uint64    `json:"tenant_id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AdminUserRepository defines access methods for admin_users records.
// All standard methods enforce tenant_id isolation.
type AdminUserRepository interface {
	Create(ctx context.Context, tenantID uint64, user *AdminUser) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*AdminUser, error)
	ListByTenant(ctx context.Context, tenantID uint64) ([]AdminUser, error)
	Update(ctx context.Context, tenantID uint64, user *AdminUser) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error

	// FindByTenantAndEmail finds an admin user within a specific tenant by email.
	FindByTenantAndEmail(ctx context.Context, tenantID uint64, email string) (*AdminUser, error)

	// CountActiveByTenant returns the count of active admin users in a tenant.
	CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error)

	// FindByEmail searches across all tenants by email without requiring a tenant_id parameter.
	// SPECIAL EXCEPTION: This function is strictly used during login authentication when the caller
	// only has an email address and does not yet know which tenant the user belongs to. It returns
	// the tenant_id as part of the AdminUser record for session creation.
	FindByEmail(ctx context.Context, email string) (*AdminUser, error)
}

type mysqlAdminUserRepository struct {
	db *sql.DB
}

// NewAdminUserRepository creates a new AdminUserRepository instance.
func NewAdminUserRepository(db *sql.DB) AdminUserRepository {
	return &mysqlAdminUserRepository{db: db}
}

func (r *mysqlAdminUserRepository) Create(ctx context.Context, tenantID uint64, user *AdminUser) error {
	query := `
		INSERT INTO admin_users (
			tenant_id, email, password_hash, name, status
		) VALUES (?, ?, ?, ?, ?)
	`
	user.TenantID = tenantID
	if user.Status == "" {
		user.Status = "active"
	}

	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		user.Email,
		user.PasswordHash,
		user.Name,
		user.Status,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	user.ID = uint64(id)
	return nil
}

func (r *mysqlAdminUserRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*AdminUser, error) {
	query := `
		SELECT id, tenant_id, email, password_hash, name, status, created_at, updated_at
		FROM admin_users
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanAdminUser(row)
}

func (r *mysqlAdminUserRepository) ListByTenant(ctx context.Context, tenantID uint64) ([]AdminUser, error) {
	query := `
		SELECT id, tenant_id, email, password_hash, name, status, created_at, updated_at
		FROM admin_users
		WHERE tenant_id = ?
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []AdminUser
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(
			&u.ID,
			&u.TenantID,
			&u.Email,
			&u.PasswordHash,
			&u.Name,
			&u.Status,
			&u.CreatedAt,
			&u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

func (r *mysqlAdminUserRepository) Update(ctx context.Context, tenantID uint64, user *AdminUser) error {
	query := `
		UPDATE admin_users
		SET email = ?, password_hash = ?, name = ?, status = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		user.Email,
		user.PasswordHash,
		user.Name,
		user.Status,
		user.ID,
		tenantID,
	)
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

func (r *mysqlAdminUserRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM admin_users WHERE id = ? AND tenant_id = ?`
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

func (r *mysqlAdminUserRepository) FindByTenantAndEmail(ctx context.Context, tenantID uint64, email string) (*AdminUser, error) {
	query := `
		SELECT id, tenant_id, email, password_hash, name, status, created_at, updated_at
		FROM admin_users
		WHERE tenant_id = ? AND email = ?
	`
	row := r.db.QueryRowContext(ctx, query, tenantID, email)
	return r.scanAdminUser(row)
}

func (r *mysqlAdminUserRepository) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM admin_users
		WHERE tenant_id = ? AND status = 'active'
	`
	var count int
	if err := r.db.QueryRowContext(ctx, query, tenantID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *mysqlAdminUserRepository) FindByEmail(ctx context.Context, email string) (*AdminUser, error) {
	// SPECIAL EXCEPTION: Used exclusively by login authentication to resolve tenant_id from email.
	query := `
		SELECT id, tenant_id, email, password_hash, name, status, created_at, updated_at
		FROM admin_users
		WHERE email = ?
	`
	row := r.db.QueryRowContext(ctx, query, email)
	return r.scanAdminUser(row)
}

func (r *mysqlAdminUserRepository) scanAdminUser(row *sql.Row) (*AdminUser, error) {
	var u AdminUser
	err := row.Scan(
		&u.ID,
		&u.TenantID,
		&u.Email,
		&u.PasswordHash,
		&u.Name,
		&u.Status,
		&u.CreatedAt,
		&u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}
