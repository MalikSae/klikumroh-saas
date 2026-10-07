package repository

import (
	"context"
	"database/sql"
	"errors"
)

// MaxPlaybookChecksPerPage caps the checked items one travel can store for one guide page, so a client that
// invents item ids cannot grow the table without limit. A real page has a few dozen items.
const MaxPlaybookChecksPerPage = 200

// ErrPlaybookChecksFull: the travel already stores MaxPlaybookChecksPerPage checked items for the page.
var ErrPlaybookChecksFull = errors.New("terlalu banyak butir yang dicentang pada halaman ini")

// PlaybookCheckRepository stores which checklist items of the recruitment guide a travel has checked.
// Every method is scoped to the tenant: one travel never reads or changes another travel's checks.
type PlaybookCheckRepository interface {
	// List returns the checked item ids of one guide page.
	List(ctx context.Context, tenantID uint64, pageSlug string) ([]string, error)
	// Set checks (checked=true) or unchecks one item. A repeat of the same change is a no-op.
	// adminUserID is the travel admin who checked it (nil if unknown).
	Set(ctx context.Context, tenantID uint64, pageSlug, itemID string, checked bool, adminUserID *uint64) error
}

type mysqlPlaybookCheckRepository struct {
	db *sql.DB
}

// NewPlaybookCheckRepository creates a new PlaybookCheckRepository.
func NewPlaybookCheckRepository(db *sql.DB) PlaybookCheckRepository {
	return &mysqlPlaybookCheckRepository{db: db}
}

func (r *mysqlPlaybookCheckRepository) List(ctx context.Context, tenantID uint64, pageSlug string) ([]string, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT item_id FROM playbook_checks WHERE tenant_id = ? AND page_slug = ? ORDER BY checked_at, item_id`,
		tenantID, pageSlug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (r *mysqlPlaybookCheckRepository) Set(ctx context.Context, tenantID uint64, pageSlug, itemID string, checked bool, adminUserID *uint64) error {
	if !checked {
		_, err := r.db.ExecContext(ctx,
			`DELETE FROM playbook_checks WHERE tenant_id = ? AND page_slug = ? AND item_id = ?`,
			tenantID, pageSlug, itemID)
		return err
	}

	var n int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM playbook_checks WHERE tenant_id = ? AND page_slug = ?`,
		tenantID, pageSlug).Scan(&n); err != nil {
		return err
	}
	if n >= MaxPlaybookChecksPerPage {
		// A repeat of an item that is already stored is still fine.
		var exists int
		if err := r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM playbook_checks WHERE tenant_id = ? AND page_slug = ? AND item_id = ?`,
			tenantID, pageSlug, itemID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return ErrPlaybookChecksFull
		}
		return nil
	}

	_, err := r.db.ExecContext(ctx,
		`INSERT IGNORE INTO playbook_checks (tenant_id, page_slug, item_id, checked_by) VALUES (?, ?, ?, ?)`,
		tenantID, pageSlug, itemID, adminUserID)
	return err
}
