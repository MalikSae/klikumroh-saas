package handler_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt putaran 5 (domains): the daily job counts at most one check per domain per ~day, however often
// the API restarts (the job runs shortly after every start); after 3 failed days the primary is set to
// failed TOGETHER with its active alias (one notification, link to the domain page); a domain of another
// travel is untouched.
func TestBugHunt5_DomainDailyRecheckAliasAndRestarts(t *testing.T) {
	ctx := context.Background()
	primaryID := uint64(1)
	repo := &recheckDomainRepo{&mockDomainRepo{domains: map[string]*repository.Domain{
		"www.travel-x.com":      {ID: primaryID, TenantID: 90, Hostname: "www.travel-x.com", Type: "custom", Status: "active"},
		"travel-x.com":          {ID: 2, TenantID: 90, Hostname: "travel-x.com", Type: "custom", Status: "active", RedirectToDomainID: &primaryID},
		"travel-x.klikumroh.id": {ID: 3, TenantID: 90, Hostname: "travel-x.klikumroh.id", Type: "subdomain", Status: "active"},
		"www.travel-y.com":      {ID: 4, TenantID: 91, Hostname: "www.travel-y.com", Type: "custom", Status: "active"},
	}}}
	dns := newMockDNSResolver()
	dns.responses["www.travel-y.com"] = service.ExpectedCNAMETarget + "."
	dns.responses["travel-x.com"] = service.ExpectedCNAMETarget + "." // the apex still points here
	// www.travel-x.com resolves nowhere.
	svc := service.NewDomainService(repo, dns)
	notif := &recordingNotifier{}
	svc.(interface {
		SetNotifier(service.NotificationService, repository.AdminUserRepository, service.StaffLister)
	}).SetNotifier(notif,
		&fixedAdmins{list: map[uint64][]repository.AdminUser{90: {{ID: 21, TenantID: 90, Status: "active"}}}},
		fixedStaff{{ID: 501, Status: "active"}})
	clock := time.Date(2026, 10, 6, 2, 0, 0, 0, time.UTC)
	svc.(interface{ SetClock(func() time.Time) }).SetClock(func() time.Time { return clock })

	run := func(after time.Duration) {
		clock = clock.Add(after)
		svc.RecheckActiveDomains(ctx)
	}
	for day := 1; day <= 2; day++ {
		run(24 * time.Hour)
		// Two restarts later the same day: the job runs again but must not count again.
		run(time.Hour)
		run(2 * time.Hour)
		p := repo.domains["www.travel-x.com"]
		t.Logf("day %d (+2 restarts): www.travel-x.com status=%s check_failures=%d", day, p.Status, p.CheckFailures)
		if p.Status != "active" || p.CheckFailures != day {
			t.Fatalf("day %d: restarts must not add failures, got %s/%d", day, p.Status, p.CheckFailures)
		}
	}
	run(21 * time.Hour) // 24h after the last counted check
	p, a := repo.domains["www.travel-x.com"], repo.domains["travel-x.com"]
	t.Logf("day 3: primary %s/%d reason=%q; alias %s reason=%q; notifications=%v",
		p.Status, p.CheckFailures, *p.VerificationFailureReason, a.Status, *a.VerificationFailureReason, notif.sent)
	if p.Status != "failed" || p.CheckFailures != 3 {
		t.Fatalf("primary must be failed after 3 daily failures, got %s/%d", p.Status, p.CheckFailures)
	}
	if a.Status != "failed" || !strings.Contains(*a.VerificationFailureReason, "Domain utama www.travel-x.com") {
		t.Fatalf("active alias must be deactivated with its primary, got %s %v", a.Status, a.VerificationFailureReason)
	}
	if !strings.Contains(*p.VerificationFailureReason, "3 pemeriksaan harian") {
		t.Fatalf("reason must state 3 daily checks, got %q", *p.VerificationFailureReason)
	}
	want := []string{"admin:21:domain_deactivated:/website/domain", "staff:501:domain_deactivated:/internal/tenants/90"}
	if strings.Join(notif.sent, ",") != strings.Join(want, ",") {
		t.Fatalf("one notification per recipient for the pair: got %v, want %v", notif.sent, want)
	}
	if y := repo.domains["www.travel-y.com"]; y.Status != "active" || y.CheckFailures != 0 {
		t.Fatalf("another travel's healthy domain must be untouched, got %s/%d", y.Status, y.CheckFailures)
	}
	// Neither host of the pair is served any more; the subdomain keeps working without redirect.
	for _, h := range []string{"www.travel-x.com", "travel-x.com", "travel-x.klikumroh.id"} {
		if d, err := svc.GetActiveCustomDomainByHost(ctx, h); err == nil {
			t.Fatalf("%s must not resolve to a custom domain any more, got %s", h, d.Hostname)
		}
	}
}

// The DNS failure reason shown to the travel never contains the resolver's error text (which names the
// server's own DNS resolver address).
func TestBugHunt5_DNSFailureReasonIsGeneric(t *testing.T) {
	ctx := context.Background()
	repo := newMockDomainRepoDedicated()
	dns := newMockDNSResolver()
	dns.errors["www.belum-ada.example"] = errors.New("lookup www.belum-ada.example on 127.0.0.53:53: no such host")
	svc := service.NewDomainService(repo, dns)
	d := &repository.Domain{TenantID: 5, Hostname: "www.belum-ada.example", Type: "custom", Status: "pending"}
	_ = repo.Create(ctx, 5, d)
	got, err := svc.VerifyDomain(ctx, 5, d.ID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	reason := *got.VerificationFailureReason
	t.Logf("failure reason: %q", reason)
	if strings.Contains(reason, "lookup") || strings.Contains(reason, "127.0.0") || strings.Contains(reason, ":53") {
		t.Fatalf("resolver details leaked into the reason: %q", reason)
	}
	if !strings.Contains(reason, "DNS domain belum bisa ditemukan") {
		t.Fatalf("expected the generic Indonesian DNS message, got %q", reason)
	}
}
