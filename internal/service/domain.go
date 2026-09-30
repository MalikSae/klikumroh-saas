package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"regexp"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

const ExpectedCNAMETarget = "cname.klikumroh.id"

// VerificationTXTPrefix is the DNS name the travel adds a TXT record under: _klikumroh-verify.<hostname>.
const VerificationTXTPrefix = "_klikumroh-verify."

// MaxDomainCheckFailures: after this many failed DNS checks in a row, the default subdomain stops
// redirecting to the custom domain (the domain itself stays active until DNS is fixed or it is removed).
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
)

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
}

// DomainService defines the business logic interface for domain management.
type DomainService interface {
	RegisterCustomDomain(ctx context.Context, tenantID uint64, hostname string) (*RegisterDomainResponse, error)
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

func (s *domainService) RegisterCustomDomain(ctx context.Context, tenantID uint64, rawHostname string) (*RegisterDomainResponse, error) {
	cleaned := strings.TrimSpace(strings.ToLower(rawHostname))

	// Validate basic hostname format
	if cleaned == "" || strings.HasPrefix(cleaned, "http://") || strings.HasPrefix(cleaned, "https://") || strings.Contains(cleaned, "/") || strings.Contains(cleaned, ":") {
		return nil, ErrInvalidHostname
	}

	// Reject if IP address
	if net.ParseIP(cleaned) != nil {
		return nil, ErrInvalidHostname
	}

	if !hostnameRegex.MatchString(cleaned) {
		return nil, ErrInvalidHostname
	}

	// Reject if attempting to register klikumroh.id itself or *.klikumroh.id as custom domain
	if cleaned == "klikumroh.id" || strings.HasSuffix(cleaned, ".klikumroh.id") {
		return nil, errors.New("domain dengan suffix klikumroh.id adalah domain bawaan sistem, bukan custom domain")
	}

	// An unverified claim by another travel does not block this one: only proof of DNS control (TXT)
	// activates a domain. An active domain, a default subdomain, or this travel's own row does block.
	existing, err := s.domainRepo.FindByHostname(ctx, cleaned)
	if err == nil && existing != nil && existing.Hostname == cleaned {
		if existing.Status == "active" || existing.Type != "custom" || existing.TenantID == tenantID {
			return nil, ErrDomainAlreadyUsed
		}
		if err := s.domainRepo.ReleaseUnverifiedClaim(ctx, cleaned, tenantID); err != nil {
			return nil, err
		}
	} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}

	newDomain := &repository.Domain{
		TenantID: tenantID,
		Hostname: cleaned,
		Type:     "custom",
		Status:   "pending",
	}

	if err := s.domainRepo.Create(ctx, tenantID, newDomain); err != nil {
		return nil, err
	}

	token := DomainVerificationToken(tenantID, cleaned)
	newDomain.VerificationToken = token
	return &RegisterDomainResponse{
		Domain:         newDomain,
		Hostname:       cleaned,
		CNAMETarget:    ExpectedCNAMETarget,
		ARecordTargets: s.PlatformIPs(),
		TXTName:        VerificationTXTPrefix + cleaned,
		TXTValue:       token,
		Instruction:    fmt.Sprintf("Arahkan '%s' ke KlikUmroh (CNAME ke '%s', atau A record ke IP server untuk domain utama), lalu tambahkan TXT record '%s%s' berisi '%s'", cleaned, ExpectedCNAMETarget, VerificationTXTPrefix, cleaned, token),
	}, nil
}

func (s *domainService) ListDomains(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	domains, err := s.domainRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	for i := range domains {
		if domains[i].Type == "custom" && domains[i].Status != "active" {
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
	resolved, err := s.resolver.LookupIP(ExpectedCNAMETarget)
	if err != nil {
		return nil
	}
	for _, ip := range resolved {
		ips = append(ips, ip.String())
	}
	return ips
}

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
			return false, fmt.Sprintf("DNS lookup gagal: %v", cnameErr)
		}
		return false, fmt.Sprintf("domain belum mengarah ke KlikUmroh (CNAME ke '%s' atau A record ke IP server)", ExpectedCNAMETarget)
	}
	if len(platform) == 0 {
		return false, "alamat IP server KlikUmroh belum tersedia untuk verifikasi A record; hubungi tim KlikUmroh"
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

// VerifyDomain activates a pending/failed custom domain when its CNAME points to the platform AND the
// TXT record proves this travel controls the DNS. An active domain is only re-checked: a single
// failure does not take it offline (see recordCheck).
func (s *domainService) VerifyDomain(ctx context.Context, tenantID uint64, domainID uint64) (*repository.Domain, error) {
	domain, err := s.domainRepo.GetByID(ctx, tenantID, domainID)
	if err != nil {
		return nil, err
	}

	if domain.Type != "custom" {
		return nil, ErrDomainNotCustom
	}

	if domain.Status == "active" {
		return s.recordCheck(ctx, domain)
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

// recordCheck re-checks the CNAME of an active domain. A failure only increments check_failures and keeps
// the domain active (a DNS hiccup must not take a travel's site offline); after MaxDomainCheckFailures in
// a row the default subdomain stops redirecting to it. A success resets the counter.
func (s *domainService) recordCheck(ctx context.Context, domain *repository.Domain) (*repository.Domain, error) {
	now := time.Now()
	domain.LastCheckAt = &now
	domain.LastVerificationAttemptAt = &now
	if ok, reason := s.cnameOK(domain.Hostname); ok {
		domain.CheckFailures = 0
		domain.VerificationFailureReason = nil
	} else {
		domain.CheckFailures++
		domain.VerificationFailureReason = &reason
	}
	if err := s.domainRepo.Update(ctx, domain.TenantID, domain); err != nil {
		return nil, err
	}
	return domain, nil
}

func (s *domainService) RecheckActiveDomains(ctx context.Context) (checked int, failing int) {
	domains, err := s.domainRepo.ListActiveCustom(ctx)
	if err != nil {
		return 0, 0
	}
	for i := range domains {
		d, err := s.recordCheck(ctx, &domains[i])
		if err != nil {
			continue
		}
		checked++
		if d.CheckFailures > 0 {
			failing++
		}
	}
	return checked, failing
}

func (s *domainService) DeleteDomain(ctx context.Context, tenantID uint64, domainID uint64) error {
	domain, err := s.domainRepo.GetByID(ctx, tenantID, domainID)
	if err != nil {
		return err
	}

	if domain.Type == "subdomain" {
		return ErrCannotDeleteSubdomain
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
	host = strings.TrimSpace(strings.ToLower(host))
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

	// If it's already a custom domain, no need to redirect to another custom domain
	if resolvedDomain.Type == "custom" {
		return nil, repository.ErrNotFound
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
