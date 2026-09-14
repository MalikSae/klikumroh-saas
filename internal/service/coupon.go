package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

var (
	ErrCouponNotFound     = errors.New("kode kupon tidak ditemukan")
	ErrCouponInactive     = errors.New("kupon sudah tidak aktif")
	ErrCouponExpired      = errors.New("kupon sudah kedaluwarsa")
	ErrCouponExhausted    = errors.New("kuota pemakaian kupon sudah habis")
	ErrCouponPlanMismatch = errors.New("kupon ini tidak berlaku untuk paket yang dipilih")
	ErrInvalidDiscount    = errors.New("persentase diskon harus antara 0 dan 100")
	ErrEmptyCouponCode    = errors.New("kode kupon wajib diisi")
)

// CouponService provides business logic for managing and validating coupons.
type CouponService interface {
	List(ctx context.Context) ([]repository.Coupon, error)
	Create(ctx context.Context, code string, discountPercentage float64, maxUses *int, expiresAt *time.Time, planID *uint64) (*repository.Coupon, error)
	Deactivate(ctx context.Context, id uint64) error
	Validate(ctx context.Context, code string, planID ...uint64) (*repository.Coupon, error)
}

type couponService struct {
	repo repository.CouponRepository
}

// NewCouponService creates a new CouponService instance.
func NewCouponService(repo repository.CouponRepository) CouponService {
	return &couponService{repo: repo}
}

func (s *couponService) List(ctx context.Context) ([]repository.Coupon, error) {
	return s.repo.List(ctx)
}

func (s *couponService) Create(ctx context.Context, code string, discountPercentage float64, maxUses *int, expiresAt *time.Time, planID *uint64) (*repository.Coupon, error) {
	trimmedCode := strings.ToUpper(strings.TrimSpace(code))
	if trimmedCode == "" {
		return nil, ErrEmptyCouponCode
	}

	if discountPercentage <= 0 || discountPercentage > 100 {
		return nil, ErrInvalidDiscount
	}

	if maxUses != nil && *maxUses <= 0 {
		return nil, errors.New("batas penggunaan harus lebih dari 0")
	}

	coupon := &repository.Coupon{
		Code:               trimmedCode,
		DiscountPercentage: discountPercentage,
		MaxUses:            maxUses,
		ExpiresAt:          expiresAt,
		PlanID:             planID,
		Status:             "active",
	}

	if err := s.repo.Create(ctx, coupon); err != nil {
		return nil, err
	}

	return coupon, nil
}

func (s *couponService) Deactivate(ctx context.Context, id uint64) error {
	return s.repo.Deactivate(ctx, id)
}

func (s *couponService) Validate(ctx context.Context, code string, planID ...uint64) (*repository.Coupon, error) {
	trimmedCode := strings.ToUpper(strings.TrimSpace(code))
	if trimmedCode == "" {
		return nil, ErrEmptyCouponCode
	}

	coupon, err := s.repo.FindByCode(ctx, trimmedCode)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrCouponNotFound
		}
		return nil, err
	}

	if coupon.Status != "active" {
		return nil, ErrCouponInactive
	}

	if coupon.ExpiresAt != nil {
		now := time.Now()
		// Compare date (end of the expiration day)
		exp := time.Date(coupon.ExpiresAt.Year(), coupon.ExpiresAt.Month(), coupon.ExpiresAt.Day(), 23, 59, 59, 0, now.Location())
		if now.After(exp) {
			return nil, ErrCouponExpired
		}
	}

	if coupon.MaxUses != nil && coupon.UsedCount >= *coupon.MaxUses {
		return nil, ErrCouponExhausted
	}

	if coupon.PlanID != nil {
		if len(planID) == 0 || planID[0] == 0 || *coupon.PlanID != planID[0] {
			return nil, ErrCouponPlanMismatch
		}
	}

	return coupon, nil
}
