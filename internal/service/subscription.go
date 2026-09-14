package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

var (
	ErrSubscriptionNotFound    = errors.New("data langganan tidak ditemukan")
	ErrPlanNotFound            = errors.New("paket langganan tidak ditemukan")
	ErrProofRequired           = errors.New("bukti transfer wajib diunggah untuk pembayaran lebih dari Rp 0")
	ErrVerificationAlreadyDone = errors.New("permohonan verifikasi ini sudah diproses sebelumnya")
	ErrRejectionReasonRequired = errors.New("alasan penolakan wajib diisi")
)

// TenantSubscriptionInfo encapsulates current subscription details and history.
type TenantSubscriptionInfo struct {
	TenantID                 uint64                           `json:"tenant_id"`
	TenantName               string                           `json:"tenant_name"`
	TenantSlug               string                           `json:"tenant_slug"`
	Status                   string                           `json:"status"`
	CurrentPlanID            *uint64                          `json:"current_plan_id"`
	CurrentPlanName          *string                          `json:"current_plan_name"`
	CurrentPlanPeriod        *int                             `json:"current_plan_period_months"`
	SubscriptionExpiresAt    *time.Time                       `json:"subscription_expires_at"`
	IsActive                 bool                             `json:"is_active"`
	DaysRemaining            int                              `json:"days_remaining"`
	IsSubscriptionExpired    bool                             `json:"is_subscription_expired"`
	ShouldShowRenewalInvoice bool                             `json:"should_show_renewal_invoice"`
	GracePeriodDaysRemaining int                              `json:"grace_period_days_remaining"`
	IsSuspended              bool                             `json:"is_suspended"`
	PendingVerification      *repository.PaymentVerification  `json:"pending_verification,omitempty"`
	PaymentVerifications     []repository.PaymentVerification `json:"payment_verifications"`
}

// SubscriptionService defines business logic for tenant subscriptions and payment verifications.
type SubscriptionService interface {
	GetSubscriptionInfo(ctx context.Context, tenantID uint64) (*TenantSubscriptionInfo, error)
	GetPaymentVerificationByID(ctx context.Context, tenantID uint64, verificationID uint64) (*repository.PaymentVerification, error)
	CreateRenewalRequest(ctx context.Context, tenantID uint64, planID uint64, couponCode *string, proofURL *string) (*repository.PaymentVerification, error)
	UploadRenewalProof(ctx context.Context, tenantID uint64, verificationID uint64, fileBytes []byte) (string, error)
	ListStaffVerifications(ctx context.Context, statusFilter string, tenantID ...uint64) ([]repository.PaymentVerification, error)
	ApproveVerification(ctx context.Context, id uint64, staffUserID uint64) error
	RejectVerification(ctx context.Context, id uint64, reason string, staffUserID uint64) error
	SetContentRepos(pkgRepo repository.PackageRepository, faqRepo repository.FAQRepository)
}

type subscriptionService struct {
	pvRepo        repository.PaymentVerificationRepository
	couponRepo    repository.CouponRepository
	couponService CouponService
	planRepo      repository.PricingPlanRepository
	tenantRepo    repository.TenantRepository
	domainRepo    repository.DomainRepository
	packageRepo   repository.PackageRepository
	faqRepo       repository.FAQRepository
}

// NewSubscriptionService creates a new SubscriptionService.
func NewSubscriptionService(
	pvRepo repository.PaymentVerificationRepository,
	couponRepo repository.CouponRepository,
	couponService CouponService,
	planRepo repository.PricingPlanRepository,
	tenantRepo repository.TenantRepository,
	domainRepos ...repository.DomainRepository,
) SubscriptionService {
	var dr repository.DomainRepository
	if len(domainRepos) > 0 {
		dr = domainRepos[0]
	}
	return &subscriptionService{
		pvRepo:        pvRepo,
		couponRepo:    couponRepo,
		couponService: couponService,
		planRepo:      planRepo,
		tenantRepo:    tenantRepo,
		domainRepo:    dr,
	}
}

func (s *subscriptionService) SetContentRepos(pkgRepo repository.PackageRepository, faqRepo repository.FAQRepository) {
	s.packageRepo = pkgRepo
	s.faqRepo = faqRepo
}

func (s *subscriptionService) GetSubscriptionInfo(ctx context.Context, tenantID uint64) (*TenantSubscriptionInfo, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	info := &TenantSubscriptionInfo{
		TenantID:              tenant.ID,
		TenantName:            tenant.Name,
		TenantSlug:            tenant.Slug,
		Status:                tenant.Status,
		CurrentPlanID:         tenant.CurrentPlanID,
		SubscriptionExpiresAt: tenant.SubscriptionExpiresAt,
	}

	if tenant.CurrentPlanID != nil {
		if plan, err := s.planRepo.GetByID(ctx, *tenant.CurrentPlanID); err == nil && plan != nil {
			info.CurrentPlanName = &plan.Name
			info.CurrentPlanPeriod = &plan.PeriodMonths
		}
	}

	now := time.Now()
	if tenant.SubscriptionExpiresAt != nil {
		if tenant.SubscriptionExpiresAt.After(now) {
			info.IsActive = true
			diff := tenant.SubscriptionExpiresAt.Sub(now)
			info.DaysRemaining = int(diff.Hours()/24) + 1
			info.IsSubscriptionExpired = false
			info.GracePeriodDaysRemaining = 7
			info.IsSuspended = false
		} else {
			info.IsActive = false
			info.DaysRemaining = 0
			info.IsSubscriptionExpired = true

			// Grace period calculation (7 days after expiry)
			graceEnd := tenant.SubscriptionExpiresAt.AddDate(0, 0, 7)
			if now.Before(graceEnd) {
				diff := graceEnd.Sub(now)
				info.GracePeriodDaysRemaining = int(diff.Hours()/24) + 1
				info.IsSuspended = false
			} else {
				info.GracePeriodDaysRemaining = 0
				info.IsSuspended = true
			}
		}
	} else {
		// If no expiry date set, consider active if status is 'active' or 'trial'
		info.IsActive = tenant.Status == "active" || tenant.Status == "trial"
		info.DaysRemaining = 0
		info.IsSubscriptionExpired = false
		info.GracePeriodDaysRemaining = 7
		info.IsSuspended = false
	}

	// ShouldShowRenewalInvoice is true if within 30 days of expiry OR already expired
	if (tenant.SubscriptionExpiresAt != nil && info.DaysRemaining <= 30) || info.IsSubscriptionExpired {
		info.ShouldShowRenewalInvoice = true
	}

	// Fetch history
	history, err := s.pvRepo.ListByTenant(ctx, tenantID)
	if err == nil {
		info.PaymentVerifications = history
		for i := range history {
			if history[i].Status == "pending" {
				info.PendingVerification = &history[i]
				break
			}
		}
	} else {
		info.PaymentVerifications = []repository.PaymentVerification{}
	}

	return info, nil
}

func (s *subscriptionService) CreateRenewalRequest(
	ctx context.Context,
	tenantID uint64,
	planID uint64,
	couponCode *string,
	proofURL *string,
) (*repository.PaymentVerification, error) {
	plan, err := s.planRepo.GetByID(ctx, planID)
	if err != nil {
		return nil, ErrPlanNotFound
	}

	baseAmount := plan.Price
	discountedAmount := baseAmount

	var validCouponCode *string
	if couponCode != nil && strings.TrimSpace(*couponCode) != "" {
		code := strings.TrimSpace(*couponCode)
		coupon, err := s.couponService.Validate(ctx, code, planID)
		if err != nil {
			return nil, err
		}
		discount := (coupon.DiscountPercentage / 100.0) * baseAmount
		discountedAmount = math.Round(baseAmount - discount)
		if discountedAmount < 0 {
			discountedAmount = 0
		}
		validCouponCode = &coupon.Code
	}

	uniqueCode := 0
	finalAmount := discountedAmount
	if discountedAmount > 0 {
		uniqueCode = rand.Intn(900) + 100
		finalAmount = discountedAmount + float64(uniqueCode)
	}

	// Check if there is already an existing pending verification for this tenant to prevent duplicate spam
	existingHistory, _ := s.pvRepo.ListByTenant(ctx, tenantID)
	for i := range existingHistory {
		if existingHistory[i].Status == "pending" {
			// Update the existing pending verification
			if err := s.pvRepo.UpdateDetails(ctx, existingHistory[i].ID, planID, validCouponCode, baseAmount, finalAmount, uniqueCode, proofURL); err != nil {
				return nil, err
			}
			existingHistory[i].PlanID = planID
			existingHistory[i].CouponCode = validCouponCode
			existingHistory[i].Amount = baseAmount
			existingHistory[i].FinalAmount = finalAmount
			existingHistory[i].UniqueCode = uniqueCode
			if proofURL != nil {
				existingHistory[i].ProofURL = proofURL
			}
			return &existingHistory[i], nil
		}
	}

	pv := &repository.PaymentVerification{
		TenantID:    tenantID,
		PlanID:      planID,
		CouponCode:  validCouponCode,
		Amount:      baseAmount,
		FinalAmount: finalAmount,
		UniqueCode:  uniqueCode,
		ProofURL:    proofURL,
		Status:      "pending",
	}

	if err := s.pvRepo.Create(ctx, pv); err != nil {
		return nil, err
	}

	return pv, nil
}

func (s *subscriptionService) GetPaymentVerificationByID(
	ctx context.Context,
	tenantID uint64,
	verificationID uint64,
) (*repository.PaymentVerification, error) {
	pv, err := s.pvRepo.GetByID(ctx, verificationID)
	if err != nil {
		return nil, ErrVerificationNotFound
	}
	if pv.TenantID != tenantID {
		return nil, ErrVerificationNotFound
	}
	return pv, nil
}

func (s *subscriptionService) UploadRenewalProof(
	ctx context.Context,
	tenantID uint64,
	verificationID uint64,
	fileBytes []byte,
) (string, error) {
	pv, err := s.pvRepo.GetByID(ctx, verificationID)
	if err != nil {
		return "", ErrVerificationNotFound
	}
	if pv.TenantID != tenantID {
		return "", ErrVerificationNotFound
	}
	if pv.Status != "pending" && pv.Status != "rejected" {
		return "", ErrVerificationNotPending
	}
	if len(fileBytes) == 0 {
		return "", ErrEmptyProofFile
	}

	fileName := uuid.New().String() + ".webp"
	relPath := fmt.Sprintf("/uploads/%d/subscription-proofs/%s", tenantID, fileName)
	absPath := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantID), "subscription-proofs", fileName)

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
		return "", err
	}

	if pv.Status == "rejected" {
		if err := s.pvRepo.ResetToPendingWithProof(ctx, verificationID, relPath); err != nil {
			_ = os.Remove(absPath)
			return "", err
		}
	} else {
		if err := s.pvRepo.UpdateProofURL(ctx, verificationID, relPath); err != nil {
			_ = os.Remove(absPath)
			return "", err
		}
	}

	return relPath, nil
}

func (s *subscriptionService) ListStaffVerifications(ctx context.Context, statusFilter string, tenantID ...uint64) ([]repository.PaymentVerification, error) {
	if len(tenantID) > 0 && tenantID[0] > 0 {
		list, err := s.pvRepo.ListByTenant(ctx, tenantID[0])
		if err != nil {
			return nil, err
		}
		if statusFilter == "" || statusFilter == "all" {
			return list, nil
		}
		filtered := make([]repository.PaymentVerification, 0)
		for _, v := range list {
			if v.Status == statusFilter {
				filtered = append(filtered, v)
			}
		}
		return filtered, nil
	}
	return s.pvRepo.ListAll(ctx, statusFilter)
}

func (s *subscriptionService) ApproveVerification(ctx context.Context, id uint64, staffUserID uint64) error {
	pv, err := s.pvRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if pv.Status != "pending" {
		return ErrVerificationAlreadyDone
	}

	tenant, err := s.tenantRepo.GetByID(ctx, pv.TenantID)
	if err != nil {
		return err
	}

	plan, err := s.planRepo.GetByID(ctx, pv.PlanID)
	if err != nil {
		return err
	}

	wasPending := tenant.Status == "pending"

	// Non-greedy expiry calculation
	baseTime := time.Now()
	if tenant.SubscriptionExpiresAt != nil && tenant.SubscriptionExpiresAt.After(baseTime) {
		baseTime = *tenant.SubscriptionExpiresAt
	}
	newExpiry := baseTime.AddDate(0, plan.PeriodMonths, 0)

	// Update tenant subscription and set status to active
	if err := s.tenantRepo.UpdateSubscription(ctx, pv.TenantID, pv.PlanID, newExpiry, "active"); err != nil {
		return err
	}

	// Ensure default subdomain exists in domains table
	if s.domainRepo != nil {
		defaultHostname := fmt.Sprintf("%s.klikumroh.id", tenant.Slug)
		if existing, _ := s.domainRepo.FindByHostname(ctx, defaultHostname); existing == nil {
			_ = s.domainRepo.Create(ctx, tenant.ID, &repository.Domain{
				TenantID: tenant.ID,
				Hostname: defaultHostname,
				Type:     "subdomain",
				Status:   "active",
			})
		}
	}

	// Record coupon redemption if coupon was applied
	if pv.CouponCode != nil && strings.TrimSpace(*pv.CouponCode) != "" {
		if coupon, err := s.couponRepo.FindByCode(ctx, *pv.CouponCode); err == nil && coupon != nil {
			_ = s.couponRepo.IncrementUsedCount(ctx, coupon.ID)
			_ = s.couponRepo.RecordRedemption(ctx, coupon.ID, pv.TenantID)
		}
	}

	// If tenant was pending activation, seed default sample draft package and standard FAQs if none exist
	if wasPending {
		if s.packageRepo != nil {
			count, err := s.packageRepo.CountByTenant(ctx, tenant.ID)
			if err == nil && count == 0 {
				sampleDesc := "Paket perjalanan ibadah umroh reguler dengan fasilitas bintang 4 dan bimbingan ibadah sesuai sunnah."
				samplePrice := 29500000.0
				sampleQuota := 45
				depDate := time.Now().AddDate(0, 2, 0)
				sampleFacilitiesInc := "- Tiket pesawat PP kelas ekonomi\n- Visa Umroh\n- Hotel Makkah & Madinah\n- Makan 3x sehari menu Indonesia\n- Muthawwif berpengalaman\n- Perlengkapan umroh eksklusif"
				sampleFacilitiesExc := "- Paspor & suntik meningitis\n- Keperluan pribadi / laundry\n- Kelebihan bagasi"
				sampleHotel := "Makkah: Hotel Bintang 4 (Walking distance) | Madinah: Hotel Bintang 4"
				sampleFlight := "Direct flight Jakarta - Jeddah"
				sampleTerms := "1. DP Rp 5.000.000 saat pendaftaran.\n2. Pelunasan H-30 sebelum keberangkatan.\n3. Paspor berlaku minimal 7 bulan."

				pkg := &repository.Package{
					TenantID:           tenant.ID,
					Name:               "Paket Umroh Reguler 9 Hari (Contoh)",
					Description:        &sampleDesc,
					Price:              &samplePrice,
					DepartureDate:      &depDate,
					Quota:              &sampleQuota,
					Status:             "draft",
					FacilitiesIncluded: &sampleFacilitiesInc,
					FacilitiesExcluded: &sampleFacilitiesExc,
					HotelInfo:          &sampleHotel,
					FlightInfo:         &sampleFlight,
					TermsConditions:    &sampleTerms,
				}
				_ = s.packageRepo.Create(ctx, tenant.ID, pkg)
			}
		}

		if s.faqRepo != nil {
			faqs, err := s.faqRepo.ListByTenantID(ctx, tenant.ID, false)
			if err == nil && len(faqs) == 0 {
				defaultFaqs := []struct {
					q string
					a string
				}{
					{
						q: "Apa saja persyaratan dokumen untuk pendaftaran umroh?",
						a: "Persyaratan umum meliputi: Paspor asli yang masih berlaku minimal 7 bulan dengan nama minimal 2 kata, Buku Kuning (Meningitis), KTP, KK, dan pas foto terbaru latar belakang putih.",
					},
					{
						q: "Bagaimana cara melakukan pembayaran dan pelunasan?",
						a: "Pembayaran dapat dilakukan melalui transfer rekening resmi biro travel kami. Uang muka (DP) disetorkan saat pendaftaran dan pelunasan maksimal 30 hari sebelum jadwal keberangkatan.",
					},
					{
						q: "Apakah jamaah lansia atau yang membutuhkan kursi roda didampingi?",
						a: "Ya, tim muthawwif dan perwakilan kami di tanah suci siap membantu jamaah yang membutuhkan layanan khusus atau kursi roda demi kelancaran dan kenyamanan ibadah Anda.",
					},
				}
				for i, item := range defaultFaqs {
					_ = s.faqRepo.Create(ctx, tenant.ID, &repository.FAQ{
						TenantID:     tenant.ID,
						Question:     item.q,
						Answer:       item.a,
						DisplayOrder: i + 1,
						IsActive:     true,
					})
				}
			}
		}
	}

	now := time.Now()
	return s.pvRepo.UpdateStatus(ctx, pv.ID, "approved", nil, &staffUserID, &now)
}

func (s *subscriptionService) RejectVerification(ctx context.Context, id uint64, reason string, staffUserID uint64) error {
	pv, err := s.pvRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if pv.Status != "pending" {
		return ErrVerificationAlreadyDone
	}

	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		return ErrRejectionReasonRequired
	}

	now := time.Now()
	return s.pvRepo.UpdateStatus(ctx, pv.ID, "rejected", &trimmedReason, &staffUserID, &now)
}
