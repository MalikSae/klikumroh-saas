package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Kinds of a jamaah payment request (founder decision 7 Oct 2026).
const (
	PaymentRequestClosing = "closing"  // DP proof: approval moves the prospect to Closing
	PaymentRequestPaidOff = "paid_off" // pelunasan proof: approval marks the jamaah paid off
)

// PaymentRequest is a jamaah payment proof uploaded by the agent, waiting for the travel admin.
type PaymentRequest struct {
	ID              uint64     `json:"id"`
	TenantID        uint64     `json:"tenant_id"`
	ProspectID      uint64     `json:"prospect_id"`
	AgentID         uint64     `json:"agent_id"`
	Kind            string     `json:"kind"`
	ProofURL        string     `json:"proof_url"`
	Amount          *float64   `json:"amount"`
	Note            *string    `json:"note"`
	Status          string     `json:"status"` // pending, approved, rejected, cancelled
	RejectionReason *string    `json:"rejection_reason"`
	ReviewedBy      *uint64    `json:"reviewed_by"`
	ReviewedAt      *time.Time `json:"reviewed_at"`
	CreatedAt       time.Time  `json:"created_at"`

	// Filled by ListPending for the dashboard list.
	ProspectName string `json:"prospect_name,omitempty"`
	AgentName    string `json:"agent_name,omitempty"`
}

// ErrPaymentRequestNotPending is returned when a request was already decided (another admin, or the
// prospect moved on).
var ErrPaymentRequestNotPending = errors.New("payment request is not pending")

type PaymentRequestRepository interface {
	Create(ctx context.Context, tenantID uint64, req *PaymentRequest) error
	GetByID(ctx context.Context, tenantID, id uint64) (*PaymentRequest, error)
	ListByProspect(ctx context.Context, tenantID, prospectID uint64) ([]PaymentRequest, error)
	ListPending(ctx context.Context, tenantID uint64) ([]PaymentRequest, error)
	CountPending(ctx context.Context, tenantID uint64) (int, error)
	FindPending(ctx context.Context, tenantID, prospectID uint64, kind string) (*PaymentRequest, error)
	// Decide moves one pending request to approved or rejected (atomic: only from pending).
	Decide(ctx context.Context, tenantID, id uint64, status string, reason *string, reviewedBy uint64) error
	// ResolvePending closes every pending request of a kind for a prospect (status approved or cancelled),
	// used when the admin acts on the prospect directly. reviewedBy 0 records no reviewer.
	ResolvePending(ctx context.Context, tenantID, prospectID uint64, kind, status string, reviewedBy uint64) error
}

type mysqlPaymentRequestRepository struct {
	db *sql.DB
}

func NewPaymentRequestRepository(db *sql.DB) PaymentRequestRepository {
	return &mysqlPaymentRequestRepository{db: db}
}

const paymentRequestColumns = `r.id, r.tenant_id, r.prospect_id, r.agent_id, r.kind, r.proof_url, r.amount, r.note, r.status,
	r.rejection_reason, r.reviewed_by, r.reviewed_at, r.created_at`

func scanPaymentRequest(sc interface{ Scan(...any) error }, extra ...any) (*PaymentRequest, error) {
	var p PaymentRequest
	dest := []any{&p.ID, &p.TenantID, &p.ProspectID, &p.AgentID, &p.Kind, &p.ProofURL, &p.Amount, &p.Note, &p.Status,
		&p.RejectionReason, &p.ReviewedBy, &p.ReviewedAt, &p.CreatedAt}
	if err := sc.Scan(append(dest, extra...)...); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *mysqlPaymentRequestRepository) Create(ctx context.Context, tenantID uint64, req *PaymentRequest) error {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO prospect_payment_requests (tenant_id, prospect_id, agent_id, kind, proof_url, amount, note, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
		tenantID, req.ProspectID, req.AgentID, req.Kind, req.ProofURL, req.Amount, req.Note)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	req.ID = uint64(id)
	req.TenantID = tenantID
	req.Status = "pending"
	req.CreatedAt = time.Now()
	return nil
}

func (r *mysqlPaymentRequestRepository) GetByID(ctx context.Context, tenantID, id uint64) (*PaymentRequest, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+paymentRequestColumns+` FROM prospect_payment_requests r WHERE r.id = ? AND r.tenant_id = ?`, id, tenantID)
	p, err := scanPaymentRequest(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

func (r *mysqlPaymentRequestRepository) ListByProspect(ctx context.Context, tenantID, prospectID uint64) ([]PaymentRequest, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+paymentRequestColumns+` FROM prospect_payment_requests r
		WHERE r.tenant_id = ? AND r.prospect_id = ? ORDER BY r.id DESC`, tenantID, prospectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PaymentRequest{}
	for rows.Next() {
		p, err := scanPaymentRequest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *mysqlPaymentRequestRepository) ListPending(ctx context.Context, tenantID uint64) ([]PaymentRequest, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+paymentRequestColumns+`, p.name, a.name
		FROM prospect_payment_requests r
		JOIN prospects p ON p.id = r.prospect_id AND p.tenant_id = r.tenant_id
		JOIN agents a ON a.id = r.agent_id AND a.tenant_id = r.tenant_id
		WHERE r.tenant_id = ? AND r.status = 'pending'
		ORDER BY r.created_at ASC, r.id ASC`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PaymentRequest{}
	for rows.Next() {
		var prospectName, agentName string
		p, err := scanPaymentRequest(rows, &prospectName, &agentName)
		if err != nil {
			return nil, err
		}
		p.ProspectName, p.AgentName = prospectName, agentName
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *mysqlPaymentRequestRepository) CountPending(ctx context.Context, tenantID uint64) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM prospect_payment_requests WHERE tenant_id = ? AND status = 'pending'`, tenantID).Scan(&n)
	return n, err
}

func (r *mysqlPaymentRequestRepository) FindPending(ctx context.Context, tenantID, prospectID uint64, kind string) (*PaymentRequest, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+paymentRequestColumns+` FROM prospect_payment_requests r
		WHERE r.tenant_id = ? AND r.prospect_id = ? AND r.kind = ? AND r.status = 'pending'
		ORDER BY r.id DESC LIMIT 1`, tenantID, prospectID, kind)
	p, err := scanPaymentRequest(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

func (r *mysqlPaymentRequestRepository) Decide(ctx context.Context, tenantID, id uint64, status string, reason *string, reviewedBy uint64) error {
	var reviewer any
	if reviewedBy > 0 {
		reviewer = reviewedBy
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE prospect_payment_requests
		SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
		WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
		status, reason, reviewer, id, tenantID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := r.GetByID(ctx, tenantID, id); err != nil {
			return err
		}
		return ErrPaymentRequestNotPending
	}
	return nil
}

func (r *mysqlPaymentRequestRepository) ResolvePending(ctx context.Context, tenantID, prospectID uint64, kind, status string, reviewedBy uint64) error {
	var reviewer any
	if reviewedBy > 0 {
		reviewer = reviewedBy
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE prospect_payment_requests
		SET status = ?, reviewed_by = ?, reviewed_at = NOW()
		WHERE tenant_id = ? AND prospect_id = ? AND kind = ? AND status = 'pending'`,
		status, reviewer, tenantID, prospectID, kind)
	return err
}
