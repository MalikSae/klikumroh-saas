package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// Domain represents the data model for the domains table.
type Domain struct {
	ID                        uint64     `json:"id"`
	TenantID                  uint64     `json:"tenant_id"`
	Hostname                  string     `json:"hostname"`
	Type                      string     `json:"type"`
	Status                    string     `json:"status"`
	VerificationFailureReason *string    `json:"verification_failure_reason,omitempty"`
	DNSVerifiedAt             *time.Time `json:"dns_verified_at,omitempty"`
	LastVerificationAttemptAt *time.Time `json:"last_verification_attempt_at,omitempty"`
	VerifiedAt                *time.Time `json:"verified_at,omitempty"`   // legacy alias
	LastCheckAt               *time.Time `json:"last_check_at,omitempty"` // legacy alias
	CreatedAt                 time.Time  `json:"created_at"`
	UpdatedAt                 time.Time  `json:"updated_at"`
}

// DomainRepository defines access methods for domain records.
// All tenant-scoped methods enforce tenant_id isolation.
type DomainRepository interface {
	Create(ctx context.Context, tenantID uint64, domain *Domain) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Domain, error)
	ListByTenant(ctx context.Context, tenantID uint64) ([]Domain, error)
	Update(ctx context.Context, tenantID uint64, domain *Domain) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error

	// GetActiveCustomDomain finds an active custom domain for the given tenant if one exists.
	GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*Domain, error)

	// FindByHostname searches across all tenants without a tenant_id filter.
	// SPECIAL EXCEPTION: This function is strictly used by the Caddy reverse-proxy
	// ask-endpoint (see Arsitektur-Teknis-KlikUmroh.md Section 5.2) to validate whether
	// incoming TLS certificate issuance requests for an unknown hostname belong to any
	// valid tenant in the system.
	FindByHostname(ctx context.Context, hostname string) (*Domain, error)
}

type mysqlDomainRepository struct {
	db *sql.DB
}

// NewDomainRepository creates a new DomainRepository instance.
func NewDomainRepository(db *sql.DB) DomainRepository {
	return &mysqlDomainRepository{db: db}
}

func (r *mysqlDomainRepository) Create(ctx context.Context, tenantID uint64, domain *Domain) error {
	query := `
		INSERT INTO domains (
			tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	domain.TenantID = tenantID
	if domain.Status == "" {
		domain.Status = "pending"
	}
	if domain.VerifiedAt == nil && domain.DNSVerifiedAt != nil {
		domain.VerifiedAt = domain.DNSVerifiedAt
	}
	if domain.LastCheckAt == nil && domain.LastVerificationAttemptAt != nil {
		domain.LastCheckAt = domain.LastVerificationAttemptAt
	}

	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		domain.Hostname,
		domain.Type,
		domain.Status,
		domain.VerificationFailureReason,
		domain.VerifiedAt,
		domain.LastCheckAt,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	domain.ID = uint64(id)
	return nil
}

func (r *mysqlDomainRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Domain, error) {
	query := `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, created_at, updated_at
		FROM domains
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanDomain(row)
}

func (r *mysqlDomainRepository) ListByTenant(ctx context.Context, tenantID uint64) ([]Domain, error) {
	query := `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, created_at, updated_at
		FROM domains
		WHERE tenant_id = ?
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var domains []Domain
	for rows.Next() {
		var d Domain
		var failureReason sql.NullString
		var verifiedAt, lastCheckAt sql.NullTime
		if err := rows.Scan(
			&d.ID,
			&d.TenantID,
			&d.Hostname,
			&d.Type,
			&d.Status,
			&failureReason,
			&verifiedAt,
			&lastCheckAt,
			&d.CreatedAt,
			&d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if failureReason.Valid {
			d.VerificationFailureReason = &failureReason.String
		}
		if verifiedAt.Valid {
			d.VerifiedAt = &verifiedAt.Time
			d.DNSVerifiedAt = &verifiedAt.Time
		}
		if lastCheckAt.Valid {
			d.LastCheckAt = &lastCheckAt.Time
			d.LastVerificationAttemptAt = &lastCheckAt.Time
		}
		domains = append(domains, d)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return domains, nil
}

func (r *mysqlDomainRepository) Update(ctx context.Context, tenantID uint64, domain *Domain) error {
	query := `
		UPDATE domains
		SET hostname = ?, type = ?, status = ?, verification_failure_reason = ?, verified_at = ?, last_check_at = ?
		WHERE id = ? AND tenant_id = ?
	`
	if domain.VerifiedAt == nil && domain.DNSVerifiedAt != nil {
		domain.VerifiedAt = domain.DNSVerifiedAt
	}
	if domain.LastCheckAt == nil && domain.LastVerificationAttemptAt != nil {
		domain.LastCheckAt = domain.LastVerificationAttemptAt
	}

	res, err := r.db.ExecContext(ctx, query,
		domain.Hostname,
		domain.Type,
		domain.Status,
		domain.VerificationFailureReason,
		domain.VerifiedAt,
		domain.LastCheckAt,
		domain.ID,
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

func (r *mysqlDomainRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM domains WHERE id = ? AND tenant_id = ?`
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

func (r *mysqlDomainRepository) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*Domain, error) {
	query := `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, created_at, updated_at
		FROM domains
		WHERE tenant_id = ? AND type = 'custom' AND status = 'active'
		LIMIT 1
	`
	row := r.db.QueryRowContext(ctx, query, tenantID)
	return r.scanDomain(row)
}

func (r *mysqlDomainRepository) FindByHostname(ctx context.Context, hostname string) (*Domain, error) {
	// SPECIAL EXCEPTION for Caddy ask-endpoint lookup across all tenants
	query := `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, created_at, updated_at
		FROM domains
		WHERE hostname = ?
	`
	row := r.db.QueryRowContext(ctx, query, hostname)
	d, err := r.scanDomain(row)
	if err == nil {
		return d, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	// Dev / Local environment fallback:
	// Support *.localhost or *.klikumroh.local resolving automatically to the corresponding *.klikumroh.id
	var fallbackHostname string
	if strings.HasSuffix(hostname, ".localhost") {
		slug := strings.TrimSuffix(hostname, ".localhost")
		if slug != "" {
			fallbackHostname = slug + ".klikumroh.id"
		}
	} else if strings.HasSuffix(hostname, ".klikumroh.local") {
		slug := strings.TrimSuffix(hostname, ".klikumroh.local")
		if slug != "" {
			fallbackHostname = slug + ".klikumroh.id"
		}
	}

	if fallbackHostname != "" {
		rowFallback := r.db.QueryRowContext(ctx, query, fallbackHostname)
		return r.scanDomain(rowFallback)
	}

	return nil, ErrNotFound
}

func (r *mysqlDomainRepository) scanDomain(row *sql.Row) (*Domain, error) {
	var d Domain
	var failureReason sql.NullString
	var verifiedAt, lastCheckAt sql.NullTime

	err := row.Scan(
		&d.ID,
		&d.TenantID,
		&d.Hostname,
		&d.Type,
		&d.Status,
		&failureReason,
		&verifiedAt,
		&lastCheckAt,
		&d.CreatedAt,
		&d.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if failureReason.Valid {
		d.VerificationFailureReason = &failureReason.String
	}
	if verifiedAt.Valid {
		d.VerifiedAt = &verifiedAt.Time
		d.DNSVerifiedAt = &verifiedAt.Time
	}
	if lastCheckAt.Valid {
		d.LastCheckAt = &lastCheckAt.Time
		d.LastVerificationAttemptAt = &lastCheckAt.Time
	}

	return &d, nil
}
