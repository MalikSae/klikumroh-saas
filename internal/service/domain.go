package service

import (
	"context"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

const ExpectedCNAMETarget = "cname.klikumroh.id"

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
}

// NetDNSResolver is the standard implementation using Go's net package.
type NetDNSResolver struct{}

func (r *NetDNSResolver) LookupCNAME(hostname string) (string, error) {
	return net.LookupCNAME(hostname)
}

// RegisterDomainResponse holds the created domain and instructions for DNS configuration.
type RegisterDomainResponse struct {
	Domain      *repository.Domain `json:"domain"`
	Hostname    string             `json:"hostname"`
	CNAMETarget string             `json:"cname_target"`
	Instruction string             `json:"instruction"`
}

// DomainService defines the business logic interface for domain management.
type DomainService interface {
	RegisterCustomDomain(ctx context.Context, tenantID uint64, hostname string) (*RegisterDomainResponse, error)
	ListDomains(ctx context.Context, tenantID uint64) ([]repository.Domain, error)
	VerifyDomain(ctx context.Context, tenantID uint64, domainID uint64) (*repository.Domain, error)
	DeleteDomain(ctx context.Context, tenantID uint64, domainID uint64) error
	GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error)
	GetActiveCustomDomainByHost(ctx context.Context, host string) (*repository.Domain, error)
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

	// Check if already registered
	existing, err := s.domainRepo.FindByHostname(ctx, cleaned)
	if err == nil && existing != nil {
		return nil, ErrDomainAlreadyUsed
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

	return &RegisterDomainResponse{
		Domain:      newDomain,
		Hostname:    cleaned,
		CNAMETarget: ExpectedCNAMETarget,
		Instruction: fmt.Sprintf("Arahkan CNAME record '%s' ke '%s'", cleaned, ExpectedCNAMETarget),
	}, nil
}

func (s *domainService) ListDomains(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	return s.domainRepo.ListByTenant(ctx, tenantID)
}

func (s *domainService) VerifyDomain(ctx context.Context, tenantID uint64, domainID uint64) (*repository.Domain, error) {
	domain, err := s.domainRepo.GetByID(ctx, tenantID, domainID)
	if err != nil {
		return nil, err
	}

	if domain.Type != "custom" {
		return nil, ErrDomainNotCustom
	}

	now := time.Now()
	domain.LastCheckAt = &now
	domain.LastVerificationAttemptAt = &now

	cnameResult, lookupErr := s.resolver.LookupCNAME(domain.Hostname)

	expected := strings.TrimSuffix(strings.TrimSpace(strings.ToLower(ExpectedCNAMETarget)), ".")
	actual := strings.TrimSuffix(strings.TrimSpace(strings.ToLower(cnameResult)), ".")

	if lookupErr == nil && actual == expected {
		domain.Status = "active"
		domain.VerifiedAt = &now
		domain.DNSVerifiedAt = &now
		domain.VerificationFailureReason = nil
	} else {
		domain.Status = "failed"
		var reason string
		if lookupErr != nil {
			reason = fmt.Sprintf("DNS lookup gagal: %v", lookupErr)
		} else {
			reason = fmt.Sprintf("CNAME mengarah ke '%s', seharusnya '%s'", actual, ExpectedCNAMETarget)
		}
		domain.VerificationFailureReason = &reason
	}

	if err := s.domainRepo.Update(ctx, tenantID, domain); err != nil {
		return nil, err
	}

	return domain, nil
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

	return customDomain, nil
}
