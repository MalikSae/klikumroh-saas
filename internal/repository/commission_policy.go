package repository

import (
	"context"
	"database/sql"
	"errors"
)

// Commission release policies: when an agent's commission may be withdrawn.
const (
	CommissionReleaseOnLunas = "lunas" // held until the admin marks the jamaah as paid off (default)
	CommissionReleaseOnDP    = "dp"    // withdrawable right at closing (DP)
)

// CommissionPolicyRepository reads and writes the tenant's commission release policy.
// All methods are scoped by tenantID.
type CommissionPolicyRepository interface {
	GetReleaseOn(ctx context.Context, tenantID uint64) (string, error)
	SetReleaseOn(ctx context.Context, tenantID uint64, releaseOn string) error
}

type mysqlCommissionPolicyRepository struct {
	db *sql.DB
}

// NewCommissionPolicyRepository creates a new CommissionPolicyRepository.
func NewCommissionPolicyRepository(db *sql.DB) CommissionPolicyRepository {
	return &mysqlCommissionPolicyRepository{db: db}
}

func (r *mysqlCommissionPolicyRepository) GetReleaseOn(ctx context.Context, tenantID uint64) (string, error) {
	var v string
	err := r.db.QueryRowContext(ctx, "SELECT commission_release_on FROM tenants WHERE id = ?", tenantID).Scan(&v)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return v, nil
}

func (r *mysqlCommissionPolicyRepository) SetReleaseOn(ctx context.Context, tenantID uint64, releaseOn string) error {
	res, err := r.db.ExecContext(ctx, "UPDATE tenants SET commission_release_on = ? WHERE id = ?", releaseOn, tenantID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		var exists int
		if err := r.db.QueryRowContext(ctx, "SELECT 1 FROM tenants WHERE id = ?", tenantID).Scan(&exists); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}
	return nil
}
