package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// CommissionPayoutRequest represents an entry in commission_payout_requests table.
type CommissionPayoutRequest struct {
	ID                        uint64     `json:"id"`
	TenantID                  uint64     `json:"tenant_id"`
	AgentID                   uint64     `json:"agent_id"`
	AmountRequested           float64    `json:"amount_requested"`
	Status                    string     `json:"status"` // 'pending', 'approved', 'rejected', 'paid'
	BankNameSnapshot          string     `json:"bank_name_snapshot"`
	BankAccountNumberSnapshot string     `json:"bank_account_number_snapshot"`
	BankAccountHolderSnapshot string     `json:"bank_account_holder_snapshot"`
	ReviewedBy                *uint64    `json:"reviewed_by"`
	ReviewedAt                *time.Time `json:"reviewed_at"`
	RejectionReason           *string    `json:"rejection_reason"`
	CreatedAt                 time.Time  `json:"created_at"`
	UpdatedAt                 time.Time  `json:"updated_at"`
}

// CommissionPayoutRequestItem is a joined view for admin listing with agent details.
type CommissionPayoutRequestItem struct {
	CommissionPayoutRequest
	AgentName  string  `json:"agent_name"`
	AgentPhone *string `json:"agent_phone"`
}

// CommissionPayoutRequestRepository defines data access for commission payout requests.
type CommissionPayoutRequestRepository interface {
	Create(ctx context.Context, tenantID uint64, req *CommissionPayoutRequest) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*CommissionPayoutRequest, error)
	GetActiveRequestByAgent(ctx context.Context, tenantID uint64, agentID uint64) (*CommissionPayoutRequest, error)
	SumPendingApprovedPaidByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error)
	List(ctx context.Context, tenantID uint64, statusFilter *string) ([]CommissionPayoutRequestItem, error)
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionPayoutRequest, error)
	UpdateStatus(ctx context.Context, tenantID uint64, id uint64, fromStatus, toStatus string, reviewedBy *uint64, reviewedAt *time.Time, rejectionReason *string) error
}

type mysqlCommissionPayoutRequestRepository struct {
	db *sql.DB
}

// NewCommissionPayoutRequestRepository instantiates a new repository.
func NewCommissionPayoutRequestRepository(db *sql.DB) CommissionPayoutRequestRepository {
	return &mysqlCommissionPayoutRequestRepository{db: db}
}

func (r *mysqlCommissionPayoutRequestRepository) Create(ctx context.Context, tenantID uint64, req *CommissionPayoutRequest) error {
	query := `
		INSERT INTO commission_payout_requests (
			tenant_id, agent_id, amount_requested, status,
			bank_name_snapshot, bank_account_number_snapshot, bank_account_holder_snapshot,
			reviewed_by, reviewed_at, rejection_reason
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	req.TenantID = tenantID
	if req.Status == "" {
		req.Status = "pending"
	}

	res, err := r.db.ExecContext(ctx, query,
		tenantID,
		req.AgentID,
		req.AmountRequested,
		req.Status,
		req.BankNameSnapshot,
		req.BankAccountNumberSnapshot,
		req.BankAccountHolderSnapshot,
		req.ReviewedBy,
		req.ReviewedAt,
		req.RejectionReason,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	req.ID = uint64(id)

	var createdAt, updatedAt time.Time
	if err := r.db.QueryRowContext(ctx, "SELECT created_at, updated_at FROM commission_payout_requests WHERE id = ? AND tenant_id = ?", req.ID, tenantID).Scan(&createdAt, &updatedAt); err == nil {
		req.CreatedAt = createdAt
		req.UpdatedAt = updatedAt
	} else {
		now := time.Now().UTC()
		req.CreatedAt = now
		req.UpdatedAt = now
	}

	return nil
}

func (r *mysqlCommissionPayoutRequestRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*CommissionPayoutRequest, error) {
	query := `
		SELECT id, tenant_id, agent_id, amount_requested, status,
		       bank_name_snapshot, bank_account_number_snapshot, bank_account_holder_snapshot,
		       reviewed_by, reviewed_at, rejection_reason, created_at, updated_at
		FROM commission_payout_requests
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)

	var req CommissionPayoutRequest
	var reviewedBy sql.NullInt64
	var reviewedAt sql.NullTime
	var rejectionReason sql.NullString

	err := row.Scan(
		&req.ID,
		&req.TenantID,
		&req.AgentID,
		&req.AmountRequested,
		&req.Status,
		&req.BankNameSnapshot,
		&req.BankAccountNumberSnapshot,
		&req.BankAccountHolderSnapshot,
		&reviewedBy,
		&reviewedAt,
		&rejectionReason,
		&req.CreatedAt,
		&req.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if reviewedBy.Valid {
		rID := uint64(reviewedBy.Int64)
		req.ReviewedBy = &rID
	}
	if reviewedAt.Valid {
		req.ReviewedAt = &reviewedAt.Time
	}
	if rejectionReason.Valid {
		req.RejectionReason = &rejectionReason.String
	}

	return &req, nil
}

// GetActiveRequestByAgent returns a request if the agent currently has one with status IN ('pending', 'approved').
func (r *mysqlCommissionPayoutRequestRepository) GetActiveRequestByAgent(ctx context.Context, tenantID uint64, agentID uint64) (*CommissionPayoutRequest, error) {
	query := `
		SELECT id, tenant_id, agent_id, amount_requested, status,
		       bank_name_snapshot, bank_account_number_snapshot, bank_account_holder_snapshot,
		       reviewed_by, reviewed_at, rejection_reason, created_at, updated_at
		FROM commission_payout_requests
		WHERE tenant_id = ? AND agent_id = ? AND status IN ('pending', 'approved')
		ORDER BY id DESC
		LIMIT 1
	`
	row := r.db.QueryRowContext(ctx, query, tenantID, agentID)

	var req CommissionPayoutRequest
	var reviewedBy sql.NullInt64
	var reviewedAt sql.NullTime
	var rejectionReason sql.NullString

	err := row.Scan(
		&req.ID,
		&req.TenantID,
		&req.AgentID,
		&req.AmountRequested,
		&req.Status,
		&req.BankNameSnapshot,
		&req.BankAccountNumberSnapshot,
		&req.BankAccountHolderSnapshot,
		&reviewedBy,
		&reviewedAt,
		&rejectionReason,
		&req.CreatedAt,
		&req.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // No active request
		}
		return nil, err
	}

	if reviewedBy.Valid {
		rID := uint64(reviewedBy.Int64)
		req.ReviewedBy = &rID
	}
	if reviewedAt.Valid {
		req.ReviewedAt = &reviewedAt.Time
	}
	if rejectionReason.Valid {
		req.RejectionReason = &rejectionReason.String
	}

	return &req, nil
}

// SumPendingApprovedPaidByAgent computes SUM(amount_requested) for status IN ('pending', 'approved', 'paid').
func (r *mysqlCommissionPayoutRequestRepository) SumPendingApprovedPaidByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error) {
	query := `
		SELECT COALESCE(SUM(amount_requested), 0)
		FROM commission_payout_requests
		WHERE tenant_id = ? AND agent_id = ? AND status IN ('pending', 'approved', 'paid')
	`
	var total float64
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (r *mysqlCommissionPayoutRequestRepository) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]CommissionPayoutRequestItem, error) {
	var query string
	var args []interface{}

	query = `
		SELECT r.id, r.tenant_id, r.agent_id, r.amount_requested, r.status,
		       r.bank_name_snapshot, r.bank_account_number_snapshot, r.bank_account_holder_snapshot,
		       r.reviewed_by, r.reviewed_at, r.rejection_reason, r.created_at, r.updated_at,
		       COALESCE(a.name, '') AS agent_name, a.phone AS agent_phone
		FROM commission_payout_requests r
		JOIN agents a ON r.agent_id = a.id
		WHERE r.tenant_id = ?
	`
	args = append(args, tenantID)

	if statusFilter != nil && *statusFilter != "" {
		query += " AND r.status = ?"
		args = append(args, *statusFilter)
	}

	query += " ORDER BY r.created_at DESC, r.id DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []CommissionPayoutRequestItem
	for rows.Next() {
		var item CommissionPayoutRequestItem
		var reviewedBy sql.NullInt64
		var reviewedAt sql.NullTime
		var rejectionReason sql.NullString
		var phone sql.NullString

		if err := rows.Scan(
			&item.ID,
			&item.TenantID,
			&item.AgentID,
			&item.AmountRequested,
			&item.Status,
			&item.BankNameSnapshot,
			&item.BankAccountNumberSnapshot,
			&item.BankAccountHolderSnapshot,
			&reviewedBy,
			&reviewedAt,
			&rejectionReason,
			&item.CreatedAt,
			&item.UpdatedAt,
			&item.AgentName,
			&phone,
		); err != nil {
			return nil, err
		}

		if reviewedBy.Valid {
			rID := uint64(reviewedBy.Int64)
			item.ReviewedBy = &rID
		}
		if reviewedAt.Valid {
			item.ReviewedAt = &reviewedAt.Time
		}
		if rejectionReason.Valid {
			item.RejectionReason = &rejectionReason.String
		}
		if phone.Valid {
			item.AgentPhone = &phone.String
		}

		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (r *mysqlCommissionPayoutRequestRepository) UpdateStatus(
	ctx context.Context,
	tenantID uint64,
	id uint64,
	fromStatus, toStatus string,
	reviewedBy *uint64,
	reviewedAt *time.Time,
	rejectionReason *string,
) error {
	query := `
		UPDATE commission_payout_requests
		SET status = ?, reviewed_by = ?, reviewed_at = ?, rejection_reason = ?
		WHERE id = ? AND tenant_id = ? AND status = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		toStatus,
		reviewedBy,
		reviewedAt,
		rejectionReason,
		id,
		tenantID,
		fromStatus,
	)
	if err != nil {
		return err
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("pengajuan tidak ditemukan atau status saat ini bukan '%s'", fromStatus)
	}

	return nil
}

func (r *mysqlCommissionPayoutRequestRepository) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionPayoutRequest, error) {
	query := `
		SELECT id, tenant_id, agent_id, amount_requested, status,
		       bank_name_snapshot, bank_account_number_snapshot, bank_account_holder_snapshot,
		       reviewed_by, reviewed_at, rejection_reason, created_at, updated_at
		FROM commission_payout_requests
		WHERE tenant_id = ? AND agent_id = ?
		ORDER BY created_at DESC, id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []CommissionPayoutRequest
	for rows.Next() {
		var req CommissionPayoutRequest
		var reviewedBy sql.NullInt64
		var reviewedAt sql.NullTime
		var rejectionReason sql.NullString

		err := rows.Scan(
			&req.ID,
			&req.TenantID,
			&req.AgentID,
			&req.AmountRequested,
			&req.Status,
			&req.BankNameSnapshot,
			&req.BankAccountNumberSnapshot,
			&req.BankAccountHolderSnapshot,
			&reviewedBy,
			&reviewedAt,
			&rejectionReason,
			&req.CreatedAt,
			&req.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if reviewedBy.Valid {
			rID := uint64(reviewedBy.Int64)
			req.ReviewedBy = &rID
		}
		if reviewedAt.Valid {
			req.ReviewedAt = &reviewedAt.Time
		}
		if rejectionReason.Valid {
			req.RejectionReason = &rejectionReason.String
		}

		requests = append(requests, req)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return requests, nil
}

