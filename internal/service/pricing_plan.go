package service

import (
	"context"
	"errors"
	"strings"

	"klikumroh/internal/repository"
)

var (
	ErrInvalidPlanName   = errors.New("nama plan tidak boleh kosong")
	ErrInvalidPlanPeriod = errors.New("periode plan harus lebih dari 0 bulan")
	ErrInvalidPlanPrice  = errors.New("harga plan tidak boleh negatif")
)

// PricingPlanService defines business logic for managing subscription plans.
type PricingPlanService interface {
	List(ctx context.Context) ([]repository.PricingPlan, error)
	GetByID(ctx context.Context, id uint64) (*repository.PricingPlan, error)
	Create(ctx context.Context, name string, periodMonths int, price float64) (*repository.PricingPlan, error)
	Update(ctx context.Context, id uint64, name string, periodMonths int, price float64) (*repository.PricingPlan, error)
	Delete(ctx context.Context, id uint64) error
}

type pricingPlanService struct {
	repo repository.PricingPlanRepository
}

// NewPricingPlanService creates a new PricingPlanService instance.
func NewPricingPlanService(repo repository.PricingPlanRepository) PricingPlanService {
	return &pricingPlanService{repo: repo}
}

func (s *pricingPlanService) List(ctx context.Context) ([]repository.PricingPlan, error) {
	return s.repo.List(ctx)
}

func (s *pricingPlanService) GetByID(ctx context.Context, id uint64) (*repository.PricingPlan, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *pricingPlanService) Create(ctx context.Context, name string, periodMonths int, price float64) (*repository.PricingPlan, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, ErrInvalidPlanName
	}
	if periodMonths <= 0 {
		return nil, ErrInvalidPlanPeriod
	}
	if price < 0 {
		return nil, ErrInvalidPlanPrice
	}

	plan := &repository.PricingPlan{
		Name:         trimmedName,
		PeriodMonths: periodMonths,
		Price:        price,
	}

	if err := s.repo.Create(ctx, plan); err != nil {
		return nil, err
	}

	return plan, nil
}

func (s *pricingPlanService) Update(ctx context.Context, id uint64, name string, periodMonths int, price float64) (*repository.PricingPlan, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, ErrInvalidPlanName
	}
	if periodMonths <= 0 {
		return nil, ErrInvalidPlanPeriod
	}
	if price < 0 {
		return nil, ErrInvalidPlanPrice
	}

	plan := &repository.PricingPlan{
		ID:           id,
		Name:         trimmedName,
		PeriodMonths: periodMonths,
		Price:        price,
	}

	if err := s.repo.Update(ctx, plan); err != nil {
		return nil, err
	}

	return s.repo.GetByID(ctx, id)
}

func (s *pricingPlanService) Delete(ctx context.Context, id uint64) error {
	return s.repo.Delete(ctx, id)
}
