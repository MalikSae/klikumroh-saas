package repository

import (
	"context"
	"database/sql"
	"time"
)

// ProspectStatusHistory represents an audit entry for prospect pipeline status changes.
type ProspectStatusHistory struct {
	ID            uint64    `json:"id"`
	TenantID      uint64    `json:"tenant_id"`
	ProspectID    uint64    `json:"prospect_id"`
	ChangedByType string    `json:"changed_by_type"` // 'admin', 'agent'
	ChangedByID   uint64    `json:"changed_by_id"`
	ChangedByName *string   `json:"changed_by_name,omitempty"`
	OldStatus     string    `json:"old_status"`
	NewStatus     string    `json:"new_status"`
	ChangedAt     time.Time `json:"changed_at"`
}

// ProspectStatusHistoryRepository defines access methods for status history records.
type ProspectStatusHistoryRepository interface {
	Create(ctx context.Context, tenantID uint64, history *ProspectStatusHistory) error
	ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]ProspectStatusHistory, error)
}

type mysqlProspectStatusHistoryRepository struct {
	db *sql.DB
}

// NewProspectStatusHistoryRepository creates a new ProspectStatusHistoryRepository.
func NewProspectStatusHistoryRepository(db *sql.DB) ProspectStatusHistoryRepository {
	return &mysqlProspectStatusHistoryRepository{db: db}
}

func (r *mysqlProspectStatusHistoryRepository) Create(ctx context.Context, tenantID uint64, history *ProspectStatusHistory) error {
	query := `
		INSERT INTO prospect_status_history (
			tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status
		) VALUES (?, ?, ?, ?, ?, ?)
	`
	history.TenantID = tenantID
	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		history.ProspectID,
		history.ChangedByType,
		history.ChangedByID,
		history.OldStatus,
		history.NewStatus,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	history.ID = uint64(id)
	return nil
}

func (r *mysqlProspectStatusHistoryRepository) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]ProspectStatusHistory, error) {
	query := `
		SELECT h.id, h.tenant_id, h.prospect_id, h.changed_by_type, h.changed_by_id,
			h.old_status, h.new_status, h.changed_at,
			CASE 
				WHEN h.changed_by_type = 'admin' THEN u.name 
				ELSE NULL 
			END as changed_by_name
		FROM prospect_status_history h
		LEFT JOIN admin_users u ON h.changed_by_type = 'admin' AND h.changed_by_id = u.id AND u.tenant_id = h.tenant_id
		WHERE h.tenant_id = ? AND h.prospect_id = ?
		ORDER BY h.changed_at DESC, h.id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, prospectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var histories []ProspectStatusHistory
	for rows.Next() {
		var h ProspectStatusHistory
		var changedByName sql.NullString

		if err := rows.Scan(
			&h.ID,
			&h.TenantID,
			&h.ProspectID,
			&h.ChangedByType,
			&h.ChangedByID,
			&h.OldStatus,
			&h.NewStatus,
			&h.ChangedAt,
			&changedByName,
		); err != nil {
			return nil, err
		}

		if changedByName.Valid {
			h.ChangedByName = &changedByName.String
		}
		histories = append(histories, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return histories, nil
}
