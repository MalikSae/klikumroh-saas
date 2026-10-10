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

// Links an agent shares (referral, recruit, per-package referral) and the commission shown in the invite
// message, against real MySQL.

type agentLinksEnv struct {
	ctx        context.Context
	svc        service.AgentService
	domainRepo repository.DomainRepository
	pkgRepo    repository.PackageRepository
	tenant     *repository.Tenant
	agent      *repository.Agent
}

func setupAgentLinks(t *testing.T) *agentLinksEnv {
	t.Helper()
	db := setupTestDB(t)
	ctx := context.Background()
	e := &agentLinksEnv{
		ctx:        ctx,
		domainRepo: repository.NewDomainRepository(db),
		pkgRepo:    repository.NewPackageRepository(db),
	}
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	nano := time.Now().UnixNano()
	e.tenant = createDummyTenant(t, ctx, tenantRepo, fmt.Sprintf("links-%d", nano))
	e.agent = &repository.Agent{
		Name: "Agen Tautan", Phone: strPtr(fmt.Sprintf("0819%08d", nano%100000000)),
		ReferralCode: fmt.Sprintf("LK%d", nano), Status: "active",
	}
	if err := agentRepo.Create(ctx, e.tenant.ID, e.agent); err != nil {
		t.Fatal(err)
	}
	e.svc = service.NewAgentService(
		agentRepo,
		repository.NewAgentSessionRepository(db),
		tenantRepo,
		repository.NewCommissionLedgerRepository(db),
		repository.NewProspectRepository(db),
		repository.NewCommissionPayoutRequestRepository(db),
		nil, nil, nil,
		service.WithCustomDomains(e.domainRepo),
		service.WithPackages(e.pkgRepo),
	)
	return e
}

func (e *agentLinksEnv) addPackage(t *testing.T, name string, commission *float64, status string, departure *time.Time) {
	t.Helper()
	p := &repository.Package{Name: name, CommissionAmount: commission, Status: status, DepartureDate: departure}
	if err := e.pkgRepo.Create(e.ctx, e.tenant.ID, p); err != nil {
		t.Fatalf("package %s: %v", name, err)
	}
}

func (e *agentLinksEnv) addCustomDomain(t *testing.T, hostname string) *repository.Domain {
	t.Helper()
	d := &repository.Domain{Hostname: hostname, Type: "custom", Status: "active"}
	if err := e.domainRepo.Create(e.ctx, e.tenant.ID, d); err != nil {
		t.Fatalf("domain: %v", err)
	}
	return d
}

func TestAgentLinks_UseRequestHostWithoutCustomDomain(t *testing.T) {
	e := setupAgentLinks(t)
	sum, err := e.svc.GetDashboardSummary(e.ctx, e.tenant.ID, e.agent.ID, "mabrur.klikumroh.id")
	if err != nil {
		t.Fatal(err)
	}
	if want := "https://mabrur.klikumroh.id/ref/" + e.agent.ReferralCode; sum.ReferralLink != want {
		t.Fatalf("referral link %q, want %q", sum.ReferralLink, want)
	}
	if !strings.HasPrefix(sum.RecruitLink, "https://mabrur.klikumroh.id/agen/daftar?ref=") {
		t.Fatalf("recruit link %q", sum.RecruitLink)
	}
}

func TestAgentLinks_ActiveCustomDomainWinsOverTheRequestHost(t *testing.T) {
	e := setupAgentLinks(t)
	e.addCustomDomain(t, fmt.Sprintf("www.mabrur-%d.example", time.Now().UnixNano()))
	d, err := e.domainRepo.GetActiveCustomDomain(e.ctx, e.tenant.ID)
	if err != nil {
		t.Fatal(err)
	}

	// The portal is open on the default subdomain, yet the shared links point to the custom domain.
	sum, err := e.svc.GetDashboardSummary(e.ctx, e.tenant.ID, e.agent.ID, "mabrur.klikumroh.id")
	if err != nil {
		t.Fatal(err)
	}
	if want := "https://" + d.Hostname + "/ref/" + e.agent.ReferralCode; sum.ReferralLink != want {
		t.Fatalf("referral link %q, want %q", sum.ReferralLink, want)
	}
	if !strings.HasPrefix(sum.RecruitLink, "https://"+d.Hostname+"/agen/daftar?ref=") {
		t.Fatalf("recruit link must use the custom domain, got %q", sum.RecruitLink)
	}
	if strings.Contains(sum.ReferralLink, "klikumroh.id") || strings.Contains(sum.RecruitLink, "klikumroh.id") {
		t.Fatalf("no link may keep the default subdomain: %q / %q", sum.ReferralLink, sum.RecruitLink)
	}
}

func TestAgentLinks_BrokenCustomDomainKeepsTheWorkingHost(t *testing.T) {
	e := setupAgentLinks(t)
	d := e.addCustomDomain(t, fmt.Sprintf("www.rusak-%d.example", time.Now().UnixNano()))
	stored, err := e.domainRepo.GetByID(e.ctx, e.tenant.ID, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	stored.CheckFailures = service.MaxDomainCheckFailures
	if err := e.domainRepo.Update(e.ctx, e.tenant.ID, stored); err != nil {
		t.Fatal(err)
	}
	sum, err := e.svc.GetDashboardSummary(e.ctx, e.tenant.ID, e.agent.ID, "mabrur.klikumroh.id")
	if err != nil {
		t.Fatal(err)
	}
	if want := "https://mabrur.klikumroh.id/ref/" + e.agent.ReferralCode; sum.ReferralLink != want {
		t.Fatalf("a custom domain that keeps failing must not be linked, got %q", sum.ReferralLink)
	}
}

func TestAgentLinks_MaxCommissionOnlyFromPackagesOnSale(t *testing.T) {
	e := setupAgentLinks(t)
	sum, err := e.svc.GetDashboardSummary(e.ctx, e.tenant.ID, e.agent.ID, "mabrur.klikumroh.id")
	if err != nil {
		t.Fatal(err)
	}
	if sum.MaxCommissionPerJamaah != nil {
		t.Fatalf("no package: expected nil, got %v", *sum.MaxCommissionPerJamaah)
	}

	c := func(v float64) *float64 { return &v }
	future := time.Now().AddDate(0, 2, 0)
	past := time.Now().AddDate(0, -1, 0)
	e.addPackage(t, "Reguler", c(1500000), "published", &future)
	e.addPackage(t, "Plus", c(2000000), "published", nil)
	e.addPackage(t, "Draf mahal", c(5000000), "draft", &future)
	e.addPackage(t, "Sudah berangkat", c(9000000), "published", &past)
	e.addPackage(t, "Tanpa komisi", nil, "published", &future)

	sum, err = e.svc.GetDashboardSummary(e.ctx, e.tenant.ID, e.agent.ID, "mabrur.klikumroh.id")
	if err != nil {
		t.Fatal(err)
	}
	if sum.MaxCommissionPerJamaah == nil || *sum.MaxCommissionPerJamaah != 2000000 {
		t.Fatalf("expected 2000000 (published, not departed), got %v", sum.MaxCommissionPerJamaah)
	}
}

// Cross-tenant: another travel's packages never raise this travel's figure.
func TestAgentLinks_MaxCommissionIgnoresOtherTravels(t *testing.T) {
	a := setupAgentLinks(t)
	b := setupAgentLinks(t)
	hi := 8000000.0
	b.addPackage(t, "Paket travel B", &hi, "published", nil)

	sum, err := a.svc.GetDashboardSummary(a.ctx, a.tenant.ID, a.agent.ID, "a.klikumroh.id")
	if err != nil {
		t.Fatal(err)
	}
	if sum.MaxCommissionPerJamaah != nil {
		t.Fatalf("travel A has no packages with commission, got %v", *sum.MaxCommissionPerJamaah)
	}
}
