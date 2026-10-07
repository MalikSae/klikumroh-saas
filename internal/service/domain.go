package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"klikumroh/internal/repository"
)

const ExpectedCNAMETarget = "cname.klikumroh.id"

// VerificationTXTPrefix is the DNS name the travel adds a TXT record under: _klikumroh-verify.<hostname>.
const VerificationTXTPrefix = "_klikumroh-verify."

// MaxDomainCheckFailures: after this many failed DNS checks in a row, the default subdomain stops
// redirecting to the custom domain, and the daily recheck sets the domain to 'failed' (RecheckActiveDomains).
const MaxDomainCheckFailures = 3

// DomainVerificationToken is the TXT value that proves a travel controls hostname's DNS. It is bound to
// the tenant, so a claim can only be activated by the travel whose token the DNS owner published.
// It does not need to be secret: only whoever controls the domain's DNS can publish it.
func DomainVerificationToken(tenantID uint64, hostname string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("klikumroh-domain-verify|%d|%s", tenantID, strings.ToLower(strings.TrimSpace(hostname)))))
	return "klikumroh-verify=" + hex.EncodeToString(sum[:16])
}

var (
	ErrInvalidHostname       = errors.New("format hostname tidak valid")
	ErrDomainAlreadyUsed     = errors.New("domain sudah terdaftar di sistem")
	ErrCannotDeleteSubdomain = errors.New("subdomain default tidak dapat dihapus")
	ErrDomainNotCustom       = errors.New("hanya custom domain yang dapat diverifikasi")
	ErrAliasNotPossible      = errors.New("alias tanpa www hanya bisa untuk domain seperti www.namatravel.com")
	ErrPlatformHostname      = errors.New("domain dengan suffix klikumroh.id adalah domain bawaan sistem, bukan custom domain")
	// ErrDomainStillUsed: another travel's unverified row for this hostname still has a live (active) alias
	// pointing at it, so it cannot be released (answered 409).
	ErrDomainStillUsed = errors.New("Domain ini masih dipakai travel lain.")
)

// dailyCheckMinInterval: the daily DNS job counts at most one check per domain in this interval, so API
// restarts (the job also runs shortly after start) never speed up the "3 failed days in a row" rule.
const dailyCheckMinInterval = 20 * time.Hour

var hostnameRegex = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$`)

// DNSResolver defines the interface for DNS CNAME lookups so it can be cleanly mocked in tests.
type DNSResolver interface {
	LookupCNAME(hostname string) (string, error)
	LookupTXT(name string) ([]string, error)
	LookupIP(host string) ([]net.IP, error)
}

// NetDNSResolver is the standard implementation using Go's net package.
type NetDNSResolver struct{}

func (r *NetDNSResolver) LookupCNAME(hostname string) (string, error) {
	return net.LookupCNAME(hostname)
}

func (r *NetDNSResolver) LookupTXT(name string) ([]string, error) {
	return net.LookupTXT(name)
}

func (r *NetDNSResolver) LookupIP(host string) ([]net.IP, error) {
	return net.LookupIP(host)
}

// RegisterDomainResponse holds the created domain and instructions for DNS configuration.
type RegisterDomainResponse struct {
	Domain         *repository.Domain `json:"domain"`
	Hostname       string             `json:"hostname"`
	CNAMETarget    string             `json:"cname_target"`
	ARecordTargets []string           `json:"a_record_targets"`
	TXTName        string             `json:"txt_name"`
	TXTValue       string             `json:"txt_value"`
	Instruction    string             `json:"instruction"`
	// AliasDomain is the non-www domain registered together with the primary (redirected to it).
	AliasDomain *repository.Domain `json:"alias_domain,omitempty"`
}

// DomainService defines the business logic interface for domain management.
type DomainService interface {
	// RegisterCustomDomain registers hostname. With includeAlias, the pair www.X (primary) and X (alias,
	// redirected to www.X) is registered, whichever of the two was typed.
	RegisterCustomDomain(ctx context.Context, tenantID uint64, hostname string, includeAlias bool) (*RegisterDomainResponse, error)
	ListDomains(ctx context.Context, tenantID uint64) ([]repository.Domain, error)
	VerifyDomain(ctx context.Context, tenantID uint64, domainID uint64) (*repository.Domain, error)
	DeleteDomain(ctx context.Context, tenantID uint64, domainID uint64) error
	GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error)
	GetActiveCustomDomainByHost(ctx context.Context, host string) (*repository.Domain, error)
	// PlatformIPs are the addresses a root domain's A/AAAA records must point to (empty when unknown).
	PlatformIPs() []string
	// RecheckActiveDomains re-checks the CNAME of every active custom domain (daily job).
	RecheckActiveDomains(ctx context.Context) (checked int, failing int)
}

type domainService struct {
	domainRepo repository.DomainRepository
	resolver   DNSResolver
	// Notifications when the daily recheck takes a domain offline (optional, see SetNotifier).
	notif  NotificationService
	admins repository.AdminUserRepository
	staff  StaffLister
	// now is the clock of the daily job (tests advance it, see SetClock).
	now func() time.Time

	// Cached lookup of the platform addresses (see PlatformIPs): a live DNS lookup on every request made
	// the Domain tab wait for DNS, up to seconds when the name does not resolve.
	ipMu      sync.Mutex
	ipCache   []string
	ipExpires time.Time
}

// SetClock replaces the clock used by the daily DNS job (tests only).
func (s *domainService) SetClock(now func() time.Time) {
	s.now = now
}

func (s *domainService) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// NewDomainService creates a new DomainService instance.
func NewDomainService(domainRepo repository.DomainRepository, resolver DNSResolver) DomainService {
	if resolver == nil {
		resolver = &NetDNSResolver{}
	}
	return &domainService{
		domainRepo: domainRepo,
		resolver:   resolver,
	}
}

// cleanCustomHostname validates a hostname typed by a travel for use as a custom domain.
func cleanCustomHostname(raw string) (string, error) {
	cleaned := strings.TrimSpace(strings.ToLower(raw))
	if cleaned == "" || strings.HasPrefix(cleaned, "http://") || strings.HasPrefix(cleaned, "https://") || strings.Contains(cleaned, "/") || strings.Contains(cleaned, ":") {
		return "", ErrInvalidHostname
	}
	// Reject IP addresses.
	if net.ParseIP(cleaned) != nil {
		return "", ErrInvalidHostname
	}
	if !hostnameRegex.MatchString(cleaned) {
		return "", ErrInvalidHostname
	}
	// klikumroh.id and *.klikumroh.id are platform addresses, not custom domains.
	if cleaned == "klikumroh.id" || strings.HasSuffix(cleaned, ".klikumroh.id") {
		return "", ErrPlatformHostname
	}
	return cleaned, nil
}

// claimable reports whether this travel may register hostname. An unverified claim by another travel does
// not block it (only proof of DNS control activates a domain) and is released; an active domain, a default
// subdomain, or this travel's own row does block.
func (s *domainService) claimable(ctx context.Context, tenantID uint64, hostname string) error {
	existing, err := s.domainRepo.FindByHostname(ctx, hostname)
	if err == nil && existing != nil && existing.Hostname == hostname {
		if existing.Status == "active" || existing.Type != "custom" || existing.TenantID == tenantID {
			return fmt.Errorf("%w: %s", ErrDomainAlreadyUsed, hostname)
		}
		if err := s.domainRepo.ReleaseUnverifiedClaim(ctx, hostname, tenantID); err != nil {
			if errors.Is(err, repository.ErrDomainInUse) {
				return ErrDomainStillUsed
			}
			return err
		}
		return nil
	}
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return err
	}
	return nil
}

// wwwPair returns the primary (www.X) and alias (X) hostnames for either www.X or X.
func wwwPair(hostname string) (primary, alias string, err error) {
	if strings.HasPrefix(hostname, "www.") {
		primary, alias = hostname, strings.TrimPrefix(hostname, "www.")
	} else {
		primary, alias = "www."+hostname, hostname
	}
	if strings.Count(alias, ".") < 1 || !hostnameRegex.MatchString(alias) || !hostnameRegex.MatchString(primary) {
		return "", "", ErrAliasNotPossible
	}
	return primary, alias, nil
}

func (s *domainService) RegisterCustomDomain(ctx context.Context, tenantID uint64, rawHostname string, includeAlias bool) (*RegisterDomainResponse, error) {
	cleaned, err := cleanCustomHostname(rawHostname)
	if err != nil {
		return nil, err
	}
	primaryHost, aliasHost := cleaned, ""
	if includeAlias {
		if primaryHost, aliasHost, err = wwwPair(cleaned); err != nil {
			return nil, err
		}
		if _, err := cleanCustomHostname(primaryHost); err != nil {
			return nil, err
		}
	}

	// Re-adding the alias of a primary this travel already has (the alias was removed on its own):
	// keep the existing primary and only create the alias pointing at it.
	var existingPrimary *repository.Domain
	if aliasHost != "" {
		d, err := s.domainRepo.FindByHostname(ctx, primaryHost)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		if err == nil && d != nil && d.Hostname == primaryHost && d.TenantID == tenantID && d.Type == "custom" && d.RedirectToDomainID == nil {
			existingPrimary = d
		}
	}

	// Check every hostname before creating anything, so a blocked alias does not leave half a pair.
	if existingPrimary == nil {
		if err := s.claimable(ctx, tenantID, primaryHost); err != nil {
			return nil, err
		}
	}
	if aliasHost != "" {
		if err := s.claimable(ctx, tenantID, aliasHost); err != nil {
			return nil, err
		}
	}

	primary := existingPrimary
	if primary == nil {
		primary = &repository.Domain{TenantID: tenantID, Hostname: primaryHost, Type: "custom", Status: "pending"}
		if err := s.domainRepo.Create(ctx, tenantID, primary); err != nil {
			return nil, err
		}
	}
	var alias *repository.Domain
	if aliasHost != "" {
		alias = &repository.Domain{TenantID: tenantID, Hostname: aliasHost, Type: "custom", Status: "pending", RedirectToDomainID: &primary.ID}
		if err := s.domainRepo.Create(ctx, tenantID, alias); err != nil {
			if existingPrimary == nil {
				_ = s.domainRepo.Delete(ctx, tenantID, primary.ID)
			}
			return nil, err
		}
	}

	token := DomainVerificationToken(tenantID, primaryHost)
	primary.VerificationToken = token
	return &RegisterDomainResponse{
		Domain:         primary,
		Hostname:       primaryHost,
		CNAMETarget:    ExpectedCNAMETarget,
		ARecordTargets: s.PlatformIPs(),
		TXTName:        VerificationTXTPrefix + primaryHost,
		TXTValue:       token,
		Instruction:    fmt.Sprintf("Arahkan '%s' ke KlikUmroh (CNAME ke '%s', atau A record ke IP server untuk domain utama), lalu tambahkan TXT record '%s%s' berisi '%s'", primaryHost, ExpectedCNAMETarget, VerificationTXTPrefix, primaryHost, token),
		AliasDomain:    alias,
	}, nil
}

func (s *domainService) ListDomains(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	domains, err := s.domainRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	for i := range domains {
		// An alias is proven by its primary's TXT record, so only primaries carry a token.
		if domains[i].Type == "custom" && domains[i].Status != "active" && domains[i].RedirectToDomainID == nil {
			domains[i].VerificationToken = DomainVerificationToken(tenantID, domains[i].Hostname)
		}
	}
	return domains, nil
}

// PlatformIPs returns the platform server addresses: PLATFORM_IPS (comma-separated) when set, otherwise
// whatever cname.klikumroh.id resolves to, so the A-record target always follows the real server.
func (s *domainService) PlatformIPs() []string {
	var ips []string
	if env := strings.TrimSpace(os.Getenv("PLATFORM_IPS")); env != "" {
		for _, p := range strings.Split(env, ",") {
			if ip := net.ParseIP(strings.TrimSpace(p)); ip != nil {
				ips = append(ips, ip.String())
			}
		}
		return ips
	}
	s.ipMu.Lock()
	defer s.ipMu.Unlock()
	now := s.clock()
	if now.Before(s.ipExpires) {
		return append([]string(nil), s.ipCache...)
	}
	resolved, err := s.resolver.LookupIP(ExpectedCNAMETarget)
	if err != nil {
		// A failed lookup is remembered briefly too, so a name that does not resolve is not retried per request.
		s.ipCache, s.ipExpires = nil, now.Add(platformIPFailTTL)
		return nil
	}
	for _, ip := range resolved {
		ips = append(ips, ip.String())
	}
	s.ipCache, s.ipExpires = ips, now.Add(platformIPTTL)
	return append([]string(nil), ips...)
}

// reasonPlatformIPsUnknown: a root domain's A records cannot be checked because the platform's own
// addresses are unknown (lookup of cname.klikumroh.id failed, PLATFORM_IPS unset). That is KlikUmroh's
// problem, not the travel's, so the daily job does not count it as a failed check.
const reasonPlatformIPsUnknown = "alamat IP server KlikUmroh belum tersedia untuk verifikasi A record; hubungi tim KlikUmroh"

// How long PlatformIPs keeps a resolved (or failed) lookup of cname.klikumroh.id.
const (
	platformIPTTL     = 10 * time.Minute
	platformIPFailTTL = time.Minute
)

// cnameOK reports whether hostname points to the platform: a CNAME to cname.klikumroh.id (subdomains such
// as www.namatravel.com), or, for a root domain that cannot have a CNAME, A/AAAA records that all point to
// the platform server. A record set mixing platform and foreign addresses is rejected (visitors would be
// split between two servers).
func (s *domainService) cnameOK(hostname string) (bool, string) {
	expected := strings.TrimSuffix(strings.TrimSpace(strings.ToLower(ExpectedCNAMETarget)), ".")
	cnameResult, cnameErr := s.resolver.LookupCNAME(hostname)
	actual := strings.TrimSuffix(strings.TrimSpace(strings.ToLower(cnameResult)), ".")
	if cnameErr == nil && actual == expected {
		return true, ""
	}
	// Without a CNAME the resolver returns the hostname itself: check the address records instead.
	if cnameErr == nil && actual != "" && actual != strings.ToLower(hostname) {
		return false, fmt.Sprintf("CNAME mengarah ke '%s', seharusnya '%s'", actual, ExpectedCNAMETarget)
	}

	platform := map[string]bool{}
	for _, ip := range s.PlatformIPs() {
		platform[ip] = true
	}
	addrs, err := s.resolver.LookupIP(hostname)
	if err != nil || len(addrs) == 0 {
		if cnameErr != nil {
			// The resolver error text names the server's own DNS resolver (e.g. "lookup x on
			// 127.0.0.53:53"); it is logged, never stored or shown to the travel.
			log.Printf("[Domain] DNS lookup %s: %v", hostname, cnameErr)
			return false, "DNS domain belum bisa ditemukan (belum diatur, salah ketik, atau perubahan DNS belum menyebar). Coba lagi beberapa saat lagi."
		}
		return false, fmt.Sprintf("domain belum mengarah ke KlikUmroh (CNAME ke '%s' atau A record ke IP server)", ExpectedCNAMETarget)
	}
	if len(platform) == 0 {
		return false, reasonPlatformIPsUnknown
	}
	var foreign []string
	for _, ip := range addrs {
		if !platform[ip.String()] {
			foreign = append(foreign, ip.String())
		}
	}
	if len(foreign) > 0 {
		return false, fmt.Sprintf("A/AAAA record mengarah ke %s, seharusnya hanya ke %s", strings.Join(foreign, ", "), strings.Join(s.PlatformIPs(), ", "))
	}
	return true, ""
}

func (s *domainService) txtOK(tenantID uint64, hostname string) (bool, string) {
	name := VerificationTXTPrefix + hostname
	token := DomainVerificationToken(tenantID, hostname)
	records, err := s.resolver.LookupTXT(name)
	if err == nil {
		for _, rec := range records {
			if strings.TrimSpace(rec) == token {
				return true, ""
			}
		}
	}
	return false, fmt.Sprintf("TXT record '%s' berisi '%s' belum ditemukan", name, token)
}

// VerifyDomain checks a primary custom domain together with its alias (checking either one checks the
// pair) and returns the requested domain. A primary becomes active when it points to the platform AND its
// TXT record proves this travel controls the DNS. An active domain is only re-checked: a single failure
// does not take it offline (see recordCheck).
func (s *domainService) VerifyDomain(ctx context.Context, tenantID uint64, domainID uint64) (*repository.Domain, error) {
	domain, err := s.domainRepo.GetByID(ctx, tenantID, domainID)
	if err != nil {
		return nil, err
	}
	if domain.Type != "custom" {
		return nil, ErrDomainNotCustom
	}

	primary := domain
	if domain.RedirectToDomainID != nil {
		if primary, err = s.domainRepo.GetByID(ctx, tenantID, *domain.RedirectToDomainID); err != nil {
			return nil, err
		}
	}
	if primary, err = s.verifyPrimary(ctx, tenantID, primary); err != nil {
		return nil, err
	}

	all, err := s.domainRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].RedirectToDomainID != nil && *all[i].RedirectToDomainID == primary.ID {
			if _, err := s.verifyAlias(ctx, tenantID, &all[i], primary); err != nil {
				return nil, err
			}
		}
	}
	return s.domainRepo.GetByID(ctx, tenantID, domainID)
}

func (s *domainService) verifyPrimary(ctx context.Context, tenantID uint64, domain *repository.Domain) (*repository.Domain, error) {
	if domain.Status == "active" {
		return s.manualCheck(ctx, domain)
	}

	now := time.Now()
	domain.LastCheckAt = &now
	domain.LastVerificationAttemptAt = &now

	cnameOK, cnameReason := s.cnameOK(domain.Hostname)
	txtOK, txtReason := s.txtOK(tenantID, domain.Hostname)
	if cnameOK && txtOK {
		domain.Status = "active"
		domain.VerifiedAt = &now
		domain.DNSVerifiedAt = &now
		domain.VerificationFailureReason = nil
		domain.CheckFailures = 0
	} else {
		domain.Status = "failed"
		var reasons []string
		if !cnameOK {
			reasons = append(reasons, cnameReason)
		}
		if !txtOK {
			reasons = append(reasons, txtReason)
		}
		reason := strings.Join(reasons, "; ")
		domain.VerificationFailureReason = &reason
		domain.VerificationToken = DomainVerificationToken(tenantID, domain.Hostname)
	}

	if err := s.domainRepo.Update(ctx, tenantID, domain); err != nil {
		return nil, err
	}
	return domain, nil
}

// verifyAlias activates an alias (X) once its primary (www.X) is active and X points to the platform.
// The primary's TXT record already proved this travel controls the DNS of the zone both names live in,
// so the alias needs no TXT of its own; it must be exactly the primary without "www.".
func (s *domainService) verifyAlias(ctx context.Context, tenantID uint64, alias, primary *repository.Domain) (*repository.Domain, error) {
	if alias.Status == "active" {
		return s.manualCheck(ctx, alias)
	}
	now := time.Now()
	alias.LastCheckAt = &now
	alias.LastVerificationAttemptAt = &now

	var reason string
	switch {
	case primary.TenantID != tenantID || alias.TenantID != tenantID || !strings.HasPrefix(primary.Hostname, "www.") || strings.TrimPrefix(primary.Hostname, "www.") != alias.Hostname:
		reason = "alias tidak cocok dengan domain utamanya"
	case primary.Status != "active":
		reason = fmt.Sprintf("menunggu domain utama '%s' aktif", primary.Hostname)
	default:
		if ok, r := s.cnameOK(alias.Hostname); !ok {
			reason = r
		}
	}

	if reason == "" {
		alias.Status = "active"
		alias.VerifiedAt = &now
		alias.DNSVerifiedAt = &now
		alias.VerificationFailureReason = nil
		alias.CheckFailures = 0
	} else {
		alias.Status = "failed"
		alias.VerificationFailureReason = &reason
	}
	if err := s.domainRepo.Update(ctx, tenantID, alias); err != nil {
		return nil, err
	}
	return alias, nil
}

// manualCheck re-checks the CNAME of an active domain when the travel clicks "Verifikasi". It only
// reports (bug hunt putaran 5): a failure never increments check_failures, which counts the daily job's
// checks only ("gagal 3 hari berturut-turut"). A success resets the counter, so a travel that fixed its DNS
// gets the subdomain redirect back right away.
func (s *domainService) manualCheck(ctx context.Context, domain *repository.Domain) (*repository.Domain, error) {
	now := time.Now()
	domain.LastCheckAt = &now
	domain.LastVerificationAttemptAt = &now
	domain.DailyCheckAt = nil // keep the stored daily-check time (Update keeps it when nil)
	if ok, reason := s.cnameOK(domain.Hostname); ok {
		domain.CheckFailures = 0
		domain.VerificationFailureReason = nil
	} else {
		domain.VerificationFailureReason = &reason
	}
	if err := s.domainRepo.Update(ctx, domain.TenantID, domain); err != nil {
		return nil, err
	}
	return domain, nil
}

// dailyCheck re-checks the CNAME of an active domain for the daily job. A failure only increments
// check_failures and keeps the domain active (a DNS hiccup must not take a travel's site offline); after
// MaxDomainCheckFailures in a row the default subdomain stops redirecting to it. A success resets the
// counter. The check time is stored in daily_check_at.
func (s *domainService) dailyCheck(ctx context.Context, domain *repository.Domain, now time.Time) (*repository.Domain, error) {
	domain.LastCheckAt = &now
	domain.LastVerificationAttemptAt = &now
	domain.DailyCheckAt = &now
	if ok, reason := s.cnameOK(domain.Hostname); ok {
		domain.CheckFailures = 0
		domain.VerificationFailureReason = nil
	} else if reason == reasonPlatformIPsUnknown {
		// The platform lookup failed (cached for a minute, so it hits every root domain in this run):
		// not counted against the travel, which would otherwise lose its domain after 3 such days
		// (security audit 7 Oct 2026). The counter stays as it was.
		log.Printf("[Domain] daily recheck of %s skipped: platform IPs unknown", domain.Hostname)
	} else {
		domain.CheckFailures++
		domain.VerificationFailureReason = &reason
	}
	if err := s.domainRepo.Update(ctx, domain.TenantID, domain); err != nil {
		return nil, err
	}
	return domain, nil
}

// RecheckActiveDomains is the daily job: it re-checks the CNAME of every active custom domain
// (dailyCheck). A domain already counted less than dailyCheckMinInterval ago is skipped, so the run shortly
// after every API start never counts the same day twice. A domain whose check fails
// MaxDomainCheckFailures times in a row (a success resets the count) is set to 'failed' (keputusan
// pendiri 6 Okt 2026): it is no longer served, the Caddy ask endpoint (active custom domains only) stops
// approving certificates for it, and the travel can verify it again once DNS is fixed. The travel's admins
// and KlikUmroh staff are notified.
func (s *domainService) RecheckActiveDomains(ctx context.Context) (checked int, failing int) {
	domains, err := s.domainRepo.ListActiveCustom(ctx)
	if err != nil {
		log.Printf("[Domain] daily recheck: cannot list active domains: %v", err)
		return 0, 0
	}
	now := s.clock()
	deactivated := map[uint64]bool{}
	for i := range domains {
		if deactivated[domains[i].ID] {
			continue // alias already deactivated together with its primary in this run
		}
		if last := domains[i].DailyCheckAt; last != nil && now.Sub(*last) < dailyCheckMinInterval {
			continue
		}
		d, err := s.dailyCheck(ctx, &domains[i], now)
		if err != nil {
			log.Printf("[Domain] daily recheck of %s failed: %v", domains[i].Hostname, err)
			continue
		}
		checked++
		if d.CheckFailures > 0 {
			failing++
		}
		if d.CheckFailures >= MaxDomainCheckFailures {
			for _, id := range s.deactivateFailingDomain(ctx, d) {
				deactivated[id] = true
			}
		}
	}
	return checked, failing
}

// deactivateFailingDomain sets an active custom domain whose DNS check kept failing to 'failed', and
// returns the ids it deactivated.
//
// Its active aliases go with it (bug hunt putaran 5, chosen over keeping them online): an alias is proven
// only through its primary's TXT record and has no verification of its own, so once the primary is
// deactivated nothing proves the travel still controls the zone. Keeping the alias live would also leave
// an active row hanging off a non-active primary, the state that let another travel's claim cascade-delete
// a live alias. The travel re-verifies the pair with one "Verifikasi" click once DNS is fixed (VerifyDomain
// checks the primary and its aliases together), and the site stays reachable on its subdomain meanwhile.
func (s *domainService) deactivateFailingDomain(ctx context.Context, d *repository.Domain) []uint64 {
	days := d.CheckFailures
	detail := ""
	if d.VerificationFailureReason != nil {
		detail = ": " + *d.VerificationFailureReason
	}
	reason := fmt.Sprintf("DNS domain tidak lagi mengarah ke KlikUmroh dalam %d pemeriksaan harian berturut-turut%s. Perbaiki DNS lalu verifikasi ulang.", days, detail)
	d.Status = "failed"
	d.VerificationFailureReason = &reason
	if err := s.domainRepo.Update(ctx, d.TenantID, d); err != nil {
		log.Printf("[Domain] tenant %d: cannot deactivate %s after %d failed checks: %v", d.TenantID, d.Hostname, days, err)
		return nil
	}
	log.Printf("[Domain] tenant %d: %s deactivated after %d failed daily DNS checks", d.TenantID, d.Hostname, days)
	ids := []uint64{d.ID}
	hosts := []string{d.Hostname}

	if d.RedirectToDomainID == nil {
		all, err := s.domainRepo.ListByTenant(ctx, d.TenantID)
		if err != nil {
			log.Printf("[Domain] tenant %d: cannot list aliases of %s: %v", d.TenantID, d.Hostname, err)
		}
		for i := range all {
			a := &all[i]
			if a.RedirectToDomainID == nil || *a.RedirectToDomainID != d.ID || a.Status != "active" {
				continue
			}
			aliasReason := fmt.Sprintf("Domain utama %s dinonaktifkan karena DNS-nya tidak lagi mengarah ke KlikUmroh dalam %d pemeriksaan harian berturut-turut. Perbaiki DNS lalu verifikasi ulang.", d.Hostname, days)
			a.Status = "failed"
			a.VerificationFailureReason = &aliasReason
			a.DailyCheckAt = nil
			if err := s.domainRepo.Update(ctx, d.TenantID, a); err != nil {
				log.Printf("[Domain] tenant %d: cannot deactivate alias %s: %v", d.TenantID, a.Hostname, err)
				continue
			}
			log.Printf("[Domain] tenant %d: alias %s deactivated together with %s", d.TenantID, a.Hostname, d.Hostname)
			ids = append(ids, a.ID)
			hosts = append(hosts, a.Hostname)
		}
	}

	named := hosts[0]
	if len(hosts) > 1 {
		named = fmt.Sprintf("%s (beserta %s)", hosts[0], strings.Join(hosts[1:], ", "))
	}
	title := "Domain kustom dinonaktifkan"
	body := fmt.Sprintf("Domain %s tidak lagi mengarah ke KlikUmroh selama %d hari pemeriksaan berturut-turut, jadi dinonaktifkan. Website tetap bisa dibuka lewat subdomain KlikUmroh. Perbaiki DNS domain lalu verifikasi ulang di menu Website > Domain.", named, days)
	s.notifyDomain(ctx, d.TenantID, "admin", title, body, DomainSettingsLink)
	s.notifyDomain(ctx, d.TenantID, "staff", title,
		fmt.Sprintf("Domain %s milik travel #%d dinonaktifkan setelah %d pemeriksaan DNS harian gagal berturut-turut.", named, d.TenantID, days),
		fmt.Sprintf("/internal/tenants/%d", d.TenantID))
	return ids
}

// DomainSettingsLink is the travel dashboard page that manages custom domains.
const DomainSettingsLink = "/website/domain"

// SetNotifier enables notifications for domains taken offline by the daily recheck (wired in main).
func (s *domainService) SetNotifier(notif NotificationService, admins repository.AdminUserRepository, staff StaffLister) {
	s.notif = notif
	s.admins = admins
	s.staff = staff
}

// notifyDomain notifies the travel's active admins (recipient "admin") or every active staff member
// ("staff") about a domain of tenantID.
func (s *domainService) notifyDomain(ctx context.Context, tenantID uint64, recipient, title, body, link string) {
	if s.notif == nil {
		return
	}
	tID := tenantID
	switch recipient {
	case "admin":
		if s.admins == nil {
			return
		}
		admins, err := s.admins.ListByTenant(ctx, tenantID)
		if err != nil {
			log.Printf("[Domain] cannot list admins of tenant %d: %v", tenantID, err)
			return
		}
		for _, a := range admins {
			if a.Status != "active" {
				continue
			}
			if _, err := s.notif.CreateNotification(ctx, &tID, "admin", a.ID, "domain_deactivated", title, body, link); err != nil {
				log.Printf("[Domain] cannot notify admin %d: %v", a.ID, err)
			}
		}
	case "staff":
		if s.staff == nil {
			return
		}
		staff, err := s.staff.ListStaffUsers(ctx)
		if err != nil {
			log.Printf("[Domain] cannot list staff: %v", err)
			return
		}
		for _, u := range staff {
			if u.Status != "active" {
				continue
			}
			if _, err := s.notif.CreateNotification(ctx, &tID, "staff", u.ID, "domain_deactivated", title, body, link); err != nil {
				log.Printf("[Domain] cannot notify staff %d: %v", u.ID, err)
			}
		}
	}
}

func (s *domainService) DeleteDomain(ctx context.Context, tenantID uint64, domainID uint64) error {
	domain, err := s.domainRepo.GetByID(ctx, tenantID, domainID)
	if err != nil {
		return err
	}

	if domain.Type == "subdomain" {
		return ErrCannotDeleteSubdomain
	}

	// A primary takes its aliases with it (also enforced by the foreign key).
	if domain.RedirectToDomainID == nil {
		all, err := s.domainRepo.ListByTenant(ctx, tenantID)
		if err != nil {
			return err
		}
		for i := range all {
			if all[i].RedirectToDomainID != nil && *all[i].RedirectToDomainID == domain.ID {
				if err := s.domainRepo.Delete(ctx, tenantID, all[i].ID); err != nil && !errors.Is(err, repository.ErrNotFound) {
					return err
				}
			}
		}
	}
	return s.domainRepo.Delete(ctx, tenantID, domainID)
}

func (s *domainService) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error) {
	return s.domainRepo.GetActiveCustomDomain(ctx, tenantID)
}

func (s *domainService) GetActiveCustomDomainByHost(ctx context.Context, host string) (*repository.Domain, error) {
	// Strip port if present
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	// "travel.klikumroh.id." (with the root dot) is the same host as "travel.klikumroh.id".
	host = strings.TrimSuffix(strings.TrimSpace(strings.ToLower(host)), ".")
	if host == "" {
		return nil, repository.ErrNotFound
	}

	resolvedDomain, err := s.domainRepo.FindByHostname(ctx, host)
	if err != nil {
		return nil, err
	}

	// If resolvedDomain is not active, return not found
	if resolvedDomain.Status != "active" {
		return nil, repository.ErrNotFound
	}

	// A primary custom domain is served as is. An alias (namatravel.com) redirects to its primary
	// (www.namatravel.com) while that primary is active and its DNS healthy; otherwise the site is served
	// on the alias itself.
	if resolvedDomain.Type == "custom" {
		if resolvedDomain.RedirectToDomainID == nil {
			return nil, repository.ErrNotFound
		}
		primary, err := s.domainRepo.GetByID(ctx, resolvedDomain.TenantID, *resolvedDomain.RedirectToDomainID)
		if err != nil {
			return nil, err
		}
		if primary.Status != "active" || primary.CheckFailures >= MaxDomainCheckFailures {
			return nil, repository.ErrNotFound
		}
		return primary, nil
	}

	// If it's a subdomain, check if this tenant has an active custom domain
	customDomain, err := s.domainRepo.GetActiveCustomDomain(ctx, resolvedDomain.TenantID)
	if err != nil {
		return nil, err
	}
	// DNS has failed repeatedly: keep visitors (and referral links) on the working subdomain.
	if customDomain.CheckFailures >= MaxDomainCheckFailures {
		return nil, repository.ErrNotFound
	}

	return customDomain, nil
}
