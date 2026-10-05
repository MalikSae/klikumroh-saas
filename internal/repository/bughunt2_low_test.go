package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt 2, group B (5 Oct 2026): backend LOW fixes checked against real MySQL. Every row is
// removed when the test ends (createDummyTenant purges each test tenant).

// A password set with a trailing space is stored exactly as typed, so the agent can log in with
// exactly what the admin handed over; a password of only spaces is still refused.
func TestBugHunt2_AgentPasswordResetKeepsSpaces(t *testing.T) {
	e := setupProspectAudit(t)
	agentSvc := newAgentAuditService(e)
	agentRepo := repository.NewAgentRepository(e.db)
	sessionRepo := repository.NewAgentSessionRepository(e.db)
	t.Cleanup(func() { _ = sessionRepo.DeleteByAgentID(context.Background(), e.agentA.ID) })

	email := fmt.Sprintf("bh2-pass-%d@example.test", time.Now().UnixNano())
	if _, err := agentRepo.UpdateProfile(e.ctx, e.tenantA.ID, e.agentA.ID, repository.UpdateAgentProfileParams{Email: &email}); err != nil {
		t.Fatalf("set email: %v", err)
	}

	const typed = "rahasia-spasi1 " // test value, trailing space on purpose
	if err := agentSvc.ResetAgentPassword(e.ctx, e.tenantA.ID, e.agentA.ID, typed); err != nil {
		t.Fatalf("reset: %v", err)
	}
	if _, err := agentSvc.Login(e.ctx, e.tenantA.ID, email, typed); err != nil {
		t.Fatalf("login with the exact password given by the admin failed: %v", err)
	}
	if _, err := agentSvc.Login(e.ctx, e.tenantA.ID, email, "rahasia-spasi1"); err == nil {
		t.Fatal("the stored password must be the typed one, not a trimmed copy")
	}
	if err := agentSvc.ResetAgentPassword(e.ctx, e.tenantA.ID, e.agentA.ID, "         "); err == nil {
		t.Fatal("a password of only spaces must be refused")
	}
	// Tenant isolation: tenant B cannot reset tenant A's agent.
	if err := agentSvc.ResetAgentPassword(e.ctx, e.tenantB.ID, e.agentA.ID, "rahasia-lain-1"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("cross-tenant reset: expected ErrNotFound, got %v", err)
	}
}

// Travel admin changing their own password: stored exactly as typed (login does not trim).
func TestBugHunt2_AdminPasswordKeepsSpaces(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	teamSvc := service.NewTeamService(adminRepo, repository.NewSessionRepository(db))
	tenant := createDummyTenant(t, ctx, tenantRepo, "bh2-admin-pass")

	hash, _ := bcrypt.GenerateFromPassword([]byte("rahasia-awal-1"), bcrypt.MinCost)
	u := &repository.AdminUser{Name: "Admin BH2", Email: fmt.Sprintf("bh2-admin-%d@klikumroh.test", time.Now().UnixNano()), PasswordHash: string(hash), Status: "active"}
	if err := adminRepo.Create(ctx, tenant.ID, u); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	const typed = " rahasia-baru-1 "
	if err := teamSvc.UpdateMyPassword(ctx, tenant.ID, u.ID, "rahasia-awal-1", typed, ""); err != nil {
		t.Fatalf("update password: %v", err)
	}
	stored, err := adminRepo.GetByID(ctx, tenant.ID, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte(typed)) != nil {
		t.Fatal("stored hash must match the password exactly as typed")
	}
	if err := teamSvc.UpdateMyPassword(ctx, tenant.ID, u.ID, typed, "        ", ""); !errors.Is(err, service.ErrPasswordTooShort) {
		t.Fatalf("blank password: expected ErrPasswordTooShort, got %v", err)
	}
}

// A closed target is final: editing it is refused, in the service and in the repository's UPDATE.
func TestBugHunt2_ClosedTargetCannotBeEdited(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)
	svc := service.NewAgentTargetService(targetRepo, repository.NewAgentRepository(db))
	tenantA := createDummyTenant(t, ctx, tenantRepo, "bh2-target-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "bh2-target-b")

	newTarget := func(status string) *repository.AgentTarget {
		tg := &repository.AgentTarget{Title: strPtr("Target " + status), MetricType: "closing_pax", MetricValue: 5,
			PeriodStart: "2026-09-01", PeriodEnd: "2026-09-30", Status: status}
		if err := targetRepo.Create(ctx, tenantA.ID, tg); err != nil {
			t.Fatalf("create target: %v", err)
		}
		return tg
	}
	closed, open := newTarget("closed"), newTarget("active")
	input := &service.UpdateTargetInput{Title: strPtr("Diubah"), MetricValue: 1, PeriodStart: "2026-09-01", PeriodEnd: "2026-09-30"}

	if _, err := svc.UpdateTarget(ctx, tenantA.ID, closed.ID, input); !errors.Is(err, service.ErrTargetAlreadyClosed) {
		t.Fatalf("edit closed target: expected ErrTargetAlreadyClosed, got %v", err)
	}
	// The repository guard catches a close that happens between the read and the update.
	closed.MetricValue = 1
	if err := targetRepo.Update(ctx, tenantA.ID, closed); !errors.Is(err, repository.ErrStatusConflict) {
		t.Fatalf("repo update of closed target: expected ErrStatusConflict, got %v", err)
	}
	got, _ := targetRepo.GetByID(ctx, tenantA.ID, closed.ID)
	if got.MetricValue != 5 {
		t.Fatalf("closed target changed: metric_value=%d", got.MetricValue)
	}

	if _, err := svc.UpdateTarget(ctx, tenantA.ID, open.ID, input); err != nil {
		t.Fatalf("edit open target: %v", err)
	}
	if _, err := svc.UpdateTarget(ctx, tenantB.ID, open.ID, input); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("cross-tenant edit: expected ErrNotFound, got %v", err)
	}
}

// Saving the profile form (which still carries the logo path it loaded) never overwrites a logo
// uploaded in the meantime.
func TestBugHunt2_ProfileSaveKeepsUploadedLogo(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(tenantRepo)
	tenant := createDummyTenant(t, ctx, tenantRepo, "bh2-logo")

	newLogo := "/uploads/1/branding/baru.png"
	if err := tenantRepo.UpdateBrandLogo(ctx, tenant.ID, &newLogo); err != nil {
		t.Fatalf("upload logo: %v", err)
	}
	tagline := "Tagline baru"
	if _, err := svc.UpdateProfile(ctx, tenant.ID, "Travel BH2", &tagline, nil); err != nil {
		t.Fatalf("save profile: %v", err)
	}
	got, _ := tenantRepo.GetByID(ctx, tenant.ID)
	if got.BrandLogoURL == nil || *got.BrandLogoURL != newLogo {
		t.Fatalf("logo overwritten by profile save: %v", got.BrandLogoURL)
	}
	if got.Tagline == nil || *got.Tagline != tagline || got.Name != "Travel BH2" {
		t.Fatalf("profile not saved: name=%q tagline=%v", got.Name, got.Tagline)
	}
	if _, err := svc.UpdateProfile(ctx, tenant.ID, "   ", nil, nil); !errors.Is(err, service.ErrTenantNameRequired) {
		t.Fatalf("blank name: expected ErrTenantNameRequired, got %v", err)
	}
}

// Super admin tenant list: only a verified (active) primary custom domain is shown, and the plan
// id is returned so MRR does not depend on (non-unique) plan names.
func TestBugHunt2_StaffTenantListDomainAndPlanID(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	staffRepo := repository.NewStaffRepository(db)

	pending := createDummyTenant(t, ctx, tenantRepo, "bh2-dom-pending")
	verified := createDummyTenant(t, ctx, tenantRepo, "bh2-dom-active")
	ts := time.Now().UnixNano()

	if err := domainRepo.Create(ctx, pending.ID, &repository.Domain{Hostname: fmt.Sprintf("belum-%d.test", ts), Type: "custom", Status: "pending"}); err != nil {
		t.Fatalf("create pending domain: %v", err)
	}
	primary := &repository.Domain{Hostname: fmt.Sprintf("www.aktif-%d.test", ts), Type: "custom", Status: "active"}
	if err := domainRepo.Create(ctx, verified.ID, primary); err != nil {
		t.Fatalf("create primary: %v", err)
	}
	// An older-looking alias row must not be picked either.
	if err := domainRepo.Create(ctx, verified.ID, &repository.Domain{Hostname: fmt.Sprintf("aktif-%d.test", ts), Type: "custom", Status: "active", RedirectToDomainID: &primary.ID}); err != nil {
		t.Fatalf("create alias: %v", err)
	}

	res, err := db.Exec("INSERT INTO pricing_plans (name, period_months, price) VALUES (?, 1, 300000)", fmt.Sprintf("BH2 Plan %d", ts))
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	planID, _ := res.LastInsertId()
	t.Cleanup(func() {
		_, _ = db.Exec("UPDATE tenants SET current_plan_id = NULL WHERE id = ? AND current_plan_id = ?", verified.ID, planID)
		_, _ = db.Exec("DELETE FROM pricing_plans WHERE id = ?", planID)
	})
	if _, err := db.Exec("UPDATE tenants SET current_plan_id = ? WHERE id = ?", planID, verified.ID); err != nil {
		t.Fatalf("set plan: %v", err)
	}

	items, err := staffRepo.ListAllTenants(ctx)
	if err != nil {
		t.Fatalf("list tenants: %v", err)
	}
	found := 0
	for _, it := range items {
		switch it.ID {
		case pending.ID:
			found++
			if it.CustomDomain != nil {
				t.Errorf("unverified domain shown in the tenant list: %s", *it.CustomDomain)
			}
		case verified.ID:
			found++
			if it.CustomDomain == nil || *it.CustomDomain != primary.Hostname {
				t.Errorf("expected verified primary %s, got %v", primary.Hostname, it.CustomDomain)
			}
			if it.CurrentPlanID == nil || *it.CurrentPlanID != uint64(planID) {
				t.Errorf("expected current_plan_id %d, got %v", planID, it.CurrentPlanID)
			}
		}
	}
	if found != 2 {
		t.Fatalf("test tenants missing from the list (found %d)", found)
	}
}
