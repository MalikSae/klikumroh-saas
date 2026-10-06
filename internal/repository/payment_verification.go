package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

// PaymentVerification represents a subscription renewal/purchase verification request.
type PaymentVerification struct {
	ID               uint64     `json:"id"`
	TenantID         uint64     `json:"tenant_id"`
	PublicToken      string     `json:"public_token"`
	TenantName       string     `json:"tenant_name,omitempty"`
	TenantSlug       string     `json:"tenant_slug,omitempty"`
	TenantWhatsApp   *string    `json:"tenant_whatsapp,omitempty"`
	TenantEmail      *string    `json:"tenant_email,omitempty"`
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
	GetByPublicToken(ctx context.Context, token string) (*PaymentVerification, error)
	Create(ctx context.Context, pv *PaymentVerification) error
	UpdateStatus(ctx context.Context, id uint64, status string, rejectionReason *string, reviewedBy *uint64, reviewedAt *time.Time) error
	// TransitionStatus atomically moves a verification from fromStatus to toStatus in one conditional UPDATE.
	// Only one concurrent caller can win; the others get ErrStatusConflict (or ErrNotFound if the row is gone).
	TransitionStatus(ctx context.Context, id uint64, fromStatus, toStatus string, rejectionReason *string, reviewedBy *uint64, reviewedAt *time.Time) error
	// Travel-side writes (renewal request / proof upload) are scoped by tenant_id.
	UpdateProofURL(ctx context.Context, tenantID uint64, id uint64, proofURL string) error
	ResetToPendingWithProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error
	UpdateDetails(ctx context.Context, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error
	// ReplaceDetails is like UpdateDetails but writes proof_url exactly as given (nil clears it).
	// Used when the travel changes the billed amount, so an old transfer proof never stays attached
	// to an invoice with a different amount.
	ReplaceDetails(ctx context.Context, tenantID uint64, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error
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
			pv.id, pv.tenant_id, pv.public_token, t.name, t.slug, t.whatsapp_number,
			(SELECT email FROM admin_users au WHERE au.tenant_id = pv.tenant_id ORDER BY au.id ASC LIMIT 1) AS tenant_email,
			pv.plan_id, p.name, p.period_months,
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
			pv.id, pv.tenant_id, pv.public_token, t.name, t.slug, t.whatsapp_number,
			(SELECT email FROM admin_users au WHERE au.tenant_id = pv.tenant_id ORDER BY au.id ASC LIMIT 1) AS tenant_email,
			pv.plan_id, p.name, p.period_months,
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
			pv.id, pv.tenant_id, pv.public_token, t.name, t.slug, t.whatsapp_number,
			(SELECT email FROM admin_users au WHERE au.tenant_id = pv.tenant_id ORDER BY au.id ASC LIMIT 1) AS tenant_email,
			pv.plan_id, p.name, p.period_months,
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
	var couponCode, proofURL, rejectionReason, reviewedByName, tenantWhatsApp, tenantEmail sql.NullString
	var reviewedBy sql.NullInt64
	var reviewedAt sql.NullTime

	err := row.Scan(
		&pv.ID, &pv.TenantID, &pv.PublicToken, &pv.TenantName, &pv.TenantSlug, &tenantWhatsApp, &tenantEmail, &pv.PlanID, &pv.PlanName, &pv.PlanPeriodMonths,
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
	if tenantEmail.Valid && tenantEmail.String != "" {
		pv.TenantEmail = &tenantEmail.String
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

func (r *mysqlPaymentVerificationRepository) GetByPublicToken(ctx context.Context, token string) (*PaymentVerification, error) {
	query := `
		SELECT 
			pv.id, pv.tenant_id, pv.public_token, t.name, t.slug, t.whatsapp_number,
			(SELECT email FROM admin_users au WHERE au.tenant_id = pv.tenant_id ORDER BY au.id ASC LIMIT 1) AS tenant_email,
			pv.plan_id, p.name, p.period_months,
			pv.coupon_code, pv.amount, pv.final_amount, pv.unique_code, pv.proof_url, pv.status,
			pv.rejection_reason, pv.reviewed_by, su.name, pv.reviewed_at, pv.created_at, pv.updated_at
		FROM payment_verifications pv
		JOIN tenants t ON pv.tenant_id = t.id
		JOIN pricing_plans p ON pv.plan_id = p.id
		LEFT JOIN staff_users su ON pv.reviewed_by = su.id
		WHERE pv.public_token = ?
	`
	row := r.db.QueryRowContext(ctx, query, token)

	var pv PaymentVerification
	var couponCode, proofURL, rejectionReason, reviewedByName, tenantWhatsApp, tenantEmail sql.NullString
	var reviewedBy sql.NullInt64
	var reviewedAt sql.NullTime

	err := row.Scan(
		&pv.ID, &pv.TenantID, &pv.PublicToken, &pv.TenantName, &pv.TenantSlug, &tenantWhatsApp, &tenantEmail, &pv.PlanID, &pv.PlanName, &pv.PlanPeriodMonths,
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
	if tenantEmail.Valid && tenantEmail.String != "" {
		pv.TenantEmail = &tenantEmail.String
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
	if pv.PublicToken == "" {
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		pv.PublicToken = hex.EncodeToString(b)
	}

	query := `
		INSERT INTO payment_verifications (
			tenant_id, public_token, plan_id, coupon_code, amount, final_amount, unique_code, proof_url, status, rejection_reason, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
	`
	status := pv.Status
	if status == "" {
		status = "pending"
	}

	res, err := r.db.ExecContext(ctx, query,
		pv.TenantID,
		pv.PublicToken,
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

// CancelOpenForTenant closes every invoice of the tenant still waiting for payment, and every rejected one
// (which a new transfer proof could reopen), as status 'cancelled', e.g. when staff activate the
// subscription manually. Returns how many were cancelled.
func (r *mysqlPaymentVerificationRepository) CancelOpenForTenant(ctx context.Context, tenantID uint64, reason string, staffUserID uint64) (int64, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE payment_verifications
		SET status = 'cancelled', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
		WHERE tenant_id = ? AND status IN ('pending', 'rejected')`, reason, staffUserID, tenantID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *mysqlPaymentVerificationRepository) TransitionStatus(
	ctx context.Context,
	id uint64,
	fromStatus, toStatus string,
	rejectionReason *string,
	reviewedBy *uint64,
	reviewedAt *time.Time,
) error {
	query := `
		UPDATE payment_verifications
		SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = NOW()
		WHERE id = ? AND status = ?
	`
	res, err := r.db.ExecContext(ctx, query, toStatus, rejectionReason, reviewedBy, reviewedAt, id, fromStatus)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}
	return r.missingOrConflict(ctx, id, fromStatus)
}

// missingOrConflict explains why a conditional UPDATE (WHERE ... AND status = expectedStatus) reported
// no affected row: the row is gone, its status changed concurrently, or (without clientFoundRows) the
// UPDATE simply wrote identical values.
func (r *mysqlPaymentVerificationRepository) missingOrConflict(ctx context.Context, id uint64, expectedStatus string) error {
	var status string
	err := r.db.QueryRowContext(ctx, `SELECT status FROM payment_verifications WHERE id = ?`, id).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status == expectedStatus {
		return nil
	}
	return ErrStatusConflict
}

// UpdateProofURL attaches a proof only while the invoice is still pending: the status condition sits in
// the UPDATE itself, so an approval landing between the service's check and this write cannot be
// followed by a different proof on an already-approved invoice (ErrStatusConflict).
func (r *mysqlPaymentVerificationRepository) UpdateProofURL(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	query := `
		UPDATE payment_verifications
		SET proof_url = ?, updated_at = NOW()
		WHERE id = ? AND tenant_id = ? AND status = 'pending'
	`
	res, err := r.db.ExecContext(ctx, query, proofURL, id, tenantID)
	if err != nil {
		return err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}
	// No row changed: not this tenant's invoice, no longer pending, or identical values written.
	var status string
	err = r.db.QueryRowContext(ctx,
		`SELECT status FROM payment_verifications WHERE id = ? AND tenant_id = ?`, id, tenantID).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status == "pending" {
		return nil
	}
	return ErrStatusConflict
}

// ResetToPendingWithProof reopens a rejected invoice with a new proof. Only a rejected one: the status
// condition sits in the UPDATE, so an approved or cancelled invoice can never be flipped back to pending
// (ErrStatusConflict).
func (r *mysqlPaymentVerificationRepository) ResetToPendingWithProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	query := `
		UPDATE payment_verifications
		SET proof_url = ?, status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
		WHERE id = ? AND tenant_id = ? AND status = 'rejected'
	`
	res, err := r.db.ExecContext(ctx, query, proofURL, id, tenantID)
	if err != nil {
		return err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}
	var status string
	err = r.db.QueryRowContext(ctx,
		`SELECT status FROM payment_verifications WHERE id = ? AND tenant_id = ?`, id, tenantID).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	return ErrStatusConflict
}

// UpdateDetails is used by platform staff (plan/coupon correction on any travel's invoice), so it is not
// tenant-scoped; the staff routes are behind StaffAuthMiddleware.
func (r *mysqlPaymentVerificationRepository) UpdateDetails(ctx context.Context, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error {
	return r.updateDetails(ctx, "COALESCE(?, proof_url)", nil, id, planID, couponCode, amount, finalAmount, uniqueCode, proofURL)
}

func (r *mysqlPaymentVerificationRepository) ReplaceDetails(ctx context.Context, tenantID uint64, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error {
	return r.updateDetails(ctx, "?", &tenantID, id, planID, couponCode, amount, finalAmount, uniqueCode, proofURL)
}

// updateDetails shares the UPDATE for UpdateDetails/ReplaceDetails; proofExpr is a fixed SQL fragment
// (never user input) that decides whether an absent proof keeps or clears the stored one.
func (r *mysqlPaymentVerificationRepository) updateDetails(ctx context.Context, proofExpr string, tenantID *uint64, id uint64, planID uint64, couponCode *string, amount float64, finalAmount float64, uniqueCode int, proofURL *string) error {
	args := []interface{}{planID, couponCode, amount, finalAmount, uniqueCode, proofURL, id}
	tenantClause := ""
	if tenantID != nil {
		tenantClause = " AND tenant_id = ?"
		args = append(args, *tenantID)
	}
	query := `
		UPDATE payment_verifications
		SET plan_id = ?, coupon_code = ?, amount = ?, final_amount = ?, unique_code = ?, proof_url = ` + proofExpr + `, status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
		WHERE id = ? AND status = 'pending'` + tenantClause + `
	`
	// The status guard keeps a concurrent approve/reject from being silently reverted to 'pending'.
	res, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}
	// Another tenant's invoice is reported as not found (never as "unchanged").
	if tenantID != nil {
		var owner uint64
		err := r.db.QueryRowContext(ctx, `SELECT tenant_id FROM payment_verifications WHERE id = ?`, id).Scan(&owner)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && owner != *tenantID) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
	}
	return r.missingOrConflict(ctx, id, "pending")
}

func (r *mysqlPaymentVerificationRepository) scanList(rows *sql.Rows) ([]PaymentVerification, error) {
	var list []PaymentVerification
	for rows.Next() {
		var pv PaymentVerification
		var couponCode, proofURL, rejectionReason, reviewedByName, tenantWhatsApp, tenantEmail sql.NullString
		var reviewedBy sql.NullInt64
		var reviewedAt sql.NullTime

		if err := rows.Scan(
			&pv.ID, &pv.TenantID, &pv.PublicToken, &pv.TenantName, &pv.TenantSlug, &tenantWhatsApp, &tenantEmail, &pv.PlanID, &pv.PlanName, &pv.PlanPeriodMonths,
			&couponCode, &pv.Amount, &pv.FinalAmount, &pv.UniqueCode, &proofURL, &pv.Status,
			&rejectionReason, &reviewedBy, &reviewedByName, &reviewedAt, &pv.CreatedAt, &pv.UpdatedAt,
		); err != nil {
			return nil, err
		}

		if tenantWhatsApp.Valid && tenantWhatsApp.String != "" {
			pv.TenantWhatsApp = &tenantWhatsApp.String
		}
		if tenantEmail.Valid && tenantEmail.String != "" {
			pv.TenantEmail = &tenantEmail.String
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

// PendingFinalAmounts lists the totals of every open (pending) invoice between minAmount and maxAmount,
// leaving out excludeID. It is used to pick a unique transfer code: the bank statement is matched to an
// invoice by its total, so two open invoices must never share one. Platform-wide by design (the bank
// account is KlikUmroh's, shared by every travel); only amounts are returned, never tenant data.
func (r *mysqlPaymentVerificationRepository) PendingFinalAmounts(ctx context.Context, minAmount, maxAmount float64, excludeID uint64) ([]float64, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT final_amount FROM payment_verifications
		WHERE status = 'pending' AND final_amount BETWEEN ? AND ? AND id <> ?`, minAmount, maxAmount, excludeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []float64{}
	for rows.Next() {
		var v float64
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
