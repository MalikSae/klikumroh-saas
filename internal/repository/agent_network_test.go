package repository_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// "Jaringan Saya": the agents an upline recruited directly, against real MySQL.

func newNetworkService(t *testing.T) (service.AgentService, repository.AgentNetworkRepository) {
	t.Helper()
	db := setupTestDB(t)
	netRepo := repository.NewAgentNetworkRepository(db)
	svc := service.NewAgentService(
		repository.NewAgentRepository(db),
		repository.NewAgentSessionRepository(db),
		repository.NewTenantRepository(db),
		repository.NewCommissionLedgerRepository(db),
		repository.NewProspectRepository(db),
		repository.NewCommissionPayoutRequestRepository(db),
		nil, nil, nil,
		service.WithAgentNetwork(netRepo),
	)
	return svc, netRepo
}

func TestAgentNetwork_FiguresFollowTheClosing(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-fig-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)

	net, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID)
	if err != nil {
		t.Fatalf("network: %v", err)
	}
	if net.Total != 1 || net.Active != 1 || len(net.Members) != 1 || net.Members[0].ID != e.downline.ID {
		t.Fatalf("expected the one downline, got %+v", net)
	}
	m := net.Members[0]
	if m.ProspectCount != 1 || m.ClosingJamaah != 0 || m.OverrideHeld != 0 || m.OverrideReleased != 0 {
		t.Fatalf("before any closing: %+v", m)
	}
	if m.Phone == nil {
		t.Fatalf("an active recruit's number is shown to the upline")
	}

	// The recruit's prospect is for 3 jamaah: the closing counts 3 pax (like the leaderboard), not 1 prospect,
	// and the Komisi Pembinaan is 10% of 3 x Rp1.000.000.
	if _, err := setupTestDB(t).Exec("UPDATE prospects SET jumlah_jamaah = 3 WHERE tenant_id = ? AND id = ?", e.tenant.ID, e.prospect.ID); err != nil {
		t.Fatalf("set jamaah: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, e.prospect.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	net, _ = svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID)
	m = net.Members[0]
	if m.ProspectCount != 1 || m.ClosingJamaah != 3 || m.OverrideReleased != 300000 || m.OverrideHeld != 0 {
		t.Fatalf("after closing expected 1 prospect, 3 jamaah closing and 300000 released, got %+v", m)
	}
	if !net.OverrideEnabled || net.OverrideReleased != 300000 {
		t.Fatalf("summary must carry the released override, got %+v", net)
	}

	// A held entry (jamaah not paid off yet) on the same recruit's prospect counts as held, not released.
	pkgID := *e.prospect.PackageID
	held := &repository.CommissionLedger{
		TenantID: e.tenant.ID, AgentID: e.upline.ID, ProspectID: e.prospect.ID, PackageID: &pkgID,
		Type: "override", Amount: 40000, ReleasedAt: nil,
	}
	if err := e.ledgerRepo.Create(e.ctx, e.tenant.ID, held); err != nil {
		t.Fatalf("held entry: %v", err)
	}
	net, _ = svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID)
	m = net.Members[0]
	if m.OverrideReleased != 300000 || m.OverrideHeld != 40000 || net.OverrideHeld != 40000 {
		t.Fatalf("expected 300000 released and 40000 held, got %+v / %+v", m, net)
	}

	// Paid off releases what was held.
	if err := e.svc.MarkPaidOff(e.ctx, e.tenant.ID, e.prospect.ID, e.adminID); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	net, _ = svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID)
	m = net.Members[0]
	if m.OverrideReleased != 340000 || m.OverrideHeld != 0 {
		t.Fatalf("after paid off expected 340000 released and nothing held, got %+v", m)
	}
}

func TestAgentNetwork_OnlyDirectRecruitsAndNoLeakOfPendingNumbers(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-dir-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)
	nano := time.Now().UnixNano()

	add := func(name, status string, parent *repository.Agent, tag string) *repository.Agent {
		a := &repository.Agent{
			Name: name, Phone: strPtr(fmt.Sprintf("0815%08d", (nano+int64(len(tag)))%100000000)),
			ReferralCode: fmt.Sprintf("%s%d", tag, nano), Status: status,
		}
		if tag == "PE" {
			a.Phone = strPtr(fmt.Sprintf("0816%08d", nano%100000000))
		}
		if tag == "RJ" {
			a.Phone = strPtr(fmt.Sprintf("0817%08d", nano%100000000))
		}
		if tag == "GC" {
			a.Phone = strPtr(fmt.Sprintf("0818%08d", nano%100000000))
		}
		if parent != nil {
			a.ParentAgentID = &parent.ID
		}
		if err := e.agentRepo.Create(e.ctx, e.tenant.ID, a); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		return a
	}
	pending := add("Menunggu", "pending", e.upline, "PE")
	rejected := add("Ditolak", "rejected", e.upline, "RJ")
	grandchild := add("Cucu", "active", e.downline, "GC")

	net, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[uint64]service.AgentNetworkMember{}
	for _, m := range net.Members {
		seen[m.ID] = m
	}
	if _, ok := seen[e.downline.ID]; !ok {
		t.Fatalf("the direct recruit must be listed")
	}
	if p, ok := seen[pending.ID]; !ok || p.Status != "pending" || p.Phone != nil {
		t.Fatalf("a pending recruit is listed without its number, got %+v (listed %v)", p, ok)
	}
	if _, ok := seen[rejected.ID]; ok {
		t.Fatalf("a rejected sign-up must not be listed")
	}
	if _, ok := seen[grandchild.ID]; ok {
		t.Fatalf("one level only: the recruit of a recruit must not be listed")
	}
	if net.Pending != 1 || net.Active != 1 || net.Total != 2 {
		t.Fatalf("summary counts: %+v", net)
	}

	// The recruit's own network holds its own recruit only.
	own, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.downline.ID)
	if err != nil {
		t.Fatal(err)
	}
	if own.Total != 1 || own.Members[0].ID != grandchild.ID {
		t.Fatalf("the recruit sees its own recruit only, got %+v", own)
	}
}

func TestAgentNetwork_NotActiveAgentCannotLook(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-act-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)
	e.setUplineStatus(t, "pending")
	if _, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID); !errors.Is(err, service.ErrAgentNotActive) {
		t.Fatalf("a pending agent must not see its network, got %v", err)
	}
}

// Cross-tenant (AGENTS 3.1): travel B can never read the network of travel A, by agent id or by repository.
func TestAgentNetwork_CrossTenantIsolation(t *testing.T) {
	nano := time.Now().UnixNano()
	a := setupOverrideCorrection(t, fmt.Sprintf("net-xa-%d", nano))
	b := setupOverrideCorrection(t, fmt.Sprintf("net-xb-%d", nano))
	svc, netRepo := newNetworkService(t)

	// Travel B asks with an upline id that belongs to travel A.
	if _, err := svc.GetNetwork(b.ctx, b.tenant.ID, a.upline.ID); err == nil {
		t.Fatalf("an agent id of another travel must not resolve")
	}
	// The repository, scoped to travel B, finds nothing under travel A's upline.
	rows, err := netRepo.ListDirectRecruits(b.ctx, b.tenant.ID, a.upline.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("tenant B must see no recruits of tenant A's upline, got %d", len(rows))
	}
	// Each travel sees only its own downline.
	netB, err := svc.GetNetwork(b.ctx, b.tenant.ID, b.upline.ID)
	if err != nil {
		t.Fatal(err)
	}
	if netB.Total != 1 || netB.Members[0].ID != b.downline.ID {
		t.Fatalf("travel B network: %+v", netB)
	}
}
