package repository_test

import (
	"errors"
	"testing"

	"klikumroh/internal/repository"
)

// Public consultant lookup (2 Oct 2026), against real MySQL: a referral code resolves only inside its own
// travel and only for an active agent. setupProspectAudit removes the tenants afterwards.
func TestGetActiveByReferralCode_TenantIsolationAndStatus(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewAgentRepository(e.db)

	t.Run("own tenant, active agent", func(t *testing.T) {
		a, err := repo.GetActiveByReferralCode(e.ctx, e.tenantA.ID, e.agentA.ReferralCode)
		if err != nil {
			t.Fatalf("lookup: %v", err)
		}
		if a.ID != e.agentA.ID || a.TenantID != e.tenantA.ID {
			t.Fatalf("got agent %d of tenant %d, want %d of %d", a.ID, a.TenantID, e.agentA.ID, e.tenantA.ID)
		}
	})

	t.Run("other tenant cannot resolve the code", func(t *testing.T) {
		a, err := repo.GetActiveByReferralCode(e.ctx, e.tenantB.ID, e.agentA.ReferralCode)
		if !errors.Is(err, repository.ErrNotFound) || a != nil {
			t.Fatalf("tenant B resolved tenant A's code: agent=%+v err=%v", a, err)
		}
	})

	t.Run("unknown code", func(t *testing.T) {
		if _, err := repo.GetActiveByReferralCode(e.ctx, e.tenantA.ID, "TIDAK-ADA"); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("want ErrNotFound, got %v", err)
		}
	})

	t.Run("inactive agent", func(t *testing.T) {
		if _, err := e.db.Exec("UPDATE agents SET status = 'inactive' WHERE tenant_id = ? AND id = ?", e.tenantA.ID, e.agentA.ID); err != nil {
			t.Fatalf("deactivate: %v", err)
		}
		t.Cleanup(func() {
			_, _ = e.db.Exec("UPDATE agents SET status = 'active' WHERE tenant_id = ? AND id = ?", e.tenantA.ID, e.agentA.ID)
		})
		if _, err := repo.GetActiveByReferralCode(e.ctx, e.tenantA.ID, e.agentA.ReferralCode); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("want ErrNotFound for inactive agent, got %v", err)
		}
	})
}
