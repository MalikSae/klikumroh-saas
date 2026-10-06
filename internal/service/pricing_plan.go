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
	// ListForTravel lists the plans a travel may pick: public plans, plus its own current plan (hidden or
	// not) so it can still renew it. currentPlanID is nil for a travel without a plan (public signup).
	ListForTravel(ctx context.Context, currentPlanID *uint64) ([]repository.PricingPlan, error)
	Create(ctx context.Context, name string, periodMonths int, price float64, isPublic bool) (*repository.PricingPlan, error)
	// Update changes a plan; isPublic nil keeps the current visibility.
	Update(ctx context.Context, id uint64, name string, periodMonths int, price float64, isPublic *bool) (*repository.PricingPlan, error)
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

func (s *pricingPlanService) Create(ctx context.Context, name string, periodMonths int, price float64, isPublic bool) (*repository.PricingPlan, error) {
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
		Hidden:       !isPublic,
	}

	if err := s.repo.Create(ctx, plan); err != nil {
		return nil, err
	}

	return plan, nil
}

func (s *pricingPlanService) Update(ctx context.Context, id uint64, name string, periodMonths int, price float64, isPublic *bool) (*repository.PricingPlan, error) {
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
	// read from the plan at approval, so it is locked while invoices for this plan are pending. A rejected
	// invoice is not counted: reopening it (UploadRenewalProof) refuses a plan changed after the rejection.
	current, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if s.invoices != nil && current.PeriodMonths != periodMonths {
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

	hidden := current.Hidden
	if isPublic != nil {
		hidden = !*isPublic
	}
	plan := &repository.PricingPlan{
		ID:           id,
		Name:         trimmedName,
		PeriodMonths: periodMonths,
		Price:        price,
		Hidden:       hidden,
	}

	if err := s.repo.Update(ctx, plan); err != nil {
		return nil, err
	}

	return s.repo.GetByID(ctx, id)
}

func (s *pricingPlanService) Delete(ctx context.Context, id uint64) error {
	return s.repo.Delete(ctx, id)
}

// ListForTravel: public plans, plus the travel's own current plan when it is hidden.
func (s *pricingPlanService) ListForTravel(ctx context.Context, currentPlanID *uint64) ([]repository.PricingPlan, error) {
	all, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]repository.PricingPlan, 0, len(all))
	for _, p := range all {
		if PlanAvailableToTravel(&p, currentPlanID) {
			out = append(out, p)
		}
	}
	return out, nil
}

// PlanAvailableToTravel: a travel may pick a public plan, or its own current plan (renewal) even when
// that plan was hidden later (keputusan pendiri 6 Okt 2026).
func PlanAvailableToTravel(plan *repository.PricingPlan, currentPlanID *uint64) bool {
	if plan == nil {
		return false
	}
	return !plan.Hidden || (currentPlanID != nil && *currentPlanID == plan.ID)
}
