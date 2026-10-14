package repository_test

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"klikumroh/internal/repository"
)

func TestTenantAdAttribution_ScopedFirstWriteWinsAndPurchaseClaimOnce(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewTenantAdAttributionRepository(e.db)
	t.Cleanup(func() {
		_, _ = e.db.Exec(`DELETE FROM tenant_ad_attribution WHERE tenant_id IN (?, ?)`, e.tenantA.ID, e.tenantB.ID)
	})

	str := func(v string) *string { return &v }
	err := repo.Save(e.ctx, &repository.TenantAdAttribution{
		TenantID: e.tenantA.ID, Fbp: str("fb.1.1700000000000.111"), Fbclid: str("click-A"),
		UTMCampaign: str("camp-A"), LeadEventID: str("lead-A"),
	})
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	// First touch wins: a second save for the same tenant changes nothing.
	if err := repo.Save(e.ctx, &repository.TenantAdAttribution{TenantID: e.tenantA.ID, Fbclid: str("click-OTHER")}); err != nil {
		t.Fatalf("second save: %v", err)
	}
	got, err := repo.Get(e.ctx, e.tenantA.ID)
	if err != nil || got.Fbclid == nil || *got.Fbclid != "click-A" || got.LeadEventID == nil || *got.LeadEventID != "lead-A" {
		t.Fatalf("first save must be kept, got %+v err %v", got, err)
	}

	// Tenant B cannot see tenant A's attribution.
	if _, err := repo.Get(e.ctx, e.tenantB.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B must not read tenant A attribution, got err %v", err)
	}
	// Claiming for tenant B must not touch tenant A.
	if ok, _ := repo.ClaimPurchaseSend(e.ctx, e.tenantB.ID); ok {
		t.Fatalf("CRITICAL: claim for a tenant without a row must be false")
	}
	if a, _ := repo.Get(e.ctx, e.tenantA.ID); a.PurchaseEventSentAt != nil {
		t.Fatalf("tenant A purchase must still be unclaimed")
	}

	// Concurrent claims: exactly one wins.
	var wins int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, err := repo.ClaimPurchaseSend(e.ctx, e.tenantA.ID); err == nil && ok {
				atomic.AddInt32(&wins, 1)
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Fatalf("exactly one claim must win, got %d", wins)
	}

	// Release allows a retry.
	if err := repo.ReleasePurchaseSend(e.ctx, e.tenantA.ID); err != nil {
		t.Fatalf("release: %v", err)
	}
	if ok, _ := repo.ClaimPurchaseSend(e.ctx, e.tenantA.ID); !ok {
		t.Fatalf("claim after release must succeed")
	}
}
