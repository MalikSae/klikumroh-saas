package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Subscription notifications (L1, L3): the travel is told when its payment is approved or needs fixing
// and before its subscription ends; KlikUmroh staff are told when a transfer proof arrives.

// StaffLister lists KlikUmroh staff accounts (implemented by the staff repository).
type StaffLister interface {
	ListStaffUsers(ctx context.Context) ([]repository.StaffUser, error)
}

// SetNotifier enables subscription notifications. Wired in main via a type assertion.
func (s *subscriptionService) SetNotifier(notif NotificationService, admins repository.AdminUserRepository, staff StaffLister, reminders repository.SubscriptionReminderRepository) {
	s.notif = notif
	s.admins = admins
	s.staff = staff
	s.reminders = reminders
}

func (s *subscriptionService) notifyTenantAdmins(ctx context.Context, tenantID uint64, kind, title, body, link string) {
	if s.notif == nil || s.admins == nil {
		return
	}
	admins, err := s.admins.ListByTenant(ctx, tenantID)
	if err != nil {
		log.Printf("[Subscription] cannot list admins of tenant %d: %v", tenantID, err)
		return
	}
	tID := tenantID
	for _, a := range admins {
		if a.Status != "active" {
			continue
		}
		if _, err := s.notif.CreateNotification(ctx, &tID, "admin", a.ID, kind, title, body, link); err != nil {
			log.Printf("[Subscription] cannot notify admin %d: %v", a.ID, err)
		}
	}
}

func (s *subscriptionService) notifyStaff(ctx context.Context, tenantID uint64, kind, title, body, link string) {
	if s.notif == nil || s.staff == nil {
		return
	}
	staff, err := s.staff.ListStaffUsers(ctx)
	if err != nil {
		log.Printf("[Subscription] cannot list staff: %v", err)
		return
	}
	tID := tenantID
	for _, u := range staff {
		if u.Status != "active" {
			continue
		}
		if _, err := s.notif.CreateNotification(ctx, &tID, "staff", u.ID, kind, title, body, link); err != nil {
			log.Printf("[Subscription] cannot notify staff %d: %v", u.ID, err)
		}
	}
}

// notifyProofUploaded tells staff there is a transfer proof to verify.
func (s *subscriptionService) notifyProofUploaded(ctx context.Context, pv *repository.PaymentVerification) {
	tenantName := fmt.Sprintf("Travel #%d", pv.TenantID)
	if s.tenantRepo != nil {
		if t, err := s.tenantRepo.GetByID(ctx, pv.TenantID); err == nil && t != nil {
			tenantName = t.Name
		}
	}
	s.notifyStaff(ctx, pv.TenantID, "payment_proof_uploaded", "Bukti transfer baru",
		fmt.Sprintf("%s mengunggah bukti transfer untuk tagihan #%d (Rp %s).", tenantName, pv.ID, util.FormatRupiah(pv.FinalAmount)),
		"/internal/payment-verifications")
}

var indonesianMonthNames = []string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

func formatDateID(t time.Time) string {
	t = t.In(jakartaLocation)
	return fmt.Sprintf("%d %s %d", t.Day(), indonesianMonthNames[t.Month()-1], t.Year())
}

// reminderStage returns the notification type, title and body for a subscription ending at expiresAt,
// or kind "" when no reminder is due. Stages: H-30, H-7, H-1 and the grace period after expiry.
func reminderStage(expiresAt, now time.Time) (kind, title, body string, since time.Time) {
	left := expiresAt.Sub(now)
	days := int(math.Ceil(left.Hours() / 24))
	date := formatDateID(expiresAt)
	switch {
	case left <= 0:
		graceLeft := int(math.Ceil(util.SubscriptionGraceEnd(expiresAt).Sub(now).Hours() / 24))
		if graceLeft <= 0 {
			return "", "", "", time.Time{}
		}
		return "subscription_grace", "Masa aktif langganan berakhir",
			fmt.Sprintf("Masa aktif berakhir %s. Dashboard dan website tetap berjalan selama masa tenggang %d hari lagi; setelah itu website ditangguhkan.", date, graceLeft),
			expiresAt
	case days <= 1:
		return "subscription_expiring_1", "Masa aktif berakhir besok",
			fmt.Sprintf("Langganan KlikUmroh Anda berakhir %s. Perpanjang hari ini agar website travel tidak terganggu.", date),
			expiresAt.AddDate(0, 0, -31)
	case days <= 7:
		return "subscription_expiring_7", fmt.Sprintf("Masa aktif berakhir dalam %d hari", days),
			fmt.Sprintf("Langganan KlikUmroh Anda berakhir %s. Perpanjang sekarang; masa aktif baru melanjutkan sisa masa aktif.", date),
			expiresAt.AddDate(0, 0, -31)
	case days <= 30:
		return "subscription_expiring_30", fmt.Sprintf("Masa aktif berakhir dalam %d hari", days),
			fmt.Sprintf("Langganan KlikUmroh Anda berakhir %s. Anda bisa memperpanjang lebih awal; masa aktif baru melanjutkan sisa masa aktif.", date),
			expiresAt.AddDate(0, 0, -31)
	}
	return "", "", "", time.Time{}
}

// SendRenewalReminders notifies travels whose subscription ends within 30 days (H-30, H-7, H-1) or
// ended within the grace period. Each stage is sent once per subscription period. Returns how many
// travels were notified.
func (s *subscriptionService) SendRenewalReminders(ctx context.Context, now time.Time) (int, error) {
	if s.reminders == nil || s.notif == nil {
		return 0, nil
	}
	tenants, err := s.reminders.ListExpiringTenants(ctx, now.AddDate(0, 0, -util.SubscriptionGraceDays), now.AddDate(0, 0, 30))
	if err != nil {
		return 0, err
	}
	sent := 0
	for _, t := range tenants {
		kind, title, body, since := reminderStage(t.ExpiresAt, now)
		if kind == "" {
			continue
		}
		already, err := s.reminders.HasNotificationSince(ctx, t.ID, kind, since)
		if err != nil || already {
			continue
		}
		s.notifyTenantAdmins(ctx, t.ID, kind, title, body, "/settings/subscription")
		sent++
	}
	return sent, nil
}

// StartRenewalReminderLoop runs SendRenewalReminders shortly after start and then every interval.
func (s *subscriptionService) StartRenewalReminderLoop(ctx context.Context, interval time.Duration) {
	go func() {
		timer := time.NewTimer(time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				if n, err := s.SendRenewalReminders(ctx, time.Now()); err != nil {
					log.Printf("[Subscription] renewal reminders failed: %v", err)
				} else if n > 0 {
					log.Printf("[Subscription] renewal reminders sent to %d travel(s)", n)
				}
				timer.Reset(interval)
			}
		}
	}()
}
