package repository

import (
	"context"
	"database/sql"
	"time"
)

// CommissionLedger represents an entry in the commission_ledger table.
type CommissionLedger struct {
	ID         uint64  `json:"id"`
	TenantID   uint64  `json:"tenant_id"`
	AgentID    uint64  `json:"agent_id"`
	ProspectID uint64  `json:"prospect_id"`
	PackageID  *uint64 `json:"package_id"`
	Type       string  `json:"type"` // 'direct', 'override', 'correction'
	Amount     float64 `json:"amount"`
	Notes      *string `json:"notes"`
	// ReleasedAt nil = tertahan (jamaah belum lunas); set = boleh dicairkan agen.
	ReleasedAt *time.Time `json:"released_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// CommissionLedgerWithProspect holds a ledger item along with joined prospect info for direct commissions.
type CommissionLedgerWithProspect struct {
	CommissionLedger
	ProspectName         string `json:"prospect_name"`
	ProspectJumlahJamaah int    `json:"prospect_jumlah_jamaah"`
	// ProspectAgentID is the agent the prospect belongs to (0 when none). A row booked to another agent
	// (the upline's override or its correction) comes from a downline's prospect.
	ProspectAgentID uint64 `json:"-"`
}

// CommissionLedgerRepository defines access methods for commission ledger records.
// All methods strictly enforce tenantID isolation as the first parameter.
type CommissionLedgerRepository interface {
	Create(ctx context.Context, tenantID uint64, entry *CommissionLedger) error
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedger, error)
	ListByAgentWithProspect(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedgerWithProspect, error)
	ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]CommissionLedger, error)
	SumByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error)
	// SumReleasedByAgent sums entries the agent may withdraw; SumHeldByAgent sums entries still on hold.
	SumReleasedByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error)
	SumHeldByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error)
	// ReleaseByProspect releases every held entry of a prospect (jamaah lunas). Returns rows released.
	ReleaseByProspect(ctx context.Context, tenantID uint64, prospectID uint64) (int64, error)
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
			tenant_id, agent_id, prospect_id, package_id, type, amount, notes, released_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
		entry.ReleasedAt,
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

// CreateBatch writes all entries of one commission booking (direct + override, or a set of
// corrections) in a single transaction, so a failure never leaves half a booking behind.
func (r *mysqlCommissionLedgerRepository) CreateBatch(ctx context.Context, tenantID uint64, entries []*CommissionLedger) error {
	if len(entries) == 0 {
		return nil
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	query := `
		INSERT INTO commission_ledger (
			tenant_id, agent_id, prospect_id, package_id, type, amount, notes, released_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	for _, entry := range entries {
		entry.TenantID = tenantID
		res, err := tx.ExecContext(ctx, query, tenantID, entry.AgentID, entry.ProspectID, entry.PackageID, entry.Type, entry.Amount, entry.Notes, entry.ReleasedAt)
		if err != nil {
			return err
		}
		id, err := res.LastInsertId()
		if err != nil {
			return err
		}
		entry.ID = uint64(id)
	}
	return tx.Commit()
}

func (r *mysqlCommissionLedgerRepository) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionLedger, error) {
	query := `
		SELECT id, tenant_id, agent_id, prospect_id, package_id, type, amount, notes, released_at, created_at
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
		SELECT id, tenant_id, agent_id, prospect_id, package_id, type, amount, notes, released_at, created_at
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
		var releasedAt sql.NullTime

		if err := rows.Scan(
			&l.ID,
			&l.TenantID,
			&l.AgentID,
			&l.ProspectID,
			&packageID,
			&l.Type,
			&l.Amount,
			&notes,
			&releasedAt,
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
		if releasedAt.Valid {
			t := releasedAt.Time
			l.ReleasedAt = &t
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
		SELECT l.id, l.tenant_id, l.agent_id, l.prospect_id, l.package_id, l.type, l.amount, l.notes, l.released_at, l.created_at,
		       COALESCE(p.name, ''),
		       COALESCE(p.jumlah_jamaah, 1),
		       COALESCE(p.agent_id, 0)
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
		var releasedAt sql.NullTime

		if err := rows.Scan(
			&item.ID,
			&item.TenantID,
			&item.AgentID,
			&item.ProspectID,
			&packageID,
			&item.Type,
			&item.Amount,
			&notes,
			&releasedAt,
			&item.CreatedAt,
			&item.ProspectName,
			&item.ProspectJumlahJamaah,
			&item.ProspectAgentID,
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
		if releasedAt.Valid {
			t := releasedAt.Time
			item.ReleasedAt = &t
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *mysqlCommissionLedgerRepository) SumReleasedByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount), 0) FROM commission_ledger WHERE tenant_id = ? AND agent_id = ? AND released_at IS NOT NULL",
		tenantID, agentID).Scan(&total)
	return total, err
}

func (r *mysqlCommissionLedgerRepository) SumHeldByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error) {
	var total float64
	err := r.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount), 0) FROM commission_ledger WHERE tenant_id = ? AND agent_id = ? AND released_at IS NULL",
		tenantID, agentID).Scan(&total)
	return total, err
}

func (r *mysqlCommissionLedgerRepository) ReleaseByProspect(ctx context.Context, tenantID uint64, prospectID uint64) (int64, error) {
	// Only while the prospect is still closing: if "Batalkan Closing" wins a race with "Tandai Lunas",
	// nothing is released after the reversal was computed.
	res, err := r.db.ExecContext(ctx, `
		UPDATE commission_ledger l
		JOIN prospects p ON p.id = l.prospect_id AND p.tenant_id = l.tenant_id
		SET l.released_at = NOW()
		WHERE l.tenant_id = ? AND l.prospect_id = ? AND l.released_at IS NULL AND p.status = 'closing'`,
		tenantID, prospectID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
