package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// FAQ represents a Frequently Asked Question item for the public home page.
type FAQ struct {
	ID           uint64    `json:"id"`
	TenantID     uint64    `json:"tenant_id"`
	Question     string    `json:"question"`
	Answer       string    `json:"answer"`
	DisplayOrder int       `json:"display_order"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// FAQRepository defines data access operations for tenant FAQs.
// In compliance with AGENTS.md 3.1, every method requires tenantID.
type FAQRepository interface {
	Create(ctx context.Context, tenantID uint64, faq *FAQ) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*FAQ, error)
	ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*FAQ, error)
	Update(ctx context.Context, tenantID uint64, faq *FAQ) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
}

type mysqlFAQRepository struct {
	db *sql.DB
}

// NewFAQRepository creates a new FAQRepository instance.
func NewFAQRepository(db *sql.DB) FAQRepository {
	return &mysqlFAQRepository{db: db}
}

func (r *mysqlFAQRepository) Create(ctx context.Context, tenantID uint64, faq *FAQ) error {
	query := `
		INSERT INTO tenant_faqs (
			tenant_id, question, answer, display_order, is_active
		) VALUES (?, ?, ?, ?, ?)
	`
	res, err := r.db.ExecContext(ctx, query,
		tenantID,
		faq.Question,
		faq.Answer,
		faq.DisplayOrder,
		faq.IsActive,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	faq.ID = uint64(id)
	faq.TenantID = tenantID
	return nil
}

func (r *mysqlFAQRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*FAQ, error) {
	query := `
		SELECT id, tenant_id, question, answer, display_order, is_active, created_at, updated_at
		FROM tenant_faqs
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanFAQ(row)
}

func (r *mysqlFAQRepository) ListByTenantID(ctx context.Context, tenantID uint64, activeOnly bool) ([]*FAQ, error) {
	query := `
		SELECT id, tenant_id, question, answer, display_order, is_active, created_at, updated_at
		FROM tenant_faqs
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

	var list []*FAQ
	for rows.Next() {
		item, err := r.scanFAQRow(rows)
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

func (r *mysqlFAQRepository) Update(ctx context.Context, tenantID uint64, faq *FAQ) error {
	query := `
		UPDATE tenant_faqs
		SET question = ?, answer = ?, display_order = ?, is_active = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		faq.Question,
		faq.Answer,
		faq.DisplayOrder,
		faq.IsActive,
		faq.ID,
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

func (r *mysqlFAQRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM tenant_faqs WHERE id = ? AND tenant_id = ?`
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

func (r *mysqlFAQRepository) scanFAQ(row *sql.Row) (*FAQ, error) {
	var f FAQ
	err := row.Scan(
		&f.ID,
		&f.TenantID,
		&f.Question,
		&f.Answer,
		&f.DisplayOrder,
		&f.IsActive,
		&f.CreatedAt,
		&f.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &f, nil
}

func (r *mysqlFAQRepository) scanFAQRow(rows *sql.Rows) (*FAQ, error) {
	var f FAQ
	err := rows.Scan(
		&f.ID,
		&f.TenantID,
		&f.Question,
		&f.Answer,
		&f.DisplayOrder,
		&f.IsActive,
		&f.CreatedAt,
		&f.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}
