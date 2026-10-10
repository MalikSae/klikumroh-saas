package service

import (
	"context"
	"errors"
	"time"

	"klikumroh/internal/repository"
)

// AgentNetworkMember is one directly recruited agent as the upline sees it.
type AgentNetworkMember struct {
	ID       uint64    `json:"id"`
	Name     string    `json:"name"`
	PhotoURL *string   `json:"photo_url"`
	Status   string    `json:"status"` // pending, active, inactive
	JoinedAt time.Time `json:"joined_at"`
	// Phone is only set for active agents: a sign-up the travel has not approved yet does not give its number
	// to anyone else.
	Phone         *string `json:"phone"`
	ProspectCount int     `json:"prospect_count"`
	ClosingJamaah int     `json:"closing_jamaah"` // jamaah (pax) in closed prospects, like the leaderboard
	// OverrideReleased / OverrideHeld are only meaningful when the travel pays override (Network.OverrideEnabled).
	OverrideReleased float64 `json:"override_released"`
	OverrideHeld     float64 `json:"override_held"`
}

// AgentNetwork is the "Jaringan Saya" payload: one level only, the agents this agent recruited directly.
type AgentNetwork struct {
	OverrideEnabled  bool                 `json:"override_enabled"`
	Total            int                  `json:"total"`
	Active           int                  `json:"active"`
	Pending          int                  `json:"pending"`
	OverrideReleased float64              `json:"override_released"`
	OverrideHeld     float64              `json:"override_held"`
	Members          []AgentNetworkMember `json:"members"`
}

// ErrAgentNetworkUnavailable is returned when the service was built without the network repository.
var ErrAgentNetworkUnavailable = errors.New("jaringan agen belum tersedia")

// WithAgentNetwork lets agents see the agents they recruited.
func WithAgentNetwork(networkRepo repository.AgentNetworkRepository) AgentServiceOption {
	return func(s *agentService) { s.networkRepo = networkRepo }
}

// GetNetwork lists the agents recruited directly by agentID. Only an active agent may look (sign-up is public,
// a pending account must not see names and numbers), and only its own recruits are returned: the parent is the
// authenticated agent, never a value from the request.
func (s *agentService) GetNetwork(ctx context.Context, tenantID uint64, agentID uint64) (*AgentNetwork, error) {
	if s.networkRepo == nil {
		return nil, ErrAgentNetworkUnavailable
	}
	me, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	if me.Status != "active" {
		return nil, ErrAgentNotActive
	}

	recruits, err := s.networkRepo.ListDirectRecruits(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	overrideOn := false
	if s.tenantRepo != nil {
		if t, err := s.tenantRepo.GetByID(ctx, tenantID); err == nil && t != nil {
			overrideOn = t.CommissionOverrideEnabled && t.CommissionOverridePercentage != nil && *t.CommissionOverridePercentage > 0
		}
	}

	out := &AgentNetwork{OverrideEnabled: overrideOn, Members: make([]AgentNetworkMember, 0, len(recruits))}
	for _, m := range recruits {
		view := AgentNetworkMember{
			ID:            m.ID,
			Name:          m.Name,
			PhotoURL:      m.PhotoURL,
			Status:        m.Status,
			JoinedAt:      m.CreatedAt,
			ProspectCount: m.ProspectCount,
			ClosingJamaah: m.ClosingJamaah,
		}
		if m.Status == "active" {
			view.Phone = m.Phone
			out.Active++
		}
		if m.Status == "pending" {
			out.Pending++
		}
		if overrideOn {
			view.OverrideReleased = m.OverrideReleased
			view.OverrideHeld = m.OverrideHeld
			out.OverrideReleased += m.OverrideReleased
			out.OverrideHeld += m.OverrideHeld
		}
		out.Total++
		out.Members = append(out.Members, view)
	}
	return out, nil
}
