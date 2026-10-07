package service

import (
	"context"
	"errors"
	"time"

	"klikumroh/internal/repository"
)

// Plan promo (founder decision 7 Oct 2026): a percent off a subscription plan, optionally until a date,
// for a new travel's first payment only; renewals pay the normal price. A coupon (an affiliator's
// included) is taken off the promo price, so 50% promo + 20% affiliator coupon = 60% off in total, and
// the affiliator's commission follows the amount actually paid.
//
// An invoice keeps the promo it was billed with (payment_verifications.promo_percent), so editing or
// ending the plan promo later never reprices or invalidates an open invoice.

// firstPayment reports whether the travel has never had a payment approved (its first invoice).
func firstPayment(history []repository.PaymentVerification) bool {
	for i := range history {
		if history[i].Status == "approved" {
			return false
		}
	}
	return true
}

// firstPaymentOf reports whether the travel is still on its first payment: no approved invoice, and no
// subscription set by hand either (staff activation records no invoice, security audit 7 Oct 2026: such a
// travel got the new-travel promo and an affiliator coupon on its renewal).
func (s *subscriptionService) firstPaymentOf(ctx context.Context, tenantID uint64, history []repository.PaymentVerification) (bool, error) {
	if !firstPayment(history) {
		return false, nil
	}
	if s.tenantRepo == nil {
		return true, nil
	}
	t, err := s.tenantRepo.GetByID(ctx, tenantID)
	if errors.Is(err, repository.ErrNotFound) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return t == nil || (t.CurrentPlanID == nil && t.SubscriptionExpiresAt == nil), nil
}

// promoForInvoice is the promo an invoice for plan gets: the one the open invoice already has when it
// stays on the same plan, otherwise the plan's current promo for a first payment, otherwise none.
func promoForInvoice(plan *repository.PricingPlan, first bool, open *repository.PaymentVerification, now time.Time) *float64 {
	// The open invoice on the same plan keeps what it was billed with, "no promo" included: turning a promo
	// on later must not reprice it (and wipe a proof already uploaded for the full amount).
	if open != nil && open.PlanID == plan.ID {
		if open.PromoPercent == nil {
			return nil
		}
		v := *open.PromoPercent
		return &v
	}
	if !first {
		return nil
	}
	if pct := plan.ActivePromo(now); pct > 0 {
		return &pct
	}
	return nil
}

// promoBilled is the plan price after the invoice's promo (the amount a coupon is taken from).
func promoBilled(price float64, promo *float64) float64 {
	if promo == nil {
		return price
	}
	return repository.PromoPrice(price, *promo)
}

func samePromo(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
