package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// The onboarding status of a travel only ever reads its own data: Tenant B's package, agent, prospect,
// testimonial and target never tick Tenant A's steps (AGENTS.md 3.1).
func TestOnboarding_CrossTenantAndSteps(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	pkgRepo := repository.NewPackageRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	svc := service.NewOnboardingService(repository.NewOnboardingRepository(db))

	tenantA := createDummyTenant(t, ctx, tenantRepo, "onb-A")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "onb-B")

	// Tenant B is fully set up for stage 1 and 2.
	price, commission := 30000000.0, 1000000.0
	departure := time.Now().AddDate(0, 2, 0)
	pkgB := &repository.Package{Name: "Paket B", Status: "published", Price: &price, CommissionAmount: &commission, DepartureDate: &departure}
	if err := pkgRepo.Create(ctx, tenantB.ID, pkgB); err != nil {
		t.Fatal(err)
	}
	agentB := &repository.Agent{Name: "Agen B", Phone: strPtr("08123450001"), ReferralCode: fmt.Sprintf("ONB_%d", time.Now().UnixNano()), Status: "active"}
	if err := agentRepo.Create(ctx, tenantB.ID, agentB); err != nil {
		t.Fatal(err)
	}
	prospectB := &repository.Prospect{TenantID: tenantB.ID, Name: "Jamaah B", Phone: "0811000001", Status: "dihubungi", SourceChannel: "organik", EntryMethod: "web_form"}
	if err := prospectRepo.Create(ctx, tenantB.ID, prospectB); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO tenant_testimonials (tenant_id, name, package_name, rating, quote, display_order, is_active) VALUES (?, 'Ibu B', 'Paket B', 5, 'Bagus', 1, 1)`, tenantB.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO agent_targets (tenant_id, title, metric_type, metric_value, period_start, period_end) VALUES (?, 'Target B', 'closing_pax', 5, CURDATE(), CURDATE())`, tenantB.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE tenants SET brand_logo_url = '/logo-b.png', city = 'Bandung', agent_registration_benefits = 'Komisi', agent_terms_conditions = 'S&K' WHERE id = ?`, tenantB.ID); err != nil {
		t.Fatal(err)
	}

	t.Run("CRITICAL: Tenant B data does not tick Tenant A steps", func(t *testing.T) {
		a, err := svc.Status(ctx, tenantA.ID)
		if err != nil {
			t.Fatal(err)
		}
		if a.Logo || a.PackageReady || a.Trust || a.Commission || a.AgentProgram || a.AgentRegistered || a.AgentActive || a.Target || a.Prospect || a.FollowedUp {
			t.Fatalf("Tenant A must have nothing done, got %+v", a)
		}
		if a.DraftPackageID != nil || a.MissingCommissionPackageID != nil {
			t.Fatalf("Tenant A must not see Tenant B package ids, got %+v", a)
		}
	})

	t.Run("Tenant B steps follow its own data", func(t *testing.T) {
		b, err := svc.Status(ctx, tenantB.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !(b.Profile && b.Logo && b.PackageReady && b.Trust && b.Commission && b.AgentProgram && b.AgentRegistered && b.AgentActive && b.Target && b.Prospect && b.FollowedUp) {
			t.Fatalf("Tenant B stage 1 and 2 must be done, got %+v", b)
		}
		if b.Pixel || b.CustomDomain || b.Team {
			t.Fatalf("Tenant B stage 3 extras are not set up, got %+v", b)
		}
	})

	t.Run("A published package without commission keeps the commission step open and points to it", func(t *testing.T) {
		noCommission := &repository.Package{Name: "Paket tanpa komisi", Status: "published", Price: &price, DepartureDate: &departure}
		if err := pkgRepo.Create(ctx, tenantB.ID, noCommission); err != nil {
			t.Fatal(err)
		}
		b, err := svc.Status(ctx, tenantB.ID)
		if err != nil {
			t.Fatal(err)
		}
		if b.Commission || b.MissingCommissionPackageID == nil || *b.MissingCommissionPackageID != noCommission.ID {
			t.Fatalf("expected the commission step open at package %d, got %+v", noCommission.ID, b)
		}
	})
}
