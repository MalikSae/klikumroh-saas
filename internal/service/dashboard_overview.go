package service

import (
	"context"
	"math"
	"time"

	"klikumroh/internal/repository"
)

// ChannelAttributionDTO holds formatted attribution data for UI.
type ChannelAttributionDTO struct {
	Channel         string  `json:"channel"`
	Label           string  `json:"label"`
	LeadsCount      int     `json:"leads_count"`
	ClosingCount    int     `json:"closing_count"`
	TotalClosingPax int     `json:"total_closing_pax"`
	ClosingRate     float64 `json:"closing_rate"`
}

// LostReasonDTO holds lost reason with percentage.
type LostReasonDTO struct {
	Reason     string  `json:"reason"`
	Count      int     `json:"count"`
	Percentage float64 `json:"percentage"`
}

// FunnelDTO holds pipeline counts and top lost reasons.
type FunnelDTO struct {
	Baru           int             `json:"baru"`
	Dihubungi      int             `json:"dihubungi"`
	Tertarik       int             `json:"tertarik"`
	Closing        int             `json:"closing"`
	TidakLanjut    int             `json:"tidak_lanjut"`
	TopLostReasons []LostReasonDTO `json:"top_lost_reasons"`
}

// OverviewKPIsDTO holds calculated KPI metrics.
type OverviewKPIsDTO struct {
	TotalProspects              int     `json:"total_prospects"`
	TotalClosingJamaah          int     `json:"total_closing_jamaah"`
	ClosingRate                 float64 `json:"closing_rate"`
	AgentContributionPercentage float64 `json:"agent_contribution_percentage"`
}

// RecentProspectDTO represents a recent lead.
type RecentProspectDTO struct {
	ID                   uint64 `json:"id"`
	Name                 string `json:"name"`
	Phone                string `json:"phone"`
	JumlahJamaah         int    `json:"jumlah_jamaah"`
	PackageName          string `json:"package_name"`
	PackageDepartureDate string `json:"package_departure_date"`
	SourceChannel        string `json:"source_channel"`
	AgentName            string `json:"agent_name"`
	Status               string `json:"status"`
	CreatedAt            string `json:"created_at"`
}

// UpcomingPackageDTO represents an upcoming departure.
type UpcomingPackageDTO struct {
	ID             uint64  `json:"id"`
	Name           string  `json:"name"`
	DepartureDate  string  `json:"departure_date"`
	Price          float64 `json:"price"`
	Quota          int     `json:"quota"`
	BookedSeats    int     `json:"booked_seats"`
	RemainingSeats int     `json:"remaining_seats"`
}

// DailyTrendItemDTO represents a single day's leads across 3 channels.
type DailyTrendItemDTO struct {
	Date    string `json:"date"`     // "2026-09-08"
	Label   string `json:"label"`    // "08 Sep"
	Organik int    `json:"organik"`
	MetaAds int    `json:"meta_ads"`
	Agent   int    `json:"agent"`
	Total   int    `json:"total"`
}

// PendingStageDTO represents a pipeline stage under negotiation.
type PendingStageDTO struct {
	Status        string  `json:"status"`
	Label         string  `json:"label"`
	ProspectCount int     `json:"prospect_count"`
	TotalPax      int     `json:"total_pax"`
	TotalValue    float64 `json:"total_value"`
}

// PendingPipelineDTO represents total pipeline in negotiation.
type PendingPipelineDTO struct {
	TotalProspects int               `json:"total_prospects"`
	TotalPax       int               `json:"total_pax"`
	TotalValue     float64           `json:"total_value"`
	AvgValuePerPax float64           `json:"avg_value_per_pax"`
	Stages         []PendingStageDTO `json:"stages"`
}

// DashboardOverviewResponse is the complete response for the overview endpoint.
type DashboardOverviewResponse struct {
	UrgentAlerts       repository.UrgentAlertsData  `json:"urgent_alerts"`
	KPIs               OverviewKPIsDTO              `json:"kpis"`
	ChannelAttribution []ChannelAttributionDTO      `json:"channel_attribution"`
	PipelineFunnel     FunnelDTO                    `json:"pipeline_funnel"`
	RecentProspects    []RecentProspectDTO          `json:"recent_prospects"`
	TopAgents          []repository.TopAgentItem    `json:"top_agents"`
	UpcomingPackages   []UpcomingPackageDTO         `json:"upcoming_packages"`
	ProspectTrends     []DailyTrendItemDTO          `json:"prospect_trends"`
	PendingPipeline    PendingPipelineDTO           `json:"pending_pipeline"`
}

// DashboardOverviewService provides business logic for the admin overview.
type DashboardOverviewService interface {
	GetOverview(ctx context.Context, tenantID uint64) (*DashboardOverviewResponse, error)
}

type dashboardOverviewService struct {
	repo repository.DashboardOverviewRepository
}

// NewDashboardOverviewService creates a new DashboardOverviewService instance.
func NewDashboardOverviewService(repo repository.DashboardOverviewRepository) DashboardOverviewService {
	return &dashboardOverviewService{repo: repo}
}

func roundToTwoDecimals(val float64) float64 {
	return math.Round(val*100) / 100
}

func (s *dashboardOverviewService) GetOverview(ctx context.Context, tenantID uint64) (*DashboardOverviewResponse, error) {
	raw, err := s.repo.GetOverview(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	// Calculate KPIs
	var closingRate float64
	if raw.KPIs.TotalProspects > 0 {
		closingRate = roundToTwoDecimals(float64(raw.KPIs.ClosingProspectsCount) / float64(raw.KPIs.TotalProspects) * 100)
	}

	var agentContribution float64
	if raw.KPIs.TotalProspects > 0 {
		agentContribution = roundToTwoDecimals(float64(raw.KPIs.AgentProspectsCount) / float64(raw.KPIs.TotalProspects) * 100)
	}

	kpisDTO := OverviewKPIsDTO{
		TotalProspects:              raw.KPIs.TotalProspects,
		TotalClosingJamaah:          raw.KPIs.TotalClosingJamaah,
		ClosingRate:                 closingRate,
		AgentContributionPercentage: agentContribution,
	}

	// Process Channel Attribution with default 3 channels
	channelMap := map[string]ChannelAttributionDTO{
		"agent": {
			Channel: "agent",
			Label:   "Agen",
		},
		"paid_ads": {
			Channel: "paid_ads",
			Label:   "Meta Ads",
		},
		"organik": {
			Channel: "organik",
			Label:   "Organik",
		},
	}

	for _, a := range raw.Attributions {
		dto, exists := channelMap[a.Channel]
		if !exists {
			dto = ChannelAttributionDTO{
				Channel: a.Channel,
				Label:   a.Channel,
			}
		}
		dto.LeadsCount = a.LeadsCount
		dto.ClosingCount = a.ClosingCount
		dto.TotalClosingPax = a.TotalClosingPax
		if a.LeadsCount > 0 {
			dto.ClosingRate = roundToTwoDecimals(float64(a.ClosingCount) / float64(a.LeadsCount) * 100)
		}
		channelMap[a.Channel] = dto
	}

	// Keep fixed order: agent, paid_ads, organik
	orderedChannels := []ChannelAttributionDTO{
		channelMap["agent"],
		channelMap["paid_ads"],
		channelMap["organik"],
	}

	// Process Funnel & Lost Reasons
	lostReasonsDTO := make([]LostReasonDTO, 0, len(raw.TopLostReasons))
	totalLost := raw.Funnel.TidakLanjut
	for _, lr := range raw.TopLostReasons {
		var pct float64
		if totalLost > 0 {
			pct = roundToTwoDecimals(float64(lr.Count) / float64(totalLost) * 100)
		}
		lostReasonsDTO = append(lostReasonsDTO, LostReasonDTO{
			Reason:     lr.Reason,
			Count:      lr.Count,
			Percentage: pct,
		})
	}

	funnelDTO := FunnelDTO{
		Baru:           raw.Funnel.Baru,
		Dihubungi:      raw.Funnel.Dihubungi,
		Tertarik:       raw.Funnel.Tertarik,
		Closing:        raw.Funnel.Closing,
		TidakLanjut:    raw.Funnel.TidakLanjut,
		TopLostReasons: lostReasonsDTO,
	}

	// Format Recent Prospects
	recentDTO := make([]RecentProspectDTO, 0, len(raw.RecentProspects))
	for _, p := range raw.RecentProspects {
		depDate := ""
		if p.PackageDepartureDate != nil {
			depDate = *p.PackageDepartureDate
		}
		recentDTO = append(recentDTO, RecentProspectDTO{
			ID:                   p.ID,
			Name:                 p.Name,
			Phone:                p.Phone,
			JumlahJamaah:         p.JumlahJamaah,
			PackageName:          p.PackageName,
			PackageDepartureDate: depDate,
			SourceChannel:        p.SourceChannel,
			AgentName:            p.AgentName,
			Status:               p.Status,
			CreatedAt:            p.CreatedAt.Format(time.RFC3339),
		})
	}

	// Format Upcoming Packages
	packagesDTO := make([]UpcomingPackageDTO, 0, len(raw.UpcomingPackages))
	for _, pkg := range raw.UpcomingPackages {
		depStr := ""
		if pkg.DepartureDate != nil {
			depStr = pkg.DepartureDate.Format("2006-01-02")
		}
		packagesDTO = append(packagesDTO, UpcomingPackageDTO{
			ID:             pkg.ID,
			Name:           pkg.Name,
			DepartureDate:  depStr,
			Price:          pkg.Price,
			Quota:          pkg.Quota,
			BookedSeats:    pkg.BookedSeats,
			RemainingSeats: pkg.RemainingSeats,
		})
	}

	// Format Daily Prospect Trends (Last 14 days)
	now := time.Now()
	trendsMap := make(map[string]map[string]int)
	for _, rawTrend := range raw.ProspectTrends {
		if _, exists := trendsMap[rawTrend.DateStr]; !exists {
			trendsMap[rawTrend.DateStr] = make(map[string]int)
		}
		trendsMap[rawTrend.DateStr][rawTrend.Channel] += rawTrend.Count
	}

	var prospectTrends []DailyTrendItemDTO
	for i := 13; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		dateStr := day.Format("2006-01-02")
		labelStr := day.Format("02 Jan")

		chMap := trendsMap[dateStr]
		organik := chMap["organik"]
		metaAds := chMap["paid_ads"]
		agent := chMap["agent"]
		total := organik + metaAds + agent

		prospectTrends = append(prospectTrends, DailyTrendItemDTO{
			Date:    dateStr,
			Label:   labelStr,
			Organik: organik,
			MetaAds: metaAds,
			Agent:   agent,
			Total:   total,
		})
	}

	// Format Pending Pipeline Value & Pax
	stageLabelMap := map[string]string{
		"baru":      "Baru",
		"dihubungi": "Dihubungi",
		"tertarik":  "Tertarik",
	}

	var pendingStages []PendingStageDTO
	for _, st := range raw.PendingPipeline.Stages {
		label := stageLabelMap[st.Status]
		if label == "" {
			label = st.Status
		}
		pendingStages = append(pendingStages, PendingStageDTO{
			Status:        st.Status,
			Label:         label,
			ProspectCount: st.ProspectCount,
			TotalPax:      st.TotalPax,
			TotalValue:    st.TotalValue,
		})
	}

	pendingPipeline := PendingPipelineDTO{
		TotalProspects: raw.PendingPipeline.TotalProspects,
		TotalPax:       raw.PendingPipeline.TotalPax,
		TotalValue:     raw.PendingPipeline.TotalValue,
		AvgValuePerPax: roundToTwoDecimals(raw.PendingPipeline.AvgValuePerPax),
		Stages:         pendingStages,
	}

	return &DashboardOverviewResponse{
		UrgentAlerts:       raw.Alerts,
		KPIs:               kpisDTO,
		ChannelAttribution: orderedChannels,
		PipelineFunnel:     funnelDTO,
		RecentProspects:    recentDTO,
		TopAgents:          raw.TopAgents,
		UpcomingPackages:   packagesDTO,
		ProspectTrends:     prospectTrends,
		PendingPipeline:    pendingPipeline,
	}, nil
}
