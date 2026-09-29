package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// S1: a manual activation by staff cancels the travel's open invoice (no double payment), seeds the
// starter content and notifies the travel; another travel's invoices are untouched.
func TestSubscriptionManualChange_CancelsOpenInvoices(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	var staffID, planID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	if err := db.QueryRow(`SELECT id FROM pricing_plans ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skipf("no pricing plan in test DB: %v", err)
	}

	tenantRepo := repository.NewTenantRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	tenantA := createDummyTenant(t, ctx, tenantRepo, "manual-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "manual-b")
	_, _ = db.Exec(`UPDATE tenants SET status = 'pending' WHERE id IN (?, ?)`, tenantA.ID, tenantB.ID)
	admin := &repository.AdminUser{Email: fmt.Sprintf("manual-a-%d@example.test", time.Now().UnixNano()), PasswordHash: "x", Name: "Admin", Status: "active"}
	if err := adminRepo.Create(ctx, tenantA.ID, admin); err != nil {
		t.Fatalf("admin: %v", err)
	}
	t.Cleanup(func() {
		for _, id := range []uint64{tenantA.ID, tenantB.ID} {
			for _, q := range []string{
				"DELETE FROM notifications WHERE tenant_id = ?", "DELETE FROM payment_verifications WHERE tenant_id = ?",
				"DELETE FROM packages WHERE tenant_id = ?", "DELETE FROM tenant_faqs WHERE tenant_id = ?",
				"DELETE FROM domains WHERE tenant_id = ?", "DELETE FROM access_logs WHERE tenant_id = ?",
				"DELETE FROM admin_users WHERE tenant_id = ?",
			} {
				_, _ = db.Exec(q, id)
			}
			_ = tenantRepo.Delete(ctx, id)
		}
	})

	couponRepo := repository.NewCouponRepository(db)
	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo),
		repository.NewPricingPlanRepository(db), tenantRepo, repository.NewDomainRepository(db))
	sub.SetContentRepos(repository.NewPackageRepository(db), repository.NewFAQRepository(db))
	sub.(interface {
		SetNotifier(service.NotificationService, repository.AdminUserRepository, service.StaffLister, repository.SubscriptionReminderRepository)
	}).SetNotifier(service.NewNotificationService(repository.NewNotificationRepository(db)), adminRepo, nil, nil)

	pvA, err := sub.CreateRenewalRequest(ctx, tenantA.ID, planID, nil, nil)
	if err != nil {
		t.Fatalf("invoice A: %v", err)
	}
	pvB, err := sub.CreateRenewalRequest(ctx, tenantB.ID, planID, nil, nil)
	if err != nil {
		t.Fatalf("invoice B: %v", err)
	}

	staff := service.NewStaffService(repository.NewStaffRepository(db), tenantRepo, repository.NewDomainRepository(db),
		repository.NewPricingPlanRepository(db), repository.NewPackageRepository(db), repository.NewProspectRepository(db),
		repository.NewAgentRepository(db), adminRepo, repository.NewSessionRepository(db), pvRepo, repository.NewAccessLogRepository(db))
	staff.(interface{ SetManualSubscriptionHook(service.ManualSubscriptionHook) }).SetManualSubscriptionHook(sub.(service.ManualSubscriptionHook))

	if err := staff.UpdateTenantSubscription(ctx, tenantA.ID, planID, staffID); err != nil {
		t.Fatalf("manual activation: %v", err)
	}

	gotA, _ := pvRepo.GetByID(ctx, pvA.ID)
	if gotA.Status != "cancelled" || gotA.RejectionReason == nil || *gotA.RejectionReason != service.ManualCancelReason {
		t.Fatalf("open invoice must be cancelled with the manual reason, got %s %v", gotA.Status, gotA.RejectionReason)
	}
	if gotB, _ := pvRepo.GetByID(ctx, pvB.ID); gotB.Status != "pending" {
		t.Fatalf("CRITICAL: tenant B invoice must stay pending, got %s", gotB.Status)
	}
	if err := sub.ApproveVerification(ctx, pvA.ID, staffID); err == nil {
		t.Fatalf("a cancelled invoice must not be approvable (no double extension)")
	}
	var pkgs, faqs, notifs int
	_ = db.QueryRow(`SELECT COUNT(*) FROM packages WHERE tenant_id = ?`, tenantA.ID).Scan(&pkgs)
	_ = db.QueryRow(`SELECT COUNT(*) FROM tenant_faqs WHERE tenant_id = ?`, tenantA.ID).Scan(&faqs)
	_ = db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND type = 'subscription_approved'`, tenantA.ID).Scan(&notifs)
	if pkgs != 1 || faqs != 3 || notifs != 1 {
		t.Fatalf("newly activated travel needs starter content and a notification: packages %d faqs %d notifs %d", pkgs, faqs, notifs)
	}
	info, _ := sub.GetSubscriptionInfo(ctx, tenantA.ID)
	if info.Status != "active" || info.PendingVerification != nil {
		t.Fatalf("travel must be active without an open invoice, got %s %+v", info.Status, info.PendingVerification)
	}
}
