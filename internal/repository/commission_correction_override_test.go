package repository_test

import (
	"context"
	"fmt"
	"math"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type overrideCorrectionEnv struct {
	ctx        context.Context
	tenantRepo repository.TenantRepository
	agentRepo  repository.AgentRepository
	ledgerRepo repository.CommissionLedgerRepository
	svc        service.ProspectService
	tenant     *repository.Tenant
	adminID    uint64
	upline     *repository.Agent
	downline   *repository.Agent
	pkg        *repository.Package
	prospect   *repository.Prospect
}

// setupOverrideCorrection: override 10%, package commission Rp1.000.000, upline U -> downline D.
func setupOverrideCorrection(t *testing.T, slug string) *overrideCorrectionEnv {
	t.Helper()
	db := setupTestDB(t)
	ctx := context.Background()
	e := &overrideCorrectionEnv{
		ctx:        ctx,
		tenantRepo: repository.NewTenantRepository(db),
		agentRepo:  repository.NewAgentRepository(db),
		ledgerRepo: repository.NewCommissionLedgerRepository(db),
	}
	packageRepo := repository.NewPackageRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)

	e.tenant = createDummyTenant(t, ctx, e.tenantRepo, slug)
	admin := &repository.AdminUser{TenantID: e.tenant.ID, Email: fmt.Sprintf("admin-%d@example.com", e.tenant.ID), PasswordHash: "hashed", Name: "Admin"}
	if err := adminRepo.Create(ctx, e.tenant.ID, admin); err != nil {
		t.Fatal(err)
	}
	e.adminID = admin.ID

	nano := time.Now().UnixNano()
	e.upline = &repository.Agent{Name: "Upline U", Phone: strPtr(fmt.Sprintf("0811%08d", nano%100000000)), ReferralCode: fmt.Sprintf("UP%d", nano), Status: "active"}
	if err := e.agentRepo.Create(ctx, e.tenant.ID, e.upline); err != nil {
		t.Fatal(err)
	}
	e.downline = &repository.Agent{Name: "Downline D", Phone: strPtr(fmt.Sprintf("0812%08d", nano%100000000)), ReferralCode: fmt.Sprintf("DN%d", nano), ParentAgentID: &e.upline.ID, Status: "active"}
	if err := e.agentRepo.Create(ctx, e.tenant.ID, e.downline); err != nil {
		t.Fatal(err)
	}

	comm := 1000000.0
	e.pkg = &repository.Package{Name: "Paket Override", CommissionAmount: &comm, Status: "published"}
	if err := packageRepo.Create(ctx, e.tenant.ID, e.pkg); err != nil {
		t.Fatal(err)
	}
	pct := 10.0
	if err := e.tenantRepo.UpdateCommissionSettings(ctx, e.tenant.ID, true, &pct); err != nil {
		t.Fatal(err)
	}

	e.svc = service.NewProspectService(prospectRepo, packageRepo, e.agentRepo, e.tenantRepo, e.ledgerRepo,
		repository.NewProspectStatusHistoryRepository(db), repository.NewProspectNoteRepository(db), nil, nil)

	e.prospectRepoCreate(t, prospectRepo)
	return e
}

func (e *overrideCorrectionEnv) prospectRepoCreate(t *testing.T, prospectRepo repository.ProspectRepository) {
	t.Helper()
	one := 1
	p := &repository.Prospect{TenantID: e.tenant.ID, Name: "Jamaah Override", Phone: fmt.Sprintf("0813%08d", time.Now().UnixNano()%100000000),
		PackageID: &e.pkg.ID, AgentID: &e.downline.ID, JumlahJamaah: &one, SourceChannel: "agen", Status: "baru"}
	if err := prospectRepo.Create(e.ctx, e.tenant.ID, p); err != nil {
		t.Fatal(err)
	}
	e.prospect = p
}

func (e *overrideCorrectionEnv) setUplineStatus(t *testing.T, status string) {
	t.Helper()
	if err := e.agentRepo.UpdateStatus(e.ctx, e.tenant.ID, e.upline.ID, status); err != nil {
		t.Fatal(err)
	}
}

func (e *overrideCorrectionEnv) netByAgent(t *testing.T, prospectID uint64) map[uint64]float64 {
	t.Helper()
	ledgers, err := e.ledgerRepo.ListByProspect(e.ctx, e.tenant.ID, prospectID)
	if err != nil {
		t.Fatal(err)
	}
	net := map[uint64]float64{}
	for _, l := range ledgers {
		net[l.AgentID] += l.Amount
	}
	return net
}

func (e *overrideCorrectionEnv) setJamaah(t *testing.T, p *repository.Prospect, n int) {
	t.Helper()
	reason := fmt.Sprintf("Jumlah jamaah menjadi %d", n)
	in := service.UpdateProspectInput{Name: p.Name, Phone: p.Phone, PackageID: p.PackageID, JumlahJamaah: &n, CorrectionReason: &reason}
	if err := e.svc.UpdateDetail(e.ctx, e.tenant.ID, p.ID, e.adminID, in); err != nil {
		t.Fatalf("UpdateDetail jamaah=%d: %v", n, err)
	}
}

func approxEq(a, b float64) bool { return math.Abs(a-b) < 0.005 }

// M6 scenario A: the upline was inactive when the downline's prospect was closed (direct row only). After
// the upline is reactivated, a jamaah change must not book any override for the upline.
func TestCommissionCorrection_NoRetroactiveOverride(t *testing.T) {
	e := setupOverrideCorrection(t, "ovr_retro")
	p := e.prospect

	e.setUplineStatus(t, "inactive")
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if net := e.netByAgent(t, p.ID); !approxEq(net[e.downline.ID], 1000000) || net[e.upline.ID] != 0 {
		t.Fatalf("after closing with inactive upline: %+v", net)
	}

	e.setUplineStatus(t, "active")
	e.setJamaah(t, p, 2)

	net := e.netByAgent(t, p.ID)
	if !approxEq(net[e.downline.ID], 2000000) {
		t.Fatalf("downline direct must follow the jamaah change to 2.000.000, got %.2f", net[e.downline.ID])
	}
	if net[e.upline.ID] != 0 {
		t.Fatalf("upline must get no retroactive override, got %.2f", net[e.upline.ID])
	}

	// Same with override switched off at closing time and switched on later (fresh prospect).
	e2 := setupOverrideCorrection(t, "ovr_retro2")
	p2 := e2.prospect
	if err := e2.tenantRepo.UpdateCommissionSettings(e2.ctx, e2.tenant.ID, false, nil); err != nil {
		t.Fatal(err)
	}
	if err := e2.svc.UpdateStatus(e2.ctx, e2.tenant.ID, p2.ID, e2.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	pct := 10.0
	if err := e2.tenantRepo.UpdateCommissionSettings(e2.ctx, e2.tenant.ID, true, &pct); err != nil {
		t.Fatal(err)
	}
	e2.setJamaah(t, p2, 3)
	if net := e2.netByAgent(t, p2.ID); !approxEq(net[e2.downline.ID], 3000000) || net[e2.upline.ID] != 0 {
		t.Fatalf("override switched on after closing must not pay retroactively: %+v", net)
	}
}

// M6 scenario B: first closing had direct + override; it is cancelled ("Batalkan Closing"), the upline is
// deactivated and the prospect closed again (direct only). A jamaah change must use only the current
// closing's rows: no override for the inactive upline from the cancelled closing's ratio.
func TestCommissionCorrection_IgnoresCancelledClosing(t *testing.T) {
	e := setupOverrideCorrection(t, "ovr_cancel")
	p := e.prospect

	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("first closing: %v", err)
	}
	if net := e.netByAgent(t, p.ID); !approxEq(net[e.downline.ID], 1000000) || !approxEq(net[e.upline.ID], 100000) {
		t.Fatalf("first closing must book direct 1.000.000 + override 100.000: %+v", net)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenant.ID, p.ID, e.adminID, "jamaah batal"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if net := e.netByAgent(t, p.ID); net[e.downline.ID] != 0 || net[e.upline.ID] != 0 {
		t.Fatalf("cancel must reverse everything: %+v", net)
	}

	e.setUplineStatus(t, "inactive")
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("re-closing: %v", err)
	}
	e.setJamaah(t, p, 2)

	net := e.netByAgent(t, p.ID)
	if !approxEq(net[e.downline.ID], 2000000) {
		t.Fatalf("downline must have 2.000.000, got %.2f", net[e.downline.ID])
	}
	if net[e.upline.ID] != 0 {
		t.Fatalf("inactive upline must get no override from the cancelled closing, got %.2f", net[e.upline.ID])
	}

	// Control: when the re-closing does carry an override (upline active again), its own share is kept.
	e2 := setupOverrideCorrection(t, "ovr_cancel2")
	p2 := e2.prospect
	if err := e2.svc.UpdateStatus(e2.ctx, e2.tenant.ID, p2.ID, e2.adminID, "closing", nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := e2.svc.CancelClosing(e2.ctx, e2.tenant.ID, p2.ID, e2.adminID, "jamaah batal"); err != nil {
		t.Fatal(err)
	}
	if err := e2.svc.UpdateStatus(e2.ctx, e2.tenant.ID, p2.ID, e2.adminID, "closing", nil, nil); err != nil {
		t.Fatal(err)
	}
	e2.setJamaah(t, p2, 2)
	if net := e2.netByAgent(t, p2.ID); !approxEq(net[e2.downline.ID], 2000000) || !approxEq(net[e2.upline.ID], 200000) {
		t.Fatalf("re-closing with override: want direct 2.000.000 and override 200.000, got %+v", net)
	}
}
