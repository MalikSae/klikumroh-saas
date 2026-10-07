package repository_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// A refused subdomain suggests one made from the travel name typed in the checkout (7 Oct 2026): the
// name itself when free, otherwise with -tours; the fixed "idris-tours" only without a usable name.
func TestCheckSlug_ExampleFollowsTravelName(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	signup := service.NewPublicSignupService(tenantRepo, repository.NewAdminUserRepository(db), repository.NewPricingPlanRepository(db), nil, repository.NewPaymentVerificationRepository(db))

	// A unique travel name, so the suggestion does not depend on other data.
	n := time.Now().UnixNano() % 1000000
	name := fmt.Sprintf("Zahra Wisata %d", n)
	base := fmt.Sprintf("zahra-wisata-%d", n)

	check := func(slug, travelName string) string {
		t.Helper()
		ok, msg, err := signup.CheckSlug(ctx, slug, travelName)
		if err != nil {
			t.Fatalf("CheckSlug(%q): %v", slug, err)
		}
		if ok {
			t.Fatalf("slug %q must be refused", slug)
		}
		return msg
	}

	t.Run("reserved slug suggests the travel name", func(t *testing.T) {
		msg := check("app", name)
		if !strings.HasSuffix(msg, "contoh: "+base+".") || strings.Contains(msg, "idris-tours") {
			t.Fatalf("expected example %q, got %q", base, msg)
		}
	})

	t.Run("misleading slug suggests the travel name", func(t *testing.T) {
		if msg := check("resmi", name); !strings.HasSuffix(msg, "contoh: "+base+".") {
			t.Fatalf("expected example %q, got %q", base, msg)
		}
	})

	t.Run("no name keeps the fixed example", func(t *testing.T) {
		if msg := check("app", ""); !strings.HasSuffix(msg, "contoh: idris-tours.") {
			t.Fatalf("expected the fixed example, got %q", msg)
		}
	})

	t.Run("a generic name is not suggested as is", func(t *testing.T) {
		// "Travel" alone is refused as too generic, so the example becomes travel-tours.
		if msg := check("app", "Travel"); !strings.HasSuffix(msg, "contoh: travel-tours.") {
			t.Fatalf("expected travel-tours, got %q", msg)
		}
	})

	t.Run("taken subdomain: suggestion skips taken names", func(t *testing.T) {
		taken := &repository.Tenant{Name: name, Slug: base}
		if err := tenantRepo.Create(ctx, taken); err != nil {
			t.Fatalf("create tenant: %v", err)
		}
		t.Cleanup(func() { _, _ = db.Exec("DELETE FROM tenants WHERE id = ?", taken.ID) })

		msg := check(base, name)
		if !strings.HasPrefix(msg, "Subdomain sudah digunakan travel lain.") || !strings.HasSuffix(msg, "Coba: "+base+"-tours.") {
			t.Fatalf("expected a -tours suggestion, got %q", msg)
		}
		if msg := check("app", name); !strings.HasSuffix(msg, "contoh: "+base+"-tours.") {
			t.Fatalf("a taken name must not be suggested, got %q", msg)
		}
	})
}
