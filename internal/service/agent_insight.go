package service

import (
	"context"
	"sort"
	"time"

	"klikumroh/internal/repository"
)

// Agent summary on the travel dashboard home (3 Oct 2026), definitions set by the founder:
//
//	terdaftar  - approved agents with status active
//	aktif      - did their daily syiar routinely in the last 7 days: at least AgentRoutineMinDays active
//	             habit days (a habit day is active with HabitActiveMin of the five habits)
//	produktif  - brought in a prospect or a closing jamaah in the last 30 days
//
// Plus the top agents of the last 30 days (by closing jamaah, then prospects).
const (
	AgentRoutineMinDays = 3
	agentInsightTopN    = 5
	agentProductiveDays = 30
)

// AgentInsightTop is one agent in the dashboard's top list.
type AgentInsightTop struct {
	AgentID     uint64  `json:"agent_id"`
	Name        string  `json:"name"`
	PhotoURL    *string `json:"photo_url"`
	Prospects30 int     `json:"prospects_30d"`
	Jamaah30    int     `json:"jamaah_30d"`
	TopBadge    int     `json:"top_badge"`
	ActiveDays7 int     `json:"active_days_7"`
}

// AgentInsight is the agent block of the dashboard home.
type AgentInsight struct {
	Registered   int               `json:"registered"`
	Active7      int               `json:"active_7d"`
	Productive30 int               `json:"productive_30d"`
	Prospects30  int               `json:"prospects_30d"`
	Jamaah30     int               `json:"jamaah_30d"`
	RoutineMin   int               `json:"routine_min_days"`
	Top          []AgentInsightTop `json:"top"`
}

// AgentInsightService builds the agent summary for one travel.
type AgentInsightService interface {
	Summary(ctx context.Context, tenantID uint64) (*AgentInsight, error)
}

type agentInsightService struct {
	agentRepo    repository.AgentRepository
	prospectRepo repository.ProspectRepository
	habitRepo    repository.AgentHabitRepository
	now          func() time.Time
}

// NewAgentInsightService creates the dashboard agent summary service.
func NewAgentInsightService(agentRepo repository.AgentRepository, prospectRepo repository.ProspectRepository, habitRepo repository.AgentHabitRepository) AgentInsightService {
	return &agentInsightService{agentRepo: agentRepo, prospectRepo: prospectRepo, habitRepo: habitRepo, now: time.Now}
}

func (s *agentInsightService) Summary(ctx context.Context, tenantID uint64) (*AgentInsight, error) {
	agents, err := s.agentRepo.List(ctx, tenantID, "active")
	if err != nil {
		return nil, err
	}
	today := businessToday(s.now())
	since := today.AddDate(0, 0, -(agentProductiveDays - 1)).Format("2006-01-02 15:04:05")

	prospects := map[uint64]int{}
	pc, err := s.prospectRepo.GetAgentProspectCountsSince(ctx, tenantID, since)
	if err != nil {
		return nil, err
	}
	for _, c := range pc {
		prospects[c.AgentID] = c.Count
	}
	jamaah := map[uint64]int{}
	cs, err := s.prospectRepo.GetActiveAgentsClosingStatsSince(ctx, tenantID, since)
	if err != nil {
		return nil, err
	}
	for _, c := range cs {
		jamaah[c.AgentID] = c.TotalJamaah
	}

	// Active habit days in the last 7 days, per agent.
	from := today.AddDate(0, 0, -(habitOverviewDays - 1))
	rows, err := s.habitRepo.ListTenantHabitDays(ctx, tenantID, from.Format("2006-01-02"), today.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	perAgent := map[uint64][]repository.AgentHabitDay{}
	for _, r := range rows {
		perAgent[r.AgentID] = append(perAgent[r.AgentID], repository.AgentHabitDay{Date: r.Date, Key: r.Key})
	}
	badges, err := s.habitRepo.TopBadgeByAgent(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	out := &AgentInsight{Registered: len(agents), RoutineMin: AgentRoutineMinDays, Top: []AgentInsightTop{}}
	for _, a := range agents {
		active := 0
		if days := perAgent[a.ID]; len(days) > 0 {
			cal := BuildHabitSummary(days, today).Calendar
			for _, d := range cal[len(cal)-habitOverviewDays:] {
				if d.Active {
					active++
				}
			}
		}
		if active >= AgentRoutineMinDays {
			out.Active7++
		}
		p, j := prospects[a.ID], jamaah[a.ID]
		out.Prospects30 += p
		out.Jamaah30 += j
		if p > 0 || j > 0 {
			out.Productive30++
			out.Top = append(out.Top, AgentInsightTop{
				AgentID: a.ID, Name: a.Name, PhotoURL: a.PhotoURL,
				Prospects30: p, Jamaah30: j, TopBadge: badges[a.ID], ActiveDays7: active,
			})
		}
	}
	sort.SliceStable(out.Top, func(i, k int) bool {
		if out.Top[i].Jamaah30 != out.Top[k].Jamaah30 {
			return out.Top[i].Jamaah30 > out.Top[k].Jamaah30
		}
		if out.Top[i].Prospects30 != out.Top[k].Prospects30 {
			return out.Top[i].Prospects30 > out.Top[k].Prospects30
		}
		return out.Top[i].Name < out.Top[k].Name
	})
	if len(out.Top) > agentInsightTopN {
		out.Top = out.Top[:agentInsightTopN]
	}
	return out, nil
}
