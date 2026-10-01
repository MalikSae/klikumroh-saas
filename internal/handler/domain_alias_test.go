package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"klikumroh/internal/handler"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Domain alias (1 Oct 2026, founder decision: non-www redirects to www with 307). A travel registers
// www.X together with X; X is an alias proven by www.X's TXT record and redirected to www.X.

const aliasPlatformIP = "203.0.113.10"

type aliasEnv struct {
	repo   *mockDomainRepoDedicated
	dns    *mockDNSResolver
	svc    service.DomainService
	router http.Handler
}

func newAliasEnv(t *testing.T, tenantID uint64) *aliasEnv {
	t.Helper()
	t.Setenv("PLATFORM_IPS", aliasPlatformIP)
	repo := newMockDomainRepoDedicated()
	dns := newMockDNSResolver()
	svc := service.NewDomainService(repo, dns)
	return &aliasEnv{repo: repo, dns: dns, svc: svc, router: setupDomainTestRouter(handler.NewDomainHandler(svc, repo), tenantID)}
}

// pointPair makes www.<zone> a CNAME to the platform with the tenant's TXT, and <zone> an A record to ip.
func (e *aliasEnv) pointPair(tenantID uint64, zone, ip string) {
	e.dns.responses["www."+zone] = service.ExpectedCNAMETarget + "."
	e.dns.txt[service.VerificationTXTPrefix+"www."+zone] = []string{service.DomainVerificationToken(tenantID, "www."+zone)}
	e.dns.responses[zone] = zone + "."
	e.dns.ips[zone] = []string{ip}
}

func (e *aliasEnv) byHost(host string) *repository.Domain {
	d, err := e.repo.FindByHostname(context.Background(), host)
	if err != nil {
		return nil
	}
	return d
}

func (e *aliasEnv) target(t *testing.T, host string) string {
	t.Helper()
	rr := httptest.NewRecorder()
	e.router.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/public/custom-domain-target?host="+host, nil))
	var body struct {
		CustomDomain *string `json:"custom_domain"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body.CustomDomain == nil {
		return ""
	}
	return *body.CustomDomain
}

func (e *aliasEnv) ask(host string) int {
	rr := httptest.NewRecorder()
	e.router.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/internal/domain-ask?domain="+host, nil))
	return rr.Code
}

func TestDomainAlias_RegisterPair(t *testing.T) {
	ctx := context.Background()
	for _, typed := range []string{"www.namatravel.com", "namatravel.com"} {
		e := newAliasEnv(t, 1)
		res, err := e.svc.RegisterCustomDomain(ctx, 1, typed, true)
		if err != nil {
			t.Fatalf("%s: register: %v", typed, err)
		}
		if res.Hostname != "www.namatravel.com" || res.AliasDomain == nil || res.AliasDomain.Hostname != "namatravel.com" {
			t.Fatalf("%s: expected primary www.namatravel.com + alias namatravel.com, got %+v", typed, res)
		}
		alias := e.byHost("namatravel.com")
		if alias.RedirectToDomainID == nil || *alias.RedirectToDomainID != res.Domain.ID {
			t.Fatalf("%s: alias must point to the primary: %+v", typed, alias)
		}
	}
}

func TestDomainAlias_BlockedAliasLeavesNothing(t *testing.T) {
	ctx := context.Background()
	e := newAliasEnv(t, 1)
	// Another travel already runs namatravel.com.
	_ = e.repo.Create(ctx, 2, &repository.Domain{Hostname: "namatravel.com", Type: "custom", Status: "active"})
	if _, err := e.svc.RegisterCustomDomain(ctx, 1, "www.namatravel.com", true); !errors.Is(err, service.ErrDomainAlreadyUsed) {
		t.Fatalf("expected ErrDomainAlreadyUsed, got %v", err)
	}
	if e.byHost("www.namatravel.com") != nil {
		t.Fatal("a blocked alias must not leave the primary registered")
	}
}

func TestDomainAlias_VerifyPairAndRedirect(t *testing.T) {
	ctx := context.Background()
	e := newAliasEnv(t, 1)
	_ = e.repo.Create(ctx, 1, &repository.Domain{Hostname: "travela.klikumroh.id", Type: "subdomain", Status: "active"})
	res, err := e.svc.RegisterCustomDomain(ctx, 1, "namatravel.com", true)
	if err != nil {
		t.Fatal(err)
	}
	alias := e.byHost("namatravel.com")

	// Pending alias: no certificate, no redirect.
	if code := e.ask("namatravel.com"); code != http.StatusNotFound {
		t.Fatalf("ask for a pending alias must be 404, got %d", code)
	}

	// Checking the alias checks the pair.
	e.pointPair(1, "namatravel.com", aliasPlatformIP)
	if _, err := e.svc.VerifyDomain(ctx, 1, alias.ID); err != nil {
		t.Fatal(err)
	}
	if p, a := e.byHost("www.namatravel.com"), e.byHost("namatravel.com"); p.Status != "active" || a.Status != "active" {
		t.Fatalf("both must be active: primary=%s alias=%s (%v)", p.Status, a.Status, a.VerificationFailureReason)
	}
	if code := e.ask("namatravel.com"); code != http.StatusOK {
		t.Fatalf("ask for an active alias must be 200, got %d", code)
	}

	// The alias redirects to the primary; the subdomain goes to the primary, never to the alias.
	if got := e.target(t, "namatravel.com"); got != "www.namatravel.com" {
		t.Fatalf("alias target: expected www.namatravel.com, got %q", got)
	}
	if got := e.target(t, "www.namatravel.com"); got != "" {
		t.Fatalf("the primary must not redirect, got %q", got)
	}
	for i := 0; i < 20; i++ {
		if got := e.target(t, "travela.klikumroh.id"); got != "www.namatravel.com" {
			t.Fatalf("subdomain target must always be the primary, got %q", got)
		}
	}

	// Primary DNS failing repeatedly: the alias serves the site itself instead of redirecting.
	p := e.byHost("www.namatravel.com")
	p.CheckFailures = service.MaxDomainCheckFailures
	_ = e.repo.Update(ctx, 1, p)
	if got := e.target(t, "namatravel.com"); got != "" {
		t.Fatalf("no redirect to a failing primary, got %q", got)
	}
	_ = res
}

func TestDomainAlias_ForeignIPAndPendingPrimary(t *testing.T) {
	ctx := context.Background()

	// Alias pointing elsewhere: primary active, alias failed.
	e := newAliasEnv(t, 1)
	res, _ := e.svc.RegisterCustomDomain(ctx, 1, "www.namatravel.com", true)
	e.pointPair(1, "namatravel.com", "198.51.100.99")
	_, _ = e.svc.VerifyDomain(ctx, 1, res.Domain.ID)
	if p, a := e.byHost("www.namatravel.com"), e.byHost("namatravel.com"); p.Status != "active" || a.Status != "failed" {
		t.Fatalf("expected primary active and alias failed, got %s/%s", p.Status, a.Status)
	}

	// Primary without TXT: the alias waits for it even when its own A record is right.
	e2 := newAliasEnv(t, 1)
	res2, _ := e2.svc.RegisterCustomDomain(ctx, 1, "www.namatravel.com", true)
	e2.pointPair(1, "namatravel.com", aliasPlatformIP)
	delete(e2.dns.txt, service.VerificationTXTPrefix+"www.namatravel.com")
	_, _ = e2.svc.VerifyDomain(ctx, 1, res2.Domain.ID)
	a := e2.byHost("namatravel.com")
	if a.Status != "failed" || a.VerificationFailureReason == nil || !strings.Contains(*a.VerificationFailureReason, "menunggu domain utama") {
		t.Fatalf("alias must wait for its primary, got %s %v", a.Status, a.VerificationFailureReason)
	}
}

func TestDomainAlias_CrossTenant(t *testing.T) {
	ctx := context.Background()
	e := newAliasEnv(t, 1)
	res, _ := e.svc.RegisterCustomDomain(ctx, 1, "www.namatravel.com", true)
	alias := e.byHost("namatravel.com")

	// Tenant 2 cannot check or delete tenant 1's alias or primary.
	if _, err := e.svc.VerifyDomain(ctx, 2, alias.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("tenant 2 verifying tenant 1's alias: expected ErrNotFound, got %v", err)
	}
	if err := e.svc.DeleteDomain(ctx, 2, res.Domain.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("tenant 2 deleting tenant 1's primary: expected ErrNotFound, got %v", err)
	}

	// DNS carrying tenant 2's TXT token does not activate tenant 1's pair.
	e.pointPair(2, "namatravel.com", aliasPlatformIP)
	_, _ = e.svc.VerifyDomain(ctx, 1, res.Domain.ID)
	if p, a := e.byHost("www.namatravel.com"), e.byHost("namatravel.com"); p.Status == "active" || a.Status == "active" {
		t.Fatalf("another tenant's TXT must not activate the pair: %s/%s", p.Status, a.Status)
	}
}

func TestDomainAlias_DeletePrimaryRemovesAlias(t *testing.T) {
	ctx := context.Background()
	e := newAliasEnv(t, 1)
	res, _ := e.svc.RegisterCustomDomain(ctx, 1, "www.namatravel.com", true)
	if err := e.svc.DeleteDomain(ctx, 1, res.Domain.ID); err != nil {
		t.Fatal(err)
	}
	if e.byHost("namatravel.com") != nil || e.byHost("www.namatravel.com") != nil {
		t.Fatal("deleting the primary must remove its alias")
	}
}
