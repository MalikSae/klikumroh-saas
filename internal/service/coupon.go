package service

import (
	"context"
	"errors"
	"regexp"
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
	// Staff coupon input errors, shown to staff as 400.
	ErrInvalidCouponCode   = errors.New("kode kupon 3-30 karakter: huruf besar, angka, tanda hubung, atau garis bawah")
	ErrInvalidCouponUses   = errors.New("batas penggunaan harus antara 1 dan 1.000.000")
	ErrCouponExpiryPast    = errors.New("tanggal kedaluwarsa kupon sudah lewat")
	ErrCouponPlanNotExists = errors.New("paket untuk kupon ini tidak ditemukan")
	ErrEmptyCouponCode     = errors.New("kode kupon wajib diisi")
	// ErrCouponOwnedByAffiliator: an affiliator coupon is switched off by deactivating its affiliator, so
	// payment approval can tell "affiliator replaced its code" (honored) from "switched off" (refused).
	ErrCouponOwnedByAffiliator = errors.New("kupon affiliator dinonaktifkan lewat menonaktifkan affiliatornya")
	// ErrCouponUsedByTenant: a coupon counts once per travel (keputusan pendiri 5 Okt 2026). The travel
	// already paid with it, or another open invoice of the travel carries it.
	ErrCouponUsedByTenant = errors.New("Kupon ini sudah pernah dipakai travel Anda")
)

// MaxCouponUses caps a coupon's usage limit.
const MaxCouponUses = 1_000_000

// staffCouponPattern is the shape of a staff coupon code (uppercased first). Hyphen and underscore are
// allowed (REF-ALI-10); affiliators keep their own stricter letters-and-digits rule.
var staffCouponPattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{2,29}$`)

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
	if !staffCouponPattern.MatchString(trimmedCode) {
		return nil, ErrInvalidCouponCode
	}

	if discountPercentage <= 0 || discountPercentage > 100 {
		return nil, ErrInvalidDiscount
	}

	if maxUses != nil && (*maxUses <= 0 || *maxUses > MaxCouponUses) {
		return nil, ErrInvalidCouponUses
	}
	if expiresAt != nil {
		// expires_at is a calendar day in WIB: today is still allowed, yesterday is not.
		y, m, d := time.Now().In(jakartaLocation).Date()
		if expiresAt.Before(time.Date(y, m, d, 0, 0, 0, 0, time.UTC)) {
			return nil, ErrCouponExpiryPast
		}
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
		// coupons.plan_id is a foreign key: a plan that does not exist is the staff's input error, not a 500.
		if planID != nil && strings.Contains(strings.ToLower(err.Error()), "foreign key") {
			return nil, ErrCouponPlanNotExists
		}
		return nil, err
	}

	return coupon, nil
}

func (s *couponService) Deactivate(ctx context.Context, id uint64) error {
	coupon, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if coupon.AffiliatorID != nil {
		return ErrCouponOwnedByAffiliator
	}
	return s.repo.Deactivate(ctx, id)
}

// couponEndOfDay is the last moment a coupon is valid: 23:59:59 WIB on its expiry date. expires_at is a
// DATE, and the business day is WIB whatever time zone the server process runs in (a UTC VPS would
// otherwise keep a coupon valid until 06:59 WIB the next day).
func couponEndOfDay(expiresAt time.Time) time.Time {
	d := expiresAt.In(jakartaLocation)
	return time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, jakartaLocation)
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

	if coupon.ExpiresAt != nil && time.Now().After(couponEndOfDay(*coupon.ExpiresAt)) {
		return nil, ErrCouponExpired
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
