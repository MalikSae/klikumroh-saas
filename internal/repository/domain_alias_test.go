package repository_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// Domain alias (1 Oct 2026) against real MySQL: the alias link is stored, the primary lookup never returns
// an alias and always picks the domain verified first, and deleting a primary deletes its alias.
func TestDomainAlias_PrimaryLookupAndCascade(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	domainRepo := repository.NewDomainRepository(db)
	a := createDummyTenant(t, ctx, tenantRepo, "alias-a")
	b := createDummyTenant(t, ctx, tenantRepo, "alias-b")

	ts := time.Now().UnixNano()
	zone := fmt.Sprintf("alias-%d.example.test", ts)
	earlier := time.Now().Add(-2 * time.Hour)
	later := time.Now().Add(-time.Hour)

	primary := &repository.Domain{Hostname: "www." + zone, Type: "custom", Status: "active", VerifiedAt: &earlier}
	if err := domainRepo.Create(ctx, a.ID, primary); err != nil {
		t.Fatalf("create primary: %v", err)
	}
	// The alias was verified later than nothing else, but is an alias: never the primary.
	alias := &repository.Domain{Hostname: zone, Type: "custom", Status: "active", VerifiedAt: &earlier, RedirectToDomainID: &primary.ID}
	if err := domainRepo.Create(ctx, a.ID, alias); err != nil {
		t.Fatalf("create alias: %v", err)
	}
	other := &repository.Domain{Hostname: fmt.Sprintf("lain-%d.example.test", ts), Type: "custom", Status: "active", VerifiedAt: &later}
	if err := domainRepo.Create(ctx, a.ID, other); err != nil {
		t.Fatalf("create other: %v", err)
	}

	got, err := domainRepo.FindByHostname(ctx, zone)
	if err != nil || got.RedirectToDomainID == nil || *got.RedirectToDomainID != primary.ID {
		t.Fatalf("alias link not stored: %+v %v", got, err)
	}
	for i := 0; i < 5; i++ {
		p, err := domainRepo.GetActiveCustomDomain(ctx, a.ID)
		if err != nil || p.ID != primary.ID {
			t.Fatalf("primary lookup must return the first-verified primary %d, got %+v %v", primary.ID, p, err)
		}
	}
	// Tenant B sees none of tenant A's domains.
	if _, err := domainRepo.GetActiveCustomDomain(ctx, b.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("tenant B must not get tenant A's domain: %v", err)
	}
	if _, err := domainRepo.GetByID(ctx, b.ID, alias.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("tenant B must not read tenant A's alias: %v", err)
	}

	// Deleting the primary deletes the alias (foreign key cascade).
	if err := domainRepo.Delete(ctx, a.ID, primary.ID); err != nil {
		t.Fatalf("delete primary: %v", err)
	}
	if _, err := domainRepo.FindByHostname(ctx, zone); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("alias must be deleted with its primary: %v", err)
	}
}
