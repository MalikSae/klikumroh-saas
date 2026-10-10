package repository_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// "Agen binaan saya": the agents an upline recruited directly, against real MySQL.

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

var networkAgentSeq int

// addRecruit creates an agent under parent with a unique number and the given status and domicile.
func (e *overrideCorrectionEnv) addRecruit(t *testing.T, parent *repository.Agent, name, status, domisili string) *repository.Agent {
	t.Helper()
	networkAgentSeq++
	n := time.Now().UnixNano()
	a := &repository.Agent{
		Name:         name,
		Phone:        strPtr(fmt.Sprintf("0812%04d%04d", networkAgentSeq%10000, n%10000)),
		ReferralCode: fmt.Sprintf("N%d%d", n, networkAgentSeq),
		Status:       status,
	}
	if domisili != "" {
		a.Domisili = &domisili
	}
	if parent != nil {
		a.ParentAgentID = &parent.ID
	}
	if err := e.agentRepo.Create(e.ctx, e.tenant.ID, a); err != nil {
		t.Fatalf("create %s: %v", name, err)
	}
	return a
}

func TestAgentNetwork_FiguresFollowTheClosing(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-fig-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)

	net, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{})
	if err != nil {
		t.Fatalf("network: %v", err)
	}
	if net.Summary.Registered != 1 || net.Summary.Active != 1 || len(net.Members) != 1 || net.Members[0].ID != e.downline.ID {
		t.Fatalf("expected the one downline, got %+v", net)
	}
	m := net.Members[0]
	if m.ProspectCount != 1 || m.ClosingJamaah != 0 || m.OverrideHeld != 0 || m.OverrideReleased != 0 {
		t.Fatalf("before any closing: %+v", m)
	}
	if m.Phone == nil {
		t.Fatalf("the recruit's number is shown to the upline")
	}

	// The recruit's prospect is for 3 jamaah: the closing counts 3 pax (like the leaderboard), not 1 prospect,
	// and the Komisi Pembinaan is 10% of 3 x Rp1.000.000.
	if _, err := setupTestDB(t).Exec("UPDATE prospects SET jumlah_jamaah = 3 WHERE tenant_id = ? AND id = ?", e.tenant.ID, e.prospect.ID); err != nil {
		t.Fatalf("set jamaah: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, e.prospect.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	net, _ = svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{})
	m = net.Members[0]
	if m.ProspectCount != 1 || m.ClosingJamaah != 3 || m.OverrideReleased != 300000 || m.OverrideHeld != 0 {
		t.Fatalf("after closing expected 1 prospect, 3 jamaah closing and 300000 released, got %+v", m)
	}
	if !net.OverrideEnabled || net.Summary.OverrideReleased != 300000 {
		t.Fatalf("summary must carry the released commission, got %+v", net.Summary)
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
	net, _ = svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{})
	m = net.Members[0]
	if m.OverrideReleased != 300000 || m.OverrideHeld != 40000 || net.Summary.OverrideHeld != 40000 {
		t.Fatalf("expected 300000 released and 40000 held, got %+v / %+v", m, net.Summary)
	}

	// Paid off releases what was held.
	if err := e.svc.MarkPaidOff(e.ctx, e.tenant.ID, e.prospect.ID, e.adminID); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	net, _ = svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{})
	m = net.Members[0]
	if m.OverrideReleased != 340000 || m.OverrideHeld != 0 {
		t.Fatalf("after paid off expected 340000 released and nothing held, got %+v", m)
	}
}

func TestAgentNetwork_OnlyDirectRecruitsAndStatuses(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-dir-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)

	pending := e.addRecruit(t, e.upline, "Menunggu", "pending", "Bandung")
	inactive := e.addRecruit(t, e.upline, "Nonaktif", "inactive", "Garut")
	rejected := e.addRecruit(t, e.upline, "Ditolak", "rejected", "Bogor")
	grandchild := e.addRecruit(t, e.downline, "Cucu", "active", "Depok")

	net, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{})
	if err != nil {
		t.Fatal(err)
	}
	seen := map[uint64]service.AgentNetworkMember{}
	for _, m := range net.Members {
		seen[m.ID] = m
	}
	if _, ok := seen[e.downline.ID]; !ok {
		t.Fatalf("the direct active recruit must be listed")
	}
	// Founder decision (11 Okt 2026): the number and the domicile are shown for every listed status.
	if p, ok := seen[pending.ID]; !ok || p.Status != "pending" || p.Phone == nil || p.Domisili == nil || *p.Domisili != "Bandung" {
		t.Fatalf("a pending recruit is listed with number and domicile, got %+v (listed %v)", p, ok)
	}
	if i, ok := seen[inactive.ID]; !ok || i.Status != "inactive" || i.Phone == nil {
		t.Fatalf("an inactive recruit is listed with its number, got %+v (listed %v)", i, ok)
	}
	if _, ok := seen[rejected.ID]; ok {
		t.Fatalf("a rejected sign-up must not be listed")
	}
	if _, ok := seen[grandchild.ID]; ok {
		t.Fatalf("one level only: the recruit of a recruit must not be listed")
	}
	s := net.Summary
	if s.Registered != 2 || s.Active != 1 || s.Inactive != 1 || s.Pending != 1 {
		t.Fatalf("summary counts: %+v", s)
	}

	own, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.downline.ID, service.AgentNetworkQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if own.Total != 1 || own.Members[0].ID != grandchild.ID {
		t.Fatalf("the recruit sees its own recruit only, got %+v", own)
	}
}

func TestAgentNetwork_PaginationAndFilterKeepTheSummary(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-pg-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)

	// 1 (from the env) + 11 active + 2 inactive + 1 pending = 15 listed, 14 registered.
	for i := 0; i < 11; i++ {
		e.addRecruit(t, e.upline, fmt.Sprintf("Agen %02d", i), "active", "Bandung")
	}
	e.addRecruit(t, e.upline, "Off A", "inactive", "Bandung")
	e.addRecruit(t, e.upline, "Off B", "inactive", "Bandung")
	e.addRecruit(t, e.upline, "Proses", "pending", "Bandung")

	p1, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Page: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(p1.Members) != 10 || p1.Total != 15 || p1.TotalPages != 2 || p1.Page != 1 || p1.PerPage != 10 {
		t.Fatalf("page 1: %d members, total %d, pages %d", len(p1.Members), p1.Total, p1.TotalPages)
	}
	p2, _ := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Page: 2})
	if len(p2.Members) != 5 || p2.Page != 2 {
		t.Fatalf("page 2: %d members", len(p2.Members))
	}
	ids := map[uint64]bool{}
	for _, m := range append(p1.Members, p2.Members...) {
		if ids[m.ID] {
			t.Fatalf("agent %d appears on both pages", m.ID)
		}
		ids[m.ID] = true
	}

	// Past the last page: empty list, still a sane payload.
	far, _ := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Page: 9})
	if len(far.Members) != 0 || far.Total != 15 {
		t.Fatalf("a page past the end is empty, got %d members / total %d", len(far.Members), far.Total)
	}

	// A filter narrows the list but never the summary.
	off, _ := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Status: "inactive"})
	if off.Total != 2 || len(off.Members) != 2 {
		t.Fatalf("inactive filter: total %d", off.Total)
	}
	if off.Summary.Registered != 14 || off.Summary.Active != 12 || off.Summary.Inactive != 2 || off.Summary.Pending != 1 {
		t.Fatalf("the summary must not follow the filter: %+v", off.Summary)
	}
	proc, _ := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Status: "pending"})
	if proc.Total != 1 || proc.Members[0].Status != "pending" {
		t.Fatalf("pending filter: %+v", proc.Total)
	}

	if _, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Status: "bogus"}); !errors.Is(err, service.ErrInvalidNetworkStatus) {
		t.Fatalf("an unknown status must be refused, got %v", err)
	}
	// The page size is capped.
	big, _ := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{PerPage: 5000})
	if big.PerPage != 50 {
		t.Fatalf("per_page must be capped at 50, got %d", big.PerPage)
	}
}

func TestAgentNetwork_Search(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-sr-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)

	budi := e.addRecruit(t, e.upline, "Budi Santoso", "active", "Kota Tasikmalaya")
	e.addRecruit(t, e.upline, "Siti Aminah", "active", "Kab. Bandung")
	e.addRecruit(t, e.upline, "100% Hemat_", "active", "Cianjur")

	names := func(q string) []string {
		n, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{Query: q})
		if err != nil {
			t.Fatalf("search %q: %v", q, err)
		}
		out := []string{}
		for _, m := range n.Members {
			out = append(out, m.Name)
		}
		return out
	}
	has := func(list []string, want string) bool {
		for _, s := range list {
			if s == want {
				return true
			}
		}
		return false
	}

	if got := names("budi"); len(got) != 1 || got[0] != "Budi Santoso" {
		t.Fatalf("by name, case-insensitive: %v", got)
	}
	if got := names("tasik"); len(got) != 1 || got[0] != "Budi Santoso" {
		t.Fatalf("by domicile: %v", got)
	}
	// The number is stored as 62812...; people type 0812...
	stored, err := e.agentRepo.GetByID(e.ctx, e.tenant.ID, budi.ID)
	if err != nil || stored.Phone == nil {
		t.Fatalf("reload recruit: %v", err)
	}
	local := "0" + (*stored.Phone)[2:]
	if got := names(local); !has(got, "Budi Santoso") {
		t.Fatalf("by number typed as %s: %v", local, got)
	}
	if got := names(*stored.Phone); !has(got, "Budi Santoso") {
		t.Fatalf("by number in international form: %v", got)
	}
	// Wildcards typed by the user match themselves, not everything.
	if got := names("%"); len(got) != 1 || got[0] != "100% Hemat_" {
		t.Fatalf("a typed %% must not be a wildcard: %v", got)
	}
	if got := names("_"); len(got) != 1 || got[0] != "100% Hemat_" {
		t.Fatalf("a typed _ must not be a wildcard: %v", got)
	}
	if got := names("tidak-ada-orang-ini"); len(got) != 0 {
		t.Fatalf("no match expected: %v", got)
	}
}

func TestAgentNetwork_NotActiveAgentCannotLook(t *testing.T) {
	e := setupOverrideCorrection(t, fmt.Sprintf("net-act-%d", time.Now().UnixNano()))
	svc, _ := newNetworkService(t)
	e.setUplineStatus(t, "pending")
	if _, err := svc.GetNetwork(e.ctx, e.tenant.ID, e.upline.ID, service.AgentNetworkQuery{}); !errors.Is(err, service.ErrAgentNotActive) {
		t.Fatalf("a pending agent must not see its network, got %v", err)
	}
}

// Cross-tenant (AGENTS 3.1): travel B can never read the network of travel A, by agent id, by repository,
// nor through a search term.
func TestAgentNetwork_CrossTenantIsolation(t *testing.T) {
	nano := time.Now().UnixNano()
	a := setupOverrideCorrection(t, fmt.Sprintf("net-xa-%d", nano))
	b := setupOverrideCorrection(t, fmt.Sprintf("net-xb-%d", nano))
	svc, netRepo := newNetworkService(t)

	if _, err := svc.GetNetwork(b.ctx, b.tenant.ID, a.upline.ID, service.AgentNetworkQuery{}); err == nil {
		t.Fatalf("an agent id of another travel must not resolve")
	}
	rows, total, err := netRepo.ListDirectRecruits(b.ctx, b.tenant.ID, a.upline.ID, repository.AgentNetworkFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 || total != 0 {
		t.Fatalf("tenant B must see no recruits of tenant A's upline, got %d", len(rows))
	}
	sum, err := netRepo.Summary(b.ctx, b.tenant.ID, a.upline.ID)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Active+sum.Inactive+sum.Pending != 0 || sum.OverrideReleased != 0 || sum.OverrideHeld != 0 {
		t.Fatalf("tenant B's summary of A's upline must be empty, got %+v", sum)
	}
	// Each travel sees only its own downline, also through a search term.
	netB, err := svc.GetNetwork(b.ctx, b.tenant.ID, b.upline.ID, service.AgentNetworkQuery{Query: "Downline D"})
	if err != nil {
		t.Fatal(err)
	}
	if netB.Total != 1 || netB.Members[0].ID != b.downline.ID {
		t.Fatalf("travel B network: %+v", netB)
	}
}
