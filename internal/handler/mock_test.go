package handler_test

import (
	"context"
	"strings"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// mockDomainRepo implements repository.DomainRepository for handler tests.
type mockDomainRepo struct {
	domains map[string]*repository.Domain
}

func (m *mockDomainRepo) Create(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	m.domains[domain.Hostname] = domain
	return nil
}

func (m *mockDomainRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Domain, error) {
	for _, d := range m.domains {
		if d.ID == id && d.TenantID == tenantID {
			return d, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockDomainRepo) FindByHostname(ctx context.Context, hostname string) (*repository.Domain, error) {
	d, ok := m.domains[hostname]
	if !ok {
		return nil, repository.ErrNotFound
	}
	return d, nil
}

func (m *mockDomainRepo) ListByTenant(ctx context.Context, tenantID uint64) ([]repository.Domain, error) {
	var list []repository.Domain
	for _, d := range m.domains {
		if d.TenantID == tenantID {
			list = append(list, *d)
		}
	}
	return list, nil
}

func (m *mockDomainRepo) Update(ctx context.Context, tenantID uint64, domain *repository.Domain) error {
	existing, ok := m.domains[domain.Hostname]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	m.domains[domain.Hostname] = domain
	return nil
}

func (m *mockDomainRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	for host, d := range m.domains {
		if d.ID == id && d.TenantID == tenantID {
			delete(m.domains, host)
			return nil
		}
	}
	return repository.ErrNotFound
}

func (m *mockDomainRepo) GetActiveCustomDomain(ctx context.Context, tenantID uint64) (*repository.Domain, error) {
	for _, d := range m.domains {
		if d.TenantID == tenantID && d.Type == "custom" && d.Status == "active" {
			return d, nil
		}
	}
	return nil, repository.ErrNotFound
}

// mockAgentRepo implements repository.AgentRepository for handler tests.
type mockAgentRepo struct {
	agents map[uint64]*repository.Agent
	nextID uint64
}

func newMockAgentRepo() *mockAgentRepo {
	return &mockAgentRepo{
		agents: make(map[uint64]*repository.Agent),
		nextID: 1,
	}
}

func (m *mockAgentRepo) Create(ctx context.Context, tenantID uint64, agent *repository.Agent) error {
	if agent.Email != nil && *agent.Email != "" {
		for _, a := range m.agents {
			if a.TenantID == tenantID && a.Email != nil && *a.Email == *agent.Email {
				return repository.ErrDuplicateAgentEmail
			}
		}
	}
	if agent.Phone != nil && *agent.Phone != "" {
		normalized := util.NormalizePhoneToWhatsApp(*agent.Phone)
		agent.Phone = &normalized
		for _, a := range m.agents {
			if a.TenantID == tenantID && a.Phone != nil && util.NormalizePhoneToWhatsApp(*a.Phone) == normalized {
				return repository.ErrDuplicateAgentPhone
			}
		}
	}

	if agent.ParentAgentID != nil && agent.ID != 0 && *agent.ParentAgentID == agent.ID {
		return repository.ErrSelfReferencingParentAgent
	}
	agent.ID = m.nextID
	m.nextID++
	agent.TenantID = tenantID
	if agent.Status == "" {
		agent.Status = "pending"
	}
	if agent.PaymentStatus == "" {
		agent.PaymentStatus = "not_applicable"
	}
	m.agents[agent.ID] = agent
	return nil
}

func (m *mockAgentRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Agent, error) {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return a, nil
}

func (m *mockAgentRepo) GetByEmail(ctx context.Context, tenantID uint64, email string) (*repository.Agent, error) {
	for _, a := range m.agents {
		if a.TenantID == tenantID && a.Email != nil && *a.Email == email {
			return a, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockAgentRepo) GetByReferralCode(ctx context.Context, referralCode string) (*repository.Agent, error) {
	for _, a := range m.agents {
		if a.ReferralCode == referralCode {
			return a, nil
		}
	}
	return nil, repository.ErrNotFound
}

func (m *mockAgentRepo) List(ctx context.Context, tenantID uint64, statusFilter ...string) ([]repository.Agent, error) {
	var list []repository.Agent
	for _, a := range m.agents {
		if a.TenantID == tenantID {
			if len(statusFilter) > 0 && statusFilter[0] != "" {
				if a.Status == statusFilter[0] {
					list = append(list, *a)
				}
			} else {
				list = append(list, *a)
			}
		}
	}
	return list, nil
}

func (m *mockAgentRepo) Update(ctx context.Context, tenantID uint64, agent *repository.Agent) error {
	existing, ok := m.agents[agent.ID]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	if agent.ParentAgentID != nil && *agent.ParentAgentID == agent.ID {
		return repository.ErrSelfReferencingParentAgent
	}
	m.agents[agent.ID] = agent
	return nil
}

func (m *mockAgentRepo) UpdateBankInfo(ctx context.Context, tenantID uint64, id uint64, bankName, accountNumber, accountHolder string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.BankName = &bankName
	a.BankAccountNumber = &accountNumber
	a.BankAccountHolder = &accountHolder
	return nil
}

func (m *mockAgentRepo) Approve(ctx context.Context, tenantID uint64, id uint64) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.Status = "active"
	if a.PaymentStatus == "pending_verification" {
		a.PaymentStatus = "verified"
	}
	return nil
}

func (m *mockAgentRepo) Reject(ctx context.Context, tenantID uint64, id uint64, reason string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.Status = "rejected"
	trimmed := strings.TrimSpace(reason)
	if trimmed != "" {
		a.RejectionReason = &trimmed
	} else {
		a.RejectionReason = nil
	}
	return nil
}

func (m *mockAgentRepo) ResetToPendingWithProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.Status = "pending"
	a.PaymentStatus = "pending_verification"
	a.PaymentProofURL = &proofURL
	a.RejectionReason = nil
	return nil
}

func (m *mockAgentRepo) UpdatePaymentProof(ctx context.Context, tenantID uint64, id uint64, proofURL string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.PaymentProofURL = &proofURL
	a.PaymentStatus = "pending_verification"
	return nil
}

func (m *mockAgentRepo) UpdateProfile(ctx context.Context, tenantID uint64, id uint64, params repository.UpdateAgentProfileParams) (*repository.Agent, error) {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	if params.Email != nil && *params.Email != "" {
		for otherID, other := range m.agents {
			if other.TenantID == tenantID && otherID != id && other.Email != nil && *other.Email == *params.Email {
				return nil, repository.ErrDuplicateAgentEmail
			}
		}
		a.Email = params.Email
	}
	if params.Phone != nil && *params.Phone != "" {
		normalized := util.NormalizePhoneToWhatsApp(*params.Phone)
		for otherID, other := range m.agents {
			if other.TenantID == tenantID && otherID != id && other.Phone != nil && util.NormalizePhoneToWhatsApp(*other.Phone) == normalized {
				return nil, repository.ErrDuplicateAgentPhone
			}
		}
		a.Phone = &normalized
	}
	if params.Name != nil && *params.Name != "" {
		a.Name = *params.Name
	}
	if params.Domisili != nil {
		a.Domisili = params.Domisili
	}
	if params.BankName != nil {
		a.BankName = params.BankName
	}
	if params.BankAccountNumber != nil {
		a.BankAccountNumber = params.BankAccountNumber
	}
	if params.BankAccountHolder != nil {
		a.BankAccountHolder = params.BankAccountHolder
	}
	return a, nil
}

func (m *mockAgentRepo) UpdatePhotoURL(ctx context.Context, tenantID uint64, id uint64, photoURL string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.PhotoURL = &photoURL
	return nil
}

func (m *mockAgentRepo) UpdatePassword(ctx context.Context, tenantID uint64, id uint64, newPasswordHash string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.PasswordHash = &newPasswordHash
	return nil
}

func (m *mockAgentRepo) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, status string) error {
	a, ok := m.agents[id]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.Status = status
	return nil
}

func (m *mockAgentRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	existing, ok := m.agents[id]
	if !ok || existing.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.agents, id)
	return nil
}

func (m *mockAgentRepo) CountActiveByTenant(ctx context.Context, tenantID uint64) (int, error) {
	count := 0
	for _, a := range m.agents {
		if a.TenantID == tenantID && a.Status == "active" {
			count++
		}
	}
	return count, nil
}

// mockAgentSessionRepo implements repository.AgentSessionRepository for handler tests.
type mockAgentSessionRepo struct {
	sessions  map[string]*repository.AgentSession
	agentRepo *mockAgentRepo
	nextID    uint64
}

func newMockAgentSessionRepo(agentRepo *mockAgentRepo) *mockAgentSessionRepo {
	return &mockAgentSessionRepo{
		sessions:  make(map[string]*repository.AgentSession),
		agentRepo: agentRepo,
		nextID:    1,
	}
}

func (m *mockAgentSessionRepo) Create(ctx context.Context, s *repository.AgentSession) error {
	s.ID = m.nextID
	m.nextID++
	m.sessions[s.Token] = s
	return nil
}

func (m *mockAgentSessionRepo) FindByToken(ctx context.Context, token string) (*repository.AgentSession, error) {
	s, ok := m.sessions[token]
	if !ok {
		return nil, repository.ErrNotFound
	}
	if !s.ExpiresAt.IsZero() && time.Now().After(s.ExpiresAt) {
		return nil, repository.ErrNotFound
	}
	if m.agentRepo != nil {
		for _, a := range m.agentRepo.agents {
			if a.ID == s.AgentID {
				s.TenantID = a.TenantID
				s.AgentStatus = a.Status
				break
			}
		}
	}
	return s, nil
}

func (m *mockAgentSessionRepo) DeleteByToken(ctx context.Context, token string) error {
	delete(m.sessions, token)
	return nil
}

func (m *mockAgentSessionRepo) DeleteByAgentID(ctx context.Context, agentID uint64) error {
	for token, s := range m.sessions {
		if s.AgentID == agentID {
			delete(m.sessions, token)
		}
	}
	return nil
}

func (m *mockAgentSessionRepo) Delete(ctx context.Context, id uint64) error {
	for token, s := range m.sessions {
		if s.ID == id {
			delete(m.sessions, token)
			return nil
		}
	}
	return repository.ErrNotFound
}

type mockAgentTargetRepo struct {
	targets      map[uint64]*repository.AgentTarget
	achievements map[uint64]*repository.AgentTargetAchievement
	nextTargetID uint64
	nextAchID    uint64
	prospectRepo *mockProspectRepo
	agentRepo    *mockAgentRepo
}

func newMockAgentTargetRepo(agentRepo *mockAgentRepo, prospectRepo *mockProspectRepo) *mockAgentTargetRepo {
	return &mockAgentTargetRepo{
		targets:      make(map[uint64]*repository.AgentTarget),
		achievements: make(map[uint64]*repository.AgentTargetAchievement),
		nextTargetID: 1,
		nextAchID:    1,
		agentRepo:    agentRepo,
		prospectRepo: prospectRepo,
	}
}

func (m *mockAgentTargetRepo) Create(ctx context.Context, tenantID uint64, target *repository.AgentTarget) error {
	target.ID = m.nextTargetID
	m.nextTargetID++
	target.TenantID = tenantID
	if target.Status == "" {
		target.Status = "active"
	}
	target.CreatedAt = time.Now()
	target.UpdatedAt = time.Now()
	cp := *target
	m.targets[target.ID] = &cp
	return nil
}

func (m *mockAgentTargetRepo) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.AgentTarget, error) {
	t, ok := m.targets[id]
	if !ok || t.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	cp := *t
	return &cp, nil
}

func (m *mockAgentTargetRepo) ListByTenant(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.AgentTarget, error) {
	var list []repository.AgentTarget
	for _, t := range m.targets {
		if t.TenantID == tenantID {
			if statusFilter != nil && *statusFilter != "" && t.Status != *statusFilter {
				continue
			}
			list = append(list, *t)
		}
	}
	return list, nil
}

func (m *mockAgentTargetRepo) Update(ctx context.Context, tenantID uint64, target *repository.AgentTarget) error {
	t, ok := m.targets[target.ID]
	if !ok || t.TenantID != tenantID {
		return repository.ErrNotFound
	}
	t.Title = target.Title
	t.MetricValue = target.MetricValue
	t.RewardDescription = target.RewardDescription
	t.PeriodStart = target.PeriodStart
	t.PeriodEnd = target.PeriodEnd
	t.UpdatedAt = time.Now()
	return nil
}

func (m *mockAgentTargetRepo) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	t, ok := m.targets[id]
	if !ok || t.TenantID != tenantID {
		return repository.ErrNotFound
	}
	delete(m.targets, id)
	return nil
}

func (m *mockAgentTargetRepo) Close(ctx context.Context, tenantID uint64, id uint64) error {
	t, ok := m.targets[id]
	if !ok || t.TenantID != tenantID {
		return repository.ErrNotFound
	}
	t.Status = "closed"
	t.UpdatedAt = time.Now()
	return nil
}

func (m *mockAgentTargetRepo) GetAgentProgress(ctx context.Context, tenantID uint64, agentID uint64, metricType string, periodStart, periodEnd string) (int, error) {
	if m.prospectRepo == nil {
		return 0, nil
	}
	start, _ := time.Parse("2006-01-02", periodStart)
	end, _ := time.Parse("2006-01-02", periodEnd)
	endExclusive := end.AddDate(0, 0, 1)

	if metricType == "mitra_baru_count" {
		if m.agentRepo == nil {
			return 0, nil
		}
		mitraClosingCount := 0
		for _, ag := range m.agentRepo.agents {
			if ag.TenantID == tenantID && ag.ParentAgentID != nil && *ag.ParentAgentID == agentID {
				hasClosing := false
				for _, h := range m.prospectRepo.history {
					if h.TenantID == tenantID && h.NewStatus == "closing" && !h.ChangedAt.Before(start) && h.ChangedAt.Before(endExclusive) {
						if p, ok := m.prospectRepo.prospects[h.ProspectID]; ok && p.AgentID != nil && *p.AgentID == ag.ID {
							hasClosing = true
							break
						}
					}
				}
				if hasClosing {
					mitraClosingCount++
				}
			}
		}
		return mitraClosingCount, nil
	}

	// closing_pax
	sum := 0
	for _, h := range m.prospectRepo.history {
		if h.TenantID == tenantID && h.NewStatus == "closing" && !h.ChangedAt.Before(start) && h.ChangedAt.Before(endExclusive) {
			if p, ok := m.prospectRepo.prospects[h.ProspectID]; ok && p.AgentID != nil && *p.AgentID == agentID {
				jj := 1
				if p.JumlahJamaah != nil && *p.JumlahJamaah > 0 {
					jj = *p.JumlahJamaah
				}
				sum += jj
			}
		}
	}
	return sum, nil
}

func (m *mockAgentTargetRepo) ListAgentProgress(ctx context.Context, tenantID uint64, targetID uint64) ([]repository.AgentTargetProgressRow, error) {
	target, err := m.GetByID(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}

	var rows []repository.AgentTargetProgressRow
	if m.agentRepo == nil {
		return rows, nil
	}

	for _, a := range m.agentRepo.agents {
		if a.TenantID == tenantID && a.Status == "active" {
			prog, _ := m.GetAgentProgress(ctx, tenantID, a.ID, target.MetricType, target.PeriodStart, target.PeriodEnd)

			var achID *uint64
			var rewardStatus *string
			for _, ach := range m.achievements {
				if ach.TenantID == tenantID && ach.TargetID == targetID && ach.AgentID == a.ID {
					val := ach.ID
					achID = &val
					rs := ach.RewardStatus
					rewardStatus = &rs
					prog = ach.AchievedValue
					break
				}
			}

			rows = append(rows, repository.AgentTargetProgressRow{
				AgentID:       a.ID,
				AgentName:     a.Name,
				AgentPhone:    a.Phone,
				AchievedValue: prog,
				TargetValue:   target.MetricValue,
				Achieved:      prog >= target.MetricValue,
				AchievementID: achID,
				RewardStatus:  rewardStatus,
			})
		}
	}
	return rows, nil
}

func (m *mockAgentTargetRepo) CreateAchievement(ctx context.Context, tenantID uint64, achievement *repository.AgentTargetAchievement) error {
	for _, existing := range m.achievements {
		if existing.TenantID == tenantID && existing.TargetID == achievement.TargetID && existing.AgentID == achievement.AgentID {
			existing.AchievedValue = achievement.AchievedValue
			existing.RewardDescriptionSnapshot = achievement.RewardDescriptionSnapshot
			existing.UpdatedAt = time.Now()
			achievement.ID = existing.ID
			return nil
		}
	}

	achievement.ID = m.nextAchID
	m.nextAchID++
	achievement.TenantID = tenantID
	if achievement.RewardStatus == "" {
		achievement.RewardStatus = "pending"
	}
	if achievement.AchievedAt.IsZero() {
		achievement.AchievedAt = time.Now()
	}
	achievement.CreatedAt = time.Now()
	achievement.UpdatedAt = time.Now()
	cp := *achievement
	m.achievements[achievement.ID] = &cp
	return nil
}

func (m *mockAgentTargetRepo) ListAchievementsByTarget(ctx context.Context, tenantID uint64, targetID uint64) ([]repository.AgentTargetAchievement, error) {
	var list []repository.AgentTargetAchievement
	for _, a := range m.achievements {
		if a.TenantID == tenantID && a.TargetID == targetID {
			list = append(list, *a)
		}
	}
	return list, nil
}

func (m *mockAgentTargetRepo) GetAchievementByID(ctx context.Context, tenantID uint64, id uint64) (*repository.AgentTargetAchievement, error) {
	a, ok := m.achievements[id]
	if !ok || a.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	cp := *a
	return &cp, nil
}

func (m *mockAgentTargetRepo) UpdateRewardStatus(ctx context.Context, tenantID uint64, achievementID, adminUserID uint64, status string, notes *string) error {
	a, ok := m.achievements[achievementID]
	if !ok || a.TenantID != tenantID {
		return repository.ErrNotFound
	}
	a.RewardStatus = status
	if status == "given" {
		now := time.Now()
		a.RewardGivenAt = &now
		a.RewardGivenBy = &adminUserID
	}
	if notes != nil {
		a.Notes = notes
	}
	a.UpdatedAt = time.Now()
	return nil
}

func (m *mockAgentTargetRepo) HasAchievements(ctx context.Context, tenantID uint64, targetID uint64) (bool, error) {
	for _, a := range m.achievements {
		if a.TenantID == tenantID && a.TargetID == targetID {
			return true, nil
		}
	}
	return false, nil
}
