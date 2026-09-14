package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Testimonial represents a customer review displayed on the public home page.
type Testimonial struct {
	ID           uint64    `json:"id"`
	TenantID     uint64    `json:"tenant_id"`
	Name         string    `json:"name"`
	PackageName  string    `json:"package_name"`
	Rating       int       `json:"rating"`
	Quote        string    `json:"quote"`
	AvatarURL    *string   `json:"avatar_url"`
	DisplayOrder int       `json:"display_order"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TestimonialRepository defines data access operations for tenant testimonials.
// In compliance with AGENTS.md 3.1, every method requires tenantID.
type TestimonialRepository interface {
	Create(ctx context.Context, tenantID uint64, testimonial *Testimonial) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Testimonial, error)
	ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*Testimonial, error)
	Update(ctx context.Context, tenantID uint64, testimonial *Testimonial) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
}

type mysqlTestimonialRepository struct {
	db *sql.DB
}

// NewTestimonialRepository creates a new TestimonialRepository instance.
func NewTestimonialRepository(db *sql.DB) TestimonialRepository {
	return &mysqlTestimonialRepository{db: db}
}

func (r *mysqlTestimonialRepository) Create(ctx context.Context, tenantID uint64, t *Testimonial) error {
	query := `
		INSERT INTO tenant_testimonials (
			tenant_id, name, package_name, rating, quote, avatar_url, display_order, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	if t.Rating < 1 || t.Rating > 5 {
		t.Rating = 5
	}

	res, err := r.db.ExecContext(ctx, query,
		tenantID,
		t.Name,
		t.PackageName,
		t.Rating,
		t.Quote,
		t.AvatarURL,
		t.DisplayOrder,
		t.IsActive,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	t.ID = uint64(id)
	t.TenantID = tenantID
	return nil
}

func (r *mysqlTestimonialRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Testimonial, error) {
	query := `
		SELECT id, tenant_id, name, package_name, rating, quote, avatar_url, display_order, is_active, created_at, updated_at
		FROM tenant_testimonials
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanTestimonial(row)
}

func (r *mysqlTestimonialRepository) ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*Testimonial, error) {
	query := `
		SELECT id, tenant_id, name, package_name, rating, quote, avatar_url, display_order, is_active, created_at, updated_at
		FROM tenant_testimonials
		WHERE tenant_id = ?
	`
	if activeOnly {
		query += " AND is_active = TRUE"
	}
	query += " ORDER BY display_order ASC, id ASC"

	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*Testimonial
	for rows.Next() {
		item, err := r.scanTestimonialRow(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (r *mysqlTestimonialRepository) Update(ctx context.Context, tenantID uint64, t *Testimonial) error {
	query := `
		UPDATE tenant_testimonials
		SET name = ?, package_name = ?, rating = ?, quote = ?, avatar_url = ?, display_order = ?, is_active = ?
		WHERE id = ? AND tenant_id = ?
	`
	if t.Rating < 1 || t.Rating > 5 {
		t.Rating = 5
	}

	res, err := r.db.ExecContext(ctx, query,
		t.Name,
		t.PackageName,
		t.Rating,
		t.Quote,
		t.AvatarURL,
		t.DisplayOrder,
		t.IsActive,
		t.ID,
		tenantID,
	)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlTestimonialRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM tenant_testimonials WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlTestimonialRepository) scanTestimonial(row *sql.Row) (*Testimonial, error) {
	var t Testimonial
	var avatarURL sql.NullString

	err := row.Scan(
		&t.ID,
		&t.TenantID,
		&t.Name,
		&t.PackageName,
		&t.Rating,
		&t.Quote,
		&avatarURL,
		&t.DisplayOrder,
		&t.IsActive,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if avatarURL.Valid {
		t.AvatarURL = &avatarURL.String
	}

	return &t, nil
}

func (r *mysqlTestimonialRepository) scanTestimonialRow(rows *sql.Rows) (*Testimonial, error) {
	var t Testimonial
	var avatarURL sql.NullString

	err := rows.Scan(
		&t.ID,
		&t.TenantID,
		&t.Name,
		&t.PackageName,
		&t.Rating,
		&t.Quote,
		&avatarURL,
		&t.DisplayOrder,
		&t.IsActive,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if avatarURL.Valid {
		t.AvatarURL = &avatarURL.String
	}

	return &t, nil
}
