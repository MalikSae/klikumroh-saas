package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Domain audit (30 Sep 2026, D1/D4) against real MySQL: releasing unverified claims never touches an
// active domain or the requesting travel's own row, and the recheck list only holds active custom domains.
func TestDomainAudit_ReleaseClaimAndRecheckList(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)

	a := createDummyTenant(t, ctx, tenantRepo, "dom-a")
	b := createDummyTenant(t, ctx, tenantRepo, "dom-b")
	ts := time.Now().UnixNano()
	pendingHost := fmt.Sprintf("klaim-%d.example.test", ts)
	activeHost := fmt.Sprintf("aktif-%d.example.test", ts)

	for _, d := range []*repository.Domain{
		{Hostname: pendingHost, Type: "custom", Status: "pending"},
		{Hostname: activeHost, Type: "custom", Status: "active"},
	} {
		if err := domainRepo.Create(ctx, a.ID, d); err != nil {
			t.Fatalf("create domain: %v", err)
		}
	}

	// Tenant A's own request never releases its own claim.
	if err := domainRepo.ReleaseUnverifiedClaim(ctx, pendingHost, a.ID); err != nil {
		t.Fatalf("release own: %v", err)
	}
	if _, err := domainRepo.FindByHostname(ctx, pendingHost); err != nil {
		t.Fatalf("own pending claim must stay: %v", err)
	}
	// Tenant B releases A's unverified claim, but never A's active domain.
	for _, h := range []string{pendingHost, activeHost} {
		if err := domainRepo.ReleaseUnverifiedClaim(ctx, h, b.ID); err != nil {
			t.Fatalf("release %s: %v", h, err)
		}
	}
	if _, err := domainRepo.FindByHostname(ctx, pendingHost); err == nil {
		t.Fatal("expected A's unverified claim to be released")
	}
	active, err := domainRepo.FindByHostname(ctx, activeHost)
	if err != nil || active.Status != "active" {
		t.Fatalf("active domain must never be released: %v", err)
	}

	// check_failures round-trips and the recheck list holds the active custom domain.
	active.CheckFailures = 2
	if err := domainRepo.Update(ctx, a.ID, active); err != nil {
		t.Fatalf("update: %v", err)
	}
	list, err := domainRepo.ListActiveCustom(ctx)
	if err != nil {
		t.Fatalf("list active custom: %v", err)
	}
	found := false
	for _, d := range list {
		if d.Type != "custom" || d.Status != "active" {
			t.Fatalf("recheck list holds %s/%s", d.Type, d.Status)
		}
		if d.ID == active.ID {
			found = d.CheckFailures == 2
		}
	}
	if !found {
		t.Fatal("expected the active domain with check_failures=2 in the recheck list")
	}
}
