package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
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
	UpdateVerificationPlan(ctx context.Context, verificationID uint64, newPlanID uint64, staffUserID uint64) (*repository.PaymentVerification, error)
	UpdateVerificationCoupon(ctx context.Context, verificationID uint64, couponCode *string, staffUserID uint64) (*repository.PaymentVerification, error)
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
	// Notifications (optional, see SetNotifier in subscription_notify.go).
	notif     NotificationService
	admins    repository.AdminUserRepository
	staff     StaffLister
	reminders repository.SubscriptionReminderRepository
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
			info.GracePeriodDaysRemaining = util.SubscriptionGraceDays
			info.IsSuspended = false
		} else {
			info.IsActive = false
			info.DaysRemaining = 0
			info.IsSubscriptionExpired = true

			// Grace period calculation (7 days after expiry)
			graceEnd := util.SubscriptionGraceEnd(*tenant.SubscriptionExpiresAt)
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
		// If no expiry date set, consider active if status is 'active'
		info.IsActive = tenant.Status == "active"
		info.DaysRemaining = 0
		info.IsSubscriptionExpired = false
		info.GracePeriodDaysRemaining = util.SubscriptionGraceDays
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
		if existingHistory[i].Status != "pending" {
			continue
		}
		existing := &existingHistory[i]

		// Same plan, price, and coupon: the billed amount is unchanged, so keep the unique code
		// and any proof already uploaded. Only attach a new proof if this request carries one.
		if existing.PlanID == planID && existing.Amount == baseAmount && sameCouponCode(existing.CouponCode, validCouponCode) {
			if proofURL != nil {
				if err := s.pvRepo.UpdateProofURL(ctx, tenantID, existing.ID, *proofURL); err != nil {
					return nil, err
				}
				existing.ProofURL = proofURL
				s.notifyProofUploaded(ctx, existing)
			}
			return existing, nil
		}

		// The billed amount changes: an old transfer proof no longer matches this invoice and must be
		// cleared, otherwise a proof for a cheaper plan could be approved against a pricier one.
		// Only a proof uploaded in this same request (for the new amount) is kept.
		if err := s.pvRepo.ReplaceDetails(ctx, tenantID, existing.ID, planID, validCouponCode, baseAmount, finalAmount, uniqueCode, proofURL); err != nil {
			return nil, mapVerificationConflict(err)
		}
		existing.PlanID = planID
		existing.CouponCode = validCouponCode
		existing.Amount = baseAmount
		existing.FinalAmount = finalAmount
		existing.UniqueCode = uniqueCode
		existing.ProofURL = proofURL
		if proofURL != nil {
			s.notifyProofUploaded(ctx, existing)
		}
		return existing, nil
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
	if proofURL != nil {
		s.notifyProofUploaded(ctx, pv)
	}

	return pv, nil
}

// mapVerificationConflict turns a lost race on a pending invoice (approved/rejected meanwhile) into the
// service-level ErrVerificationAlreadyDone.
func mapVerificationConflict(err error) error {
	if errors.Is(err, repository.ErrStatusConflict) {
		return ErrVerificationAlreadyDone
	}
	return err
}

func sameCouponCode(a, b *string) bool {
	normalize := func(p *string) string {
		if p == nil {
			return ""
		}
		return strings.ToUpper(strings.TrimSpace(*p))
	}
	return normalize(a) == normalize(b)
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
	// Private: served by /api/dashboard/files and /api/staff/files, never /uploads.
	absPath := util.PrivateUploadAbsPath(relPath)

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
		return "", err
	}

	if pv.Status == "rejected" {
		if err := s.pvRepo.ResetToPendingWithProof(ctx, tenantID, verificationID, relPath); err != nil {
			_ = os.Remove(absPath)
			return "", err
		}
	} else {
		if err := s.pvRepo.UpdateProofURL(ctx, tenantID, verificationID, relPath); err != nil {
			_ = os.Remove(absPath)
			return "", err
		}
	}
	pv.ProofURL = &relPath
	s.notifyProofUploaded(ctx, pv)

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

	plan, err := s.planRepo.GetByID(ctx, pv.PlanID)
	if err != nil {
		return err
	}

	// Claim the verification FIRST with a single conditional UPDATE (pending -> approved). Only one of
	// several concurrent approve requests can win, so the subscription is extended and the coupon is
	// counted exactly once. The losers get ErrVerificationAlreadyDone.
	now := time.Now()
	if err := s.pvRepo.TransitionStatus(ctx, pv.ID, "pending", "approved", nil, &staffUserID, &now); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return ErrVerificationAlreadyDone
		}
		return err
	}

	// Read the tenant after the claim so the expiry is based on the latest value.
	tenant, err := s.tenantRepo.GetByID(ctx, pv.TenantID)
	if err != nil {
		s.releaseApprovalClaim(ctx, pv.ID)
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
		s.releaseApprovalClaim(ctx, pv.ID)
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

	title, body := "Pembayaran disetujui", fmt.Sprintf("Paket %s aktif hingga %s. Terima kasih telah memperpanjang langganan KlikUmroh.", plan.Name, formatDateID(newExpiry))
	if wasPending {
		title, body = "Akun travel aktif", fmt.Sprintf("Pembayaran paket %s disetujui. Akun dan website travel Anda aktif hingga %s.", plan.Name, formatDateID(newExpiry))
	}
	s.notifyTenantAdmins(ctx, pv.TenantID, "subscription_approved", title, body, "/settings/subscription")

	// A newly activated travel starts with a sample draft package and standard FAQs.
	if wasPending {
		s.seedStarterContent(ctx, tenant.ID)
	}
	return nil
}

// seedStarterContent gives a newly activated travel a sample draft package and standard FAQs when it
// has none yet (shared by payment approval and manual activation by staff).
func (s *subscriptionService) seedStarterContent(ctx context.Context, tenantID uint64) {
	if s.packageRepo != nil {
		count, err := s.packageRepo.CountByTenant(ctx, tenantID)
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
				TenantID:           tenantID,
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
			_ = s.packageRepo.Create(ctx, tenantID, pkg)
		}
	}

	if s.faqRepo != nil {
		faqs, err := s.faqRepo.ListByTenantID(ctx, tenantID, false)
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
				_ = s.faqRepo.Create(ctx, tenantID, &repository.FAQ{
					TenantID:     tenantID,
					Question:     item.q,
					Answer:       item.a,
					DisplayOrder: i + 1,
					IsActive:     true,
				})
			}
		}
	}
}

// ManualCancelReason is shown on invoices closed because staff changed the subscription manually.
const ManualCancelReason = "Dibatalkan: langganan diaktifkan manual oleh tim KlikUmroh"

type pendingInvoiceCanceller interface {
	CancelPendingForTenant(ctx context.Context, tenantID uint64, reason string, staffUserID uint64) (int64, error)
}

// HandleManualSubscriptionChange runs the side effects of a payment approval when staff activate or
// extend a subscription by hand: open invoices are cancelled (the travel must not pay twice), a newly
// activated travel gets its starter content, and the travel's admins are notified.
func (s *subscriptionService) HandleManualSubscriptionChange(ctx context.Context, tenantID uint64, wasPending bool, planName string, expiresAt time.Time, staffUserID uint64) {
	if c, ok := s.pvRepo.(pendingInvoiceCanceller); ok {
		if n, err := c.CancelPendingForTenant(ctx, tenantID, ManualCancelReason, staffUserID); err != nil {
			log.Printf("[Subscription] tenant %d: cannot cancel open invoices after manual change: %v", tenantID, err)
		} else if n > 0 {
			log.Printf("[Subscription] tenant %d: %d open invoice(s) cancelled after manual change", tenantID, n)
		}
	}
	if wasPending {
		s.seedStarterContent(ctx, tenantID)
	}
	title, body := "Langganan diperbarui", fmt.Sprintf("Tim KlikUmroh memperbarui langganan Anda: paket %s aktif hingga %s.", planName, formatDateID(expiresAt))
	if wasPending {
		title, body = "Akun travel aktif", fmt.Sprintf("Tim KlikUmroh mengaktifkan akun Anda: paket %s aktif hingga %s.", planName, formatDateID(expiresAt))
	}
	s.notifyTenantAdmins(ctx, tenantID, "subscription_approved", title, body, "/settings/subscription")
}

// releaseApprovalClaim puts a claimed verification back to 'pending' when the subscription could not be
// extended, so staff can retry instead of leaving an 'approved' invoice with no activation behind it.
func (s *subscriptionService) releaseApprovalClaim(ctx context.Context, id uint64) {
	_ = s.pvRepo.TransitionStatus(ctx, id, "approved", "pending", nil, nil, nil)
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
	if err := s.pvRepo.TransitionStatus(ctx, pv.ID, "pending", "rejected", &trimmedReason, &staffUserID, &now); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return ErrVerificationAlreadyDone
		}
		return err
	}
	s.notifyTenantAdmins(ctx, pv.TenantID, "subscription_rejected", "Pembayaran perlu diperbaiki",
		fmt.Sprintf("Tagihan #%d: %s. Unggah ulang bukti transfer yang benar.", pv.ID, trimmedReason),
		fmt.Sprintf("/settings/subscription/payment/%d", pv.ID))
	return nil
}

func (s *subscriptionService) UpdateVerificationPlan(ctx context.Context, verificationID uint64, newPlanID uint64, staffUserID uint64) (*repository.PaymentVerification, error) {
	pv, err := s.pvRepo.GetByID(ctx, verificationID)
	if err != nil {
		return nil, err
	}
	if pv.Status != "pending" {
		return nil, ErrVerificationAlreadyDone
	}

	newPlan, err := s.planRepo.GetByID(ctx, newPlanID)
	if err != nil {
		return nil, ErrPlanNotFound
	}

	baseAmount := newPlan.Price
	discountedAmount := baseAmount

	// Revalidate coupon if previously applied
	validCouponCode := pv.CouponCode
	if pv.CouponCode != nil && strings.TrimSpace(*pv.CouponCode) != "" && s.couponService != nil {
		coupon, err := s.couponService.Validate(ctx, *pv.CouponCode, newPlan.ID)
		if err == nil && coupon != nil {
			discount := (coupon.DiscountPercentage / 100.0) * baseAmount
			discountedAmount = math.Round(baseAmount - discount)
			if discountedAmount < 0 {
				discountedAmount = 0
			}
			validCouponCode = &coupon.Code
		} else {
			validCouponCode = nil
			discountedAmount = baseAmount
		}
	}

	uniqueCode := pv.UniqueCode
	finalAmount := discountedAmount
	if discountedAmount > 0 {
		if uniqueCode <= 0 {
			uniqueCode = rand.Intn(900) + 100
		}
		finalAmount = discountedAmount + float64(uniqueCode)
	} else {
		uniqueCode = 0
		finalAmount = 0
	}

	if err := s.pvRepo.UpdateDetails(ctx, pv.ID, newPlan.ID, validCouponCode, baseAmount, finalAmount, uniqueCode, pv.ProofURL); err != nil {
		return nil, mapVerificationConflict(err)
	}

	updatedPV, err := s.pvRepo.GetByID(ctx, pv.ID)
	if err != nil {
		return nil, err
	}

	return updatedPV, nil
}

// UpdateVerificationCoupon allows staff to apply or remove a coupon code on a pending verification.
// The plan stays unchanged; only the coupon and resulting final_amount are updated.
func (s *subscriptionService) UpdateVerificationCoupon(ctx context.Context, verificationID uint64, couponCode *string, staffUserID uint64) (*repository.PaymentVerification, error) {
	pv, err := s.pvRepo.GetByID(ctx, verificationID)
	if err != nil {
		return nil, err
	}
	if pv.Status != "pending" {
		return nil, ErrVerificationAlreadyDone
	}

	plan, err := s.planRepo.GetByID(ctx, pv.PlanID)
	if err != nil {
		return nil, ErrPlanNotFound
	}

	baseAmount := plan.Price
	discountedAmount := baseAmount
	var validCouponCode *string

	// Apply coupon if provided
	if couponCode != nil && strings.TrimSpace(*couponCode) != "" && s.couponService != nil {
		coupon, err := s.couponService.Validate(ctx, strings.TrimSpace(*couponCode), plan.ID)
		if err != nil {
			return nil, err
		}
		discount := (coupon.DiscountPercentage / 100.0) * baseAmount
		discountedAmount = math.Round(baseAmount - discount)
		if discountedAmount < 0 {
			discountedAmount = 0
		}
		code := strings.TrimSpace(*couponCode)
		validCouponCode = &code
	}
	// couponCode == nil means remove coupon (use full price)

	uniqueCode := pv.UniqueCode
	finalAmount := discountedAmount
	if discountedAmount > 0 {
		if uniqueCode <= 0 {
			uniqueCode = rand.Intn(900) + 100
		}
		finalAmount = discountedAmount + float64(uniqueCode)
	} else {
		uniqueCode = 0
		finalAmount = 0
	}

	if err := s.pvRepo.UpdateDetails(ctx, pv.ID, pv.PlanID, validCouponCode, baseAmount, finalAmount, uniqueCode, pv.ProofURL); err != nil {
		return nil, mapVerificationConflict(err)
	}

	updatedPV, err := s.pvRepo.GetByID(ctx, pv.ID)
	if err != nil {
		return nil, err
	}
	return updatedPV, nil
}
