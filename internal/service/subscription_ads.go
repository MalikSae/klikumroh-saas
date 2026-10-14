package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"klikumroh/internal/repository"
)

// Purchase event of KlikUmroh's own Meta Pixel for a travel's first confirmed payment.

// purchaseEventMaxAge: Meta rejects server events older than 7 days. A resent event older than this is sent
// with the current time instead; the click attribution still comes from fbp/fbc.
const purchaseEventMaxAge = 6 * 24 * time.Hour

// SetAdTracking enables the Meta Purchase event on a travel's first confirmed payment. Wired in main via a
// type assertion; either value may be nil.
func (s *subscriptionService) SetAdTracking(repo repository.TenantAdAttributionRepository, tracker PlatformPurchaseTracker) {
	s.adAttribution = repo
	s.purchaseTracker = tracker
}

// purchaseValue is the plan price paid: promo and coupon applied, without the transfer code.
func purchaseValue(pv *repository.PaymentVerification) float64 {
	return pv.FinalAmount - float64(pv.UniqueCode)
}

// buildPurchaseEvent assembles the event of a tenant's first payment pv (plan: the plan it was billed for).
func (s *subscriptionService) buildPurchaseEvent(ctx context.Context, tenant *repository.Tenant, pv *repository.PaymentVerification, plan *repository.PricingPlan, attr *repository.TenantAdAttribution, eventTime time.Time) PlatformPurchaseEvent {
	user := MetaUserData{ExternalID: platformMetaExternalID(tenant.ID)}
	if pv.TenantEmail != nil {
		user.Email = *pv.TenantEmail
	}
	if tenant.WhatsAppNumber != nil {
		user.Phone = *tenant.WhatsAppNumber
	}
	if s.admins != nil {
		if list, err := s.admins.ListByTenant(ctx, tenant.ID); err == nil && len(list) > 0 {
			user.Name = list[0].Name
			if user.Email == "" {
				user.Email = list[0].Email
			}
		}
	}
	applyAttributionToUser(&user, attr)

	tenantID := tenant.ID
	return PlatformPurchaseEvent{
		EventID:     fmt.Sprintf("purchase-pv-%d", pv.ID),
		EventTime:   eventTime,
		User:        user,
		Value:       purchaseValue(pv),
		ContentName: plan.Name,
		ContentID:   fmt.Sprintf("plan-%d", plan.ID),
		OnFailed: func() {
			if err := s.adAttribution.ReleasePurchaseSend(context.Background(), tenantID); err != nil {
				log.Printf("[Subscription] tenant %d: cannot release purchase claim: %v", tenantID, err)
			}
		},
	}
}

// trackPlatformPurchase reports the first confirmed payment of a travel to KlikUmroh's Meta Pixel. It never
// fails the approval. The claim on purchase_event_sent_at makes the event go out at most once. It is only
// taken while Conversions API is configured, and released again when delivery fails;
// ResendPlatformPurchases picks such travels up later.
func (s *subscriptionService) trackPlatformPurchase(ctx context.Context, tenant *repository.Tenant, pv *repository.PaymentVerification, plan *repository.PricingPlan, confirmedAt time.Time) {
	if s.adAttribution == nil || s.purchaseTracker == nil {
		return
	}
	if purchaseValue(pv) <= 0 || !s.purchaseTracker.Enabled(ctx) {
		return
	}
	attr, err := s.adAttribution.Get(ctx, tenant.ID)
	if err != nil {
		// No signup row: a travel from before ad tracking existed. Not an ad conversion.
		if !errors.Is(err, repository.ErrNotFound) {
			log.Printf("[Subscription] tenant %d: cannot read ad attribution: %v", tenant.ID, err)
		}
		return
	}
	claimed, err := s.adAttribution.ClaimPurchaseSend(ctx, tenant.ID)
	if err != nil || !claimed {
		return
	}
	s.purchaseTracker.TrackPurchase(s.buildPurchaseEvent(ctx, tenant, pv, plan, attr, confirmedAt))
}

// PlatformPurchaseResendResult counts what a resend did.
type PlatformPurchaseResendResult struct {
	// Pending is how many confirmed first payments had no delivered Purchase.
	Pending int `json:"pending"`
	Sent    int `json:"sent"`
	Failed  int `json:"failed"`
}

// ResendPlatformPurchases delivers the Purchase of every travel whose first payment was confirmed but whose
// event never reached Meta (Conversions API was off, or Meta rejected it). The event ID is the same as the
// original, so Meta deduplicates an event that did arrive. ErrMetaNotConfigured when Conversions API is off.
func (s *subscriptionService) ResendPlatformPurchases(ctx context.Context) (*PlatformPurchaseResendResult, error) {
	if s.adAttribution == nil || s.purchaseTracker == nil || !s.purchaseTracker.Enabled(ctx) {
		return nil, ErrMetaNotConfigured
	}
	pending, err := s.adAttribution.ListUnsentPurchases(ctx, 200)
	if err != nil {
		return nil, err
	}
	res := &PlatformPurchaseResendResult{Pending: len(pending)}
	for _, u := range pending {
		if err := s.resendOnePurchase(ctx, u); err != nil {
			log.Printf("[Subscription] tenant %d: resend purchase failed: %v", u.TenantID, err)
			res.Failed++
			continue
		}
		res.Sent++
	}
	return res, nil
}

func (s *subscriptionService) resendOnePurchase(ctx context.Context, u repository.UnsentPurchase) error {
	claimed, err := s.adAttribution.ClaimPurchaseSend(ctx, u.TenantID)
	if err != nil {
		return err
	}
	if !claimed {
		return nil // another resend or approval delivered it in the meantime
	}
	release := func() {
		if err := s.adAttribution.ReleasePurchaseSend(context.Background(), u.TenantID); err != nil {
			log.Printf("[Subscription] tenant %d: cannot release purchase claim: %v", u.TenantID, err)
		}
	}
	pv, err := s.pvRepo.GetByID(ctx, u.PaymentVerificationID)
	if err != nil {
		release()
		return err
	}
	tenant, err := s.tenantRepo.GetByID(ctx, u.TenantID)
	if err != nil {
		release()
		return err
	}
	plan, err := s.planRepo.GetByID(ctx, pv.PlanID)
	if err != nil {
		release()
		return err
	}
	attr, err := s.adAttribution.Get(ctx, u.TenantID)
	if err != nil {
		release()
		return err
	}
	eventTime := time.Now()
	if u.ConfirmedAt != nil && time.Since(*u.ConfirmedAt) < purchaseEventMaxAge {
		eventTime = *u.ConfirmedAt
	}
	if err := s.purchaseTracker.SendPurchase(ctx, s.buildPurchaseEvent(ctx, tenant, pv, plan, attr, eventTime)); err != nil {
		release()
		return err
	}
	return nil
}
