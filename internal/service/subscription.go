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
	ErrAnotherInvoiceOpen      = errors.New("masih ada tagihan lain yang menunggu pembayaran; unggah bukti transfer pada tagihan tersebut")
	// ErrVerificationChanged: the invoice plan/amount differ from what the staff member reviewed.
	ErrVerificationChanged = errors.New("Tagihan sudah diubah oleh travel. Muat ulang lalu periksa lagi.")
	// ErrPlanNotAvailable: the plan is hidden (pricing_plans.is_public = FALSE) and is not the travel's own plan.
	ErrPlanNotAvailable = errors.New("Paket ini tidak tersedia.")
	// ErrInvoiceNoLongerValid: a rejected invoice cannot be reopened because its plan, price or coupon no
	// longer holds under today's rules (answered 409).
	ErrInvoiceNoLongerValid = errors.New("Tagihan ini sudah tidak berlaku. Buat tagihan baru dari halaman Langganan.")
	// ErrInvoiceBusy: another request of the same travel is still creating or reopening an invoice
	// (answered 409; the travel simply tries again).
	ErrInvoiceBusy = errors.New("Tagihan sedang diproses. Coba lagi sebentar lagi.")
)

// invoiceLocker is implemented by the MySQL payment verification repository (LockTenantInvoices).
type invoiceLocker interface {
	LockTenantInvoices(ctx context.Context, tenantID uint64) (func(), error)
}

// subscriptionChangeChecker is implemented by the MySQL payment verification repository.
type subscriptionChangeChecker interface {
	SubscriptionChangedSince(ctx context.Context, tenantID uint64, since time.Time) (bool, error)
}

// lockTenantInvoices serializes invoice-opening requests of one travel (bug hunt putaran 5): without it,
// two concurrent requests could both see "no open invoice" and leave two pending invoices, each extending
// the subscription when approved. Repositories without the lock (test doubles) run unlocked.
func (s *subscriptionService) lockTenantInvoices(ctx context.Context, tenantID uint64) (func(), error) {
	l, ok := s.pvRepo.(invoiceLocker)
	if !ok {
		return func() {}, nil
	}
	unlock, err := l.LockTenantInvoices(ctx, tenantID)
	if errors.Is(err, repository.ErrInvoiceLockTimeout) {
		return nil, ErrInvoiceBusy
	}
	return unlock, err
}

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
	// IsDemo: the showcase travel (demo.klikumroh.id); the dashboard shows a demo ribbon.
	IsDemo bool `json:"is_demo"`
}

// SubscriptionService defines business logic for tenant subscriptions and payment verifications.
type SubscriptionService interface {
	GetSubscriptionInfo(ctx context.Context, tenantID uint64) (*TenantSubscriptionInfo, error)
	GetPaymentVerificationByID(ctx context.Context, tenantID uint64, verificationID uint64) (*repository.PaymentVerification, error)
	CreateRenewalRequest(ctx context.Context, tenantID uint64, planID uint64, couponCode *string, proofURL *string) (*repository.PaymentVerification, error)
	UploadRenewalProof(ctx context.Context, tenantID uint64, verificationID uint64, fileBytes []byte) (string, error)
	ListStaffVerifications(ctx context.Context, statusFilter string, tenantID ...uint64) ([]repository.PaymentVerification, error)
	ApproveVerification(ctx context.Context, id uint64, staffUserID uint64) error
	ApproveVerificationExpecting(ctx context.Context, id uint64, staffUserID uint64, expect ApprovalExpectation) error
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
	// Affiliator KlikUmroh commission on approval (optional, see SetAffiliatorRecorder).
	affiliators AffiliatorCommissionRecorder
}

// SetAffiliatorRecorder enables affiliator commissions on payment approval. Wired in main via a type assertion.
func (s *subscriptionService) SetAffiliatorRecorder(r AffiliatorCommissionRecorder) {
	s.affiliators = r
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
		IsDemo:                tenant.IsDemo,
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
		for i := range history {
			HideInvoiceReviewer(&history[i])
		}
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

	// The open-invoice check below and the insert/update at the end run under the tenant's invoice lock.
	unlock, err := s.lockTenantInvoices(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	defer unlock()

	existingHistory, err := s.pvRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	var pending *repository.PaymentVerification
	for i := range existingHistory {
		if existingHistory[i].Status == "pending" {
			pending = &existingHistory[i]
			break
		}
	}
	// A hidden plan is only for the travel already on it (renewal), or the plan staff put on its open invoice.
	if plan.Hidden && (pending == nil || pending.PlanID != plan.ID) {
		var current *uint64
		if tenant, err := s.tenantRepo.GetByID(ctx, tenantID); err == nil && tenant != nil {
			current = tenant.CurrentPlanID
		} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		if !PlanAvailableToTravel(plan, current) {
			return nil, ErrPlanNotAvailable
		}
	}

	var coupon *repository.Coupon
	if couponCode != nil && strings.TrimSpace(*couponCode) != "" {
		c, err := s.couponService.Validate(ctx, strings.TrimSpace(*couponCode), planID)
		if err != nil {
			return nil, err
		}
		if c.AffiliatorID != nil {
			allowed, err := s.affiliatorCouponAllowed(ctx, tenantID, c, existingHistory)
			if err != nil {
				return nil, err
			}
			if !allowed {
				return nil, ErrAffiliatorCouponSignupOnly
			}
		}
		var openID uint64
		if pending != nil {
			openID = pending.ID // the invoice this request updates does not count against the coupon
		}
		if err := s.couponUsedByTenant(ctx, tenantID, c, existingHistory, openID, true); err != nil {
			return nil, err
		}
		coupon = c
	} else if pending != nil && pending.CouponCode != nil {
		// A travel that has not paid yet and changes plan keeps the affiliator coupon of its signup
		// invoice (the plan picker does not send it again). Same rule as approval, so it still applies
		// after the affiliator replaced its code.
		if c, err := s.couponRepo.FindByCode(ctx, *pending.CouponCode); err == nil && c.AffiliatorID != nil &&
			(c.PlanID == nil || *c.PlanID == planID) && s.couponHonoredAtApproval(ctx, pending, c) == nil {
			allowed, err := s.affiliatorCouponCarryAllowed(ctx, tenantID, c, existingHistory)
			if err != nil {
				return nil, err
			}
			if allowed {
				coupon = c
			}
		}
	}

	var validCouponCode *string
	if coupon != nil {
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
		var excludeID uint64
		if pending != nil {
			excludeID = pending.ID
		}
		uniqueCode = pickUniqueCode(ctx, s.pvRepo, discountedAmount, excludeID, 0)
		finalAmount = discountedAmount + float64(uniqueCode)
	}

	// An existing pending verification is updated instead of creating a second open invoice.
	if pending != nil {
		existing := pending

		// Same plan, price, and coupon: the billed amount is unchanged, so keep the unique code
		// and any proof already uploaded. Only attach a new proof if this request carries one.
		if existing.PlanID == planID && existing.Amount == baseAmount && sameCouponCode(existing.CouponCode, validCouponCode) {
			if proofURL != nil {
				if err := s.pvRepo.UpdateProofURL(ctx, tenantID, existing.ID, *proofURL); err != nil {
					if errors.Is(err, repository.ErrStatusConflict) {
						return nil, ErrVerificationNotPending // approved or rejected meanwhile
					}
					return nil, err
				}
				existing.ProofURL = proofURL
				proofAmount := existing.FinalAmount
				existing.ProofFinalAmount = &proofAmount
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
		existing.ProofFinalAmount = nil
		if proofURL != nil {
			proofAmount := finalAmount
			existing.ProofFinalAmount = &proofAmount
		}
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
	// Reopening a rejected invoice while the travel already has another one waiting would leave two open
	// invoices; approving both would extend the subscription twice. The proof belongs on the open one.
	reopenCheck := func() error {
		history, err := s.pvRepo.ListByTenant(ctx, tenantID)
		if err != nil {
			return err
		}
		for i := range history {
			if history[i].ID != pv.ID && history[i].Status == "pending" {
				return ErrAnotherInvoiceOpen
			}
		}
		return s.rejectedInvoiceStillValid(ctx, pv, history)
	}
	if pv.Status == "rejected" {
		// Checked before the image work (fast answer), and again under the invoice lock right before the
		// reopen (see below).
		if err := reopenCheck(); err != nil {
			return "", err
		}
	}

	fileName := uuid.New().String() + ".webp"
	relPath := fmt.Sprintf("/uploads/%d/subscription-proofs/%s", tenantID, fileName)
	// Private: served by /api/dashboard/files and /api/staff/files, never /uploads.
	absPath := util.PrivateUploadAbsPath(relPath)

	if err := util.ConvertAndSaveWebP(fileBytes, absPath, 1600, 80); err != nil {
		return "", err
	}

	if pv.Status == "rejected" {
		unlock, err := s.lockTenantInvoices(ctx, tenantID)
		if err != nil {
			_ = os.Remove(absPath)
			return "", err
		}
		defer unlock()
		if err := reopenCheck(); err != nil {
			_ = os.Remove(absPath)
			return "", err
		}
		if err := s.pvRepo.ResetToPendingWithProof(ctx, tenantID, verificationID, relPath); err != nil {
			_ = os.Remove(absPath)
			if errors.Is(err, repository.ErrStatusConflict) {
				return "", ErrVerificationNotPending // no longer rejected (changed meanwhile)
			}
			return "", err
		}
	} else {
		if err := s.pvRepo.UpdateProofURL(ctx, tenantID, verificationID, relPath); err != nil {
			_ = os.Remove(absPath)
			if errors.Is(err, repository.ErrStatusConflict) {
				return "", ErrVerificationNotPending // approved or rejected meanwhile
			}
			return "", err
		}
	}
	pv.ProofURL = &relPath
	proofAmount := pv.FinalAmount
	pv.ProofFinalAmount = &proofAmount
	s.notifyProofUploaded(ctx, pv)

	return relPath, nil
}

// rejectedInvoiceStillValid decides whether a rejected invoice may be reopened by a new transfer proof.
// The invoice keeps its old price, coupon and unique code, so it is only reopened when all of them still
// hold under today's rules; otherwise ErrInvoiceNoLongerValid and the travel makes a new invoice:
//   - the plan still exists, is still available to the travel (public, or its own current plan), its
//     price equals the invoice amount, and it was not edited after the rejection (the period is read from
//     the plan at approval and is not stored on the invoice, so any later edit could change what the
//     invoice delivers);
//   - the coupon, if any, is usable today: active (or a replaced code of a still-active affiliator, as at
//     approval), not past its last day (WIB), uses left, valid for the
//     plan, not already used by this travel, and an affiliator coupon only before the travel's first
//     approved payment (same carry rule as a plan change on the open signup invoice);
//   - the total does not collide with another open invoice (the unique code must identify one invoice).
func (s *subscriptionService) rejectedInvoiceStillValid(ctx context.Context, pv *repository.PaymentVerification, history []repository.PaymentVerification) error {
	// The subscription moved on after this invoice (bug hunt putaran 5): a later invoice was approved, or
	// staff activated/extended the subscription by hand after the rejection (manual changes no longer
	// cancel rejected invoices, so their real rejection stays in the billing history). Reopening the old
	// invoice would extend the subscription a second time.
	for i := range history {
		if history[i].ID > pv.ID && history[i].Status == "approved" {
			return ErrInvoiceNoLongerValid
		}
	}
	if checker, ok := s.pvRepo.(subscriptionChangeChecker); ok {
		since := pv.CreatedAt
		if pv.ReviewedAt != nil {
			since = *pv.ReviewedAt
		}
		changed, err := checker.SubscriptionChangedSince(ctx, pv.TenantID, since)
		if err != nil {
			return err
		}
		if changed {
			return ErrInvoiceNoLongerValid
		}
	}

	plan, err := s.planRepo.GetByID(ctx, pv.PlanID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrInvoiceNoLongerValid
		}
		return err
	}
	if math.Round(plan.Price*100) != math.Round(pv.Amount*100) {
		return ErrInvoiceNoLongerValid
	}
	if pv.ReviewedAt != nil && plan.UpdatedAt.After(*pv.ReviewedAt) {
		return ErrInvoiceNoLongerValid
	}
	if plan.Hidden {
		var current *uint64
		if tenant, err := s.tenantRepo.GetByID(ctx, pv.TenantID); err == nil && tenant != nil {
			current = tenant.CurrentPlanID
		} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return err
		}
		if !PlanAvailableToTravel(plan, current) {
			return ErrInvoiceNoLongerValid
		}
	}

	if pv.CouponCode != nil && strings.TrimSpace(*pv.CouponCode) != "" {
		coupon, err := s.couponRepo.FindByCode(ctx, strings.TrimSpace(*pv.CouponCode))
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return ErrInvoiceNoLongerValid
			}
			return err
		}
		if coupon.Status != "active" {
			// Same as approval: an affiliator that replaced its code still honors the old one while the
			// affiliator itself is active; a platform coupon switched off by staff is not honored.
			if coupon.AffiliatorID == nil || s.affiliators == nil {
				return ErrInvoiceNoLongerValid
			}
			active, err := s.affiliators.IsAffiliatorActive(ctx, *coupon.AffiliatorID)
			if err != nil {
				return err
			}
			if !active {
				return ErrInvoiceNoLongerValid
			}
		}
		if coupon.ExpiresAt != nil && time.Now().After(couponEndOfDay(*coupon.ExpiresAt)) {
			return ErrInvoiceNoLongerValid
		}
		if coupon.MaxUses != nil && coupon.UsedCount >= *coupon.MaxUses {
			return ErrInvoiceNoLongerValid
		}
		if coupon.PlanID != nil && *coupon.PlanID != plan.ID {
			return ErrInvoiceNoLongerValid
		}
		if coupon.AffiliatorID != nil {
			allowed, err := s.affiliatorCouponCarryAllowed(ctx, pv.TenantID, coupon, history)
			if err != nil {
				return err
			}
			if !allowed {
				return ErrInvoiceNoLongerValid
			}
		}
		if err := s.couponUsedByTenant(ctx, pv.TenantID, coupon, history, pv.ID, true); err != nil {
			if errors.Is(err, ErrCouponUsedByTenant) {
				return ErrInvoiceNoLongerValid
			}
			return err
		}
		// The discount must be the coupon's current one: the invoice amount is not repriced on reopen.
		expected := math.Round(plan.Price - (coupon.DiscountPercentage/100.0)*plan.Price)
		if expected < 0 {
			expected = 0
		}
		if math.Round((pv.FinalAmount-float64(pv.UniqueCode))*100) != math.Round(expected*100) {
			return ErrInvoiceNoLongerValid
		}
	} else if math.Round((pv.FinalAmount-float64(pv.UniqueCode))*100) != math.Round(plan.Price*100) {
		return ErrInvoiceNoLongerValid
	}

	if pv.FinalAmount > 0 {
		if lister, ok := s.pvRepo.(pendingAmountLister); ok {
			taken, err := lister.PendingFinalAmounts(ctx, pv.FinalAmount, pv.FinalAmount, pv.ID)
			if err != nil {
				return err
			}
			for _, v := range taken {
				if math.Round(v*100) == math.Round(pv.FinalAmount*100) {
					return ErrInvoiceNoLongerValid
				}
			}
		}
	}
	return nil
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

// ApprovalExpectation is what the staff member saw when clicking approve. A nil field is not checked.
type ApprovalExpectation struct {
	PlanID      *uint64
	FinalAmount *float64
}

// checkApprovable refuses an invoice that cannot be approved as it stands: no transfer proof while money
// is owed, or a plan/amount that no longer matches what the staff member reviewed (the travel can change
// an open invoice with CreateRenewalRequest at any time).
func checkApprovable(pv *repository.PaymentVerification, expect ApprovalExpectation) error {
	if expect.PlanID != nil && *expect.PlanID != pv.PlanID {
		return ErrVerificationChanged
	}
	// Amounts are DECIMAL(15,2): compare in whole cents.
	if expect.FinalAmount != nil && math.Round(*expect.FinalAmount*100) != math.Round(pv.FinalAmount*100) {
		return ErrVerificationChanged
	}
	if pv.FinalAmount > 0 && (pv.ProofURL == nil || strings.TrimSpace(*pv.ProofURL) == "") {
		return ErrProofRequired
	}
	return nil
}

func (s *subscriptionService) ApproveVerification(ctx context.Context, id uint64, staffUserID uint64) error {
	return s.ApproveVerificationExpecting(ctx, id, staffUserID, ApprovalExpectation{})
}

// ApproveVerificationExpecting approves a pending invoice, refusing it when it has no proof while money is
// owed (ErrProofRequired) or when its plan/amount differ from expect (ErrVerificationChanged).
func (s *subscriptionService) ApproveVerificationExpecting(ctx context.Context, id uint64, staffUserID uint64, expect ApprovalExpectation) error {
	pv, err := s.pvRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if pv.Status != "pending" {
		return ErrVerificationAlreadyDone
	}
	if err := checkApprovable(pv, expect); err != nil {
		return err
	}
	// Values (not the pointer) the checks above passed on, compared again after the claim.
	seenPlanID, seenFinalAmount := pv.PlanID, pv.FinalAmount

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

	// Re-read the row now that it is claimed: the travel may have replaced the plan/amount/proof between
	// the read above and the claim (ReplaceDetails only touches pending rows, so after the claim the row
	// is frozen). Everything below (period, coupon, commission) uses this final row.
	claimed, err := s.pvRepo.GetByID(ctx, pv.ID)
	if err != nil {
		s.releaseApprovalClaim(ctx, pv.ID)
		return err
	}
	if claimed.PlanID != seenPlanID || math.Round(claimed.FinalAmount*100) != math.Round(seenFinalAmount*100) {
		s.releaseApprovalClaim(ctx, pv.ID)
		return ErrVerificationChanged
	}
	if err := checkApprovable(claimed, expect); err != nil {
		s.releaseApprovalClaim(ctx, pv.ID)
		return err
	}
	pv = claimed

	plan, err := s.planRepo.GetByID(ctx, pv.PlanID)
	if err != nil {
		s.releaseApprovalClaim(ctx, pv.ID)
		return err
	}

	// Consume the coupon before anything else changes. The use is only counted at approval, so several
	// pending invoices can carry a coupon that has one use left: the conditional increment lets exactly
	// that many through and stops the rest here, and staff can then remove the coupon or reject.
	var consumedCouponID uint64
	if pv.CouponCode != nil && strings.TrimSpace(*pv.CouponCode) != "" {
		coupon, err := s.couponRepo.FindByCode(ctx, *pv.CouponCode)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			// A failed lookup must not approve the discounted price without counting the coupon.
			s.releaseApprovalClaim(ctx, pv.ID)
			return err
		}
		if err == nil && coupon != nil {
			if err := s.couponHonoredAtApproval(ctx, pv, coupon); err != nil {
				s.releaseApprovalClaim(ctx, pv.ID)
				return err
			}
			if err := s.couponRepo.IncrementUsedCount(ctx, coupon.ID); err != nil {
				s.releaseApprovalClaim(ctx, pv.ID)
				if errors.Is(err, repository.ErrCouponLimitReached) {
					return ErrCouponExhausted
				}
				return err
			}
			consumedCouponID = coupon.ID
		}
	}
	// abort undoes the claim (and the coupon use) when a later step fails, so the invoice can be retried.
	abort := func() {
		s.releaseApprovalClaim(ctx, pv.ID)
		if consumedCouponID != 0 {
			_ = s.couponRepo.ReleaseUsedCount(ctx, consumedCouponID)
		}
	}

	// Read the tenant after the claim so the expiry is based on the latest value.
	tenant, err := s.tenantRepo.GetByID(ctx, pv.TenantID)
	if err != nil {
		abort()
		return err
	}

	wasPending := tenant.Status == "pending"

	// Non-greedy expiry calculation
	baseTime := time.Now().In(jakartaLocation) // month arithmetic is in WIB (see addMonthsClamped)
	if tenant.SubscriptionExpiresAt != nil && tenant.SubscriptionExpiresAt.After(baseTime) {
		baseTime = *tenant.SubscriptionExpiresAt
	}
	newExpiry := addMonthsClamped(baseTime, plan.PeriodMonths)

	// Update tenant subscription and set status to active
	if err := s.tenantRepo.UpdateSubscription(ctx, pv.TenantID, pv.PlanID, newExpiry, "active"); err != nil {
		abort()
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

	// Audit trail of the coupon use counted above.
	if consumedCouponID != 0 {
		_ = s.couponRepo.RecordRedemption(ctx, consumedCouponID, pv.TenantID)
	}

	// Commission for the affiliator that brought this travel (logged on failure, never blocks the approval).
	if s.affiliators != nil {
		s.affiliators.RecordCommission(ctx, pv, now)
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
			// Same JSON the package editor writes (city, hotel name, stars; airline and route), so the editor and
			// the website show plain example values instead of one unparsed line.
			sampleHotel := `[{"city":"Makkah","name":"Elaf Ajyad","stars":4},{"city":"Madinah","name":"Al Aqeeq Madinah","stars":4}]`
			sampleFlight := `{"airline":"Saudia","route":"Jakarta - Jeddah (langsung)"}`
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
	CancelOpenForTenant(ctx context.Context, tenantID uint64, reason string, staffUserID uint64) (int64, error)
}

// HandleManualSubscriptionChange runs the side effects of a payment approval when staff activate or
// extend a subscription by hand: open (pending) invoices are cancelled so the travel does not pay twice (rejected ones keep their reason; reopening them is refused by rejectedInvoiceStillValid), a newly
// activated travel gets its starter content, and the travel's admins are notified.
func (s *subscriptionService) HandleManualSubscriptionChange(ctx context.Context, tenantID uint64, wasPending bool, planName string, expiresAt time.Time, staffUserID uint64) {
	if c, ok := s.pvRepo.(pendingInvoiceCanceller); ok {
		if n, err := c.CancelOpenForTenant(ctx, tenantID, ManualCancelReason, staffUserID); err != nil {
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
// couponHonoredAtApproval decides whether the coupon on a pending invoice still counts when staff approve
// it (keputusan pendiri 4 Okt 2026). The price was locked when the invoice was made, so:
//   - expiry: honored when the invoice was created on or before the coupon's last day (the travel acted in
//     time), refused otherwise;
//   - inactive platform coupon (switched off by staff, e.g. leaked or abused): refused;
//   - inactive affiliator coupon: honored when the affiliator is still active (it only replaced its code),
//     refused when the affiliator itself was deactivated.
//
// A refusal leaves the invoice pending; staff remove or change the coupon (repricing it) or reject.
func (s *subscriptionService) couponHonoredAtApproval(ctx context.Context, pv *repository.PaymentVerification, coupon *repository.Coupon) error {
	if coupon.Status != "active" {
		if coupon.AffiliatorID == nil || s.affiliators == nil {
			return ErrCouponInactive
		}
		active, err := s.affiliators.IsAffiliatorActive(ctx, *coupon.AffiliatorID)
		if err != nil {
			return err
		}
		if !active {
			return ErrCouponInactive
		}
	}
	if coupon.ExpiresAt != nil {
		// Same end-of-day rule (WIB) as couponService.Validate.
		if pv.CreatedAt.After(couponEndOfDay(*coupon.ExpiresAt)) {
			return ErrCouponExpired
		}
	}
	// One coupon per travel, checked again here so two invoices carrying the same coupon cannot both be
	// approved: an invoice approved meanwhile (or claimed by a concurrent approval) counts against it.
	history, err := s.pvRepo.ListByTenant(ctx, pv.TenantID)
	if err != nil {
		return err
	}
	return s.couponUsedByTenant(ctx, pv.TenantID, coupon, history, pv.ID, false)
}

// affiliatorCouponAllowed: an affiliator coupon discounts only a travel's first payment (keputusan
// pendiri: "pembayaran pertama" = the first payment staff approve), and only the coupon of the affiliator
// the travel signed up through, so a travel cannot pick up another affiliator's discount from the dashboard.
func (s *subscriptionService) affiliatorCouponAllowed(ctx context.Context, tenantID uint64, coupon *repository.Coupon, history []repository.PaymentVerification) (bool, error) {
	if coupon.AffiliatorID == nil {
		return true, nil
	}
	for i := range history {
		if history[i].Status == "approved" {
			return false, nil
		}
	}
	if s.affiliators == nil {
		return false, nil
	}
	tenantAffiliator, err := s.affiliators.TenantAffiliatorID(ctx, tenantID)
	if err != nil {
		return false, err
	}
	return tenantAffiliator != nil && *tenantAffiliator == *coupon.AffiliatorID, nil
}

// AffiliatorCouponAllowedForTenant is affiliatorCouponAllowed for the dashboard coupon check
// (GET /api/dashboard/coupons/validate), which has no payment history at hand.
func (s *subscriptionService) AffiliatorCouponAllowedForTenant(ctx context.Context, tenantID uint64, coupon *repository.Coupon) (bool, error) {
	history, err := s.pvRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return false, err
	}
	return s.affiliatorCouponAllowed(ctx, tenantID, coupon, history)
}

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

	// Keep the coupon already on the invoice under the same rule as approval (couponHonoredAtApproval:
	// expiry judged against the invoice date, a replaced affiliator code still honored), plus the new
	// plan. If it no longer applies, refuse instead of silently repricing to the full amount: staff then
	// remove or change the coupon explicitly (UpdateVerificationCoupon).
	validCouponCode := pv.CouponCode
	if pv.CouponCode != nil && strings.TrimSpace(*pv.CouponCode) != "" {
		coupon, err := s.couponRepo.FindByCode(ctx, *pv.CouponCode)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrCouponNotFound
			}
			return nil, err
		}
		if coupon.PlanID != nil && *coupon.PlanID != newPlan.ID {
			return nil, ErrCouponPlanMismatch
		}
		if err := s.couponHonoredAtApproval(ctx, pv, coupon); err != nil {
			return nil, err
		}
		discount := (coupon.DiscountPercentage / 100.0) * baseAmount
		discountedAmount = math.Round(baseAmount - discount)
		if discountedAmount < 0 {
			discountedAmount = 0
		}
		validCouponCode = &coupon.Code
	}

	uniqueCode := pv.UniqueCode
	finalAmount := discountedAmount
	if discountedAmount > 0 {
		uniqueCode = pickUniqueCode(ctx, s.pvRepo, discountedAmount, pv.ID, uniqueCode)
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
		history, err := s.pvRepo.ListByTenant(ctx, pv.TenantID)
		if err != nil {
			return nil, err
		}
		// Same rules as the travel's own billing page: an affiliator coupon only on the first payment of a
		// travel brought by that affiliator (the commission goes to the travel's own affiliator), and a
		// coupon once per travel.
		if coupon.AffiliatorID != nil {
			allowed := false
			if sameCouponCode(pv.CouponCode, &coupon.Code) {
				allowed, err = s.affiliatorCouponCarryAllowed(ctx, pv.TenantID, coupon, history)
			} else {
				allowed, err = s.affiliatorCouponAllowed(ctx, pv.TenantID, coupon, history)
			}
			if err != nil {
				return nil, err
			}
			if !allowed {
				return nil, ErrAffiliatorCouponSignupOnly
			}
		}
		if err := s.couponUsedByTenant(ctx, pv.TenantID, coupon, history, pv.ID, true); err != nil {
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
		uniqueCode = pickUniqueCode(ctx, s.pvRepo, discountedAmount, pv.ID, uniqueCode)
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

// couponUsedByTenant applies "one coupon per travel" (keputusan pendiri 5 Okt 2026): ErrCouponUsedByTenant
// when the travel already has an approved payment with this coupon (coupon_redemptions, or an approved
// invoice carrying the code) or, when includePending, another open invoice of the travel carries it.
// excludeID is the invoice being created, edited or approved, which never counts against itself.
func (s *subscriptionService) couponUsedByTenant(ctx context.Context, tenantID uint64, coupon *repository.Coupon, history []repository.PaymentVerification, excludeID uint64, includePending bool) error {
	redeemed, err := s.couponRepo.HasTenantRedeemed(ctx, tenantID, coupon.ID)
	if err != nil {
		return err
	}
	if redeemed {
		return ErrCouponUsedByTenant
	}
	for i := range history {
		h := history[i]
		if h.ID == excludeID || h.TenantID != tenantID || !sameCouponCode(h.CouponCode, &coupon.Code) {
			continue
		}
		if h.Status == "approved" || (includePending && h.Status == "pending") {
			return ErrCouponUsedByTenant
		}
	}
	return nil
}

// CouponUsableByTenant is the "one coupon per travel" check for the dashboard coupon check
// (GET /api/dashboard/coupons/validate). The travel's open invoice is the one the coupon would go on, so
// it does not count against the coupon.
func (s *subscriptionService) CouponUsableByTenant(ctx context.Context, tenantID uint64, coupon *repository.Coupon) error {
	history, err := s.pvRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return err
	}
	var openID uint64
	for i := range history {
		if history[i].Status == "pending" {
			openID = history[i].ID
			break
		}
	}
	return s.couponUsedByTenant(ctx, tenantID, coupon, history, openID, true)
}

// affiliatorCouponCarryAllowed: the affiliator coupon already on the travel's open signup invoice stays
// when the travel changes plan before its first approved payment. It is honored also when the signup
// was not attributed to the affiliator (e.g. refused by the self-referral guard): the founder rule is
// that the coupon discount still applies then, only the commission is refused. It is not honored when
// the travel is attributed to a different affiliator.
func (s *subscriptionService) affiliatorCouponCarryAllowed(ctx context.Context, tenantID uint64, coupon *repository.Coupon, history []repository.PaymentVerification) (bool, error) {
	if coupon.AffiliatorID == nil {
		return true, nil
	}
	for i := range history {
		if history[i].Status == "approved" {
			return false, nil
		}
	}
	if s.affiliators == nil {
		return false, nil
	}
	tenantAffiliator, err := s.affiliators.TenantAffiliatorID(ctx, tenantID)
	if err != nil {
		return false, err
	}
	return tenantAffiliator == nil || *tenantAffiliator == *coupon.AffiliatorID, nil
}

// pendingAmountLister is implemented by the MySQL payment verification repository (see
// PendingFinalAmounts); test doubles without it get a plain random code.
type pendingAmountLister interface {
	PendingFinalAmounts(ctx context.Context, minAmount, maxAmount float64, excludeID uint64) ([]float64, error)
}

// pickUniqueCode returns a transfer code (100-999) whose total (amount + code) no other open invoice has,
// so a bank statement line matches exactly one invoice. keep is the invoice's current code, kept when it
// is still unique. When every code is taken (or the lookup fails) a random code is used, as before.
func pickUniqueCode(ctx context.Context, repo repository.PaymentVerificationRepository, amount float64, excludeID uint64, keep int) int {
	lister, ok := repo.(pendingAmountLister)
	if !ok {
		if keep >= 100 && keep <= 999 {
			return keep
		}
		return rand.Intn(900) + 100
	}
	taken, err := lister.PendingFinalAmounts(ctx, amount+100, amount+999, excludeID)
	if err != nil {
		log.Printf("[Subscription] cannot check open invoice totals for a unique code: %v", err)
		if keep >= 100 && keep <= 999 {
			return keep
		}
		return rand.Intn(900) + 100
	}
	used := make(map[int64]bool, len(taken))
	for _, v := range taken {
		used[int64(math.Round(v*100))] = true
	}
	free := func(code int) bool { return !used[int64(math.Round((amount+float64(code))*100))] }
	if keep >= 100 && keep <= 999 && free(keep) {
		return keep
	}
	start := rand.Intn(900)
	for i := 0; i < 900; i++ {
		code := 100 + (start+i)%900
		if free(code) {
			return code
		}
	}
	return rand.Intn(900) + 100
}

// HideInvoiceReviewer removes which KlikUmroh staff member reviewed an invoice before it is sent to the
// travel (bug hunt putaran 5): staff identity (id and name) is internal. Status, reason and review time
// stay.
func HideInvoiceReviewer(pv *repository.PaymentVerification) {
	if pv == nil {
		return
	}
	pv.ReviewedBy = nil
	pv.ReviewedByName = nil
}
