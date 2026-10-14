package repository_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Purchase event to KlikUmroh's own Meta Pixel when staff confirm a travel's FIRST payment.

func TestPlatformPurchase_FirstPaymentOnly(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	settingsRepo := repository.NewPlatformSettingsRepository(db)
	snapshotPlatformMeta(t, db, settingsRepo)
	graph := newFakeGraph(t)
	meta := service.NewPlatformMetaServiceForTest(settingsRepo, testSecretBox(t), graph.srv.URL)

	planRepo := repository.NewPricingPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	pvRepo := repository.NewPaymentVerificationRepository(db)
	couponRepo := repository.NewCouponRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	attrRepo := repository.NewTenantAdAttributionRepository(db)

	sub := service.NewSubscriptionService(pvRepo, couponRepo, service.NewCouponService(couponRepo), planRepo, tenantRepo)
	sub.(interface {
		SetAdTracking(repository.TenantAdAttributionRepository, service.PlatformPurchaseTracker)
	}).SetAdTracking(attrRepo, meta)

	var staffID uint64
	if err := db.QueryRow(`SELECT id FROM staff_users ORDER BY id LIMIT 1`).Scan(&staffID); err != nil {
		t.Skipf("no staff user in test DB: %v", err)
	}
	plan := bh5Plan(t, ctx, planRepo, 1200000)

	// newTravel creates a pending travel with an admin and an unpaid first invoice.
	newTravel := func(suffix string, withAttribution bool, finalAmount float64, uniqueCode int) (*repository.Tenant, *repository.PaymentVerification) {
		t.Helper()
		tenant := createDummyTenant(t, ctx, tenantRepo, suffix)
		if _, err := db.Exec(`UPDATE tenants SET status = 'pending', whatsapp_number = ? WHERE id = ?`,
			fmt.Sprintf("62812%08d", tenant.ID%100000000), tenant.ID); err != nil {
			t.Fatalf("prepare tenant: %v", err)
		}
		admin := &repository.AdminUser{
			TenantID: tenant.ID, Email: fmt.Sprintf("pic-%s-%d@klikumroh.test", suffix, time.Now().UnixNano()),
			PasswordHash: "[REDACTED-bcrypt-not-needed]", Name: "Budi Santoso", Status: "active", Role: repository.RolePIC,
		}
		if err := adminRepo.Create(ctx, tenant.ID, admin); err != nil {
			t.Fatalf("admin: %v", err)
		}
		if withAttribution {
			fbp, fbc, ip, ua := "fb.1.1700000000000.111", "fb.1.1700000000000.abc", "203.0.113.9", "Mozilla/5.0"
			if err := attrRepo.Save(ctx, &repository.TenantAdAttribution{TenantID: tenant.ID, Fbp: &fbp, Fbc: &fbc, ClientIP: &ip, UserAgent: &ua}); err != nil {
				t.Fatalf("attribution: %v", err)
			}
		}
		proof := "/uploads/test/proof.webp"
		pv := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: plan.Price,
			FinalAmount: finalAmount, UniqueCode: uniqueCode, Status: "pending", ProofURL: &proof}
		if err := pvRepo.Create(ctx, pv); err != nil {
			t.Fatalf("pv: %v", err)
		}
		return tenant, pv
	}
	approve := func(pvID uint64) {
		t.Helper()
		if err := sub.ApproveVerification(ctx, pvID, staffID); err != nil {
			t.Fatalf("approve: %v", err)
		}
	}
	sentAt := func(tenantID uint64) *time.Time {
		t.Helper()
		a, err := attrRepo.Get(ctx, tenantID)
		if err != nil {
			t.Fatalf("attribution get: %v", err)
		}
		return a.PurchaseEventSentAt
	}
	purchases := func() []map[string]interface{} { return graph.events("Purchase") }

	token := "EAAGplatformtoken1234567890wxyz"
	if _, err := meta.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &token}); err != nil {
		t.Fatalf("save meta: %v", err)
	}

	var failTenant, offTenant *repository.Tenant
	var failPV, offPV *repository.PaymentVerification

	t.Run("first confirmed payment sends one hashed Purchase with the plan value", func(t *testing.T) {
		tenant, pv := newTravel("pp-first", true, 1200250, 250)
		approve(pv.ID)

		got := purchases()
		if len(got) != 1 {
			t.Fatalf("want 1 Purchase, got %d", len(got))
		}
		ev := got[0]
		if ev["event_id"] != fmt.Sprintf("purchase-pv-%d", pv.ID) || ev["action_source"] != "system_generated" {
			t.Fatalf("event id / action source: %+v", ev)
		}
		cd := ev["custom_data"].(map[string]interface{})
		if cd["value"] != float64(1200000) || cd["currency"] != "IDR" {
			t.Fatalf("value must be the plan price without the transfer code, got %+v", cd)
		}
		ud := ev["user_data"].(map[string]interface{})
		if ud["fbp"] != "fb.1.1700000000000.111" || ud["client_ip_address"] != "203.0.113.9" {
			t.Fatalf("signup browser context must be reused: %+v", ud)
		}
		if em, _ := ud["em"].([]interface{}); len(em) != 1 || len(em[0].(string)) != 64 {
			t.Fatalf("email must be hashed, got %v", ud["em"])
		}
		if sentAt(tenant.ID) == nil {
			t.Fatalf("purchase must be claimed")
		}
	})

	t.Run("renewal of an active travel sends nothing", func(t *testing.T) {
		tenant, pv := newTravel("pp-renew", true, 1200250, 250)
		approve(pv.ID)
		before := len(purchases())
		// The travel is active now: the next approved invoice is a renewal.
		renewal := &repository.PaymentVerification{TenantID: tenant.ID, PlanID: plan.ID, Amount: plan.Price,
			FinalAmount: 1200300, UniqueCode: 300, Status: "pending", ProofURL: pv.ProofURL}
		if err := pvRepo.Create(ctx, renewal); err != nil {
			t.Fatalf("renewal pv: %v", err)
		}
		approve(renewal.ID)
		if after := len(purchases()); after != before {
			t.Fatalf("renewal must not send Purchase: %d -> %d", before, after)
		}
	})

	t.Run("travel without signup attribution row sends nothing", func(t *testing.T) {
		before := len(purchases())
		_, pv := newTravel("pp-legacy", false, 1200250, 250)
		approve(pv.ID)
		if after := len(purchases()); after != before {
			t.Fatalf("legacy travel must not send Purchase: %d -> %d", before, after)
		}
	})

	t.Run("free invoice (value 0) sends nothing and is not claimed", func(t *testing.T) {
		before := len(purchases())
		tenant, pv := newTravel("pp-free", true, 0, 0)
		approve(pv.ID)
		if after := len(purchases()); after != before {
			t.Fatalf("value 0 must not send Purchase: %d -> %d", before, after)
		}
		if sentAt(tenant.ID) != nil {
			t.Fatalf("value 0 must not consume the claim")
		}
	})

	t.Run("delivery failure releases the claim and is visible", func(t *testing.T) {
		graph.mu.Lock()
		graph.fail = true
		graph.mu.Unlock()
		defer func() {
			graph.mu.Lock()
			graph.fail = false
			graph.mu.Unlock()
		}()
		tenant, pv := newTravel("pp-fail", true, 1200250, 250)
		failTenant, failPV = tenant, pv
		approve(pv.ID)
		if sentAt(tenant.ID) != nil {
			t.Fatalf("failed delivery must release the claim")
		}
		view, _ := meta.GetSettings(ctx)
		if view.LastError == "" || strings.Contains(view.LastError, token) {
			t.Fatalf("failure must be visible without the token: %+v", view)
		}
	})

	t.Run("not configured: nothing sent and the claim is kept for later", func(t *testing.T) {
		if _, err := meta.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", ClearToken: true}); err != nil {
			t.Fatalf("clear token: %v", err)
		}
		before := len(purchases())
		tenant, pv := newTravel("pp-off", true, 1200250, 250)
		offTenant, offPV = tenant, pv
		approve(pv.ID)
		if after := len(purchases()); after != before {
			t.Fatalf("nothing may be sent while not configured")
		}
		if sentAt(tenant.ID) != nil {
			t.Fatalf("claim must not be consumed while not configured")
		}
		// Resend refuses while Conversions API is off.
		resender := sub.(interface {
			ResendPlatformPurchases(context.Context) (*service.PlatformPurchaseResendResult, error)
		})
		if _, err := resender.ResendPlatformPurchases(ctx); !errors.Is(err, service.ErrMetaNotConfigured) {
			t.Fatalf("resend while off: expected ErrMetaNotConfigured, got %v", err)
		}
	})

	t.Run("resend delivers the unsent first payments once", func(t *testing.T) {
		if _, err := meta.SaveSettings(ctx, service.PlatformMetaInput{PixelID: "1234567890123456", AccessToken: &token}); err != nil {
			t.Fatalf("set token: %v", err)
		}
		resender := sub.(interface {
			ResendPlatformPurchases(context.Context) (*service.PlatformPurchaseResendResult, error)
		})
		res, err := resender.ResendPlatformPurchases(ctx)
		if err != nil {
			t.Fatalf("resend: %v", err)
		}
		if res.Sent < 2 || res.Failed != 0 {
			t.Fatalf("expected at least the failed and the unconfigured travel to be sent, got %+v", res)
		}
		want := map[string]bool{
			fmt.Sprintf("purchase-pv-%d", failPV.ID): false,
			fmt.Sprintf("purchase-pv-%d", offPV.ID):  false,
		}
		for _, ev := range purchases() {
			if id, _ := ev["event_id"].(string); id != "" {
				if _, tracked := want[id]; tracked {
					want[id] = true
				}
			}
		}
		for id, seen := range want {
			if !seen {
				t.Fatalf("resend must deliver %s", id)
			}
		}
		if sentAt(failTenant.ID) == nil || sentAt(offTenant.ID) == nil {
			t.Fatalf("resent travels must be claimed")
		}

		// A second resend finds nothing for these travels: no duplicate Purchase.
		before := len(purchases())
		if _, err := resender.ResendPlatformPurchases(ctx); err != nil {
			t.Fatalf("second resend: %v", err)
		}
		if after := len(purchases()); after != before {
			t.Fatalf("second resend must not send again: %d -> %d", before, after)
		}
	})
}
