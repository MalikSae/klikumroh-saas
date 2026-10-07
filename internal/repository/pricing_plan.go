package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"time"
)

// ErrPlanInUse is returned when attempting to delete a pricing plan currently assigned to one or more tenants.
var ErrPlanInUse = errors.New("plan harga sedang digunakan oleh travel dan tidak dapat dihapus")

// ErrPlanUsedByCoupon is returned when deleting a pricing plan that an active (or affiliator) coupon is
// bound to.
var ErrPlanUsedByCoupon = errors.New("plan harga masih dipakai kupon dan tidak dapat dihapus")

// PricingPlan represents a subscription plan package in the pricing_plans table.
// Notice: There is NO tenant_id because pricing plans are platform-wide.
type PricingPlan struct {
	ID           uint64  `json:"id"`
	Name         string  `json:"name"`
	PeriodMonths int     `json:"period_months"`
	Price        float64 `json:"price"`
	// Hidden is pricing_plans.is_public = FALSE: the plan is not offered to travels (signup and billing plan
	// lists) and only staff, or a travel already on it (renewal), can use it. Stored inverted so the zero
	// value matches the column default (TRUE); JSON exposes it as "is_public" (MarshalJSON).
	Hidden bool `json:"-"`
	// PromoPercent is a discount on the plan price for a new travel's first payment (founder decision
	// 7 Oct 2026); nil or 0 = no promo. PromoEndsAt is the last day it applies (inclusive, WIB), nil = no
	// end date. JSON: "promo_percent", "promo_ends_at" (YYYY-MM-DD), plus "promo_active" and
	// "promo_price" for the current moment (MarshalJSON).
	PromoPercent *float64  `json:"promo_percent"`
	PromoEndsAt  *time.Time `json:"-"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// wib is the time zone promo end dates are read in (an end date covers the whole day in Indonesia).
var wib = time.FixedZone("WIB", 7*3600)

// ActivePromo returns the promo percent that applies at now (0 when there is none or it has ended).
func (p PricingPlan) ActivePromo(now time.Time) float64 {
	if p.PromoPercent == nil || *p.PromoPercent <= 0 {
		return 0
	}
	if p.PromoEndsAt != nil {
		y, m, d := p.PromoEndsAt.Date()
		endOfDay := time.Date(y, m, d, 23, 59, 59, 999999999, wib)
		if now.After(endOfDay) {
			return 0
		}
	}
	return *p.PromoPercent
}

// PromoPrice is price after a promo percent, rounded to whole rupiah (price itself when percent <= 0).
func PromoPrice(price, percent float64) float64 {
	if percent <= 0 {
		return price
	}
	v := math.Round(price * (1 - percent/100))
	if v < 0 {
		return 0
	}
	return v
}

// PricingPlanRepository defines access methods for pricing_plans records.
type PricingPlanRepository interface {
	List(ctx context.Context) ([]PricingPlan, error)
	GetByID(ctx context.Context, id uint64) (*PricingPlan, error)
	Create(ctx context.Context, plan *PricingPlan) error
	Update(ctx context.Context, plan *PricingPlan) error
	Delete(ctx context.Context, id uint64) error
	CountTenantsUsingPlan(ctx context.Context, id uint64) (int, error)
}

type mysqlPricingPlanRepository struct {
	db *sql.DB
}

// NewPricingPlanRepository creates a new PricingPlanRepository instance.
func NewPricingPlanRepository(db *sql.DB) PricingPlanRepository {
	return &mysqlPricingPlanRepository{db: db}
}

const pricingPlanColumns = `id, name, period_months, price, is_public, promo_percent, promo_ends_at, created_at, updated_at`

func scanPricingPlan(row rowScanner) (PricingPlan, error) {
	var p PricingPlan
	var isPublic bool
	var promo sql.NullFloat64
	var ends sql.NullTime
	if err := row.Scan(&p.ID, &p.Name, &p.PeriodMonths, &p.Price, &isPublic, &promo, &ends, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return p, err
	}
	p.Hidden = !isPublic
	if promo.Valid {
		v := promo.Float64
		p.PromoPercent = &v
	}
	if ends.Valid {
		t := ends.Time
		p.PromoEndsAt = &t
	}
	return p, nil
}

func (r *mysqlPricingPlanRepository) List(ctx context.Context) ([]PricingPlan, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+pricingPlanColumns+` FROM pricing_plans ORDER BY period_months ASC, price ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := make([]PricingPlan, 0)
	for rows.Next() {
		p, err := scanPricingPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, p)
	}

	return plans, rows.Err()
}

func (r *mysqlPricingPlanRepository) GetByID(ctx context.Context, id uint64) (*PricingPlan, error) {
	p, err := scanPricingPlan(r.db.QueryRowContext(ctx, `SELECT `+pricingPlanColumns+` FROM pricing_plans WHERE id = ?`, id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// promoDate is the DATE value written for PromoEndsAt (its calendar day).
func promoDate(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.Format("2006-01-02")
}

func (r *mysqlPricingPlanRepository) Create(ctx context.Context, plan *PricingPlan) error {
	query := `
		INSERT INTO pricing_plans (name, period_months, price, is_public, promo_percent, promo_ends_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	result, err := r.db.ExecContext(ctx, query,
		plan.Name,
		plan.PeriodMonths,
		plan.Price,
		!plan.Hidden,
		plan.PromoPercent,
		promoDate(plan.PromoEndsAt),
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	plan.ID = uint64(id)
	return nil
}

func (r *mysqlPricingPlanRepository) Update(ctx context.Context, plan *PricingPlan) error {
	query := `
		UPDATE pricing_plans
		SET name = ?, period_months = ?, price = ?, is_public = ?, promo_percent = ?, promo_ends_at = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		plan.Name,
		plan.PeriodMonths,
		plan.Price,
		!plan.Hidden,
		plan.PromoPercent,
		promoDate(plan.PromoEndsAt),
		plan.ID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM pricing_plans WHERE id = ?", plan.ID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

// UpdatePromo writes only the promo of a plan and keeps updated_at: reopening a rejected invoice refuses a
// plan changed after the rejection (price or period), and a promo change must not count as one, since an
// invoice keeps its own promo snapshot.
func (r *mysqlPricingPlanRepository) UpdatePromo(ctx context.Context, id uint64, percent *float64, endsAt *time.Time) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE pricing_plans SET promo_percent = ?, promo_ends_at = ?, updated_at = updated_at WHERE id = ?`,
		percent, promoDate(endsAt), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var exists int
		if err := r.db.QueryRowContext(ctx, "SELECT 1 FROM pricing_plans WHERE id = ?", id).Scan(&exists); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}
	return nil
}

func (r *mysqlPricingPlanRepository) CountTenantsUsingPlan(ctx context.Context, id uint64) (int, error) {
	var count int
	query := `
		SELECT
			(SELECT COUNT(*) FROM tenants WHERE current_plan_id = ?) +
			(SELECT COUNT(*) FROM payment_verifications WHERE plan_id = ?)
	`
	err := r.db.QueryRowContext(ctx, query, id, id).Scan(&count)
	return count, err
}

func (r *mysqlPricingPlanRepository) Delete(ctx context.Context, id uint64) error {
	count, err := r.CountTenantsUsingPlan(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrPlanInUse
	}
	// coupons.plan_id is ON DELETE SET NULL: deleting the plan would silently turn a plan-bound coupon into
	// an all-plans coupon (bug hunt putaran 5). Refused while a coupon that can still be honored (active, or
	// any affiliator coupon, honored after the affiliator replaced its code) is bound to this plan.
	var coupons int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM coupons WHERE plan_id = ? AND (status = 'active' OR affiliator_id IS NOT NULL)`, id).Scan(&coupons); err != nil {
		return err
	}
	if coupons > 0 {
		return ErrPlanUsedByCoupon
	}

	res, err := r.db.ExecContext(ctx, "DELETE FROM pricing_plans WHERE id = ?", id)
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

// MarshalJSON adds "is_public" (the inverse of Hidden), the promo end date as "promo_ends_at" (YYYY-MM-DD
// or null), and the promo in force right now: "promo_active" and "promo_price" (null without a promo).
func (p PricingPlan) MarshalJSON() ([]byte, error) {
	type plain PricingPlan
	var ends *string
	if p.PromoEndsAt != nil {
		s := p.PromoEndsAt.Format("2006-01-02")
		ends = &s
	}
	active := p.ActivePromo(time.Now())
	var promoPrice *float64
	if active > 0 {
		v := PromoPrice(p.Price, active)
		promoPrice = &v
	}
	return json.Marshal(struct {
		plain
		IsPublic    bool     `json:"is_public"`
		PromoEndsAt *string  `json:"promo_ends_at"`
		PromoActive bool     `json:"promo_active"`
		PromoPrice  *float64 `json:"promo_price"`
	}{plain(p), !p.Hidden, ends, active > 0, promoPrice})
}
