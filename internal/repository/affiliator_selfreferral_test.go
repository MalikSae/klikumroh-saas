package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Self-referral guard against the real database (keputusan pendiri 4 Okt 2026): a travel that signs up
// from an IP the affiliator registered or logged in from is not attributed to that affiliator. A different
// IP, a loopback IP (proxy did not forward the visitor) and the visitor's own link click are not blocked.
// All rows are removed when the test ends.
func TestAffiliator_SelfReferralIPGuard(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })

	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db),
		repository.NewPaymentVerificationRepository(db), repository.NewPlatformSettingsRepository(db))
	tenantRepo := repository.NewTenantRepository(db)

	// Documentation-range IPs (RFC 5737), never real visitors.
	const affiliatorRegisterIP = "203.0.113.10"
	const affiliatorLoginIP = "203.0.113.11"
	const travelIP = "198.51.100.20"

	email := fmt.Sprintf("aff-selfip-%d@klikumroh.test", time.Now().UnixNano())
	res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{
		Name: "Affiliator self IP", Email: email, Password: "rahasia-test-123", ClientIP: affiliatorRegisterIP,
	})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	aff := res.Affiliator
	// affiliator_logins rows go with the affiliator (ON DELETE CASCADE). Registered before the tenants, so
	// it runs after their purge has cleared tenants.affiliator_id.
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", aff.ID)
		_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", aff.ID)
	})
	if _, err := svc.Login(ctx, email, "rahasia-test-123", affiliatorLoginIP); err != nil {
		t.Fatalf("login: %v", err)
	}
	coupon, err := svc.SetCoupon(ctx, aff.ID, fmt.Sprintf("SELFIP%d", time.Now().UnixNano()%1000000))
	if err != nil {
		t.Fatalf("SetCoupon: %v", err)
	}

	attributedTo := func(tenantID uint64) uint64 {
		t.Helper()
		a, err := affRepo.TenantAffiliator(ctx, tenantID)
		if errors.Is(err, repository.ErrNotFound) {
			return 0
		}
		if err != nil {
			t.Fatalf("TenantAffiliator: %v", err)
		}
		return a.ID
	}

	cases := []struct {
		name     string
		signupIP string
		viaLink  bool
		want     uint64
	}{
		{"signup from the affiliator's registration IP is refused", affiliatorRegisterIP, false, 0},
		{"signup from the affiliator's login IP is refused (link too)", affiliatorLoginIP, true, 0},
		{"signup from another IP is attributed", travelIP, false, aff.ID},
		{"loopback signup IP is not used to refuse", "127.0.0.1", true, aff.ID},
		{"no signup IP is not used to refuse", "", false, aff.ID},
	}
	for i, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			tenant := createDummyTenant(t, ctx, tenantRepo, fmt.Sprintf("selfip%d", i))
			if c.viaLink {
				svc.AttributeSignup(ctx, tenant.ID, "", aff.LinkCode, "travel-selfip@klikumroh.test", "", c.signupIP)
			} else {
				svc.AttributeSignup(ctx, tenant.ID, coupon.Code, "", "travel-selfip@klikumroh.test", "", c.signupIP)
			}
			if got := attributedTo(tenant.ID); got != c.want {
				t.Fatalf("attributed to %d, want %d", got, c.want)
			}
		})
	}

	t.Run("a visitor's link click from the travel's IP is not an affiliator login", func(t *testing.T) {
		if err := svc.RecordClick(ctx, aff.LinkCode, travelIP); err != nil {
			t.Fatalf("RecordClick: %v", err)
		}
		tenant := createDummyTenant(t, ctx, tenantRepo, "selfip-click")
		svc.AttributeSignup(ctx, tenant.ID, "", aff.LinkCode, "travel-click@klikumroh.test", "", travelIP)
		if got := attributedTo(tenant.ID); got != aff.ID {
			t.Fatalf("attributed to %d, want %d", got, aff.ID)
		}
	})

	t.Run("loopback login IPs are not recorded", func(t *testing.T) {
		if _, err := svc.Login(ctx, email, "rahasia-test-123", "127.0.0.1"); err != nil {
			t.Fatalf("login: %v", err)
		}
		var n int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM affiliator_logins WHERE affiliator_id = ?", aff.ID).Scan(&n); err != nil {
			t.Fatalf("count: %v", err)
		}
		if n != 2 { // registration + first login only
			t.Fatalf("affiliator_logins rows = %d, want 2", n)
		}
	})
}
