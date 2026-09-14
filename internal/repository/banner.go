package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Banner represents a promotion banner slide for tenant home page.
type Banner struct {
	ID           uint64    `json:"id"`
	TenantID     uint64    `json:"tenant_id"`
	Title        string    `json:"title"`
	ImageURL     string    `json:"image_url"`
	Subtitle     *string   `json:"subtitle"`
	CTAURL       *string   `json:"cta_url"`
	DisplayOrder int       `json:"display_order"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// BannerRepository defines data access operations for tenant banners.
// In compliance with AGENTS.md 3.1, every method requires tenantID.
type BannerRepository interface {
	Create(ctx context.Context, tenantID uint64, banner *Banner) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Banner, error)
	ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*Banner, error)
	Update(ctx context.Context, tenantID uint64, banner *Banner) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
}

type mysqlBannerRepository struct {
	db *sql.DB
}

// NewBannerRepository creates a new BannerRepository instance.
func NewBannerRepository(db *sql.DB) BannerRepository {
	return &mysqlBannerRepository{db: db}
}

func (r *mysqlBannerRepository) Create(ctx context.Context, tenantID uint64, banner *Banner) error {
	query := `
		INSERT INTO tenant_banners (
			tenant_id, title, image_url, subtitle, cta_url, display_order, is_active
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	res, err := r.db.ExecContext(ctx, query,
		tenantID,
		banner.Title,
		banner.ImageURL,
		banner.Subtitle,
		banner.CTAURL,
		banner.DisplayOrder,
		banner.IsActive,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	banner.ID = uint64(id)
	banner.TenantID = tenantID
	return nil
}

func (r *mysqlBannerRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Banner, error) {
	query := `
		SELECT id, tenant_id, title, image_url, subtitle, cta_url, display_order, is_active, created_at, updated_at
		FROM tenant_banners
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanBanner(row)
}

func (r *mysqlBannerRepository) ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*Banner, error) {
	query := `
		SELECT id, tenant_id, title, image_url, subtitle, cta_url, display_order, is_active, created_at, updated_at
		FROM tenant_banners
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

	var banners []*Banner
	for rows.Next() {
		b, err := r.scanBannerRow(rows)
		if err != nil {
			return nil, err
		}
		banners = append(banners, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return banners, nil
}

func (r *mysqlBannerRepository) Update(ctx context.Context, tenantID uint64, banner *Banner) error {
	query := `
		UPDATE tenant_banners
		SET title = ?, image_url = ?, subtitle = ?, cta_url = ?, display_order = ?, is_active = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		banner.Title,
		banner.ImageURL,
		banner.Subtitle,
		banner.CTAURL,
		banner.DisplayOrder,
		banner.IsActive,
		banner.ID,
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

func (r *mysqlBannerRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM tenant_banners WHERE id = ? AND tenant_id = ?`
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

func (r *mysqlBannerRepository) scanBanner(row *sql.Row) (*Banner, error) {
	var b Banner
	var subtitle sql.NullString
	var ctaURL sql.NullString

	err := row.Scan(
		&b.ID,
		&b.TenantID,
		&b.Title,
		&b.ImageURL,
		&subtitle,
		&ctaURL,
		&b.DisplayOrder,
		&b.IsActive,
		&b.CreatedAt,
		&b.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if subtitle.Valid {
		b.Subtitle = &subtitle.String
	}
	if ctaURL.Valid {
		b.CTAURL = &ctaURL.String
	}

	return &b, nil
}

func (r *mysqlBannerRepository) scanBannerRow(rows *sql.Rows) (*Banner, error) {
	var b Banner
	var subtitle sql.NullString
	var ctaURL sql.NullString

	err := rows.Scan(
		&b.ID,
		&b.TenantID,
		&b.Title,
		&b.ImageURL,
		&subtitle,
		&ctaURL,
		&b.DisplayOrder,
		&b.IsActive,
		&b.CreatedAt,
		&b.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if subtitle.Valid {
		b.Subtitle = &subtitle.String
	}
	if ctaURL.Valid {
		b.CTAURL = &ctaURL.String
	}

	return &b, nil
}
