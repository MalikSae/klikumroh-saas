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
	// CheckFailures counts consecutive failed DNS checks of an active custom domain (reset on success).
	CheckFailures int `json:"check_failures"`
	// RedirectToDomainID is set on an alias (e.g. namatravel.com): its visitors are redirected to this
	// primary custom domain of the same travel (e.g. www.namatravel.com). Nil on a primary domain.
	RedirectToDomainID *uint64 `json:"redirect_to_domain_id,omitempty"`
	// VerificationToken is the TXT value proving DNS control (computed per tenant+hostname, not stored).
	VerificationToken string    `json:"verification_token,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// DomainRepository defines access methods for domain records.
// All tenant-scoped methods enforce tenant_id isolation.
type DomainRepository interface {
	Create(ctx context.Context, tenantID uint64, domain *Domain) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Domain, error)
	ListByTenant(ctx context.Context, tenantID uint64) ([]Domain, error)
	Update(ctx context.Context, tenantID uint64, domain *Domain) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error

	// GetActiveCustomDomain returns the tenant's primary active custom domain (never an alias); with several,
	// the one verified first, so the default subdomain always redirects to the same domain.
	GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*Domain, error)

	// FindByHostname searches across all tenants without a tenant_id filter.
	// SPECIAL EXCEPTION: This function is strictly used by the Caddy reverse-proxy
	// ask-endpoint (see Arsitektur-Teknis-KlikUmroh.md Section 5.2) to validate whether
	// incoming TLS certificate issuance requests for an unknown hostname belong to any
	// valid tenant in the system.
	FindByHostname(ctx context.Context, hostname string) (*Domain, error)

	// ReleaseUnverifiedClaim deletes another tenant's custom-domain row for hostname that was never
	// verified (pending/failed). SPECIAL EXCEPTION (cross-tenant): an unproven claim must not block the
	// travel that really controls the domain's DNS. Active domains are never touched.
	ReleaseUnverifiedClaim(ctx context.Context, hostname string, exceptTenantID uint64) error

	// ListActiveCustom lists active custom domains of all tenants. SPECIAL EXCEPTION (cross-tenant):
	// used only by the background DNS recheck job.
	ListActiveCustom(ctx context.Context) ([]Domain, error)
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
			tenant_id, hostname, type, status, redirect_to_domain_id, verification_failure_reason, verified_at, last_check_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
		domain.RedirectToDomainID,
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
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, check_failures, redirect_to_domain_id, created_at, updated_at
		FROM domains
		WHERE id = ? AND tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanDomain(row)
}

func (r *mysqlDomainRepository) ListByTenant(ctx context.Context, tenantID uint64) ([]Domain, error) {
	query := `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, check_failures, redirect_to_domain_id, created_at, updated_at
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
		var redirectTo sql.NullInt64
		if err := rows.Scan(
			&d.ID,
			&d.TenantID,
			&d.Hostname,
			&d.Type,
			&d.Status,
			&failureReason,
			&verifiedAt,
			&lastCheckAt,
			&d.CheckFailures,
			&redirectTo,
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
		if redirectTo.Valid {
			id := uint64(redirectTo.Int64)
			d.RedirectToDomainID = &id
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
		SET hostname = ?, type = ?, status = ?, verification_failure_reason = ?, verified_at = ?, last_check_at = ?, check_failures = ?
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
		domain.CheckFailures,
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
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, check_failures, redirect_to_domain_id, created_at, updated_at
		FROM domains
		WHERE tenant_id = ? AND type = 'custom' AND status = 'active' AND redirect_to_domain_id IS NULL
		ORDER BY verified_at IS NULL, verified_at, id
		LIMIT 1
	`
	row := r.db.QueryRowContext(ctx, query, tenantID)
	return r.scanDomain(row)
}

func (r *mysqlDomainRepository) FindByHostname(ctx context.Context, hostname string) (*Domain, error) {
	// SPECIAL EXCEPTION for Caddy ask-endpoint lookup across all tenants
	query := `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, check_failures, redirect_to_domain_id, created_at, updated_at
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
	var redirectTo sql.NullInt64

	err := row.Scan(
		&d.ID,
		&d.TenantID,
		&d.Hostname,
		&d.Type,
		&d.Status,
		&failureReason,
		&verifiedAt,
		&lastCheckAt,
		&d.CheckFailures,
		&redirectTo,
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
	if redirectTo.Valid {
		id := uint64(redirectTo.Int64)
		d.RedirectToDomainID = &id
	}

	return &d, nil
}

func (r *mysqlDomainRepository) ReleaseUnverifiedClaim(ctx context.Context, hostname string, exceptTenantID uint64) error {
	_, err := r.db.ExecContext(ctx,
		"DELETE FROM domains WHERE hostname = ? AND type = 'custom' AND status <> 'active' AND tenant_id <> ?",
		hostname, exceptTenantID)
	return err
}

func (r *mysqlDomainRepository) ListActiveCustom(ctx context.Context) ([]Domain, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, tenant_id, hostname, type, status, verification_failure_reason, verified_at, last_check_at, check_failures, redirect_to_domain_id, created_at, updated_at
		FROM domains
		WHERE type = 'custom' AND status = 'active'
		ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Domain
	for rows.Next() {
		var d Domain
		var failureReason sql.NullString
		var verifiedAt, lastCheckAt sql.NullTime
		var redirectTo sql.NullInt64
		if err := rows.Scan(&d.ID, &d.TenantID, &d.Hostname, &d.Type, &d.Status, &failureReason, &verifiedAt, &lastCheckAt, &d.CheckFailures, &redirectTo, &d.CreatedAt, &d.UpdatedAt); err != nil {
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
		if redirectTo.Valid {
			id := uint64(redirectTo.Int64)
			d.RedirectToDomainID = &id
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
