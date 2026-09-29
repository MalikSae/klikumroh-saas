package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// L1 & L3: subscription notifications (approve/reject/proof) and renewal reminders, against real MySQL.
func TestSubscriptionNotify_PaymentOutcomesAndReminders(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	tenantA := createDummyTenant(t, ctx, tenantRepo, "subn-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "subn-b")
	adminA := &repository.AdminUser{Email: fmt.Sprintf("subn-a-%d@example.test", time.Now().UnixNano()), PasswordHash: "x", Name: "Admin A", Status: "active"}
	if err := adminRepo.Create(ctx, tenantA.ID, adminA); err != nil {
		t.Fatalf("admin: %v", err)
	}
	t.Cleanup(func() {
		for _, id := range []uint64{tenantA.ID, tenantB.ID} {
			_, _ = db.Exec("DELETE FROM notifications WHERE tenant_id = ?", id)
			_, _ = db.Exec("DELETE FROM payment_verifications WHERE tenant_id = ?", id)
			_, _ = db.Exec("DELETE FROM packages WHERE tenant_id = ?", id)
			_, _ = db.Exec("DELETE FROM tenant_faqs WHERE tenant_id = ?", id)
			_, _ = db.Exec("DELETE FROM domains WHERE tenant_id = ?", id)
			_, _ = db.Exec("DELETE FROM admin_users WHERE tenant_id = ?", id)
			_ = tenantRepo.Delete(ctx, id)
		}
	})

	couponRepo := repository.NewCouponRepository(db)
	svc := service.NewSubscriptionService(repository.NewPaymentVerificationRepository(db), couponRepo,
		service.NewCouponService(couponRepo), repository.NewPricingPlanRepository(db), tenantRepo, repository.NewDomainRepository(db))
	notifier := svc.(interface {
		SetNotifier(service.NotificationService, repository.AdminUserRepository, service.StaffLister, repository.SubscriptionReminderRepository)
		SendRenewalReminders(context.Context, time.Time) (int, error)
	})
	notifier.SetNotifier(service.NewNotificationService(repository.NewNotificationRepository(db)), adminRepo,
		repository.NewStaffRepository(db), repository.NewSubscriptionReminderRepository(db))

	count := func(tenantID uint64, kind string) int {
		var n int
		_ = db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND type = ? AND recipient_type = 'admin'`, tenantID, kind).Scan(&n)
		return n
	}

	var planID uint64
	if err := db.QueryRow(`SELECT id FROM pricing_plans ORDER BY id LIMIT 1`).Scan(&planID); err != nil {
		t.Skipf("no pricing plan in test DB: %v", err)
	}
	proof := "/uploads/test/bukti.webp"
	pv, err := svc.CreateRenewalRequest(ctx, tenantA.ID, planID, nil, &proof)
	if err != nil {
		t.Fatalf("renewal: %v", err)
	}
	var staffNotif, activeStaff int
	_ = db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND type = 'payment_proof_uploaded' AND recipient_type = 'staff'`, tenantA.ID).Scan(&staffNotif)
	_ = db.QueryRow(`SELECT COUNT(*) FROM staff_users WHERE status = 'active'`).Scan(&activeStaff)
	if staffNotif != activeStaff {
		t.Fatalf("every active staff member must be told about the proof: %d of %d", staffNotif, activeStaff)
	}

	if err := svc.RejectVerification(ctx, pv.ID, "Nominal kurang", 1); err != nil {
		t.Fatalf("reject: %v", err)
	}
	if count(tenantA.ID, "subscription_rejected") != 1 {
		t.Fatalf("travel admin must be told the payment needs fixing")
	}
	pv2, err := svc.CreateRenewalRequest(ctx, tenantA.ID, planID, nil, &proof)
	if err != nil {
		t.Fatalf("renewal 2: %v", err)
	}
	if err := svc.ApproveVerification(ctx, pv2.ID, 1); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if count(tenantA.ID, "subscription_approved") != 1 {
		t.Fatalf("travel admin must be told the payment was approved")
	}

	// Reminders: H-30 once, then H-7, then grace; tenant B (no expiry) never.
	setExpiry := func(d time.Duration) {
		if _, err := db.Exec(`UPDATE tenants SET status = 'active', subscription_expires_at = ? WHERE id = ?`, time.Now().Add(d), tenantA.ID); err != nil {
			t.Fatalf("expiry: %v", err)
		}
	}
	setExpiry(20 * 24 * time.Hour)
	_, _ = notifier.SendRenewalReminders(ctx, time.Now())
	_, _ = notifier.SendRenewalReminders(ctx, time.Now())
	if n := count(tenantA.ID, "subscription_expiring_30"); n != 1 {
		t.Fatalf("H-30 reminder must be sent exactly once, got %d", n)
	}
	setExpiry(5 * 24 * time.Hour)
	_, _ = notifier.SendRenewalReminders(ctx, time.Now())
	if count(tenantA.ID, "subscription_expiring_7") != 1 {
		t.Fatalf("H-7 reminder must be sent")
	}
	setExpiry(-2 * 24 * time.Hour)
	_, _ = notifier.SendRenewalReminders(ctx, time.Now())
	if count(tenantA.ID, "subscription_grace") != 1 {
		t.Fatalf("grace reminder must be sent")
	}
	var bCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE tenant_id = ?`, tenantB.ID).Scan(&bCount)
	if bCount != 0 {
		t.Fatalf("CRITICAL: tenant B must receive nothing, got %d", bCount)
	}
}
