package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// PaymentVerification represents a subscription renewal/purchase verification request.
type PaymentVerification struct {
	ID               uint64     `json:"id"`
	TenantID         uint64     `json:"tenant_id"`
	TenantName       string     `json:"tenant_name,omitempty"`
	TenantSlug       string     `json:"tenant_slug,omitempty"`
	TenantWhatsApp   *string    `json:"tenant_whatsapp,omitempty"`
	PlanID           uint64     `json:"plan_id"`
	PlanName         string     `json:"plan_name,omitempty"`
	PlanPeriodMonths int        `json:"plan_period_months,omitempty"`
	CouponCode       *string    `json:"coupon_code"`
	Amount           float64    `json:"amount"`
	FinalAmount      float64    `json:"final_amount"`
	UniqueCode       int        `json:"unique_code"`
	ProofURL         *string    `json:"proof_url"`
	Status           string     `json:"status"` // 'pending' | 'approved' | 'rejected'
	RejectionReason  *string    `json:"rejection_reason"`
	ReviewedBy       *uint64    `json:"reviewed_by"`
	ReviewedByName   *string    `json:"reviewed_by_name,omitempty"`
	ReviewedAt       *time.Time `json:"reviewed_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// PaymentVerificationRepository handles database operations for payment verifications.
type PaymentVerificationRepository interface {
	ListByTenant(ctx context.Context, tenantID uint64) ([]PaymentVerification, error)
	ListAll(ctx context.Context, statusFilter string) ([]PaymentVerification, error)
	GetByID(ctx context.Context, id uint64) (*PaymentVerification, error)
	Create(ctx context.Context, pv *PaymentVerification) error
	UpdateStatus(ctx context.Context, id uint64, status string, rejectionReason *string, reviewedBy *uint64, reviewedAt *time.Time) error
	UpdateProofURL(ctx context.Context, id uint64, proofURL string) error
	ResetToPendingWithProof(ctx context.Context, id uint64, proofURL string) error
	UpdateDetails(ctx context.Context, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error
}

type mysqlPaymentVerificationRepository struct {
	db *sql.DB
}

// NewPaymentVerificationRepository creates a new instance of PaymentVerificationRepository.
func NewPaymentVerificationRepository(db *sql.DB) PaymentVerificationRepository {
	return &mysqlPaymentVerificationRepository{db: db}
}

func (r *mysqlPaymentVerificationRepository) ListByTenant(ctx context.Context, tenantID uint64) ([]PaymentVerification, error) {
	query := `
		SELECT 
			pv.id, pv.tenant_id, t.name, t.slug, t.whatsapp_number, pv.plan_id, p.name, p.period_months,
			pv.coupon_code, pv.amount, pv.final_amount, pv.unique_code, pv.proof_url, pv.status,
			pv.rejection_reason, pv.reviewed_by, su.name, pv.reviewed_at, pv.created_at, pv.updated_at
		FROM payment_verifications pv
		JOIN tenants t ON pv.tenant_id = t.id
		JOIN pricing_plans p ON pv.plan_id = p.id
		LEFT JOIN staff_users su ON pv.reviewed_by = su.id
		WHERE pv.tenant_id = ?
		ORDER BY pv.id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return r.scanList(rows)
}

func (r *mysqlPaymentVerificationRepository) ListAll(ctx context.Context, statusFilter string) ([]PaymentVerification, error) {
	query := `
		SELECT 
			pv.id, pv.tenant_id, t.name, t.slug, t.whatsapp_number, pv.plan_id, p.name, p.period_months,
			pv.coupon_code, pv.amount, pv.final_amount, pv.unique_code, pv.proof_url, pv.status,
			pv.rejection_reason, pv.reviewed_by, su.name, pv.reviewed_at, pv.created_at, pv.updated_at
		FROM payment_verifications pv
		JOIN tenants t ON pv.tenant_id = t.id
		JOIN pricing_plans p ON pv.plan_id = p.id
		LEFT JOIN staff_users su ON pv.reviewed_by = su.id
	`
	var args []interface{}
	if statusFilter != "" && statusFilter != "all" {
		query += " WHERE pv.status = ? "
		args = append(args, statusFilter)
	}
	query += " ORDER BY pv.id DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return r.scanList(rows)
}

func (r *mysqlPaymentVerificationRepository) GetByID(ctx context.Context, id uint64) (*PaymentVerification, error) {
	query := `
		SELECT 
			pv.id, pv.tenant_id, t.name, t.slug, t.whatsapp_number, pv.plan_id, p.name, p.period_months,
			pv.coupon_code, pv.amount, pv.final_amount, pv.unique_code, pv.proof_url, pv.status,
			pv.rejection_reason, pv.reviewed_by, su.name, pv.reviewed_at, pv.created_at, pv.updated_at
		FROM payment_verifications pv
		JOIN tenants t ON pv.tenant_id = t.id
		JOIN pricing_plans p ON pv.plan_id = p.id
		LEFT JOIN staff_users su ON pv.reviewed_by = su.id
		WHERE pv.id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id)

	var pv PaymentVerification
	var couponCode, proofURL, rejectionReason, reviewedByName, tenantWhatsApp sql.NullString
	var reviewedBy sql.NullInt64
	var reviewedAt sql.NullTime

	err := row.Scan(
		&pv.ID, &pv.TenantID, &pv.TenantName, &pv.TenantSlug, &tenantWhatsApp, &pv.PlanID, &pv.PlanName, &pv.PlanPeriodMonths,
		&couponCode, &pv.Amount, &pv.FinalAmount, &pv.UniqueCode, &proofURL, &pv.Status,
		&rejectionReason, &reviewedBy, &reviewedByName, &reviewedAt, &pv.CreatedAt, &pv.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if tenantWhatsApp.Valid && tenantWhatsApp.String != "" {
		pv.TenantWhatsApp = &tenantWhatsApp.String
	}
	if couponCode.Valid {
		pv.CouponCode = &couponCode.String
	}
	if proofURL.Valid {
		pv.ProofURL = &proofURL.String
	}
	if rejectionReason.Valid {
		pv.RejectionReason = &rejectionReason.String
	}
	if reviewedBy.Valid {
		val := uint64(reviewedBy.Int64)
		pv.ReviewedBy = &val
	}
	if reviewedByName.Valid {
		pv.ReviewedByName = &reviewedByName.String
	}
	if reviewedAt.Valid {
		pv.ReviewedAt = &reviewedAt.Time
	}

	return &pv, nil
}

func (r *mysqlPaymentVerificationRepository) Create(ctx context.Context, pv *PaymentVerification) error {
	query := `
		INSERT INTO payment_verifications (
			tenant_id, plan_id, coupon_code, amount, final_amount, unique_code, proof_url, status, rejection_reason, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
	`
	status := pv.Status
	if status == "" {
		status = "pending"
	}

	res, err := r.db.ExecContext(ctx, query,
		pv.TenantID,
		pv.PlanID,
		pv.CouponCode,
		pv.Amount,
		pv.FinalAmount,
		pv.UniqueCode,
		pv.ProofURL,
		status,
		pv.RejectionReason,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}

	pv.ID = uint64(id)
	pv.Status = status
	return nil
}

func (r *mysqlPaymentVerificationRepository) UpdateStatus(
	ctx context.Context,
	id uint64,
	status string,
	rejectionReason *string,
	reviewedBy *uint64,
	reviewedAt *time.Time,
) error {
	query := `
		UPDATE payment_verifications
		SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = NOW()
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		status,
		rejectionReason,
		reviewedBy,
		reviewedAt,
		id,
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

func (r *mysqlPaymentVerificationRepository) UpdateProofURL(ctx context.Context, id uint64, proofURL string) error {
	query := `
		UPDATE payment_verifications
		SET proof_url = ?, updated_at = NOW()
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, proofURL, id)
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

func (r *mysqlPaymentVerificationRepository) ResetToPendingWithProof(ctx context.Context, id uint64, proofURL string) error {
	query := `
		UPDATE payment_verifications
		SET proof_url = ?, status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, proofURL, id)
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

func (r *mysqlPaymentVerificationRepository) UpdateDetails(ctx context.Context, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error {
	query := `
		UPDATE payment_verifications
		SET plan_id = ?, coupon_code = ?, amount = ?, final_amount = ?, unique_code = ?, proof_url = COALESCE(?, proof_url), status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query, planID, couponCode, amount, finalAmount, uniqueCode, proofURL, id)
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

func (r *mysqlPaymentVerificationRepository) scanList(rows *sql.Rows) ([]PaymentVerification, error) {
	var list []PaymentVerification
	for rows.Next() {
		var pv PaymentVerification
		var couponCode, proofURL, rejectionReason, reviewedByName, tenantWhatsApp sql.NullString
		var reviewedBy sql.NullInt64
		var reviewedAt sql.NullTime

		if err := rows.Scan(
			&pv.ID, &pv.TenantID, &pv.TenantName, &pv.TenantSlug, &tenantWhatsApp, &pv.PlanID, &pv.PlanName, &pv.PlanPeriodMonths,
			&couponCode, &pv.Amount, &pv.FinalAmount, &pv.UniqueCode, &proofURL, &pv.Status,
			&rejectionReason, &reviewedBy, &reviewedByName, &reviewedAt, &pv.CreatedAt, &pv.UpdatedAt,
		); err != nil {
			return nil, err
		}

		if tenantWhatsApp.Valid && tenantWhatsApp.String != "" {
			pv.TenantWhatsApp = &tenantWhatsApp.String
		}

		if couponCode.Valid {
			pv.CouponCode = &couponCode.String
		}
		if proofURL.Valid {
			pv.ProofURL = &proofURL.String
		}
		if rejectionReason.Valid {
			pv.RejectionReason = &rejectionReason.String
		}
		if reviewedBy.Valid {
			val := uint64(reviewedBy.Int64)
			pv.ReviewedBy = &val
		}
		if reviewedByName.Valid {
			pv.ReviewedByName = &reviewedByName.String
		}
		if reviewedAt.Valid {
			pv.ReviewedAt = &reviewedAt.Time
		}

		list = append(list, pv)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return list, nil
}
