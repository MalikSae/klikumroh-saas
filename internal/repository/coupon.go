package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// Coupon represents a discount coupon platform-wide.
type Coupon struct {
	ID                 uint64     `json:"id"`
	Code               string     `json:"code"`
	DiscountPercentage float64    `json:"discount_percentage"`
	PlanID             *uint64    `json:"plan_id"`
	PlanName           *string    `json:"plan_name,omitempty"`
	MaxUses            *int       `json:"max_uses"`
	UsedCount          int        `json:"used_count"`
	ExpiresAt          *time.Time `json:"expires_at"`
	Status             string     `json:"status"` // 'active' | 'inactive'
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// CouponRedemption tracks usage of coupons by tenants.
type CouponRedemption struct {
	ID         uint64    `json:"id"`
	CouponID   uint64    `json:"coupon_id"`
	TenantID   uint64    `json:"tenant_id"`
	RedeemedAt time.Time `json:"redeemed_at"`
}

// CouponRepository provides access to coupon records.
type CouponRepository interface {
	List(ctx context.Context) ([]Coupon, error)
	GetByID(ctx context.Context, id uint64) (*Coupon, error)
	Create(ctx context.Context, coupon *Coupon) error
	FindByCode(ctx context.Context, code string) (*Coupon, error)
	Deactivate(ctx context.Context, id uint64) error
	IncrementUsedCount(ctx context.Context, couponID uint64) error
	RecordRedemption(ctx context.Context, couponID, tenantID uint64) error
}

type mysqlCouponRepository struct {
	db *sql.DB
}

// NewCouponRepository creates a new CouponRepository instance.
func NewCouponRepository(db *sql.DB) CouponRepository {
	return &mysqlCouponRepository{db: db}
}

func (r *mysqlCouponRepository) List(ctx context.Context) ([]Coupon, error) {
	query := `
		SELECT c.id, c.code, c.discount_percentage, c.plan_id, p.name, c.max_uses, c.used_count, c.expires_at, c.status, c.created_at, c.updated_at
		FROM coupons c
		LEFT JOIN pricing_plans p ON c.plan_id = p.id
		ORDER BY c.id DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var coupons []Coupon
	for rows.Next() {
		var c Coupon
		var planID sql.NullInt64
		var planName sql.NullString
		var maxUses sql.NullInt64
		var expiresAt sql.NullTime

		if err := rows.Scan(
			&c.ID, &c.Code, &c.DiscountPercentage, &planID, &planName, &maxUses, &c.UsedCount,
			&expiresAt, &c.Status, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}

		if planID.Valid {
			v := uint64(planID.Int64)
			c.PlanID = &v
		}
		if planName.Valid {
			c.PlanName = &planName.String
		}
		if maxUses.Valid {
			v := int(maxUses.Int64)
			c.MaxUses = &v
		}
		if expiresAt.Valid {
			c.ExpiresAt = &expiresAt.Time
		}

		coupons = append(coupons, c)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return coupons, nil
}

func (r *mysqlCouponRepository) GetByID(ctx context.Context, id uint64) (*Coupon, error) {
	query := `
		SELECT c.id, c.code, c.discount_percentage, c.plan_id, p.name, c.max_uses, c.used_count, c.expires_at, c.status, c.created_at, c.updated_at
		FROM coupons c
		LEFT JOIN pricing_plans p ON c.plan_id = p.id
		WHERE c.id = ?
	`
	var c Coupon
	var planID sql.NullInt64
	var planName sql.NullString
	var maxUses sql.NullInt64
	var expiresAt sql.NullTime

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.Code, &c.DiscountPercentage, &planID, &planName, &maxUses, &c.UsedCount,
		&expiresAt, &c.Status, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if planID.Valid {
		v := uint64(planID.Int64)
		c.PlanID = &v
	}
	if planName.Valid {
		c.PlanName = &planName.String
	}
	if maxUses.Valid {
		v := int(maxUses.Int64)
		c.MaxUses = &v
	}
	if expiresAt.Valid {
		c.ExpiresAt = &expiresAt.Time
	}

	return &c, nil
}

func (r *mysqlCouponRepository) Create(ctx context.Context, coupon *Coupon) error {
	query := `
		INSERT INTO coupons (code, discount_percentage, plan_id, max_uses, used_count, expires_at, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
	`
	var planID sql.NullInt64
	if coupon.PlanID != nil && *coupon.PlanID > 0 {
		planID = sql.NullInt64{Int64: int64(*coupon.PlanID), Valid: true}
	}

	var maxUses sql.NullInt64
	if coupon.MaxUses != nil {
		maxUses = sql.NullInt64{Int64: int64(*coupon.MaxUses), Valid: true}
	}

	var expiresAt sql.NullTime
	if coupon.ExpiresAt != nil {
		expiresAt = sql.NullTime{Time: *coupon.ExpiresAt, Valid: true}
	}

	status := coupon.Status
	if status == "" {
		status = "active"
	}

	res, err := r.db.ExecContext(ctx, query,
		strings.ToUpper(strings.TrimSpace(coupon.Code)),
		coupon.DiscountPercentage,
		planID,
		maxUses,
		coupon.UsedCount,
		expiresAt,
		status,
	)
	if err != nil {
		return err
	}

	id, err := res.LastInsertId()
	if err != nil {
		return err
	}

	coupon.ID = uint64(id)
	coupon.Status = status
	return nil
}

func (r *mysqlCouponRepository) FindByCode(ctx context.Context, code string) (*Coupon, error) {
	query := `
		SELECT c.id, c.code, c.discount_percentage, c.plan_id, p.name, c.max_uses, c.used_count, c.expires_at, c.status, c.created_at, c.updated_at
		FROM coupons c
		LEFT JOIN pricing_plans p ON c.plan_id = p.id
		WHERE c.code = ?
	`
	var c Coupon
	var planID sql.NullInt64
	var planName sql.NullString
	var maxUses sql.NullInt64
	var expiresAt sql.NullTime

	cleanCode := strings.ToUpper(strings.TrimSpace(code))
	err := r.db.QueryRowContext(ctx, query, cleanCode).Scan(
		&c.ID, &c.Code, &c.DiscountPercentage, &planID, &planName, &maxUses, &c.UsedCount,
		&expiresAt, &c.Status, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if planID.Valid {
		v := uint64(planID.Int64)
		c.PlanID = &v
	}
	if planName.Valid {
		c.PlanName = &planName.String
	}
	if maxUses.Valid {
		v := int(maxUses.Int64)
		c.MaxUses = &v
	}
	if expiresAt.Valid {
		c.ExpiresAt = &expiresAt.Time
	}

	return &c, nil
}

func (r *mysqlCouponRepository) Deactivate(ctx context.Context, id uint64) error {
	query := `UPDATE coupons SET status = 'inactive', updated_at = NOW() WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, id)
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

func (r *mysqlCouponRepository) IncrementUsedCount(ctx context.Context, couponID uint64) error {
	query := `UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = ?`
	res, err := r.db.ExecContext(ctx, query, couponID)
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

func (r *mysqlCouponRepository) RecordRedemption(ctx context.Context, couponID, tenantID uint64) error {
	query := `INSERT INTO coupon_redemptions (coupon_id, tenant_id, redeemed_at) VALUES (?, ?, NOW())`
	_, err := r.db.ExecContext(ctx, query, couponID, tenantID)
	return err
}

func usedCountHelper(target *int) interface{} {
	return target
}
