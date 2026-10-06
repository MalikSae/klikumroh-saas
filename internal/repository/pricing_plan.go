package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// ErrPlanInUse is returned when attempting to delete a pricing plan currently assigned to one or more tenants.
var ErrPlanInUse = errors.New("plan harga sedang digunakan oleh travel dan tidak dapat dihapus")

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
	Hidden    bool      `json:"-"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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

func (r *mysqlPricingPlanRepository) List(ctx context.Context) ([]PricingPlan, error) {
	query := `
		SELECT id, name, period_months, price, is_public, created_at, updated_at
		FROM pricing_plans
		ORDER BY period_months ASC, price ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := make([]PricingPlan, 0)
	for rows.Next() {
		var p PricingPlan
		var isPublic bool
		if err := rows.Scan(
			&p.ID,
			&p.Name,
			&p.PeriodMonths,
			&p.Price,
			&isPublic,
			&p.CreatedAt,
			&p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		p.Hidden = !isPublic
		plans = append(plans, p)
	}

	return plans, rows.Err()
}

func (r *mysqlPricingPlanRepository) GetByID(ctx context.Context, id uint64) (*PricingPlan, error) {
	query := `
		SELECT id, name, period_months, price, is_public, created_at, updated_at
		FROM pricing_plans
		WHERE id = ?
	`
	var p PricingPlan
	var isPublic bool
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&p.ID,
		&p.Name,
		&p.PeriodMonths,
		&p.Price,
		&isPublic,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	p.Hidden = !isPublic
	return &p, nil
}

func (r *mysqlPricingPlanRepository) Create(ctx context.Context, plan *PricingPlan) error {
	query := `
		INSERT INTO pricing_plans (name, period_months, price, is_public)
		VALUES (?, ?, ?, ?)
	`
	result, err := r.db.ExecContext(ctx, query,
		plan.Name,
		plan.PeriodMonths,
		plan.Price,
		!plan.Hidden,
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
		SET name = ?, period_months = ?, price = ?, is_public = ?
		WHERE id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		plan.Name,
		plan.PeriodMonths,
		plan.Price,
		!plan.Hidden,
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

// MarshalJSON adds "is_public" (the inverse of Hidden) to the plan JSON for the dashboard.
func (p PricingPlan) MarshalJSON() ([]byte, error) {
	type plain PricingPlan
	return json.Marshal(struct {
		plain
		IsPublic bool `json:"is_public"`
	}{plain(p), !p.Hidden})
}
