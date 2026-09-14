package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"klikumroh/internal/util"
)

var (
	ErrCrossTenantParentAgent     = errors.New("parent agent must belong to the same tenant")
	ErrParentAgentNotFound        = errors.New("parent agent not found")
	ErrSelfReferencingParentAgent = errors.New("parent agent cannot be the agent itself")
	ErrDuplicateAgentEmail        = errors.New("email sudah terdaftar sebagai agen")
	ErrDuplicateAgentPhone        = errors.New("nomor whatsapp sudah terdaftar sebagai agen")
)

// Agent represents the data model for the agents table.
type Agent struct {
	ID                uint64     `json:"id"`
	TenantID          uint64     `json:"tenant_id"`
	Name              string     `json:"name"`
	Phone             *string    `json:"phone"`
	Email             *string    `json:"email"`
	PasswordHash      *string    `json:"-"`
	Domisili          *string    `json:"domisili"`
	PhotoURL          *string    `json:"photo_url"`
	PaymentProofURL   *string    `json:"payment_proof_url"`
	PaymentStatus     string     `json:"payment_status"`
	RejectionReason   *string    `json:"rejection_reason,omitempty"`
	TermsAcceptedAt   *time.Time `json:"terms_accepted_at"`
	BankName          *string    `json:"bank_name"`
	BankAccountNumber *string    `json:"bank_account_number"`
	BankAccountHolder *string    `json:"bank_account_holder"`
	ReferralCode      string     `json:"referral_code"`
	Status            string     `json:"status"`
	ParentAgentID     *uint64    `json:"parent_agent_id"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// UpdateAgentProfileParams defines input fields for updating agent profile.
type UpdateAgentProfileParams struct {
	Name              *string `json:"name"`
	Phone             *string `json:"phone"`
	Email             *string `json:"email"`
	Domisili          *string `json:"domisili"`
	BankName          *string `json:"bank_name"`
	BankAccountNumber *string `json:"bank_account_number"`
	BankAccountHolder *string `json:"bank_account_holder"`
}

// AgentRepository defines access methods for agent records.
// All tenant-scoped methods enforce tenant_id isolation.
type AgentRepository interface {
	Create(ctx context.Context, tenantID uint64, agent *Agent) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Agent, error)
	GetByEmail(ctx context.Context, tenantID uint64, email string) (*Agent, error)
	GetByReferralCode(ctx context.Context, referralCode string) (*Agent, error)
	List(ctx context.Context, tenantID uint64, statusFilter ...string) ([]Agent, error)
	Update(ctx context.Context, tenantID uint64, agent *Agent) error
	UpdateProfile(ctx context.Context, tenantID uint64, id uint64, params UpdateAgentProfileParams) (*Agent, error)
	UpdatePhotoURL(ctx context.Context, tenantID uint64, id uint64, photoURL string) error
	UpdatePassword(ctx context.Context, tenantID uint64, id uint64, newPasswordHash string) error
	UpdateBankInfo(ctx context.Context, tenantID uint64, id uint64, bankName, accountNumber, accountHolder string) error
	Approve(ctx context.Context, tenantID uint64, id uint64) error
	Reject(ctx context.Context, tenantID uint64, id uint64, reason string) error
	ResetToPendingWithProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error
	UpdateStatus(ctx context.Context, tenantID uint64, id uint64, status string) error
	UpdatePaymentProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error)
}

type mysqlAgentRepository struct {
	db *sql.DB
}

// NewAgentRepository creates a new AgentRepository instance.
func NewAgentRepository(db *sql.DB) AgentRepository {
	return &mysqlAgentRepository{db: db}
}

func (r *mysqlAgentRepository) Create(ctx context.Context, tenantID uint64, agent *Agent) error {
	// 1. Explicit duplicate checks per tenant
	if agent.Email != nil && *agent.Email != "" {
		var count int
		err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents WHERE tenant_id = ? AND email = ?", tenantID, *agent.Email).Scan(&count)
		if err != nil {
			return err
		}
		if count > 0 {
			return ErrDuplicateAgentEmail
		}
	}

	if agent.Phone != nil && *agent.Phone != "" {
		normalized := util.NormalizePhoneToWhatsApp(*agent.Phone)
		agent.Phone = &normalized
		var count int
		err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents WHERE tenant_id = ? AND phone = ?", tenantID, normalized).Scan(&count)
		if err != nil {
			return err
		}
		if count > 0 {
			return ErrDuplicateAgentPhone
		}
	}

	// 2. Parent agent validation (cross-tenant + self-referencing check)
	if agent.ParentAgentID != nil {
		if agent.ID != 0 && *agent.ParentAgentID == agent.ID {
			return ErrSelfReferencingParentAgent
		}
		var parentTenantID uint64
		err := r.db.QueryRowContext(ctx, "SELECT tenant_id FROM agents WHERE id = ?", *agent.ParentAgentID).Scan(&parentTenantID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrParentAgentNotFound
			}
			return err
		}
		if parentTenantID != tenantID {
			return ErrCrossTenantParentAgent
		}
	}

	query := `
		INSERT INTO agents (
			tenant_id, name, phone, email, password_hash, domisili, photo_url,
			payment_proof_url, payment_status, terms_accepted_at,
			bank_name, bank_account_number, bank_account_holder,
			referral_code, status, parent_agent_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	agent.TenantID = tenantID
	if agent.Status == "" {
		agent.Status = "pending"
	}
	if agent.PaymentStatus == "" {
		agent.PaymentStatus = "not_applicable"
	}

	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		agent.Name,
		agent.Phone,
		agent.Email,
		agent.PasswordHash,
		agent.Domisili,
		agent.PhotoURL,
		agent.PaymentProofURL,
		agent.PaymentStatus,
		agent.TermsAcceptedAt,
		agent.BankName,
		agent.BankAccountNumber,
		agent.BankAccountHolder,
		agent.ReferralCode,
		agent.Status,
		agent.ParentAgentID,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	agent.ID = uint64(id)

	now := time.Now().UTC()
	var createdAt, updatedAt time.Time
	if err := r.db.QueryRowContext(ctx, "SELECT created_at, updated_at FROM agents WHERE id = ? AND tenant_id = ?", agent.ID, tenantID).Scan(&createdAt, &updatedAt); err == nil {
		agent.CreatedAt = createdAt
		agent.UpdatedAt = updatedAt
	} else {
		agent.CreatedAt = now
		agent.UpdatedAt = now
	}
	return nil
}

func (r *mysqlAgentRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Agent, error) {
	query := `
		SELECT id, tenant_id, name, phone, email, password_hash, domisili, photo_url,
		       payment_proof_url, payment_status, rejection_reason, terms_accepted_at,
		       bank_name, bank_account_number, bank_account_holder,
		       referral_code, status, parent_agent_id, created_at, updated_at
		FROM agents
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanAgent(row)
}

func (r *mysqlAgentRepository) GetByEmail(ctx context.Context, tenantID uint64, email string) (*Agent, error) {
	query := `
		SELECT id, tenant_id, name, phone, email, password_hash, domisili, photo_url,
		       payment_proof_url, payment_status, rejection_reason, terms_accepted_at,
		       bank_name, bank_account_number, bank_account_holder,
		       referral_code, status, parent_agent_id, created_at, updated_at
		FROM agents
		WHERE tenant_id = ? AND email = ?
	`
	row := r.db.QueryRowContext(ctx, query, tenantID, email)
	return r.scanAgent(row)
}

func (r *mysqlAgentRepository) GetByReferralCode(ctx context.Context, referralCode string) (*Agent, error) {
	query := `
		SELECT id, tenant_id, name, phone, email, password_hash, domisili, photo_url,
		       payment_proof_url, payment_status, rejection_reason, terms_accepted_at,
		       bank_name, bank_account_number, bank_account_holder,
		       referral_code, status, parent_agent_id, created_at, updated_at
		FROM agents
		WHERE referral_code = ?
	`
	row := r.db.QueryRowContext(ctx, query, referralCode)
	return r.scanAgent(row)
}

func (r *mysqlAgentRepository) List(ctx context.Context, tenantID uint64, statusFilter ...string) ([]Agent, error) {
	var query string
	var args []interface{}

	if len(statusFilter) > 0 && statusFilter[0] != "" {
		query = `
			SELECT id, tenant_id, name, phone, email, password_hash, domisili, photo_url,
			       payment_proof_url, payment_status, rejection_reason, terms_accepted_at,
			       bank_name, bank_account_number, bank_account_holder,
			       referral_code, status, parent_agent_id, created_at, updated_at
			FROM agents
			WHERE tenant_id = ? AND status = ?
			ORDER BY created_at DESC
		`
		args = append(args, tenantID, statusFilter[0])
	} else {
		query = `
			SELECT id, tenant_id, name, phone, email, password_hash, domisili, photo_url,
			       payment_proof_url, payment_status, rejection_reason, terms_accepted_at,
			       bank_name, bank_account_number, bank_account_holder,
			       referral_code, status, parent_agent_id, created_at, updated_at
			FROM agents
			WHERE tenant_id = ?
			ORDER BY created_at DESC
		`
		args = append(args, tenantID)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		var phone, email, passwordHash, domisili, photoURL, paymentProofURL, rejectionReason sql.NullString
		var termsAcceptedAt sql.NullTime
		var bankName, bankAccountNumber, bankAccountHolder sql.NullString
		var parentAgentID sql.NullInt64

		if err := rows.Scan(
			&a.ID,
			&a.TenantID,
			&a.Name,
			&phone,
			&email,
			&passwordHash,
			&domisili,
			&photoURL,
			&paymentProofURL,
			&a.PaymentStatus,
			&rejectionReason,
			&termsAcceptedAt,
			&bankName,
			&bankAccountNumber,
			&bankAccountHolder,
			&a.ReferralCode,
			&a.Status,
			&parentAgentID,
			&a.CreatedAt,
			&a.UpdatedAt,
		); err != nil {
			return nil, err
		}

		if phone.Valid {
			a.Phone = &phone.String
		}
		if email.Valid {
			a.Email = &email.String
		}
		if passwordHash.Valid {
			a.PasswordHash = &passwordHash.String
		}
		if domisili.Valid {
			a.Domisili = &domisili.String
		}
		if photoURL.Valid {
			a.PhotoURL = &photoURL.String
		}
		if paymentProofURL.Valid {
			a.PaymentProofURL = &paymentProofURL.String
		}
		if rejectionReason.Valid {
			a.RejectionReason = &rejectionReason.String
		}
		if termsAcceptedAt.Valid {
			a.TermsAcceptedAt = &termsAcceptedAt.Time
		}
		if bankName.Valid {
			a.BankName = &bankName.String
		}
		if bankAccountNumber.Valid {
			a.BankAccountNumber = &bankAccountNumber.String
		}
		if bankAccountHolder.Valid {
			a.BankAccountHolder = &bankAccountHolder.String
		}
		if parentAgentID.Valid {
			pID := uint64(parentAgentID.Int64)
			a.ParentAgentID = &pID
		}
		agents = append(agents, a)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return agents, nil
}

func (r *mysqlAgentRepository) Update(ctx context.Context, tenantID uint64, agent *Agent) error {
	if agent.ParentAgentID != nil {
		if *agent.ParentAgentID == agent.ID {
			return ErrSelfReferencingParentAgent
		}
		var parentTenantID uint64
		err := r.db.QueryRowContext(ctx, "SELECT tenant_id FROM agents WHERE id = ?", *agent.ParentAgentID).Scan(&parentTenantID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrParentAgentNotFound
			}
			return err
		}
		if parentTenantID != tenantID {
			return ErrCrossTenantParentAgent
		}
	}

	if agent.Phone != nil {
		normalized := util.NormalizePhoneToWhatsApp(*agent.Phone)
		agent.Phone = &normalized
	}
	query := `
		UPDATE agents
		SET name = ?, phone = ?, email = ?, password_hash = ?, domisili = ?, photo_url = ?,
		    payment_proof_url = ?, payment_status = ?, terms_accepted_at = ?,
		    bank_name = ?, bank_account_number = ?, bank_account_holder = ?,
		    referral_code = ?, status = ?, parent_agent_id = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		agent.Name,
		agent.Phone,
		agent.Email,
		agent.PasswordHash,
		agent.Domisili,
		agent.PhotoURL,
		agent.PaymentProofURL,
		agent.PaymentStatus,
		agent.TermsAcceptedAt,
		agent.BankName,
		agent.BankAccountNumber,
		agent.BankAccountHolder,
		agent.ReferralCode,
		agent.Status,
		agent.ParentAgentID,
		agent.ID,
		tenantID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) UpdateProfile(ctx context.Context, tenantID uint64, id uint64, params UpdateAgentProfileParams) (*Agent, error) {
	agent, err := r.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	if params.Email != nil && strings.TrimSpace(*params.Email) != "" {
		email := strings.TrimSpace(*params.Email)
		var count int
		err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents WHERE tenant_id = ? AND email = ? AND id != ?", tenantID, email, id).Scan(&count)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, ErrDuplicateAgentEmail
		}
		agent.Email = &email
	}

	if params.Phone != nil && strings.TrimSpace(*params.Phone) != "" {
		normalized := util.NormalizePhoneToWhatsApp(*params.Phone)
		var count int
		err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents WHERE tenant_id = ? AND phone = ? AND id != ?", tenantID, normalized, id).Scan(&count)
		if err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, ErrDuplicateAgentPhone
		}
		agent.Phone = &normalized
	}

	if params.Name != nil && strings.TrimSpace(*params.Name) != "" {
		name := strings.TrimSpace(*params.Name)
		agent.Name = name
	}

	if params.Domisili != nil {
		dom := strings.TrimSpace(*params.Domisili)
		agent.Domisili = &dom
	}

	if params.BankName != nil {
		bn := strings.TrimSpace(*params.BankName)
		agent.BankName = &bn
	}

	if params.BankAccountNumber != nil {
		ban := strings.TrimSpace(*params.BankAccountNumber)
		agent.BankAccountNumber = &ban
	}

	if params.BankAccountHolder != nil {
		bah := strings.TrimSpace(*params.BankAccountHolder)
		agent.BankAccountHolder = &bah
	}

	query := `
		UPDATE agents
		SET name = ?, phone = ?, email = ?, domisili = ?,
		    bank_name = ?, bank_account_number = ?, bank_account_holder = ?,
		    updated_at = NOW()
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		agent.Name,
		agent.Phone,
		agent.Email,
		agent.Domisili,
		agent.BankName,
		agent.BankAccountNumber,
		agent.BankAccountHolder,
		id,
		tenantID,
	)
	if err != nil {
		return nil, err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if rowsAffected == 0 {
		return nil, ErrNotFound
	}

	return agent, nil
}

func (r *mysqlAgentRepository) UpdatePhotoURL(ctx context.Context, tenantID uint64, id uint64, photoURL string) error {
	query := `UPDATE agents SET photo_url = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, photoURL, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) UpdatePassword(ctx context.Context, tenantID uint64, id uint64, newPasswordHash string) error {
	query := `UPDATE agents SET password_hash = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, newPasswordHash, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) UpdateBankInfo(ctx context.Context, tenantID uint64, id uint64, bankName, accountNumber, accountHolder string) error {
	query := `
		UPDATE agents
		SET bank_name = ?, bank_account_number = ?, bank_account_holder = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query, bankName, accountNumber, accountHolder, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) Approve(ctx context.Context, tenantID uint64, id uint64) error {
	agent, err := r.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}

	var query string
	if agent.PaymentStatus == "pending_verification" {
		query = `UPDATE agents SET status = 'active', payment_status = 'verified', rejection_reason = NULL WHERE id = ? AND tenant_id = ?`
	} else {
		query = `UPDATE agents SET status = 'active', rejection_reason = NULL WHERE id = ? AND tenant_id = ?`
	}

	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) Reject(ctx context.Context, tenantID uint64, id uint64, reason string) error {
	trimmed := strings.TrimSpace(reason)
	query := `UPDATE agents SET status = 'rejected', rejection_reason = ? WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, trimmed, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) ResetToPendingWithProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	query := `
		UPDATE agents
		SET status = 'pending', payment_status = 'pending_verification', payment_proof_url = ?, rejection_reason = NULL, updated_at = NOW()
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query, proofURL, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, status string) error {
	query := `UPDATE agents SET status = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, status, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) UpdatePaymentProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	query := `UPDATE agents SET payment_proof_url = ?, payment_status = 'pending_verification' WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, proofURL, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM agents WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAgentRepository) scanAgent(row *sql.Row) (*Agent, error) {
	var a Agent
	var phone, email, passwordHash, domisili, photoURL, paymentProofURL, rejectionReason sql.NullString
	var termsAcceptedAt sql.NullTime
	var bankName, bankAccountNumber, bankAccountHolder sql.NullString
	var parentAgentID sql.NullInt64

	err := row.Scan(
		&a.ID,
		&a.TenantID,
		&a.Name,
		&phone,
		&email,
		&passwordHash,
		&domisili,
		&photoURL,
		&paymentProofURL,
		&a.PaymentStatus,
		&rejectionReason,
		&termsAcceptedAt,
		&bankName,
		&bankAccountNumber,
		&bankAccountHolder,
		&a.ReferralCode,
		&a.Status,
		&parentAgentID,
		&a.CreatedAt,
		&a.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if phone.Valid {
		a.Phone = &phone.String
	}
	if email.Valid {
		a.Email = &email.String
	}
	if passwordHash.Valid {
		a.PasswordHash = &passwordHash.String
	}
	if domisili.Valid {
		a.Domisili = &domisili.String
	}
	if photoURL.Valid {
		a.PhotoURL = &photoURL.String
	}
	if paymentProofURL.Valid {
		a.PaymentProofURL = &paymentProofURL.String
	}
	if rejectionReason.Valid {
		a.RejectionReason = &rejectionReason.String
	}
	if termsAcceptedAt.Valid {
		a.TermsAcceptedAt = &termsAcceptedAt.Time
	}
	if bankName.Valid {
		a.BankName = &bankName.String
	}
	if bankAccountNumber.Valid {
		a.BankAccountNumber = &bankAccountNumber.String
	}
	if bankAccountHolder.Valid {
		a.BankAccountHolder = &bankAccountHolder.String
	}
	if parentAgentID.Valid {
		pID := uint64(parentAgentID.Int64)
		a.ParentAgentID = &pID
	}

	return &a, nil
}

func (r *mysqlAgentRepository) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	query := `SELECT COUNT(*) FROM agents WHERE tenant_id = ? AND status = 'active'`
	var count int
	if err := r.db.QueryRowContext(ctx, query, tenantID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}
