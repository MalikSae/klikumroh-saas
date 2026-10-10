package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"klikumroh/internal/repository"
)

// AgentNetworkMember is one directly recruited agent as the upline sees it.
type AgentNetworkMember struct {
	ID       uint64    `json:"id"`
	Name     string    `json:"name"`
	PhotoURL *string   `json:"photo_url"`
	Status   string    `json:"status"` // pending (in process), active, inactive
	JoinedAt time.Time `json:"joined_at"`
	// Phone and Domisili are shown for every listed status (founder decision, 11 Okt 2026): the upline brought
	// the person in and coaches them.
	Phone         *string `json:"phone"`
	Domisili      *string `json:"domisili"`
	ProspectCount int     `json:"prospect_count"`
	ClosingJamaah int     `json:"closing_jamaah"` // jamaah (pax) in closed prospects, like the leaderboard
	// OverrideReleased / OverrideHeld are only meaningful when the travel pays Komisi Pembinaan.
	OverrideReleased float64 `json:"override_released"`
	OverrideHeld     float64 `json:"override_held"`
}

// AgentNetworkSummary are the totals of the whole downline, independent of the filter and the page.
type AgentNetworkSummary struct {
	// Registered = active + inactive: the agents the travel approved. Pending (in process) are not counted.
	Registered       int     `json:"registered"`
	Active           int     `json:"active"`
	Inactive         int     `json:"inactive"`
	Pending          int     `json:"pending"`
	OverrideReleased float64 `json:"override_released"`
	OverrideHeld     float64 `json:"override_held"`
}

// AgentNetwork is the "Agen binaan saya" payload: one level only, the agents this agent recruited directly.
type AgentNetwork struct {
	OverrideEnabled bool                 `json:"override_enabled"`
	Summary         AgentNetworkSummary  `json:"summary"`
	Members         []AgentNetworkMember `json:"members"`
	Page            int                  `json:"page"`
	PerPage         int                  `json:"per_page"`
	Total           int                  `json:"total"` // members matching the filter
	TotalPages      int                  `json:"total_pages"`
}

// AgentNetworkQuery is what the page asks for. Zero values mean everything, first page, default size.
type AgentNetworkQuery struct {
	Status  string // "", "active", "inactive", "pending"
	Query   string
	Page    int
	PerPage int
}

const (
	defaultNetworkPerPage = 10
	maxNetworkPerPage     = 50
)

// ErrAgentNetworkUnavailable is returned when the service was built without the network repository.
var ErrAgentNetworkUnavailable = errors.New("daftar agen binaan belum tersedia")

// ErrInvalidNetworkStatus is returned for a status filter that does not exist.
var ErrInvalidNetworkStatus = errors.New("status tidak dikenal")

// WithAgentNetwork lets agents see the agents they recruited.
func WithAgentNetwork(networkRepo repository.AgentNetworkRepository) AgentServiceOption {
	return func(s *agentService) { s.networkRepo = networkRepo }
}

// GetNetwork lists one page of the agents recruited directly by agentID. Only an active agent may look (sign-up
// is public, a pending account must not see names and numbers), and only its own recruits are returned: the
// parent is the authenticated agent, never a value from the request.
func (s *agentService) GetNetwork(ctx context.Context, tenantID uint64, agentID uint64, q AgentNetworkQuery) (*AgentNetwork, error) {
	if s.networkRepo == nil {
		return nil, ErrAgentNetworkUnavailable
	}
	status := strings.ToLower(strings.TrimSpace(q.Status))
	switch status {
	case "", "all", "active", "inactive", "pending":
	default:
		return nil, ErrInvalidNetworkStatus
	}
	if status == "all" {
		status = ""
	}

	me, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	if me.Status != "active" {
		return nil, ErrAgentNotActive
	}

	overrideOn := false
	if s.tenantRepo != nil {
		if t, err := s.tenantRepo.GetByID(ctx, tenantID); err == nil && t != nil {
			overrideOn = t.CommissionOverrideEnabled && t.CommissionOverridePercentage != nil && *t.CommissionOverridePercentage > 0
		}
	}

	perPage := q.PerPage
	if perPage <= 0 {
		perPage = defaultNetworkPerPage
	}
	if perPage > maxNetworkPerPage {
		perPage = maxNetworkPerPage
	}
	page := q.Page
	if page < 1 {
		page = 1
	}

	sum, err := s.networkRepo.Summary(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	recruits, total, err := s.networkRepo.ListDirectRecruits(ctx, tenantID, agentID, repository.AgentNetworkFilter{
		Status: status,
		Query:  q.Query,
		Limit:  perPage,
		Offset: (page - 1) * perPage,
	})
	if err != nil {
		return nil, err
	}

	totalPages := (total + perPage - 1) / perPage
	if totalPages < 1 {
		totalPages = 1
	}

	out := &AgentNetwork{
		OverrideEnabled: overrideOn,
		Summary: AgentNetworkSummary{
			Registered: sum.Active + sum.Inactive,
			Active:     sum.Active,
			Inactive:   sum.Inactive,
			Pending:    sum.Pending,
		},
		Members:    make([]AgentNetworkMember, 0, len(recruits)),
		Page:       page,
		PerPage:    perPage,
		Total:      total,
		TotalPages: totalPages,
	}
	if overrideOn {
		out.Summary.OverrideReleased = sum.OverrideReleased
		out.Summary.OverrideHeld = sum.OverrideHeld
	}
	for _, m := range recruits {
		view := AgentNetworkMember{
			ID:            m.ID,
			Name:          m.Name,
			PhotoURL:      m.PhotoURL,
			Status:        m.Status,
			JoinedAt:      m.CreatedAt,
			Phone:         m.Phone,
			Domisili:      m.Domisili,
			ProspectCount: m.ProspectCount,
			ClosingJamaah: m.ClosingJamaah,
		}
		if overrideOn {
			view.OverrideReleased = m.OverrideReleased
			view.OverrideHeld = m.OverrideHeld
		}
		out.Members = append(out.Members, view)
	}
	return out, nil
}
