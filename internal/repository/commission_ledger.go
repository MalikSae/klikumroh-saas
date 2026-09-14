package repository

import (
	"context"
	"database/sql"
	"time"
)

// CommissionLedger represents an entry in the commission_ledger table.
type CommissionLedger struct {
	ID         uint64    `json:"id"`
	TenantID   uint64    `json:"tenant_id"`
	AgentID    uint64    `json:"agent_id"`
	ProspectID uint64    `json:"prospect_id"`
	PackageID  *uint64   `json:"package_id"`
	Type       string    `json:"type"` // 'direct', 'override', 'correction'
	Amount     float64   `json:"amount"`
	Notes      *string   `json:"notes"`
	CreatedAt  time.Time `json:"created_at"`
}

// CommissionLedgerWithProspect holds a ledger item along with joined prospect info for direct commissions.
type CommissionLedgerWithProspect struct {
	CommissionLedger
	ProspectName         string `json:"prospect_name"`
	ProspectJumlahJamaah int    `json:"prospect_jumlah_jamaah"`
}

// CommissionLedgerRepository defines access methods for commission ledger records.
// All methods strictly enforce tenantID isolation as the first parameter.
type CommissionLedgerRepository interface {
	Create(ctx context.Context, tenantID uint64, entry *CommissionLedger) error
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedger, error)
	ListByAgentWithProspect(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedgerWithProspect, error)
	ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]CommissionLedger, error)
	SumByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error)
}

type mysqlCommissionLedgerRepository struct {
	db *sql.DB
}

// NewCommissionLedgerRepository creates a new CommissionLedgerRepository.
func NewCommissionLedgerRepository(db *sql.DB) CommissionLedgerRepository {
	return &mysqlCommissionLedgerRepository{db: db}
}

func (r *mysqlCommissionLedgerRepository) Create(ctx context.Context, tenantID uint64, entry *CommissionLedger) error {
	query := `
		INSERT INTO commission_ledger (
			tenant_id, agent_id, prospect_id, package_id, type, amount, notes
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	entry.TenantID = tenantID
	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		entry.AgentID,
		entry.ProspectID,
		entry.PackageID,
		entry.Type,
		entry.Amount,
		entry.Notes,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	entry.ID = uint64(id)
	return nil
}

func (r *mysqlCommissionLedgerRepository) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedger, error) {
	query := `
		SELECT id, tenant_id, agent_id, prospect_id, package_id, type, amount, notes, created_at
		FROM commission_ledger
		WHERE tenant_id = ? AND agent_id = ?
		ORDER BY created_at DESC, id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return r.scanLedgers(rows)
}

func (r *mysqlCommissionLedgerRepository) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]CommissionLedger, error) {
	query := `
		SELECT id, tenant_id, agent_id, prospect_id, package_id, type, amount, notes, created_at
		FROM commission_ledger
		WHERE tenant_id = ? AND prospect_id = ?
		ORDER BY created_at ASC, id ASC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, prospectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return r.scanLedgers(rows)
}

func (r *mysqlCommissionLedgerRepository) SumByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error) {
	query := `
		SELECT COALESCE(SUM(amount), 0)
		FROM commission_ledger
		WHERE tenant_id = ? AND agent_id = ?
	`
	var total float64
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (r *mysqlCommissionLedgerRepository) scanLedgers(rows *sql.Rows) ([]CommissionLedger, error) {
	var ledgers []CommissionLedger
	for rows.Next() {
		var l CommissionLedger
		var packageID sql.NullInt64
		var notes sql.NullString

		if err := rows.Scan(
			&l.ID,
			&l.TenantID,
			&l.AgentID,
			&l.ProspectID,
			&packageID,
			&l.Type,
			&l.Amount,
			&notes,
			&l.CreatedAt,
		); err != nil {
			return nil, err
		}

		if packageID.Valid {
			pID := uint64(packageID.Int64)
			l.PackageID = &pID
		}
		if notes.Valid {
			l.Notes = &notes.String
		}
		ledgers = append(ledgers, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ledgers, nil
}

func (r *mysqlCommissionLedgerRepository) ListByAgentWithProspect(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedgerWithProspect, error) {
	query := `
		SELECT l.id, l.tenant_id, l.agent_id, l.prospect_id, l.package_id, l.type, l.amount, l.notes, l.created_at,
		       COALESCE(p.name, ''),
		       COALESCE(p.jumlah_jamaah, 1)
		FROM commission_ledger l
		LEFT JOIN prospects p ON p.id = l.prospect_id AND p.tenant_id = ?
		WHERE l.tenant_id = ? AND l.agent_id = ?
		ORDER BY l.created_at DESC, l.id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []CommissionLedgerWithProspect
	for rows.Next() {
		var item CommissionLedgerWithProspect
		var packageID sql.NullInt64
		var notes sql.NullString

		if err := rows.Scan(
			&item.ID,
			&item.TenantID,
			&item.AgentID,
			&item.ProspectID,
			&packageID,
			&item.Type,
			&item.Amount,
			&notes,
			&item.CreatedAt,
			&item.ProspectName,
			&item.ProspectJumlahJamaah,
		); err != nil {
			return nil, err
		}

		if packageID.Valid {
			pID := uint64(packageID.Int64)
			item.PackageID = &pID
		}
		if notes.Valid {
			item.Notes = &notes.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

