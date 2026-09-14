package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockPackageRepoForJamaah struct {
	packages map[uint64]*repository.Package
}

func newMockPackageRepoForJamaah() *mockPackageRepoForJamaah {
	return &mockPackageRepoForJamaah{
		packages: make(map[uint64]*repository.Package),
	}
}

func (m *mockPackageRepoForJamaah) Create(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	pkg.TenantID = tenantID
	m.packages[pkg.ID] = pkg
	return nil
}

func (m *mockPackageRepoForJamaah) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Package, error) {
	pkg, ok := m.packages[id]
	if !ok || pkg.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return pkg, nil
}

func (m *mockPackageRepoForJamaah) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Package, error) {
	var list []repository.Package
	for _, p := range m.packages {
		if p.TenantID == tenantID {
			list = append(list, *p)
		}
	}
	return list, nil
}

func (m *mockPackageRepoForJamaah) Update(ctx context.Context, tenantID uint64, pkg *repository.Package) error {
	return nil
}

func (m *mockPackageRepoForJamaah) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	delete(m.packages, id)
	return nil
}

func (m *mockPackageRepoForJamaah) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, p := range m.packages {
		if p.TenantID == tenantID {
			count++
		}
	}
	return count, nil
}

type mockStatusHistoryRepoForJamaah struct {
	history []repository.ProspectStatusHistory
	nextID  uint64
}

func (m *mockStatusHistoryRepoForJamaah) Create(ctx context.Context, tenantID uint64, history *repository.ProspectStatusHistory) error {
	m.nextID++
	history.ID = m.nextID
	history.TenantID = tenantID
	history.ChangedAt = time.Now()
	m.history = append(m.history, *history)
	return nil
}

func (m *mockStatusHistoryRepoForJamaah) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]repository.ProspectStatusHistory, error) {
	var list []repository.ProspectStatusHistory
	for _, h := range m.history {
		if h.TenantID == tenantID && h.ProspectID == prospectID {
			list = append(list, h)
		}
	}
	return list, nil
}

type mockNoteRepoForJamaah struct {
	notes  []repository.ProspectNote
	nextID uint64
}

func (m *mockNoteRepoForJamaah) Create(ctx context.Context, tenantID uint64, note *repository.ProspectNote) error {
	m.nextID++
	note.ID = m.nextID
	note.TenantID = tenantID
	note.CreatedAt = time.Now()
	m.notes = append(m.notes, *note)
	return nil
}

func (m *mockNoteRepoForJamaah) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]repository.ProspectNote, error) {
	var list []repository.ProspectNote
	for _, n := range m.notes {
		if n.TenantID == tenantID && n.ProspectID == prospectID {
			list = append(list, n)
		}
	}
	return list, nil
}

type mockDomainRepoForJamaah struct {
	domains map[string]*repository.Domain
}

func (m *mockDomainRepoForJamaah) FindByHostname(ctx context.Context, hostname string) (*repository.Domain, error) {
	d, ok := m.domains[hostname]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return d, nil
}

func (m *mockDomainRepoForJamaah) Create(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	return nil
}
func (m *mockDomainRepoForJamaah) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Domain, error) {
	return nil, nil
}
func (m *mockDomainRepoForJamaah) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	return nil, nil
}
func (m *mockDomainRepoForJamaah) Update(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	return nil
}
func (m *mockDomainRepoForJamaah) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return nil
}
func (m *mockDomainRepoForJamaah) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error) {
	for _, d := range m.domains {
		if d.TenantID == tenantID && d.Type == "custom" && d.Status == "active" {
			return d, nil
		}
	}
	return nil, repository.ErrNotFound
}

func setupAgentJamaahTestEnv() (
	chi.Router,
	chi.Router,
	*mockAgentRepo,
	*mockAgentSessionRepo,
	*mockProspectRepo,
	*mockPackageRepoForJamaah,
	*mockStatusHistoryRepoForJamaah,
	*mockNoteRepoForJamaah,
	*repository.Tenant,
	*repository.Tenant,
) {
	agentRepo := newMockAgentRepo()
	sessionRepo := newMockAgentSessionRepo(agentRepo)
	tenantRepo := newMockTenantRepo()
	domainRepo := &mockDomainRepoForJamaah{domains: make(map[string]*repository.Domain)}

	fee0 := float64(0)
	t1 := &repository.Tenant{
		Name:                 "Travel Amanah",
		Slug:                 "amanah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
	}
	_ = tenantRepo.Create(context.Background(), t1)
	domainRepo.domains["amanah.klikumroh.local"] = &repository.Domain{TenantID: t1.ID, Hostname: "amanah.klikumroh.local", Status: "active"}

	t2 := &repository.Tenant{
		Name:                 "Travel Berkah",
		Slug:                 "berkah",
		Status:               "active",
		AgentRegistrationFee: &fee0,
	}
	_ = tenantRepo.Create(context.Background(), t2)
	domainRepo.domains["berkah.klikumroh.local"] = &repository.Domain{TenantID: t2.ID, Hostname: "berkah.klikumroh.local", Status: "active"}

	packageRepo := newMockPackageRepoForJamaah()
	prospectRepo := newMockProspectRepo()
	prospectRepo.agentRepo = agentRepo
	commissionLedgerRepo := &mockCommissionLedgerRepo{}
	statusHistoryRepo := &mockStatusHistoryRepoForJamaah{}
	noteRepo := &mockNoteRepoForJamaah{}

	prospectService := service.NewProspectService(
		prospectRepo,
		packageRepo,
		agentRepo,
		tenantRepo,
		commissionLedgerRepo,
		statusHistoryRepo,
		noteRepo,
		nil,
		nil,
	)

	agentJamaahHandler := handler.NewAgentJamaahHandler(prospectService)

	directRouter := chi.NewRouter()
	directRouter.Use(middleware.AgentAuthMiddleware(sessionRepo))
	agentJamaahHandler.RegisterRoutes(directRouter)

	subdomainRouter := chi.NewRouter()
	subdomainRouter.Use(middleware.TenantResolutionMiddleware(domainRepo))
	subdomainRouter.Use(middleware.AgentAuthMiddleware(sessionRepo))
	agentJamaahHandler.RegisterRoutes(subdomainRouter)

	return directRouter, subdomainRouter, agentRepo, sessionRepo, prospectRepo, packageRepo, statusHistoryRepo, noteRepo, t1, t2
}

func strPtr(s string) *string {
	return &s
}

func TestAgentJamaah_List_OwnershipAndIsolation(t *testing.T) {
	r, _, agentRepo, sessionRepo, prospectRepo, packageRepo, _, _, t1, t2 := setupAgentJamaahTestEnv()
	_ = t2

	// Create Agent A & Agent B in Tenant 1
	agA := &repository.Agent{TenantID: t1.ID, Name: "Agen A", Email: strPtr("a@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agA)
	sessA := &repository.AgentSession{TenantID: t1.ID, AgentID: agA.ID, Token: "token-ag-a", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessA)

	agB := &repository.Agent{TenantID: t1.ID, Name: "Agen B", Email: strPtr("b@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agB)
	sessB := &repository.AgentSession{TenantID: t1.ID, AgentID: agB.ID, Token: "token-ag-b", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessB)

	// Create Package in Tenant 1
	comm := 1500000.0
	pkg1 := &repository.Package{ID: 10, TenantID: t1.ID, Name: "Paket Syawal", CommissionAmount: &comm}
	_ = packageRepo.Create(context.Background(), t1.ID, pkg1)
	prospectRepo.packageNames[pkg1.ID] = "Paket Syawal"

	// Create Prospects:
	// Prospect 1: Agen A, status 'baru'
	jj2 := 2
	p1 := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agA.ID,
		PackageID:     &pkg1.ID,
		Name:          "Jamaah Agen A 1",
		Phone:         "081111111",
		JumlahJamaah:  &jj2,
		Status:        "baru",
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, p1)

	// Prospect 2: Agen A, status 'dihubungi'
	p2 := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agA.ID,
		PackageID:     &pkg1.ID,
		Name:          "Jamaah Agen A 2",
		Phone:         "082222222",
		Status:        "dihubungi",
		SourceChannel: "agen",
		EntryMethod:   "web_form",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, p2)

	// Prospect 3: Agen B, status 'baru'
	p3 := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agB.ID,
		PackageID:     &pkg1.ID,
		Name:          "Jamaah Agen B",
		Phone:         "083333333",
		Status:        "baru",
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, p3)

	t.Run("Agen A hanya melihat jamaah miliknya sendiri (tidak bocor milik Agen B)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/jamaah", nil)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var items []repository.AgentProspectItem
		if err := json.NewDecoder(rec.Body).Decode(&items); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if len(items) != 2 {
			t.Fatalf("expected 2 jamaah for Agen A, got %d", len(items))
		}
		for _, item := range items {
			if item.AgentID != agA.ID {
				t.Errorf("expected agent_id %d, got %d", agA.ID, item.AgentID)
			}
			if item.PackageName != "Paket Syawal" {
				t.Errorf("expected package name 'Paket Syawal', got '%s'", item.PackageName)
			}
		}
	})

	t.Run("Agen A filter status 'baru'", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/jamaah?status=baru", nil)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var items []repository.AgentProspectItem
		_ = json.NewDecoder(rec.Body).Decode(&items)
		if len(items) != 1 || items[0].Name != "Jamaah Agen A 1" {
			t.Errorf("expected 1 item with status baru, got %d", len(items))
		}
	})

	t.Run("Agen B hanya melihat jamaah milik Agen B", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/agent/jamaah", nil)
		req.Header.Set("Authorization", "Bearer token-ag-b")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var items []repository.AgentProspectItem
		_ = json.NewDecoder(rec.Body).Decode(&items)
		if len(items) != 1 || items[0].Name != "Jamaah Agen B" {
			t.Errorf("expected 1 item belonging to Agen B, got %d", len(items))
		}
	})
}

func TestAgentJamaah_GetDetail_OwnershipValidation(t *testing.T) {
	r, _, agentRepo, sessionRepo, prospectRepo, packageRepo, _, _, t1, t2 := setupAgentJamaahTestEnv()

	agA := &repository.Agent{TenantID: t1.ID, Name: "Agen A", Email: strPtr("a@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agA)
	sessA := &repository.AgentSession{TenantID: t1.ID, AgentID: agA.ID, Token: "token-ag-a", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessA)

	agB := &repository.Agent{TenantID: t1.ID, Name: "Agen B", Email: strPtr("b@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agB)
	sessB := &repository.AgentSession{TenantID: t1.ID, AgentID: agB.ID, Token: "token-ag-b", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessB)

	// Agent from Tenant 2
	agT2 := &repository.Agent{TenantID: t2.ID, Name: "Agen T2", Email: strPtr("t2@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t2.ID, agT2)
	sessT2 := &repository.AgentSession{TenantID: t2.ID, AgentID: agT2.ID, Token: "token-ag-t2", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessT2)

	comm := 1000000.0
	pkg := &repository.Package{ID: 1, TenantID: t1.ID, Name: "Paket Reguler", CommissionAmount: &comm}
	_ = packageRepo.Create(context.Background(), t1.ID, pkg)

	pA := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agA.ID,
		PackageID:     &pkg.ID,
		Name:          "Jamaah A",
		Phone:         "08123",
		Status:        "baru",
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, pA)

	pB := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agB.ID,
		PackageID:     &pkg.ID,
		Name:          "Jamaah B",
		Phone:         "08456",
		Status:        "baru",
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, pB)

	t.Run("Agen A berhasil melihat detail jamaah miliknya sendiri", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/agent/jamaah/%d", pA.ID), nil)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res service.ProspectDetailResponse
		if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if res.Prospect.Name != "Jamaah A" {
			t.Errorf("expected 'Jamaah A', got '%s'", res.Prospect.Name)
		}
		if res.InfoKomisi == nil || res.InfoKomisi.Type != "potensi" {
			t.Errorf("expected InfoKomisi potensi, got %+v", res.InfoKomisi)
		}
	})

	t.Run("VALIDASI KRITIS: Agen A mencoba melihat jamaah Agen B (satu tenant) -> 404 (bukan 403)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/agent/jamaah/%d", pB.ID), nil)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("CRITICAL FAIL: expected 404 Not Found, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("VALIDASI KRITIS: Agen Tenant 2 mencoba melihat jamaah Tenant 1 -> 404", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/agent/jamaah/%d", pA.ID), nil)
		req.Header.Set("Authorization", "Bearer token-ag-t2")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("CRITICAL FAIL: expected 404 Not Found for cross-tenant, got %d", rec.Code)
		}
	})
}

func TestAgentJamaah_UpdateStatus_ForbiddenClosing(t *testing.T) {
	r, _, agentRepo, sessionRepo, prospectRepo, _, statusHistoryRepo, _, t1, _ := setupAgentJamaahTestEnv()

	agA := &repository.Agent{TenantID: t1.ID, Name: "Agen A", Email: strPtr("a@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agA)
	sessA := &repository.AgentSession{TenantID: t1.ID, AgentID: agA.ID, Token: "token-ag-a", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessA)

	agB := &repository.Agent{TenantID: t1.ID, Name: "Agen B", Email: strPtr("b@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agB)

	pA := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agA.ID,
		Name:          "Jamaah A",
		Phone:         "08123",
		Status:        "baru",
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, pA)

	pB := &repository.Prospect{
		TenantID:      t1.ID,
		AgentID:       &agB.ID,
		Name:          "Jamaah B",
		Phone:         "08456",
		Status:        "baru",
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
	}
	_ = prospectRepo.Create(context.Background(), t1.ID, pB)

	t.Run("ATURAN KRITIS: Agen mencoba ubah status ke 'closing' -> 403 Forbidden dengan pesan jelas", func(t *testing.T) {
		body := bytes.NewBufferString(`{"status":"closing"}`)
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/agent/jamaah/%d/status", pA.ID), body)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden, got %d: %s", rec.Code, rec.Body.String())
		}

		var res map[string]string
		_ = json.NewDecoder(rec.Body).Decode(&res)
		expectedMsg := "Hanya admin yang dapat mengubah status menjadi Closing"
		if res["error"] != expectedMsg {
			t.Errorf("expected error '%s', got '%s'", expectedMsg, res["error"])
		}
	})

	t.Run("Agen ubah status ke 'dihubungi' -> 200 OK dan tercatat di riwayat changed_by_type='agent'", func(t *testing.T) {
		body := bytes.NewBufferString(`{"status":"dihubungi"}`)
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/agent/jamaah/%d/status", pA.ID), body)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		// Verify prospect updated in repo
		updated, _ := prospectRepo.GetByID(context.Background(), t1.ID, pA.ID)
		if updated.Status != "dihubungi" {
			t.Errorf("expected status 'dihubungi', got '%s'", updated.Status)
		}

		// Verify status history
		sh, _ := statusHistoryRepo.ListByProspect(context.Background(), t1.ID, pA.ID)
		if len(sh) != 1 {
			t.Fatalf("expected 1 history record, got %d", len(sh))
		}
		if sh[0].ChangedByType != "agent" || sh[0].ChangedByID != agA.ID {
			t.Errorf("expected changed_by_type='agent' and changed_by_id=%d, got type='%s' id=%d", agA.ID, sh[0].ChangedByType, sh[0].ChangedByID)
		}
	})

	t.Run("Agen A mencoba ubah status jamaah milik Agen B -> 404", func(t *testing.T) {
		body := bytes.NewBufferString(`{"status":"tertarik"}`)
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/agent/jamaah/%d/status", pB.ID), body)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found, got %d", rec.Code)
		}
	})

	t.Run("Agen mencoba ubah status prospek yang sudah 'closing' ke status APA PUN -> 400 Bad Request", func(t *testing.T) {
		pClosed := &repository.Prospect{
			TenantID:      t1.ID,
			AgentID:       &agA.ID,
			Name:          "Jamaah Closed",
			Phone:         "08999",
			Status:        "closing",
			SourceChannel: "agen",
			EntryMethod:   "agent_manual",
		}
		_ = prospectRepo.Create(context.Background(), t1.ID, pClosed)

		allStatuses := []string{"baru", "dihubungi", "tertarik", "tidak_lanjut", "closing"}
		expectedMsg := "Status closing bersifat final dan tidak dapat diubah lagi"

		for _, targetStatus := range allStatuses {
			t.Run("agent_to_"+targetStatus, func(t *testing.T) {
				body := bytes.NewBufferString(fmt.Sprintf(`{"status":"%s"}`, targetStatus))
				req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/agent/jamaah/%d/status", pClosed.ID), body)
				req.Header.Set("Authorization", "Bearer token-ag-a")
				req.Header.Set("Content-Type", "application/json")
				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)

				if rec.Code != http.StatusBadRequest {
					t.Fatalf("expected 400 Bad Request for targetStatus '%s', got %d: %s", targetStatus, rec.Code, rec.Body.String())
				}

				var res map[string]string
				_ = json.NewDecoder(rec.Body).Decode(&res)
				if res["error"] != expectedMsg {
					t.Errorf("expected error '%s' for targetStatus '%s', got '%s'", expectedMsg, targetStatus, res["error"])
				}
			})
		}
	})
}

func TestAgentJamaah_AddNote_OwnershipValidation(t *testing.T) {
	r, _, agentRepo, sessionRepo, prospectRepo, _, _, noteRepo, t1, _ := setupAgentJamaahTestEnv()

	agA := &repository.Agent{TenantID: t1.ID, Name: "Agen A", Email: strPtr("a@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agA)
	sessA := &repository.AgentSession{TenantID: t1.ID, AgentID: agA.ID, Token: "token-ag-a", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessA)

	agB := &repository.Agent{TenantID: t1.ID, Name: "Agen B", Email: strPtr("b@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agB)

	pA := &repository.Prospect{TenantID: t1.ID, AgentID: &agA.ID, Name: "Jamaah A", Phone: "08123", Status: "baru"}
	_ = prospectRepo.Create(context.Background(), t1.ID, pA)

	pB := &repository.Prospect{TenantID: t1.ID, AgentID: &agB.ID, Name: "Jamaah B", Phone: "08456", Status: "baru"}
	_ = prospectRepo.Create(context.Background(), t1.ID, pB)

	t.Run("Agen A tambah catatan ke jamaah miliknya -> 201 Created dengan author_type='agent'", func(t *testing.T) {
		body := bytes.NewBufferString(`{"note_text":"Sudah dihubungi via WA, tertarik paket Syawal"}`)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/agent/jamaah/%d/notes", pA.ID), body)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
		}

		notes, _ := noteRepo.ListByProspect(context.Background(), t1.ID, pA.ID)
		if len(notes) != 1 {
			t.Fatalf("expected 1 note, got %d", len(notes))
		}
		if notes[0].AuthorType != "agent" || notes[0].AuthorID != agA.ID {
			t.Errorf("expected author_type='agent' and author_id=%d, got type='%s' id=%d", agA.ID, notes[0].AuthorType, notes[0].AuthorID)
		}
	})

	t.Run("Agen A mencoba tambah catatan ke jamaah Agen B -> 404", func(t *testing.T) {
		body := bytes.NewBufferString(`{"note_text":"Mencoba menyusup"}`)
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/agent/jamaah/%d/notes", pB.ID), body)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found, got %d", rec.Code)
		}
	})
}

func TestAgentJamaah_CreateManual_AssignsAgentAndAuditFields(t *testing.T) {
	r, subRouter, agentRepo, sessionRepo, _, packageRepo, statusHistoryRepo, noteRepo, t1, t2 := setupAgentJamaahTestEnv()

	agA := &repository.Agent{TenantID: t1.ID, Name: "Agen A", Email: strPtr("a@travel.com"), Status: "active"}
	_ = agentRepo.Create(context.Background(), t1.ID, agA)
	sessA := &repository.AgentSession{TenantID: t1.ID, AgentID: agA.ID, Token: "token-ag-a", ExpiresAt: time.Now().Add(24 * time.Hour)}
	_ = sessionRepo.Create(context.Background(), sessA)

	pkgT1 := &repository.Package{ID: 101, TenantID: t1.ID, Name: "Paket T1"}
	_ = packageRepo.Create(context.Background(), t1.ID, pkgT1)

	pkgT2 := &repository.Package{ID: 202, TenantID: t2.ID, Name: "Paket T2 Cross"}
	_ = packageRepo.Create(context.Background(), t2.ID, pkgT2)

	t.Run("Tambah manual sukses -> agent_id otomatis ter-assign, source_channel='agen', entry_method='agent_manual', initial note created", func(t *testing.T) {
		payload := map[string]interface{}{
			"name":          "Bapak Hendra",
			"phone":         "08129876543",
			"jumlah_jamaah": 3,
			"package_id":    101,
			"catatan_awal":  "Jamaah alumni langganan, ingin berangkat sekamar bertiga",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/jamaah", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusCreated {
			t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
		}

		var created repository.Prospect
		_ = json.NewDecoder(rec.Body).Decode(&created)

		if created.AgentID == nil || *created.AgentID != agA.ID {
			t.Errorf("expected prospect agent_id=%d, got %v", agA.ID, created.AgentID)
		}
		if created.SourceChannel != "agen" {
			t.Errorf("expected source_channel='agen', got '%s'", created.SourceChannel)
		}
		if created.EntryMethod != "agent_manual" {
			t.Errorf("expected entry_method='agent_manual', got '%s'", created.EntryMethod)
		}
		if created.JumlahJamaah == nil || *created.JumlahJamaah != 3 {
			t.Errorf("expected jumlah_jamaah=3, got %v", created.JumlahJamaah)
		}

		// Verify initial status history
		sh, _ := statusHistoryRepo.ListByProspect(context.Background(), t1.ID, created.ID)
		if len(sh) != 1 || sh[0].ChangedByType != "agent" || sh[0].NewStatus != "baru" {
			t.Errorf("expected initial status history 'baru' by agent, got %+v", sh)
		}

		// Verify initial note
		notes, _ := noteRepo.ListByProspect(context.Background(), t1.ID, created.ID)
		if len(notes) != 1 || notes[0].AuthorType != "agent" || notes[0].NoteText != "Jamaah alumni langganan, ingin berangkat sekamar bertiga" {
			t.Errorf("expected initial note to match, got %+v", notes)
		}
	})

	t.Run("Tolak package_id cross-tenant (paket milik tenant lain)", func(t *testing.T) {
		payload := map[string]interface{}{
			"name":       "Ibu Siti",
			"phone":      "0812333444",
			"package_id": 202, // Package belonging to Tenant 2
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/jamaah", bytes.NewReader(jsonBytes))
		req.Header.Set("Authorization", "Bearer token-ag-a")
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for cross-tenant package, got %d", rec.Code)
		}
	})

	t.Run("Cross-tenant isolasi: Agen Tenant 1 mengakses dengan Host/subdomain Tenant 2 -> 403 Forbidden", func(t *testing.T) {
		payload := map[string]interface{}{
			"name":  "Calon Jamaah",
			"phone": "08111222",
		}
		jsonBytes, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/agent/jamaah", bytes.NewReader(jsonBytes))
		req.Host = "berkah.klikumroh.local"                  // Tenant 2 subdomain
		req.Header.Set("Authorization", "Bearer token-ag-a") // Token for Tenant 1
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		subRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for cross-tenant host, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("Agen nonaktif (inactive) ditolak dengan 403 Forbidden pada endpoint jamaah", func(t *testing.T) {
		// Ubah status agen A menjadi inactive
		_ = agentRepo.UpdateStatus(context.Background(), t1.ID, agA.ID, "inactive")

		req := httptest.NewRequest(http.MethodGet, "/api/agent/jamaah", nil)
		req.Header.Set("Authorization", "Bearer token-ag-a")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for inactive agent, got %d: %s", rec.Code, rec.Body.String())
		}

		// Kembalikan status ke active
		_ = agentRepo.UpdateStatus(context.Background(), t1.ID, agA.ID, "active")
	})
}
