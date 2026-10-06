package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockDomainRepoDedicated struct {
	mu      sync.Mutex
	domains map[uint64]*repository.Domain
	nextID  uint64
}

func newMockDomainRepoDedicated() *mockDomainRepoDedicated {
	return &mockDomainRepoDedicated{
		domains: make(map[uint64]*repository.Domain),
		nextID:  1,
	}
}

func (m *mockDomainRepoDedicated) Create(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, d := range m.domains {
		if d.Hostname == domain.Hostname {
			return errors.New("duplicate hostname")
		}
	}

	domain.ID = m.nextID
	m.nextID++
	domain.TenantID = tenantID
	m.domains[domain.ID] = domain
	return nil
}

func (m *mockDomainRepoDedicated) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Domain, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	d, ok := m.domains[id]
	if !ok || d.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	copied := *d
	return &copied, nil
}

func (m *mockDomainRepoDedicated) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var result []repository.Domain
	for _, d := range m.domains {
		if d.TenantID == tenantID {
			result = append(result, *d)
		}
	}
	return result, nil
}

func (m *mockDomainRepoDedicated) Update(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	d, ok := m.domains[domain.ID]
	if !ok || d.TenantID != tenantID {
		return repository.ErrNotFound
	}
	*d = *domain
	return nil
}

func (m *mockDomainRepoDedicated) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	d, ok := m.domains[id]
	if !ok || d.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.domains, id)
	return nil
}

func (m *mockDomainRepoDedicated) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, d := range m.domains {
		if d.TenantID == tenantID && d.Type == "custom" && d.Status == "active" && d.RedirectToDomainID == nil {
			copied := *d
			return &copied, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockDomainRepoDedicated) FindByHostname(ctx context.Context, hostname string) (*repository.Domain, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, d := range m.domains {
		if strings.EqualFold(d.Hostname, hostname) {
			copied := *d
			return &copied, nil
		}
	}
	return nil, repository.ErrNotFound
}

type mockDNSResolver struct {
	responses map[string]string
	errors    map[string]error
	txt       map[string][]string
	ips       map[string][]string
}

func (r *mockDNSResolver) LookupIP(host string) ([]net.IP, error) {
	if ips, ok := r.ips[strings.TrimSpace(strings.ToLower(host))]; ok {
		var out []net.IP
		for _, ip := range ips {
			out = append(out, net.ParseIP(ip))
		}
		return out, nil
	}
	return nil, errors.New("no such host")
}

func (r *mockDNSResolver) LookupTXT(name string) ([]string, error) {
	if recs, ok := r.txt[strings.TrimSpace(strings.ToLower(name))]; ok {
		return recs, nil
	}
	return nil, errors.New("no such host")
}

func newMockDNSResolver() *mockDNSResolver {
	return &mockDNSResolver{
		responses: make(map[string]string),
		errors:    make(map[string]error),
		txt:       make(map[string][]string),
		ips:       make(map[string][]string),
	}
}

func (r *mockDNSResolver) LookupCNAME(hostname string) (string, error) {
	cleaned := strings.TrimSpace(strings.ToLower(hostname))
	if err, ok := r.errors[cleaned]; ok {
		return "", err
	}
	if res, ok := r.responses[cleaned]; ok {
		return res, nil
	}
	return "", errors.New("no such host")
}

func setupDomainTestRouter(domainHandler *handler.DomainHandler, tenantID uint64) *chi.Mux {
	r := chi.NewRouter()

	// Public routes
	domainHandler.RegisterPublicRoutes(r)

	// Protected routes simulating AuthMiddleware with tenantID
	r.Group(func(protected chi.Router) {
		protected.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				ctx := middleware.WithTenantID(req.Context(), tenantID)
				next.ServeHTTP(w, req.WithContext(ctx))
			})
		})
		domainHandler.RegisterDashboardRoutes(protected)
	})

	return r
}

// 1. DNSResolver di-mock: CNAME match → status jadi 'active'. CNAME tidak match → status failed dengan alasan tersimpan
func TestDomainHandler_VerifyDNS_MockResolver(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dnsResolver := newMockDNSResolver()

	tenantID := uint64(1)
	domainSvc := service.NewDomainService(repo, dnsResolver)
	domainHdl := handler.NewDomainHandler(domainSvc, repo)
	router := setupDomainTestRouter(domainHdl, tenantID)

	// Setup custom domain in pending status
	customDom := &repository.Domain{
		TenantID: tenantID,
		Hostname: "umroh.berkah.com",
		Type:     "custom",
		Status:   "pending",
	}
	_ = repo.Create(context.Background(), tenantID, customDom)

	t.Run("CNAME mismatch sets status to failed with failure reason", func(t *testing.T) {
		dnsResolver.responses["umroh.berkah.com"] = "wrong-target.other.com."

		req := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/domains/%d/verify", customDom.ID), nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp repository.Domain
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Status != "failed" {
			t.Errorf("expected status 'failed', got '%s'", resp.Status)
		}
		if resp.VerificationFailureReason == nil || !strings.Contains(*resp.VerificationFailureReason, "CNAME mengarah ke") {
			t.Errorf("expected failure reason explaining mismatch, got: %v", resp.VerificationFailureReason)
		}
	})

	verify := func(t *testing.T) repository.Domain {
		t.Helper()
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/domains/%d/verify", customDom.ID), nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var resp repository.Domain
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		return resp
	}

	// D1: a CNAME alone does not prove this travel owns the domain.
	t.Run("CNAME match without the TXT token stays failed and returns the token to publish", func(t *testing.T) {
		dnsResolver.responses["umroh.berkah.com"] = "cname.klikumroh.id."
		resp := verify(t)
		if resp.Status != "failed" {
			t.Fatalf("expected status 'failed', got '%s'", resp.Status)
		}
		if resp.VerificationFailureReason == nil || !strings.Contains(*resp.VerificationFailureReason, "TXT record") {
			t.Fatalf("expected a TXT failure reason, got %v", resp.VerificationFailureReason)
		}
		if resp.VerificationToken != service.DomainVerificationToken(tenantID, "umroh.berkah.com") {
			t.Fatalf("expected verification token in response, got %q", resp.VerificationToken)
		}
	})

	t.Run("another travel's TXT token does not activate the domain", func(t *testing.T) {
		dnsResolver.txt["_klikumroh-verify.umroh.berkah.com"] = []string{service.DomainVerificationToken(tenantID+1, "umroh.berkah.com")}
		if resp := verify(t); resp.Status != "failed" {
			t.Fatalf("expected status 'failed', got '%s'", resp.Status)
		}
	})

	t.Run("CNAME match sets status to active and sets dns_verified_at", func(t *testing.T) {
		dnsResolver.responses["umroh.berkah.com"] = "cname.klikumroh.id."
		dnsResolver.txt["_klikumroh-verify.umroh.berkah.com"] = []string{"v=spf1 -all", service.DomainVerificationToken(tenantID, "umroh.berkah.com")}

		req := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/domains/%d/verify", customDom.ID), nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp repository.Domain
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Status != "active" {
			t.Errorf("expected status 'active', got '%s'", resp.Status)
		}
		if resp.VerificationFailureReason != nil {
			t.Errorf("expected failure reason to be nil, got: %s", *resp.VerificationFailureReason)
		}
		if resp.DNSVerifiedAt == nil && resp.VerifiedAt == nil {
			t.Errorf("expected verified_at timestamp to be set")
		}
	})

	// D3/D4 (revised in bug hunt 5): a manual re-check of an active domain during a DNS failure keeps it
	// active and only reports the reason; it never counts toward the daily-failure counter. After 3 failed
	// DAILY checks (simulated on the counter) the default subdomain stops redirecting, and one successful
	// manual check resets the counter.
	t.Run("failed manual re-check of an active domain keeps it active and does not count", func(t *testing.T) {
		sub := &repository.Domain{TenantID: tenantID, Hostname: "berkah.klikumroh.id", Type: "subdomain", Status: "active"}
		_ = repo.Create(context.Background(), tenantID, sub)
		target := func() *repository.Domain {
			d, _ := domainSvc.GetActiveCustomDomainByHost(context.Background(), "berkah.klikumroh.id")
			return d
		}
		if target() == nil {
			t.Fatal("expected subdomain to redirect to the active custom domain")
		}

		dnsResolver.responses["umroh.berkah.com"] = "somewhere-else.example."
		for i := 1; i <= service.MaxDomainCheckFailures+2; i++ {
			resp := verify(t)
			if resp.Status != "active" || resp.CheckFailures != 0 || resp.VerificationFailureReason == nil {
				t.Fatalf("manual check %d: expected active, 0 counted failures and a reason, got %s / %d / %v", i, resp.Status, resp.CheckFailures, resp.VerificationFailureReason)
			}
			if target() == nil {
				t.Fatalf("manual checks must never stop the redirect (stopped after %d clicks)", i)
			}
		}
		// Three failed daily checks (the job's counter).
		repo.mu.Lock()
		repo.domains[customDom.ID].CheckFailures = service.MaxDomainCheckFailures
		repo.mu.Unlock()
		if target() != nil {
			t.Fatal("expected subdomain redirect to stop after repeated DNS failures")
		}

		dnsResolver.responses["umroh.berkah.com"] = "cname.klikumroh.id."
		if resp := verify(t); resp.CheckFailures != 0 {
			t.Fatalf("expected counter reset after a successful check, got %d", resp.CheckFailures)
		}
		if target() == nil {
			t.Fatal("expected redirect to resume after DNS is fixed")
		}
	})
}

// D1: an unverified claim by another travel does not block the travel that really owns the domain;
// an active domain still does.
func TestDomainHandler_UnverifiedClaimDoesNotBlock(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	domainSvc := service.NewDomainService(repo, newMockDNSResolver())
	ctx := context.Background()

	if _, err := domainSvc.RegisterCustomDomain(ctx, 1, "rebutan.com", false); err != nil {
		t.Fatalf("squatter register: %v", err)
	}
	res, err := domainSvc.RegisterCustomDomain(ctx, 2, "rebutan.com", false)
	if err != nil {
		t.Fatalf("owner register must not be blocked by an unverified claim: %v", err)
	}
	if res.TXTName != "_klikumroh-verify.rebutan.com" || res.TXTValue != service.DomainVerificationToken(2, "rebutan.com") {
		t.Fatalf("unexpected TXT instruction: %s = %s", res.TXTName, res.TXTValue)
	}
	if list, _ := domainSvc.ListDomains(ctx, 1); len(list) != 0 {
		t.Fatalf("squatter's unverified claim should be released, still has %d", len(list))
	}
	if _, err := domainSvc.RegisterCustomDomain(ctx, 2, "rebutan.com", false); !errors.Is(err, service.ErrDomainAlreadyUsed) {
		t.Fatalf("registering own domain twice: expected ErrDomainAlreadyUsed, got %v", err)
	}

	d, _ := repo.FindByHostname(ctx, "rebutan.com")
	d.Status = "active"
	_ = repo.Update(ctx, 2, d)
	if _, err := domainSvc.RegisterCustomDomain(ctx, 1, "rebutan.com", false); !errors.Is(err, service.ErrDomainAlreadyUsed) {
		t.Fatalf("active domain of another travel: expected ErrDomainAlreadyUsed, got %v", err)
	}
}

// 2. /internal/domain-ask: domain custom yang status='active' → 200. Status 'pending' → 404. Hostname yang sama sekali tidak terdaftar → 404
func TestDomainHandler_AskEndpoint_CaddyValidation(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dnsResolver := newMockDNSResolver()

	tenantID := uint64(1)
	domainSvc := service.NewDomainService(repo, dnsResolver)
	domainHdl := handler.NewDomainHandler(domainSvc, repo)
	router := setupDomainTestRouter(domainHdl, tenantID)

	// 1) Active custom domain
	_ = repo.Create(context.Background(), tenantID, &repository.Domain{
		TenantID: tenantID,
		Hostname: "active.custom.com",
		Type:     "custom",
		Status:   "active",
	})

	// 2) Pending custom domain
	_ = repo.Create(context.Background(), tenantID, &repository.Domain{
		TenantID: tenantID,
		Hostname: "pending.custom.com",
		Type:     "custom",
		Status:   "pending",
	})

	// 3) Failed custom domain
	_ = repo.Create(context.Background(), tenantID, &repository.Domain{
		TenantID: tenantID,
		Hostname: "failed.custom.com",
		Type:     "custom",
		Status:   "failed",
	})

	// 4) Subdomain (default)
	_ = repo.Create(context.Background(), tenantID, &repository.Domain{
		TenantID: tenantID,
		Hostname: "travela.klikumroh.id",
		Type:     "subdomain",
		Status:   "active",
	})

	testCases := []struct {
		name         string
		domainQuery  string
		expectedCode int
	}{
		{
			name:         "Active custom domain returns 200 OK",
			domainQuery:  "active.custom.com",
			expectedCode: http.StatusOK,
		},
		{
			name:         "Pending custom domain returns 404",
			domainQuery:  "pending.custom.com",
			expectedCode: http.StatusNotFound,
		},
		{
			name:         "Failed custom domain returns 404",
			domainQuery:  "failed.custom.com",
			expectedCode: http.StatusNotFound,
		},
		{
			name:         "Subdomain returns 404 (only custom domains get on-demand certs)",
			domainQuery:  "travela.klikumroh.id",
			expectedCode: http.StatusNotFound,
		},
		{
			name:         "Unregistered hostname returns 404",
			domainQuery:  "unknown.random.com",
			expectedCode: http.StatusNotFound,
		},
		{
			name:         "Empty domain param returns 404",
			domainQuery:  "",
			expectedCode: http.StatusNotFound,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", fmt.Sprintf("/internal/domain-ask?domain=%s", tc.domainQuery), nil)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != tc.expectedCode {
				t.Errorf("query '%s': expected status %d, got %d", tc.domainQuery, tc.expectedCode, rec.Code)
			}
		})
	}
}

// 3. DELETE domain type='subdomain' → ditolak (400)
func TestDomainHandler_Delete_SubdomainRejected(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dnsResolver := newMockDNSResolver()

	tenantID := uint64(1)
	domainSvc := service.NewDomainService(repo, dnsResolver)
	domainHdl := handler.NewDomainHandler(domainSvc, repo)
	router := setupDomainTestRouter(domainHdl, tenantID)

	subdomain := &repository.Domain{
		TenantID: tenantID,
		Hostname: "travela.klikumroh.id",
		Type:     "subdomain",
		Status:   "active",
	}
	_ = repo.Create(context.Background(), tenantID, subdomain)

	customDomain := &repository.Domain{
		TenantID: tenantID,
		Hostname: "custom.travela.com",
		Type:     "custom",
		Status:   "pending",
	}
	_ = repo.Create(context.Background(), tenantID, customDomain)

	t.Run("Delete subdomain is rejected with 400 Bad Request", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/dashboard/domains/%d", subdomain.ID), nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 Bad Request when deleting subdomain, got %d", rec.Code)
		}
	})

	t.Run("Delete custom domain succeeds with 200 OK", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/dashboard/domains/%d", customDomain.ID), nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected 200 OK when deleting custom domain, got %d", rec.Code)
		}
	})
}

// 4. Admin tenant A tidak bisa hapus/verifikasi domain tenant B
func TestDomainHandler_CrossTenantIsolation(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dnsResolver := newMockDNSResolver()

	tenantA := uint64(1)
	tenantB := uint64(2)

	domainSvc := service.NewDomainService(repo, dnsResolver)
	domainHdl := handler.NewDomainHandler(domainSvc, repo)

	// Router for Tenant A
	routerTenantA := setupDomainTestRouter(domainHdl, tenantA)

	// Create domain belonging to Tenant B
	domainTenantB := &repository.Domain{
		TenantID: tenantB,
		Hostname: "travelb.com",
		Type:     "custom",
		Status:   "pending",
	}
	_ = repo.Create(context.Background(), tenantB, domainTenantB)

	t.Run("Tenant A cannot verify Tenant B's domain", func(t *testing.T) {
		dnsResolver.responses["travelb.com"] = "cname.klikumroh.id."
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/dashboard/domains/%d/verify", domainTenantB.ID), nil)
		rec := httptest.NewRecorder()
		routerTenantA.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404 Not Found when Tenant A tries to verify Tenant B's domain, got %d", rec.Code)
		}
	})

	t.Run("Tenant A cannot delete Tenant B's domain", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/dashboard/domains/%d", domainTenantB.ID), nil)
		rec := httptest.NewRecorder()
		routerTenantA.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404 Not Found when Tenant A tries to delete Tenant B's domain, got %d", rec.Code)
		}
	})

	t.Run("Tenant A cannot see Tenant B's domain in list", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/dashboard/domains", nil)
		rec := httptest.NewRecorder()
		routerTenantA.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var resp struct {
			Domains []repository.Domain `json:"domains"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode list: %v", err)
		}

		for _, d := range resp.Domains {
			if d.ID == domainTenantB.ID {
				t.Errorf("Tenant A list contained Tenant B's domain ID %d", domainTenantB.ID)
			}
		}
	})
}

// 5 & 6. Custom domain target resolution for Next.js redirect middleware
func TestDomainHandler_CustomDomainTargetForRedirect(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dnsResolver := newMockDNSResolver()

	tenantID := uint64(1)
	domainSvc := service.NewDomainService(repo, dnsResolver)
	domainHdl := handler.NewDomainHandler(domainSvc, repo)
	router := setupDomainTestRouter(domainHdl, tenantID)

	// Subdomain default
	_ = repo.Create(context.Background(), tenantID, &repository.Domain{
		TenantID: tenantID,
		Hostname: "travela.klikumroh.id",
		Type:     "subdomain",
		Status:   "active",
	})

	t.Run("When custom domain is pending, target is null (DO NOT redirect)", func(t *testing.T) {
		pendingCustom := &repository.Domain{
			TenantID: tenantID,
			Hostname: "umroh-travela.com",
			Type:     "custom",
			Status:   "pending",
		}
		_ = repo.Create(context.Background(), tenantID, pendingCustom)

		req := httptest.NewRequest("GET", "/api/public/custom-domain-target?host=travela.klikumroh.id", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var res struct {
			CustomDomain *string `json:"custom_domain"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse json: %v", err)
		}

		if res.CustomDomain != nil {
			t.Errorf("expected custom_domain to be nil when custom domain is pending, got: %s", *res.CustomDomain)
		}

		// Clean up pending domain
		_ = repo.Delete(context.Background(), tenantID, pendingCustom.ID)
	})

	t.Run("When custom domain is active, target returns the custom domain hostname", func(t *testing.T) {
		activeCustom := &repository.Domain{
			TenantID: tenantID,
			Hostname: "umroh-travela.com",
			Type:     "custom",
			Status:   "active",
		}
		_ = repo.Create(context.Background(), tenantID, activeCustom)

		req := httptest.NewRequest("GET", "/api/public/custom-domain-target?host=travela.klikumroh.id", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var res struct {
			CustomDomain *string `json:"custom_domain"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse json: %v", err)
		}

		if res.CustomDomain == nil || *res.CustomDomain != "umroh-travela.com" {
			t.Errorf("expected 'umroh-travela.com', got: %v", res.CustomDomain)
		}
	})
}

func TestDomainHandler_RegisterCustomDomain_Validation(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dnsResolver := newMockDNSResolver()

	tenantID := uint64(1)
	domainSvc := service.NewDomainService(repo, dnsResolver)
	domainHdl := handler.NewDomainHandler(domainSvc, repo)
	router := setupDomainTestRouter(domainHdl, tenantID)

	invalidHosts := []string{
		"http://travel.com",
		"https://travel.com",
		"192.168.1.1",
		"invalid/path",
		"domain..com",
		"klikumroh.id",
		"travel.klikumroh.id",
	}

	for _, host := range invalidHosts {
		t.Run("Invalid: "+host, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{"hostname": host})
			req := httptest.NewRequest("POST", "/api/dashboard/domains", bytes.NewReader(body))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for host '%s', got %d", host, rec.Code)
			}
		})
	}

	t.Run("Valid registration", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"hostname": "my-travel-umroh.com"})
		req := httptest.NewRequest("POST", "/api/dashboard/domains", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
		}

		var resp service.RegisterDomainResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Hostname != "my-travel-umroh.com" {
			t.Errorf("expected hostname 'my-travel-umroh.com', got '%s'", resp.Hostname)
		}
		if resp.CNAMETarget != "cname.klikumroh.id" {
			t.Errorf("expected cname target 'cname.klikumroh.id', got '%s'", resp.CNAMETarget)
		}
		if resp.Domain.Status != "pending" {
			t.Errorf("expected initial status 'pending', got '%s'", resp.Domain.Status)
		}
	})
}

func (m *mockDomainRepoDedicated) ReleaseUnverifiedClaim(ctx context.Context, hostname string, exceptTenantID uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, d := range m.domains {
		if d.Hostname == hostname && d.Type == "custom" && d.Status != "active" && d.TenantID != exceptTenantID {
			delete(m.domains, id)
		}
	}
	return nil
}

func (m *mockDomainRepoDedicated) ListActiveCustom(ctx context.Context) ([]repository.Domain, error) {
	return nil, nil
}

// D5: a root domain (no CNAME possible) is verified by A records that all point to the platform server.
func TestDomainHandler_RootDomainARecord(t *testing.T) {
	repo := newMockDomainRepoDedicated()
	dns := newMockDNSResolver()
	dns.ips["cname.klikumroh.id"] = []string{"203.0.113.10"}
	domainSvc := service.NewDomainService(repo, dns)
	ctx := context.Background()
	tenantID := uint64(5)

	res, err := domainSvc.RegisterCustomDomain(ctx, tenantID, "namatravel.com", false)
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if len(res.ARecordTargets) != 1 || res.ARecordTargets[0] != "203.0.113.10" {
		t.Fatalf("expected A-record target 203.0.113.10, got %v", res.ARecordTargets)
	}
	// A root domain has no CNAME: the resolver returns the name itself.
	dns.responses["namatravel.com"] = "namatravel.com."
	dns.txt["_klikumroh-verify.namatravel.com"] = []string{service.DomainVerificationToken(tenantID, "namatravel.com")}

	cases := []struct {
		name   string
		ips    []string
		active bool
		reason string
	}{
		{"A record to another server", []string{"198.51.100.7"}, false, "198.51.100.7"},
		{"A records mixing platform and another server", []string{"203.0.113.10", "198.51.100.7"}, false, "198.51.100.7"},
		{"no address records", nil, false, "belum mengarah"},
		{"A record to the platform server", []string{"203.0.113.10"}, true, ""},
	}
	for _, c := range cases {
		if c.ips == nil {
			delete(dns.ips, "namatravel.com")
		} else {
			dns.ips["namatravel.com"] = c.ips
		}
		d, err := domainSvc.VerifyDomain(ctx, tenantID, res.Domain.ID)
		if err != nil {
			t.Fatalf("%s: verify: %v", c.name, err)
		}
		if (d.Status == "active") != c.active {
			t.Fatalf("%s: expected active=%v, got %s (%v)", c.name, c.active, d.Status, d.VerificationFailureReason)
		}
		if !c.active && (d.VerificationFailureReason == nil || !strings.Contains(*d.VerificationFailureReason, c.reason)) {
			t.Fatalf("%s: expected reason containing %q, got %v", c.name, c.reason, d.VerificationFailureReason)
		}
	}

	// A CNAME to somewhere else is still rejected, even if the addresses happen to match.
	sub, _ := domainSvc.RegisterCustomDomain(ctx, tenantID, "www.namatravel.com", false)
	dns.responses["www.namatravel.com"] = "other-host.example."
	dns.ips["www.namatravel.com"] = []string{"203.0.113.10"}
	dns.txt["_klikumroh-verify.www.namatravel.com"] = []string{service.DomainVerificationToken(tenantID, "www.namatravel.com")}
	if d, _ := domainSvc.VerifyDomain(ctx, tenantID, sub.Domain.ID); d.Status == "active" {
		t.Fatal("CNAME to a foreign host must not verify")
	}
}
