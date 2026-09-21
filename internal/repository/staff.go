package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// StaffUser represents an internal ClickUmroh platform staff member.
// Notice: There is NO tenant_id because staff users belong to the platform globally.
type StaffUser struct {
	ID           uint64    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// StaffSession represents an authenticated staff user session.
type StaffSession struct {
	ID          uint64    `json:"id"`
	StaffUserID uint64    `json:"staff_user_id"`
	Token       string    `json:"token"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// StaffTenantItem represents a tenant overview specifically formatted for Master Admin / Staff.
type StaffTenantItem struct {
	ID                    uint64     `json:"id"`
	Name                  string     `json:"name"`
	Slug                  string     `json:"slug"`
	Status                string     `json:"status"`
	WhatsAppNumber        *string    `json:"whatsapp_number,omitempty"`
	SubscriptionStatus    string     `json:"subscription_status"`
	CurrentPlan           *string    `json:"current_plan"`
	PlanName              *string    `json:"plan_name"`
	CustomDomain          *string    `json:"custom_domain"`
	SubscriptionExpiresAt *time.Time `json:"subscription_expires_at"`
	CreatedAt             time.Time  `json:"created_at"`
}

// StaffRepository defines access methods for staff users, sessions, and cross-tenant staff queries.
type StaffRepository interface {
	Create(ctx context.Context, user *StaffUser) error
	FindByEmail(ctx context.Context, email string) (*StaffUser, error)
	FindByID(ctx context.Context, id uint64) (*StaffUser, error)
	CreateSession(ctx context.Context, session *StaffSession) error
	FindSessionByToken(ctx context.Context, token string) (*StaffSession, *StaffUser, error)
	DeleteSession(ctx context.Context, token string) error

	// ListAllTenants retrieves all tenants across the platform.
	// SPECIAL EXCEPTION: Staff users legitimately have cross-tenant platform visibility.
	ListAllTenants(ctx context.Context, statusFilter ...string) ([]StaffTenantItem, error)

	ListStaffUsers(ctx context.Context) ([]StaffUser, error)
	Update(ctx context.Context, user *StaffUser) error
}

type mysqlStaffRepository struct {
	db *sql.DB
}

// NewStaffRepository creates a new StaffRepository instance.
func NewStaffRepository(db *sql.DB) StaffRepository {
	return &mysqlStaffRepository{db: db}
}

func (r *mysqlStaffRepository) Create(ctx context.Context, user *StaffUser) error {
	query := `
		INSERT INTO staff_users (name, email, password_hash, status)
		VALUES (?, ?, ?, ?)
	`
	if user.Status == "" {
		user.Status = "active"
	}

	result, err := r.db.ExecContext(ctx, query,
		user.Name,
		user.Email,
		user.PasswordHash,
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

func (r *mysqlStaffRepository) FindByEmail(ctx context.Context, email string) (*StaffUser, error) {
	query := `
		SELECT id, name, email, password_hash, status, created_at, updated_at
		FROM staff_users
		WHERE email = ?
	`
	var user StaffUser
	err := r.db.QueryRowContext(ctx, query, email).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &user, nil
}

func (r *mysqlStaffRepository) FindByID(ctx context.Context, id uint64) (*StaffUser, error) {
	query := `
		SELECT id, name, email, password_hash, status, created_at, updated_at
		FROM staff_users
		WHERE id = ?
	`
	var user StaffUser
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &user, nil
}

func (r *mysqlStaffRepository) CreateSession(ctx context.Context, session *StaffSession) error {
	query := `
		INSERT INTO staff_sessions (staff_user_id, token, expires_at)
		VALUES (?, ?, ?)
	`
	result, err := r.db.ExecContext(ctx, query,
		session.StaffUserID,
		session.Token,
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

func (r *mysqlStaffRepository) FindSessionByToken(ctx context.Context, token string) (*StaffSession, *StaffUser, error) {
	query := `
		SELECT 
			s.id, s.staff_user_id, s.token, s.expires_at, s.created_at,
			u.id, u.name, u.email, u.password_hash, u.status, u.created_at, u.updated_at
		FROM staff_sessions s
		JOIN staff_users u ON s.staff_user_id = u.id
		WHERE s.token = ? AND s.expires_at > NOW() AND u.status = 'active'
	`
	var session StaffSession
	var user StaffUser
	err := r.db.QueryRowContext(ctx, query, token).Scan(
		&session.ID,
		&session.StaffUserID,
		&session.Token,
		&session.ExpiresAt,
		&session.CreatedAt,
		&user.ID,
		&user.Name,
		&user.Email,
		&user.PasswordHash,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, err
	}
	return &session, &user, nil
}

func (r *mysqlStaffRepository) DeleteSession(ctx context.Context, token string) error {
	query := `DELETE FROM staff_sessions WHERE token = ?`
	_, err := r.db.ExecContext(ctx, query, token)
	return err
}

func (r *mysqlStaffRepository) ListAllTenants(ctx context.Context, statusFilter ...string) ([]StaffTenantItem, error) {
	query := `
		SELECT 
			t.id, 
			t.name, 
			t.slug, 
			t.status,
			t.whatsapp_number,
			p.name AS current_plan, 
			t.subscription_expires_at, 
			t.created_at,
			(SELECT hostname FROM domains WHERE tenant_id = t.id AND type = 'custom' LIMIT 1) AS custom_domain
		FROM tenants t
		LEFT JOIN pricing_plans p ON t.current_plan_id = p.id
		ORDER BY t.created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var filter string
	if len(statusFilter) > 0 {
		filter = strings.TrimSpace(strings.ToLower(statusFilter[0]))
	}

	items := make([]StaffTenantItem, 0)
	now := time.Now()
	for rows.Next() {
		var item StaffTenantItem
		var currentPlan sql.NullString
		var subExpires sql.NullTime
		var customDomain sql.NullString
		var whatsappNum sql.NullString

		if err := rows.Scan(
			&item.ID,
			&item.Name,
			&item.Slug,
			&item.Status,
			&whatsappNum,
			&currentPlan,
			&subExpires,
			&item.CreatedAt,
			&customDomain,
		); err != nil {
			return nil, err
		}

		if whatsappNum.Valid && whatsappNum.String != "" {
			item.WhatsAppNumber = &whatsappNum.String
		}

		if currentPlan.Valid {
			item.CurrentPlan = &currentPlan.String
			item.PlanName = &currentPlan.String
		}
		if subExpires.Valid {
			item.SubscriptionExpiresAt = &subExpires.Time
		}
		if customDomain.Valid && customDomain.String != "" {
			item.CustomDomain = &customDomain.String
		}

		// Calculate subscription status
		if item.Status == "pending" {
			item.SubscriptionStatus = "pending"
		} else if item.Status == "suspended" || item.Status == "inactive" {
			item.SubscriptionStatus = "suspended"
		} else if item.CurrentPlan == nil && item.PlanName == nil {
			item.SubscriptionStatus = "no_plan"
		} else if item.SubscriptionExpiresAt != nil && item.SubscriptionExpiresAt.Before(now) {
			item.SubscriptionStatus = "expired"
		} else if item.Status == "active" {
			item.SubscriptionStatus = "active"
		} else if item.Status != "" {
			item.SubscriptionStatus = item.Status
		} else {
			item.SubscriptionStatus = "pending"
		}

		// Apply optional status filter
		if filter != "" && filter != "all" {
			if filter == "no_plan" {
				if item.SubscriptionStatus != "no_plan" {
					continue
				}
			} else if filter == "active" {
				if item.SubscriptionStatus != "active" {
					continue
				}
			} else if item.SubscriptionStatus != filter && item.Status != filter {
				continue
			}
		}

		items = append(items, item)
	}

	return items, rows.Err()
}

func (r *mysqlStaffRepository) ListStaffUsers(ctx context.Context) ([]StaffUser, error) {
	query := `
		SELECT id, name, email, password_hash, status, created_at, updated_at
		FROM staff_users
		ORDER BY id ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []StaffUser
	for rows.Next() {
		var u StaffUser
		if err := rows.Scan(
			&u.ID,
			&u.Name,
			&u.Email,
			&u.PasswordHash,
			&u.Status,
			&u.CreatedAt,
			&u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	return users, rows.Err()
}

func (r *mysqlStaffRepository) Update(ctx context.Context, user *StaffUser) error {
	query := `
		UPDATE staff_users
		SET name = ?, email = ?, password_hash = ?, status = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		user.Name,
		user.Email,
		user.PasswordHash,
		user.Status,
		user.ID,
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

