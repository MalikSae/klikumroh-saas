package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"klikumroh/internal/handler"
	"klikumroh/internal/middleware"
	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

type mockStatusHistoryItem struct {
	TenantID   uint64
	ProspectID uint64
	AgentID    uint64
	NewStatus  string
	ChangedAt  time.Time
}

type mockReferralClick struct {
	TenantID  uint64
	AgentID   uint64
	IPAddress string
}

// mockProspectRepo implements repository.ProspectRepository for handler testing.
type mockProspectRepo struct {
	prospects          map[uint64]*repository.Prospect
	nextID             uint64
	agentRepo          *mockAgentRepo
	history            []mockStatusHistoryItem
	packageCommissions map[uint64]float64
	packageNames       map[uint64]string
	clicks             []mockReferralClick
}

func newMockProspectRepo() *mockProspectRepo {
	return &mockProspectRepo{
		prospects:          make(map[uint64]*repository.Prospect),
		nextID:             1,
		packageCommissions: make(map[uint64]float64),
		packageNames:       make(map[uint64]string),
	}
}

func (m *mockProspectRepo) Create(ctx context.Context, tenantID uint64, p *repository.Prospect) error {
	p.ID = m.nextID
	m.nextID++
	p.TenantID = tenantID
	if p.CreatedAt.IsZero() {
		p.CreatedAt = time.Now()
	}
	if p.UpdatedAt.IsZero() {
		p.UpdatedAt = time.Now()
	}
	m.prospects[p.ID] = p
	if p.Status == "closing" {
		agID := uint64(0)
		if p.AgentID != nil {
			agID = *p.AgentID
		}
		m.history = append(m.history, mockStatusHistoryItem{
			TenantID:   tenantID,
			ProspectID: p.ID,
			AgentID:    agID,
			NewStatus:  "closing",
			ChangedAt:  p.CreatedAt,
		})
	}
	return nil
}

func (m *mockProspectRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Prospect, error) {
	p, ok := m.prospects[id]
	if !ok || p.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return p, nil
}

func (m *mockProspectRepo) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.Prospect, error) {
	return m.ListWithFilter(ctx, tenantID, repository.ProspectFilter{Status: statusFilter})
}

func (m *mockProspectRepo) ListWithFilter(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]repository.Prospect, error) {
	var list []repository.Prospect
	for _, p := range m.prospects {
		if p.TenantID != tenantID {
			continue
		}
		if filter.Status != nil && *filter.Status != "" && *filter.Status != "all" && p.Status != *filter.Status {
			continue
		}
		if filter.Source != nil && *filter.Source != "" && *filter.Source != "all" {
			src := strings.ToLower(strings.TrimSpace(*filter.Source))
			pSrc := strings.ToLower(strings.TrimSpace(p.SourceChannel))
			if src == "agent" || src == "agen" {
				if p.AgentID == nil && pSrc != "agen" && pSrc != "agent" {
					continue
				}
			} else if src == "meta_ads" || src == "paid" || src == "paid_ads" {
				if pSrc != "paid" && pSrc != "paid_ads" && pSrc != "meta_ads" && pSrc != "google_ads" {
					continue
				}
			} else if src == "organik" || src == "organic" {
				if p.AgentID != nil || (pSrc != "organik" && pSrc != "organic" && pSrc != "") {
					continue
				}
			} else if pSrc != src {
				continue
			}
		}
		if filter.Search != nil && strings.TrimSpace(*filter.Search) != "" {
			s := strings.ToLower(strings.TrimSpace(*filter.Search))
			if !strings.Contains(strings.ToLower(p.Name), s) &&
				!strings.Contains(strings.ToLower(p.Phone), s) &&
				(p.Email == nil || !strings.Contains(strings.ToLower(*p.Email), s)) &&
				!strings.Contains(strings.ToLower(p.PackageName), s) {
				continue
			}
		}
		if filter.PackageID != nil && *filter.PackageID > 0 {
			if p.PackageID == nil || *p.PackageID != *filter.PackageID {
				continue
			}
		}
		list = append(list, *p)
	}
	return list, nil
}

func (m *mockProspectRepo) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]repository.AgentProspectItem, error) {
	var results []repository.AgentProspectItem
	for _, p := range m.prospects {
		if p.TenantID == tenantID && p.AgentID != nil && *p.AgentID == agentID {
			if statusFilter != nil && *statusFilter != "" && p.Status != *statusFilter {
				continue
			}
			jj := 1
			if p.JumlahJamaah != nil && *p.JumlahJamaah > 0 {
				jj = *p.JumlahJamaah
			}
			pkgName := "Umroh"
			if p.PackageID != nil && m.packageNames != nil {
				if name, ok := m.packageNames[*p.PackageID]; ok {
					pkgName = name
				}
			}
			results = append(results, repository.AgentProspectItem{
				ID:           p.ID,
				TenantID:     p.TenantID,
				PackageID:    p.PackageID,
				PackageName:  pkgName,
				AgentID:      *p.AgentID,
				Name:         p.Name,
				Phone:        p.Phone,
				JumlahJamaah: jj,
				Status:       p.Status,
				EntryMethod:  p.EntryMethod,
				CreatedAt:    p.CreatedAt,
				UpdatedAt:    p.UpdatedAt,
			})
		}
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].CreatedAt.After(results[j].CreatedAt)
	})
	return results, nil
}

func (m *mockProspectRepo) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, newStatus string, lostReason *string) error {
	p, ok := m.prospects[id]
	if !ok || p.TenantID != tenantID {
		return repository.ErrNotFound
	}
	p.Status = newStatus
	p.LostReason = lostReason
	p.UpdatedAt = time.Now()
	agID := uint64(0)
	if p.AgentID != nil {
		agID = *p.AgentID
	}
	m.history = append(m.history, mockStatusHistoryItem{
		TenantID:   tenantID,
		ProspectID: p.ID,
		AgentID:    agID,
		NewStatus:  newStatus,
		ChangedAt:  p.UpdatedAt,
	})
	return nil
}

func (m *mockProspectRepo) Update(ctx context.Context, tenantID uint64, p *repository.Prospect) error {
	existing, ok := m.prospects[p.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	m.prospects[p.ID] = p
	return nil
}

func (m *mockProspectRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	p, ok := m.prospects[id]
	if !ok || p.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.prospects, id)
	return nil
}

func (m *mockProspectRepo) GetAgentFunnelSummary(ctx context.Context, tenantID uint64, agentID uint64) (*repository.AgentFunnelSummary, error) {
	summary := &repository.AgentFunnelSummary{}
	for _, p := range m.prospects {
		if p.TenantID == tenantID && p.AgentID != nil && *p.AgentID == agentID {
			switch p.Status {
			case "baru":
				summary.Baru++
			case "dihubungi", "tertarik":
				summary.Diproses++
			case "closing":
				summary.Closing++
			}
		}
	}
	return summary, nil
}

func (m *mockProspectRepo) GetActiveAgentsClosingStats(ctx context.Context, tenantID uint64) ([]repository.AgentClosingStat, error) {
	agentMap := make(map[uint64]int)
	if m.agentRepo != nil {
		activeAgents, _ := m.agentRepo.List(ctx, tenantID, "active")
		for _, a := range activeAgents {
			agentMap[a.ID] = 0
		}
	} else {
		for _, p := range m.prospects {
			if p.TenantID == tenantID && p.AgentID != nil {
				agentMap[*p.AgentID] = 0
			}
		}
	}

	for _, p := range m.prospects {
		if p.TenantID == tenantID && p.AgentID != nil && p.Status == "closing" {
			jj := 1
			if p.JumlahJamaah != nil {
				jj = *p.JumlahJamaah
			}
			if _, exists := agentMap[*p.AgentID]; exists {
				agentMap[*p.AgentID] += jj
			}
		}
	}

	var stats []repository.AgentClosingStat
	for agentID, total := range agentMap {
		stats = append(stats, repository.AgentClosingStat{
			AgentID:     agentID,
			TotalJamaah: total,
		})
	}

	sort.Slice(stats, func(i, j int) bool {
		if stats[i].TotalJamaah != stats[j].TotalJamaah {
			return stats[i].TotalJamaah > stats[j].TotalJamaah
		}
		return stats[i].AgentID < stats[j].AgentID
	})

	return stats, nil
}

func (m *mockProspectRepo) SetPackageCommission(packageID uint64, amount float64) {
	if m.packageCommissions == nil {
		m.packageCommissions = make(map[uint64]float64)
	}
	m.packageCommissions[packageID] = amount
}

func (m *mockProspectRepo) RecordCustomStatusHistory(tenantID uint64, prospectID uint64, agentID uint64, newStatus string, changedAt time.Time) {
	m.history = append(m.history, mockStatusHistoryItem{
		TenantID:   tenantID,
		ProspectID: prospectID,
		AgentID:    agentID,
		NewStatus:  newStatus,
		ChangedAt:  changedAt,
	})
}

func (m *mockProspectRepo) GetAgentPendingCommissionAndCount(ctx context.Context, tenantID uint64, agentID uint64) (float64, int, error) {
	var saldo float64
	var count int
	for _, p := range m.prospects {
		if p.TenantID == tenantID && p.AgentID != nil && *p.AgentID == agentID && p.Status != "closing" && p.Status != "tidak_lanjut" {
			jj := 1
			if p.JumlahJamaah != nil {
				jj = *p.JumlahJamaah
			}
			comm := float64(0)
			if p.PackageID != nil && m.packageCommissions != nil {
				comm = m.packageCommissions[*p.PackageID]
			}
			saldo += comm * float64(jj)
			count += jj
		}
	}
	return saldo, count, nil
}

func (m *mockProspectRepo) GetAgentTargetProgress(ctx context.Context, tenantID uint64, agentID uint64, startDate string, endDate string) (int, error) {
	start, err1 := time.Parse("2006-01-02", startDate)
	end, err2 := time.Parse("2006-01-02", endDate)
	if err1 != nil || err2 != nil {
		return 0, nil
	}
	end = end.Add(24*time.Hour - time.Nanosecond)

	var progress int
	for _, h := range m.history {
		if h.TenantID == tenantID && h.AgentID == agentID && h.NewStatus == "closing" {
			if (h.ChangedAt.Equal(start) || h.ChangedAt.After(start)) && (h.ChangedAt.Equal(end) || h.ChangedAt.Before(end)) {
				jj := 1
				if p, ok := m.prospects[h.ProspectID]; ok && p.JumlahJamaah != nil {
					jj = *p.JumlahJamaah
				}
				progress += jj
			}
		}
	}
	return progress, nil
}

func (m *mockProspectRepo) RecordReferralClick(ctx context.Context, tenantID uint64, agentID uint64, ipAddress string) error {
	m.clicks = append(m.clicks, mockReferralClick{
		TenantID:  tenantID,
		AgentID:   agentID,
		IPAddress: ipAddress,
	})
	return nil
}

func (m *mockProspectRepo) GetAgentReferralClicksCount(ctx context.Context, tenantID uint64, agentID uint64) (int, error) {
	count := 0
	for _, c := range m.clicks {
		if c.TenantID == tenantID && c.AgentID == agentID {
			count++
		}
	}
	return count, nil
}

func (m *mockProspectRepo) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, p := range m.prospects {
		if p.TenantID == tenantID {
			count++
		}
	}
	return count, nil
}

type mockCommissionLedgerRepo struct {
	ledgers []repository.CommissionLedger
}

func (m *mockCommissionLedgerRepo) Create(ctx context.Context, tenantID uint64, ledger *repository.CommissionLedger) error {
	m.ledgers = append(m.ledgers, *ledger)
	return nil
}

func (m *mockCommissionLedgerRepo) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]repository.CommissionLedger, error) {
	return m.ledgers, nil
}

func (m *mockCommissionLedgerRepo) ListByAgentWithProspect(ctx context.Context, tenantID uint64, agentID uint64) ([]repository.CommissionLedgerWithProspect, error) {
	var list []repository.CommissionLedgerWithProspect
	for _, l := range m.ledgers {
		if l.TenantID == tenantID && l.AgentID == agentID {
			list = append(list, repository.CommissionLedgerWithProspect{
				CommissionLedger:     l,
				ProspectName:         "Prospect Mock",
				ProspectJumlahJamaah: 1,
			})
		}
	}
	return list, nil
}

func (m *mockCommissionLedgerRepo) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]repository.CommissionLedger, error) {
	var list []repository.CommissionLedger
	for _, l := range m.ledgers {
		if l.TenantID == tenantID && l.ProspectID == prospectID {
			list = append(list, l)
		}
	}
	return list, nil
}

func (m *mockCommissionLedgerRepo) SumByAgent(ctx context.Context, tenantID uint64, agentID uint64) (float64, error) {
	var total float64
	for _, l := range m.ledgers {
		if l.AgentID == agentID && l.TenantID == tenantID {
			total += l.Amount
		}
	}
	return total, nil
}

type mockProspectStatusHistoryRepo struct {
	histories []repository.ProspectStatusHistory
}

func (m *mockProspectStatusHistoryRepo) Create(ctx context.Context, tenantID uint64, history *repository.ProspectStatusHistory) error {
	m.histories = append(m.histories, *history)
	return nil
}

func (m *mockProspectStatusHistoryRepo) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]repository.ProspectStatusHistory, error) {
	return m.histories, nil
}

type mockProspectNoteRepo struct {
	notes []repository.ProspectNote
}

func (m *mockProspectNoteRepo) Create(ctx context.Context, tenantID uint64, note *repository.ProspectNote) error {
	m.notes = append(m.notes, *note)
	return nil
}

func (m *mockProspectNoteRepo) ListByProspect(ctx context.Context, tenantID uint64, prospectID uint64) ([]repository.ProspectNote, error) {
	return m.notes, nil
}

func setupProspectRouter() (*chi.Mux, *mockProspectRepo, *mockPackageRepo, *mockSessionRepo, *mockDomainRepo, *mockAgentRepo, *mockTenantRepo) {
	prospectRepo := newMockProspectRepo()
	pkgRepo := newMockPackageRepo()
	agentRepo := newMockAgentRepo()
	tenantRepo := newMockTenantRepo()
	commissionLedgerRepo := &mockCommissionLedgerRepo{}
	statusHistoryRepo := &mockProspectStatusHistoryRepo{}
	noteRepo := &mockProspectNoteRepo{}

	prospectService := service.NewProspectService(
		prospectRepo,
		pkgRepo,
		agentRepo,
		tenantRepo,
		commissionLedgerRepo,
		statusHistoryRepo,
		noteRepo,
		nil,
		nil,
	)
	prospectHandler := handler.NewProspectHandler(prospectService)

	sessionRepo := &mockSessionRepo{
		sessions: map[string]*repository.Session{
			"token_tenant_a": {
				ID:          1,
				Token:       "token_tenant_a",
				AdminUserID: 1,
				TenantID:    10,
				ExpiresAt:   time.Now().Add(24 * time.Hour),
			},
			"token_tenant_b": {
				ID:          2,
				Token:       "token_tenant_b",
				AdminUserID: 2,
				TenantID:    20,
				ExpiresAt:   time.Now().Add(24 * time.Hour),
			},
		},
	}

	domainRepo := &mockDomainRepo{
		domains: map[string]*repository.Domain{
			"travela.klikumroh.local": {
				ID:       1,
				TenantID: 10,
				Hostname: "travela.klikumroh.local",
				Status:   "active",
			},
			"travelb.klikumroh.local": {
				ID:       2,
				TenantID: 20,
				Hostname: "travelb.klikumroh.local",
				Status:   "active",
			},
		},
	}

	r := chi.NewRouter()

	// Protected Dashboard
	r.Group(func(protected chi.Router) {
		protected.Use(middleware.AuthMiddleware(sessionRepo))
		prospectHandler.RegisterDashboardRoutes(protected)
	})

	// Public Web Whitelabel
	r.Group(func(public chi.Router) {
		public.Use(middleware.TenantResolutionMiddleware(domainRepo))
		prospectHandler.RegisterPublicRoutes(public)
	})

	return r, prospectRepo, pkgRepo, sessionRepo, domainRepo, agentRepo, tenantRepo
}

func TestProspectHandler_PublicSubmission_And_CrossTenantPackage(t *testing.T) {
	r, _, pkgRepo, _, _, _, _ := setupProspectRouter()
	ctx := context.Background()

	// Seed package for Tenant A (ID=10)
	pkgA := &repository.Package{Name: "Paket Umroh Tenant A", Status: "published"}
	_ = pkgRepo.Create(ctx, 10, pkgA)

	// Seed package for Tenant B (ID=20)
	pkgB := &repository.Package{Name: "Paket Umroh Tenant B", Status: "published"}
	_ = pkgRepo.Create(ctx, 20, pkgB)

	// 1. Positive: Valid submission to Tenant A with Tenant A's package_id
	t.Run("Valid public prospect submission with valid tenant package_id", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":           "Ahmad Subagio",
			"phone":          "08123456789",
			"package_id":     pkgA.ID,
			"source_channel": "organik",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201, got %d (%s)", rr.Code, rr.Body.String())
		}
		var created repository.Prospect
		_ = json.Unmarshal(rr.Body.Bytes(), &created)
		if created.TenantID != 10 || created.Status != "baru" {
			t.Errorf("Unexpected created prospect: %+v", created)
		}
	})

	// 2. CRITICAL VALIDATION: Submitting to Tenant A with Tenant B's package_id MUST BE REJECTED (400)
	t.Run("CRITICAL: Cross-tenant package_id is rejected with 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":           "Penyusup Cross-Tenant",
			"phone":          "08999999999",
			"package_id":     pkgB.ID, // Package belongs to Tenant B (20), but submitting to Tenant A (10)
			"source_channel": "organik",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request for cross-tenant package_id, got %d (%s)", rr.Code, rr.Body.String())
		}
		var errResp map[string]string
		_ = json.Unmarshal(rr.Body.Bytes(), &errResp)
		if errResp["error"] != "paket tidak ditemukan" {
			t.Errorf("Expected 'paket tidak ditemukan', got '%s'", errResp["error"])
		}
	})
}

func TestProspectHandler_Dashboard_And_CrossTenant(t *testing.T) {
	r, prospectRepo, _, _, _, _, _ := setupProspectRouter()
	ctx := context.Background()

	// Seed prospect for Tenant A (tenant_id = 10)
	prosA := &repository.Prospect{
		Name:          "Jamaah Tenant A",
		Phone:         "08111111111",
		SourceChannel: "organik",
		Status:        "baru",
	}
	_ = prospectRepo.Create(ctx, 10, prosA)

	// Seed prospect for Tenant B (tenant_id = 20)
	prosB := &repository.Prospect{
		Name:          "Jamaah Tenant B",
		Phone:         "08222222222",
		SourceChannel: "paid",
		Status:        "baru",
	}
	_ = prospectRepo.Create(ctx, 20, prosB)

	// 1. Positive: Tenant A can read its own prospect
	t.Run("Tenant A can read its own prospect", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/prospects/%d", prosA.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rr.Code)
		}
		var resp service.ProspectDetailResponse
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)
		if resp.Prospect == nil || resp.Prospect.ID != prosA.ID || resp.Prospect.TenantID != 10 {
			t.Errorf("Unexpected prospect: %+v", resp.Prospect)
		}
	})

	// 2. Cross-Tenant: Tenant B cannot GET Tenant A's prospect
	t.Run("Cross-Tenant: Tenant B cannot GET Tenant A's prospect", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/prospects/%d", prosA.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_b")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for cross-tenant prospect access, got %d", rr.Code)
		}
	})

	// 3. Status Whitelist Validation: Valid pipeline status update
	t.Run("Update status to whitelist values works", func(t *testing.T) {
		for _, validStatus := range []string{"dihubungi", "tertarik", "tidak_lanjut", "closing"} {
			var lostReason *string
			if validStatus == "tidak_lanjut" {
				lr := "Harga belum cocok"
				lostReason = &lr
			}
			body, _ := json.Marshal(map[string]interface{}{
				"status":      validStatus,
				"lost_reason": lostReason,
			})
			req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/prospects/%d/status", prosA.ID), bytes.NewBuffer(body))
			req.Header.Set("Authorization", "Bearer token_tenant_a")
			rr := httptest.NewRecorder()
			r.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("Expected 200 for valid status '%s', got %d (%s)", validStatus, rr.Code, rr.Body.String())
			}
		}
	})

	// 4. Status Whitelist Validation: Invalid status rejects with 400
	t.Run("Invalid status rejects with 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"status": "status_ngawur",
		})
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/prospects/%d/status", prosA.ID), bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("Expected 400 for invalid pipeline status, got %d", rr.Code)
		}
	})

	// 5. Cross-Tenant: Tenant B cannot UPDATE status of Tenant A's prospect
	t.Run("Cross-Tenant: Tenant B cannot UPDATE status of Tenant A's prospect", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"status": "closing",
		})
		req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/prospects/%d/status", prosA.ID), bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer token_tenant_b")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected 404 for cross-tenant status update, got %d", rr.Code)
		}
	})

	// 6. CSV Export: Exports properly for tenant with correct headers and injection sanitization
	t.Run("CSV Export produces valid header and tenant rows with injection sanitization", func(t *testing.T) {
		// Seed a prospect with potential CSV injection payload
		injectPros := &repository.Prospect{
			Name:          "=cmd|'/c calc'!A1",
			Phone:         "+62812345678",
			Email:         nil,
			SourceChannel: "@twitter",
			Status:        "tidak_lanjut",
		}
		lr := "-Ditolak karena mahal"
		injectPros.LostReason = &lr
		_ = prospectRepo.Create(ctx, 10, injectPros)

		req := httptest.NewRequest(http.MethodGet, "/api/dashboard/prospects/export", nil)
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 for CSV export, got %d", rr.Code)
		}
		if !strings.Contains(rr.Header().Get("Content-Type"), "text/csv") {
			t.Errorf("Expected text/csv Content-Type, got %s", rr.Header().Get("Content-Type"))
		}
		dispHeader := rr.Header().Get("Content-Disposition")
		expectedPrefix := fmt.Sprintf(`attachment; filename="prospek-%s.csv"`, time.Now().Format("2006-01-02"))
		if dispHeader != expectedPrefix {
			t.Errorf("Expected Content-Disposition '%s', got '%s'", expectedPrefix, dispHeader)
		}
		csvContent := rr.Body.String()
		if !strings.HasPrefix(csvContent, "id,name,phone,jumlah_jamaah,email,source_channel,status,lost_reason,created_at") {
			t.Errorf("CSV header mismatch: %s", csvContent)
		}
		if !strings.Contains(csvContent, "Jamaah Tenant A") {
			t.Errorf("Expected Tenant A prospect in CSV output: %s", csvContent)
		}
		if strings.Contains(csvContent, "Jamaah Tenant B") {
			t.Errorf("CRITICAL: Tenant B prospect leaked in Tenant A's CSV export: %s", csvContent)
		}

		// Verify CSV Injection sanitization: =cmd|'/c calc'!A1 must be prefixed with '
		if !strings.Contains(csvContent, "'=cmd|'/c calc'!A1") {
			t.Errorf("Expected CSV injection formula to be sanitized to ''=cmd|'/c calc'!A1', got: %s", csvContent)
		}
		if !strings.Contains(csvContent, "'+62812345678") {
			t.Errorf("Expected phone with '+' to be sanitized to ''+62812345678', got: %s", csvContent)
		}
		if !strings.Contains(csvContent, "'@twitter") {
			t.Errorf("Expected source with '@' to be sanitized to ''@twitter', got: %s", csvContent)
		}
		if !strings.Contains(csvContent, "'-Ditolak karena mahal") {
			t.Errorf("Expected lost reason with '-' to be sanitized to ''-Ditolak karena mahal', got: %s", csvContent)
		}
	})
}

func TestProspectHandler_PublicSubmission_WhatsAppRedirectAndJumlahJamaah(t *testing.T) {
	r, _, pkgRepo, _, _, agentRepo, tenantRepo := setupProspectRouter()
	ctx := context.Background()

	// Tenant A (ID=10) has whatsapp_number
	waA := "6281234567890"
	tenantA := &repository.Tenant{
		ID:             10,
		Name:           "Travel A",
		Slug:           "travela",
		Status:         "active",
		WhatsAppNumber: &waA,
	}
	_ = tenantRepo.Create(ctx, tenantA)

	// Tenant B (ID=20) does not have whatsapp_number
	tenantB := &repository.Tenant{
		ID:             20,
		Name:           "Travel B",
		Slug:           "travelb",
		Status:         "active",
		WhatsAppNumber: nil,
	}
	_ = tenantRepo.Create(ctx, tenantB)

	// Package for Tenant A
	pkgA := &repository.Package{Name: "Paket Gold 12 Hari", Status: "published"}
	_ = pkgRepo.Create(ctx, 10, pkgA)

	// Agent for Tenant A with phone
	agentPhoneA := "085555555555"
	agentA := &repository.Agent{
		Name:         "Agent Ali",
		Phone:        &agentPhoneA,
		ReferralCode: "REF-ALI-10",
		Status:       "active",
	}
	_ = agentRepo.Create(ctx, 10, agentA)

	// 1. POST /api/public/prospects with jumlah_jamaah = 0 or -1 returns 400
	t.Run("Submitting with jumlah_jamaah = 0 returns 400", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":          "Rofi Test",
			"phone":         "08129999999",
			"package_id":    pkgA.ID,
			"jumlah_jamaah": 0,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request for jumlah_jamaah=0, got %d (%s)", rr.Code, rr.Body.String())
		}
	})

	t.Run("Submitting with jumlah_jamaah = -1 returns 400", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":          "Rofi Test",
			"phone":         "08129999999",
			"package_id":    pkgA.ID,
			"jumlah_jamaah": -1,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request for jumlah_jamaah=-1, got %d (%s)", rr.Code, rr.Body.String())
		}
	})

	// 2. POST /api/public/prospects with valid referral_code belongs to the tenant -> redirect URL has AGENT's number & message encoded with jumlah_jamaah
	t.Run("Valid referral_code returns AGENT WhatsApp number with correctly encoded message", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":          "Budi Santoso",
			"phone":         "08123456789",
			"package_id":    pkgA.ID,
			"referral_code": "REF-ALI-10",
			"jumlah_jamaah": 3,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d (%s)", rr.Code, rr.Body.String())
		}

		var resp map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)

		redirectURL, ok := resp["whatsapp_redirect_url"].(string)
		if !ok || redirectURL == "" {
			t.Fatalf("Expected non-empty whatsapp_redirect_url, got: %v", resp["whatsapp_redirect_url"])
		}

		// Agent phone normalized from 085555555555 is 6285555555555
		expectedAgentPhone := "6285555555555"
		if !strings.Contains(redirectURL, "https://wa.me/"+expectedAgentPhone) {
			t.Errorf("Expected redirect URL to contain agent phone %s, got: %s", expectedAgentPhone, redirectURL)
		}

		// Message should contain: "Halo, saya Budi Santoso tertarik dengan paket Paket Gold 12 Hari untuk 3 orang. Mohon informasinya."
		expectedMsgText := "Halo, saya Budi Santoso tertarik dengan paket Paket Gold 12 Hari untuk 3 orang. Mohon informasinya."
		expectedEncoded := "text=Halo%2C+saya+Budi+Santoso+tertarik+dengan+paket+Paket+Gold+12+Hari+untuk+3+orang.+Mohon+informasinya."
		if !strings.Contains(redirectURL, expectedEncoded) {
			t.Errorf("Expected redirect URL to contain encoded message for %q, got URL: %s", expectedMsgText, redirectURL)
		}

		// Check saved jumlah_jamaah
		if jj, ok := resp["jumlah_jamaah"].(float64); !ok || int(jj) != 3 {
			t.Errorf("Expected saved jumlah_jamaah 3, got: %v", resp["jumlah_jamaah"])
		}
	})

	// 3. POST /api/public/prospects WITHOUT referral_code, tenant has whatsapp_number -> redirect URL has TENANT's number
	t.Run("Without referral_code returns TENANT WhatsApp number", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":       "Dewi Lestari",
			"phone":      "08134567890",
			"package_id": pkgA.ID,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d (%s)", rr.Code, rr.Body.String())
		}

		var resp map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)

		redirectURL, ok := resp["whatsapp_redirect_url"].(string)
		if !ok || redirectURL == "" {
			t.Fatalf("Expected non-empty whatsapp_redirect_url, got: %v", resp["whatsapp_redirect_url"])
		}

		expectedTenantPhone := "6281234567890"
		if !strings.Contains(redirectURL, "https://wa.me/"+expectedTenantPhone) {
			t.Errorf("Expected redirect URL to contain tenant phone %s, got: %s", expectedTenantPhone, redirectURL)
		}

		// Message without jumlah_jamaah: "Halo, saya Dewi Lestari tertarik dengan paket Paket Gold 12 Hari. Mohon informasinya."
		expectedEncoded := "text=Halo%2C+saya+Dewi+Lestari+tertarik+dengan+paket+Paket+Gold+12+Hari.+Mohon+informasinya."
		if !strings.Contains(redirectURL, expectedEncoded) {
			t.Errorf("Expected encoded message without jumlah_jamaah, got: %s", redirectURL)
		}
	})

	// 4. POST /api/public/prospects without referral AND tenant has no whatsapp_number -> whatsapp_redirect_url is null, status 201
	t.Run("Without referral and without tenant whatsapp_number returns null redirect URL", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":  "Hendra Gunawan",
			"phone": "08198765432",
		})
		// travelb.klikumroh.local has Tenant B (ID=20) which has whatsapp_number = nil
		req := httptest.NewRequest(http.MethodPost, "/api/public/prospects", bytes.NewBuffer(body))
		req.Host = "travelb.klikumroh.local"
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d (%s)", rr.Code, rr.Body.String())
		}

		var resp map[string]interface{}
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)

		if resp["whatsapp_redirect_url"] != nil {
			t.Errorf("Expected whatsapp_redirect_url to be null, got: %v", resp["whatsapp_redirect_url"])
		}
	})
}

func TestProspectHandler_Dashboard_CommissionModuleScenarios(t *testing.T) {
	r, prospectRepo, pkgRepo, _, _, _, _ := setupProspectRouter()
	ctx := context.Background()

	// Seed package for Tenant A (ID=10)
	commAmount := 1000000.0
	pkgA := &repository.Package{
		Name:             "Paket Umroh Tenant A",
		Status:           "published",
		CommissionAmount: &commAmount,
	}
	_ = pkgRepo.Create(ctx, 10, pkgA)

	// Skenario a: PUT /api/dashboard/prospects/{id} mengubah jumlah_jamaah pada prospect closing TANPA correction_reason -> assert 400
	t.Run("PUT prospect closing changing jumlah_jamaah without correction_reason returns 400", func(t *testing.T) {
		initialJamaah := 3
		pClosing := &repository.Prospect{
			TenantID:      10,
			PackageID:     &pkgA.ID,
			Name:          "Pak Budi Closing",
			Phone:         "08111111111",
			JumlahJamaah:  &initialJamaah,
			SourceChannel: "agen",
			Status:        "closing",
		}
		_ = prospectRepo.Create(ctx, 10, pClosing)

		// Attempt to update jumlah_jamaah from 3 to 2 WITHOUT correction_reason
		body, _ := json.Marshal(map[string]interface{}{
			"name":          "Pak Budi Closing",
			"phone":         "08111111111",
			"jumlah_jamaah": 2,
			// correction_reason omitted or empty
		})

		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/prospects/%d", pClosing.ID), bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request when changing jumlah_jamaah on closing prospect without correction_reason, got %d (%s)", rr.Code, rr.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse JSON error response: %v", err)
		}

		errMsg, _ := resp["error"].(string)
		if !strings.Contains(errMsg, "alasan koreksi wajib diisi") {
			t.Errorf("Expected error message to mention 'alasan koreksi wajib diisi', got: %s", errMsg)
		}
	})

	// Skenario b: GET /api/dashboard/prospects/{id} untuk prospect tanpa agent_id -> assert response body info_komisi bernilai null
	t.Run("GET prospect without agent_id asserts response body info_komisi is null", func(t *testing.T) {
		jamaah := 2
		pOrganic := &repository.Prospect{
			TenantID:      10,
			PackageID:     &pkgA.ID,
			AgentID:       nil, // Prospek tanpa agen (organik)
			Name:          "Siti Organik",
			Phone:         "08222222222",
			JumlahJamaah:  &jamaah,
			SourceChannel: "organik",
			Status:        "baru",
		}
		_ = prospectRepo.Create(ctx, 10, pOrganic)

		req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/prospects/%d", pOrganic.ID), nil)
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d (%s)", rr.Code, rr.Body.String())
		}

		// Parse JSON response body
		var resp map[string]interface{}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse JSON response: %v", err)
		}

		// Assert info_komisi is strictly null
		infoKomisi, existsInfoKomisi := resp["info_komisi"]
		if !existsInfoKomisi {
			t.Errorf("Expected key 'info_komisi' to exist in JSON response body")
		}
		if infoKomisi != nil {
			t.Errorf("Expected response body info_komisi to be null, got: %v", infoKomisi)
		}

		// Assert commission_info does not exist anymore
		if _, existsCommInfo := resp["commission_info"]; existsCommInfo {
			t.Errorf("Expected key 'commission_info' to NOT exist in JSON response body after removal")
		}

		// Verify agent is null
		if resp["agent"] != nil {
			t.Errorf("Expected agent to be null, got: %v", resp["agent"])
		}
	})

	// Skenario c (Regression Test): closing dengan commission_amount=1000000,
	// SETELAH closing ubah packages.commission_amount jadi nilai lain (misal 1500000),
	// lalu GET detail prospek lagi — assert rate_per_jamaah yang ditampilkan TETAP 1000000
	// (bukan ikut berubah ke commission_amount baru).
	t.Run("Closing with commission 1000000, package updated to 1500000, GET detail asserts rate_per_jamaah remains 1000000", func(t *testing.T) {
		_, _, _, _, _, agentRepo, _ := setupProspectRouter()
		// Use fresh router to isolate test state
		rFresh, prospectRepoFresh, pkgRepoFresh, _, _, agentRepoFresh, _ := setupProspectRouter()

		agA := &repository.Agent{
			Name:   "Agent Joko",
			Status: "active",
		}
		_ = agentRepoFresh.Create(ctx, 10, agA)
		_ = agentRepo // suppress unused warning if any

		comm1000 := 1000000.0
		pkgClosing := &repository.Package{
			Name:             "Paket Umroh Closing Regression",
			Status:           "published",
			CommissionAmount: &comm1000,
		}
		_ = pkgRepoFresh.Create(ctx, 10, pkgClosing)

		jamaah := 2
		pLead := &repository.Prospect{
			TenantID:      10,
			PackageID:     &pkgClosing.ID,
			AgentID:       &agA.ID,
			Name:          "Pak Joko Jamaah",
			Phone:         "08133333333",
			JumlahJamaah:  &jamaah,
			SourceChannel: "agen",
			Status:        "baru",
		}
		_ = prospectRepoFresh.Create(ctx, 10, pLead)

		// 1. Ubah status prospek ke closing -> memicu pencatatan commission_ledger permanen
		bodyStatus, _ := json.Marshal(map[string]string{
			"status": "closing",
		})
		reqStatus := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/prospects/%d/status", pLead.ID), bytes.NewBuffer(bodyStatus))
		reqStatus.Header.Set("Authorization", "Bearer token_tenant_a")
		reqStatus.Header.Set("Content-Type", "application/json")
		rrStatus := httptest.NewRecorder()
		rFresh.ServeHTTP(rrStatus, reqStatus)

		if rrStatus.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on status change to closing, got %d (%s)", rrStatus.Code, rrStatus.Body.String())
		}

		// 2. SETELAH closing: ubah packages.commission_amount menjadi 1500000
		comm1500 := 1500000.0
		pkgClosing.CommissionAmount = &comm1500
		if err := pkgRepoFresh.Update(ctx, 10, pkgClosing); err != nil {
			t.Fatalf("Failed to update package commission_amount: %v", err)
		}

		// 3. GET detail prospek lagi via GET /api/dashboard/prospects/{id}
		reqDetail := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/dashboard/prospects/%d", pLead.ID), nil)
		reqDetail.Header.Set("Authorization", "Bearer token_tenant_a")
		rrDetail := httptest.NewRecorder()
		rFresh.ServeHTTP(rrDetail, reqDetail)

		if rrDetail.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK on GET detail, got %d (%s)", rrDetail.Code, rrDetail.Body.String())
		}

		var detailResp map[string]interface{}
		if err := json.Unmarshal(rrDetail.Body.Bytes(), &detailResp); err != nil {
			t.Fatalf("Failed to parse JSON response: %v", err)
		}

		infoKomisi, ok := detailResp["info_komisi"].(map[string]interface{})
		if !ok || infoKomisi == nil {
			t.Fatalf("Expected info_komisi to be present and non-nil, got: %v", detailResp["info_komisi"])
		}

		// Assert type is "final"
		if infoKomisi["type"] != "final" {
			t.Errorf("Expected info_komisi.type to be 'final', got: %v", infoKomisi["type"])
		}

		// Assert direct_amount is 2,000,000 (2 jamaah * 1,000,000)
		directAmount, _ := infoKomisi["direct_amount"].(float64)
		if directAmount != 2000000.0 {
			t.Errorf("Expected direct_amount 2000000, got: %v", directAmount)
		}

		// ASSERT rate_per_jamaah TETAP 1000000 (BUKAN ikut berubah ke commission_amount baru 1500000)
		ratePerJamaah, _ := infoKomisi["rate_per_jamaah"].(float64)
		if ratePerJamaah != 1000000.0 {
			t.Errorf("CRITICAL REGRESSION: rate_per_jamaah changed to %v! Expected it to REMAIN 1000000.0 from ledger", ratePerJamaah)
		}
	})
}

func TestProspectHandler_ReferralClicks_CrossTenant(t *testing.T) {
	r, prospectRepo, _, _, _, agentRepo, _ := setupProspectRouter()
	ctx := context.Background()

	// Seed Agent A for Tenant A (ID=10)
	emailA := "agentA@tenanta.com"
	agentA := &repository.Agent{
		TenantID:     10,
		Name:         "Agent A",
		Email:        &emailA,
		ReferralCode: "REFA-100",
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, 10, agentA); err != nil {
		t.Fatalf("Failed to create agent A: %v", err)
	}

	// Seed Agent B for Tenant B (ID=20)
	emailB := "agentB@tenantb.com"
	agentB := &repository.Agent{
		TenantID:     20,
		Name:         "Agent B",
		Email:        &emailB,
		ReferralCode: "REFB-200",
		Status:       "active",
	}
	if err := agentRepo.Create(ctx, 20, agentB); err != nil {
		t.Fatalf("Failed to create agent B: %v", err)
	}

	t.Run("Valid referral code on correct tenant records click successfully", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"referral_code": "REFA-100",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/referral-clicks", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local" // Tenant A
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d (%s)", rr.Code, rr.Body.String())
		}

		count, err := prospectRepo.GetAgentReferralClicksCount(ctx, 10, agentA.ID)
		if err != nil {
			t.Fatalf("Failed to get clicks: %v", err)
		}
		if count != 1 {
			t.Errorf("Expected 1 click recorded for Agent A, got %d", count)
		}
	})

	t.Run("Cross-tenant referral code is rejected with 404", func(t *testing.T) {
		// Attempting to use Agent B's referral code on Tenant A
		body, _ := json.Marshal(map[string]string{
			"referral_code": "REFB-200",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/referral-clicks", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local" // Tenant A
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("CRITICAL SECURITY VIOLATION: Expected 404 Not Found for cross-tenant referral code, got %d (%s)", rr.Code, rr.Body.String())
		}

		// Verify Agent B's clicks count under Tenant B remains 0
		countB, _ := prospectRepo.GetAgentReferralClicksCount(ctx, 20, agentB.ID)
		if countB != 0 {
			t.Errorf("CRITICAL SECURITY VIOLATION: Agent B received a click from Tenant A! Count is %d", countB)
		}
	})

	t.Run("Empty referral code returns 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"referral_code": "",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/referral-clicks", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request for empty referral_code, got %d (%s)", rr.Code, rr.Body.String())
		}
	})

	t.Run("Nonexistent referral code returns 404 Not Found", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"referral_code": "NONEXISTENT",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/public/referral-clicks", bytes.NewBuffer(body))
		req.Host = "travela.klikumroh.local"
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Fatalf("Expected 404 Not Found for nonexistent code, got %d (%s)", rr.Code, rr.Body.String())
		}
	})
}

func TestProspectHandler_ClosingStatusImmutable(t *testing.T) {
	r, prospectRepo, _, _, _, _, _ := setupProspectRouter()
	ctx := context.Background()

	jj := 2
	pClosing := &repository.Prospect{
		TenantID:      10,
		Name:          "Pak Haji Final",
		Phone:         "0812999888",
		Status:        "closing",
		JumlahJamaah:  &jj,
		SourceChannel: "organik",
	}
	if err := prospectRepo.Create(ctx, 10, pClosing); err != nil {
		t.Fatalf("Failed to create prospect: %v", err)
	}

	t.Run("Admin mencoba ubah status prospek yang sudah 'closing' ke status APA PUN -> 400 Bad Request", func(t *testing.T) {
		allStatuses := []string{"baru", "dihubungi", "tertarik", "tidak_lanjut", "closing"}
		expectedMsg := "Status closing bersifat final dan tidak dapat diubah lagi"

		for _, targetStatus := range allStatuses {
			t.Run("to_"+targetStatus, func(t *testing.T) {
				body, _ := json.Marshal(map[string]string{
					"status": targetStatus,
				})
				req := httptest.NewRequest(http.MethodPatch, fmt.Sprintf("/api/dashboard/prospects/%d/status", pClosing.ID), bytes.NewBuffer(body))
				req.Header.Set("Authorization", "Bearer token_tenant_a")
				req.Header.Set("Content-Type", "application/json")
				rr := httptest.NewRecorder()
				r.ServeHTTP(rr, req)

				if rr.Code != http.StatusBadRequest {
					t.Fatalf("Expected 400 Bad Request for targetStatus '%s', got %d (%s)", targetStatus, rr.Code, rr.Body.String())
				}

				var res map[string]string
				_ = json.NewDecoder(rr.Body).Decode(&res)
				if res["error"] != expectedMsg {
					t.Errorf("Expected error '%s' for targetStatus '%s', got '%s'", expectedMsg, targetStatus, res["error"])
				}
			})
		}
	})

	t.Run("Admin edit data prospek (koreksi jumlah_jamaah) yang sudah 'closing' TETAP BERHASIL", func(t *testing.T) {
		body, _ := json.Marshal(map[string]interface{}{
			"name":              "Pak Haji Final Koreksi",
			"phone":             "0812999888",
			"jumlah_jamaah":     4,
			"correction_reason": "Koreksi penambahan anggota keluarga",
		})
		req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/dashboard/prospects/%d", pClosing.ID), bytes.NewBuffer(body))
		req.Header.Set("Authorization", "Bearer token_tenant_a")
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for editing prospect details, got %d (%s)", rr.Code, rr.Body.String())
		}

		updated, err := prospectRepo.GetByID(ctx, 10, pClosing.ID)
		if err != nil {
			t.Fatalf("Failed to get updated prospect: %v", err)
		}
		if updated.JumlahJamaah == nil || *updated.JumlahJamaah != 4 {
			t.Errorf("Expected jumlah_jamaah to be updated to 4, got %v", updated.JumlahJamaah)
		}
		if updated.Status != "closing" {
			t.Errorf("Expected status to remain 'closing', got '%s'", updated.Status)
		}
	})
}

