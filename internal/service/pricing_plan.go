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
	// ErrPlanPeriodLocked: the period of a plan cannot change while invoices for it wait for approval
	// (approval reads the period from the plan, so the change would alter what those invoices deliver).
	ErrPlanPeriodLocked = errors.New("durasi paket tidak bisa diubah karena masih ada tagihan paket ini yang menunggu verifikasi; setujui atau tolak tagihan tersebut dulu, atau buat paket baru")
)

// PricingPlanService defines business logic for managing subscription plans.
type PricingPlanService interface {
	List(ctx context.Context) ([]repository.PricingPlan, error)
	GetByID(ctx context.Context, id uint64) (*repository.PricingPlan, error)
	Create(ctx context.Context, name string, periodMonths int, price float64) (*repository.PricingPlan, error)
	Update(ctx context.Context, id uint64, name string, periodMonths int, price float64) (*repository.PricingPlan, error)
	Delete(ctx context.Context, id uint64) error
}

// pendingInvoiceLister is the part of the payment verification repository the plan service needs.
type pendingInvoiceLister interface {
	ListAll(ctx context.Context, statusFilter string) ([]repository.PaymentVerification, error)
}

type pricingPlanService struct {
	repo     repository.PricingPlanRepository
	invoices pendingInvoiceLister
}

// NewPricingPlanService creates a new PricingPlanService instance. invoices (optional) enables the
// guard that refuses a period change on a plan with pending invoices.
func NewPricingPlanService(repo repository.PricingPlanRepository, invoices ...pendingInvoiceLister) PricingPlanService {
	s := &pricingPlanService{repo: repo}
	if len(invoices) > 0 {
		s.invoices = invoices[0]
	}
	return s
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

	// Name and price may change at any time (an open invoice keeps its own amount), but the period is
	// read from the plan at approval, so it is locked while invoices for this plan are pending.
	if s.invoices != nil {
		current, err := s.repo.GetByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if current.PeriodMonths != periodMonths {
			pending, err := s.invoices.ListAll(ctx, "pending")
			if err != nil {
				return nil, err
			}
			for i := range pending {
				if pending[i].PlanID == id {
					return nil, ErrPlanPeriodLocked
				}
			}
		}
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
