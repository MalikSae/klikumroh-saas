package repository

import (
	"context"
	"database/sql"
	"time"
)

// UrgentAlertsData holds metrics for urgent actions in the overview.
type UrgentAlertsData struct {
	UncontactedProspectsCount int     `json:"uncontacted_prospects_count"`
	PendingPayoutsCount        int     `json:"pending_payouts_count"`
	PendingPayoutsTotal        float64 `json:"pending_payouts_total"`
}

// OverviewKPIsData holds high-level lead-gen performance metrics.
type OverviewKPIsData struct {
	TotalProspects        int `json:"total_prospects"`
	TotalClosingJamaah    int `json:"total_closing_jamaah"`
	ClosingProspectsCount int `json:"closing_prospects_count"`
	AgentProspectsCount   int `json:"agent_prospects_count"`
}

// ChannelAttributionRaw holds raw attribution data per channel.
type ChannelAttributionRaw struct {
	Channel         string `json:"channel"`
	LeadsCount      int    `json:"leads_count"`
	ClosingCount    int    `json:"closing_count"`
	TotalClosingPax int    `json:"total_closing_pax"`
}

// FunnelCountsData holds count per pipeline stage.
type FunnelCountsData struct {
	Baru        int `json:"baru"`
	Dihubungi   int `json:"dihubungi"`
	Tertarik    int `json:"tertarik"`
	Closing     int `json:"closing"`
	TidakLanjut int `json:"tidak_lanjut"`
}

// LostReasonItem holds count for a lost reason.
type LostReasonItem struct {
	Reason string `json:"reason"`
	Count  int    `json:"count"`
}

// RecentProspectItem represents a recent prospect row.
type RecentProspectItem struct {
	ID                   uint64    `json:"id"`
	Name                 string    `json:"name"`
	Phone                string    `json:"phone"`
	JumlahJamaah         int       `json:"jumlah_jamaah"`
	PackageName          string    `json:"package_name"`
	PackageDepartureDate *string   `json:"package_departure_date"`
	SourceChannel        string    `json:"source_channel"`
	AgentName            string    `json:"agent_name"`
	Status               string    `json:"status"`
	CreatedAt            time.Time `json:"created_at"`
}

// TopAgentItem represents a top performing agent.
type TopAgentItem struct {
	AgentID            uint64  `json:"agent_id"`
	Name               string  `json:"name"`
	Phone              string  `json:"phone"`
	PhotoURL           *string `json:"photo_url"`
	TotalClicks        int     `json:"total_clicks"`
	TotalClosingJamaah int     `json:"total_closing_jamaah"`
}

// UpcomingPackageItem represents an upcoming published package with seat statistics.
type UpcomingPackageItem struct {
	ID             uint64     `json:"id"`
	Name           string     `json:"name"`
	DepartureDate  *time.Time `json:"departure_date"`
	Price          float64    `json:"price"`
	Quota          int        `json:"quota"`
	BookedSeats    int        `json:"booked_seats"`
	RemainingSeats int        `json:"remaining_seats"`
}

// ProspectTrendRaw holds raw daily counts per source channel.
type ProspectTrendRaw struct {
	DateStr string `json:"date_str"`
	Channel string `json:"channel"` // "organik", "paid_ads", "agent"
	Count   int    `json:"count"`
}

// PendingStageRaw holds metrics for each pending pipeline stage.
type PendingStageRaw struct {
	Status        string  `json:"status"` // "baru", "dihubungi", "tertarik"
	ProspectCount int     `json:"prospect_count"`
	TotalPax      int     `json:"total_pax"`
	TotalValue    float64 `json:"total_value"`
}

// PendingPipelineRaw holds total pipeline pending value and stages.
type PendingPipelineRaw struct {
	TotalProspects int               `json:"total_prospects"`
	TotalPax       int               `json:"total_pax"`
	TotalValue     float64           `json:"total_value"`
	AvgValuePerPax float64           `json:"avg_value_per_pax"`
	Stages         []PendingStageRaw `json:"stages"`
}

// DashboardOverviewRawData aggregates all raw data for the overview.
type DashboardOverviewRawData struct {
	Alerts           UrgentAlertsData
	KPIs             OverviewKPIsData
	Attributions     []ChannelAttributionRaw
	Funnel           FunnelCountsData
	TopLostReasons   []LostReasonItem
	RecentProspects  []RecentProspectItem
	TopAgents        []TopAgentItem
	UpcomingPackages []UpcomingPackageItem
	ProspectTrends   []ProspectTrendRaw
	PendingPipeline  PendingPipelineRaw
}

// DashboardOverviewRepository defines data access for dashboard overview.
type DashboardOverviewRepository interface {
	GetOverview(ctx context.Context, tenantID uint64) (*DashboardOverviewRawData, error)
}

type mysqlDashboardOverviewRepository struct {
	db *sql.DB
}

// NewDashboardOverviewRepository creates a new DashboardOverviewRepository instance.
func NewDashboardOverviewRepository(db *sql.DB) DashboardOverviewRepository {
	return &mysqlDashboardOverviewRepository{db: db}
}

func (r *mysqlDashboardOverviewRepository) GetOverview(ctx context.Context, tenantID uint64) (*DashboardOverviewRawData, error) {
	data := &DashboardOverviewRawData{
		Attributions:     make([]ChannelAttributionRaw, 0),
		TopLostReasons:   make([]LostReasonItem, 0),
		RecentProspects:  make([]RecentProspectItem, 0),
		TopAgents:        make([]TopAgentItem, 0),
		UpcomingPackages: make([]UpcomingPackageItem, 0),
		ProspectTrends:   make([]ProspectTrendRaw, 0),
		PendingPipeline: PendingPipelineRaw{
			Stages: make([]PendingStageRaw, 0),
		},
	}

	// 1. Urgent Alerts
	// 1a. Uncontacted prospects (status = 'baru')
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM prospects WHERE tenant_id = ? AND status = 'baru'`,
		tenantID,
	).Scan(&data.Alerts.UncontactedProspectsCount)
	if err != nil {
		return nil, err
	}

	// 1b. Pending payouts in commission_payout_requests
	err = r.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(amount_requested), 0) FROM commission_payout_requests WHERE tenant_id = ? AND status = 'pending'`,
		tenantID,
	).Scan(&data.Alerts.PendingPayoutsCount, &data.Alerts.PendingPayoutsTotal)
	if err != nil {
		return nil, err
	}

	// 2. High-level KPIs
	err = r.db.QueryRowContext(ctx, `
		SELECT 
			COUNT(*),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN COALESCE(jumlah_jamaah, 1) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN agent_id IS NOT NULL THEN 1 ELSE 0 END), 0)
		FROM prospects
		WHERE tenant_id = ?
	`, tenantID).Scan(
		&data.KPIs.TotalProspects,
		&data.KPIs.TotalClosingJamaah,
		&data.KPIs.ClosingProspectsCount,
		&data.KPIs.AgentProspectsCount,
	)
	if err != nil {
		return nil, err
	}

	// 3. Channel Attribution Breakdown
	attrQuery := `
		SELECT 
			CASE 
				WHEN agent_id IS NOT NULL OR source_channel = 'agen' THEN 'agent'
				WHEN source_channel IN ('paid', 'paid_ads', 'ads', 'meta_ads', 'google_ads') THEN 'paid_ads'
				ELSE 'organik'
			END AS ch,
			COUNT(*) as leads_count,
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0) as closing_count,
			COALESCE(SUM(CASE WHEN status = 'closing' THEN COALESCE(jumlah_jamaah, 1) ELSE 0 END), 0) as total_closing_pax
		FROM prospects
		WHERE tenant_id = ?
		GROUP BY ch
	`
	rows, err := r.db.QueryContext(ctx, attrQuery, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item ChannelAttributionRaw
		if err := rows.Scan(&item.Channel, &item.LeadsCount, &item.ClosingCount, &item.TotalClosingPax); err != nil {
			return nil, err
		}
		data.Attributions = append(data.Attributions, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// 4. Funnel Stage Counts
	funnelQuery := `
		SELECT 
			COALESCE(SUM(CASE WHEN status = 'baru' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'dihubungi' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'tertarik' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'tidak_lanjut' THEN 1 ELSE 0 END), 0)
		FROM prospects
		WHERE tenant_id = ?
	`
	err = r.db.QueryRowContext(ctx, funnelQuery, tenantID).Scan(
		&data.Funnel.Baru,
		&data.Funnel.Dihubungi,
		&data.Funnel.Tertarik,
		&data.Funnel.Closing,
		&data.Funnel.TidakLanjut,
	)
	if err != nil {
		return nil, err
	}

	// 5. Top Lost Reasons
	lostQuery := `
		SELECT lost_reason, COUNT(*) as cnt
		FROM prospects
		WHERE tenant_id = ? AND status = 'tidak_lanjut' AND lost_reason IS NOT NULL AND TRIM(lost_reason) != ''
		GROUP BY lost_reason
		ORDER BY cnt DESC
		LIMIT 5
	`
	lostRows, err := r.db.QueryContext(ctx, lostQuery, tenantID)
	if err != nil {
		return nil, err
	}
	defer lostRows.Close()

	for lostRows.Next() {
		var lr LostReasonItem
		if err := lostRows.Scan(&lr.Reason, &lr.Count); err != nil {
			return nil, err
		}
		data.TopLostReasons = append(data.TopLostReasons, lr)
	}
	if err := lostRows.Err(); err != nil {
		return nil, err
	}

	// 6. Actionable Prospects (Belum Dihubungi & Siap Closing)
	recentQuery := `
		SELECT 
			p.id, p.name, p.phone, COALESCE(p.jumlah_jamaah, 1), 
			COALESCE(pkg.name, '-'),
			DATE_FORMAT(pkg.departure_date, '%d %b %Y'),
			CASE 
				WHEN p.agent_id IS NOT NULL OR p.source_channel = 'agen' THEN 'agent'
				WHEN p.source_channel IN ('paid', 'paid_ads') THEN 'paid_ads'
				ELSE 'organik'
			END,
			COALESCE(a.name, '-'), p.status, p.created_at
		FROM prospects p
		LEFT JOIN packages pkg ON p.package_id = pkg.id AND pkg.tenant_id = ?
		LEFT JOIN agents a ON p.agent_id = a.id AND a.tenant_id = ?
		WHERE p.tenant_id = ? AND p.status IN ('baru', 'tertarik')
		ORDER BY 
			CASE WHEN p.status = 'baru' THEN 1 ELSE 2 END,
			p.created_at ASC
		LIMIT 50
	`
	recentRows, err := r.db.QueryContext(ctx, recentQuery, tenantID, tenantID, tenantID)
	if err != nil {
		return nil, err
	}
	defer recentRows.Close()

	for recentRows.Next() {
		var p RecentProspectItem
		if err := recentRows.Scan(
			&p.ID, &p.Name, &p.Phone, &p.JumlahJamaah,
			&p.PackageName, &p.PackageDepartureDate, &p.SourceChannel, &p.AgentName,
			&p.Status, &p.CreatedAt,
		); err != nil {
			return nil, err
		}
		data.RecentProspects = append(data.RecentProspects, p)
	}
	if err := recentRows.Err(); err != nil {
		return nil, err
	}

	// 7. Top 5 Agents
	agentQuery := `
		SELECT 
			a.id, a.name, a.phone, a.photo_url,
			(SELECT COUNT(*) FROM referral_clicks rc WHERE rc.agent_id = a.id AND rc.tenant_id = ?) as total_clicks,
			COALESCE(SUM(CASE WHEN p.status = 'closing' THEN COALESCE(p.jumlah_jamaah, 1) ELSE 0 END), 0) as total_closing_jamaah
		FROM agents a
		LEFT JOIN prospects p ON p.agent_id = a.id AND p.tenant_id = ?
		WHERE a.tenant_id = ? AND a.status = 'active'
		GROUP BY a.id, a.name, a.phone, a.photo_url
		ORDER BY total_closing_jamaah DESC, total_clicks DESC
		LIMIT 5
	`
	agentRows, err := r.db.QueryContext(ctx, agentQuery, tenantID, tenantID, tenantID)
	if err != nil {
		return nil, err
	}
	defer agentRows.Close()

	for agentRows.Next() {
		var ag TopAgentItem
		if err := agentRows.Scan(&ag.AgentID, &ag.Name, &ag.Phone, &ag.PhotoURL, &ag.TotalClicks, &ag.TotalClosingJamaah); err != nil {
			return nil, err
		}
		data.TopAgents = append(data.TopAgents, ag)
	}
	if err := agentRows.Err(); err != nil {
		return nil, err
	}

	// 8. Upcoming Published Packages
	packageQuery := `
		SELECT 
			pkg.id, pkg.name, pkg.departure_date, COALESCE(pkg.price, 0), COALESCE(pkg.quota, 0),
			COALESCE(SUM(CASE WHEN p.status = 'closing' THEN COALESCE(p.jumlah_jamaah, 1) ELSE 0 END), 0) as booked_seats
		FROM packages pkg
		LEFT JOIN prospects p ON p.package_id = pkg.id AND p.tenant_id = ?
		WHERE pkg.tenant_id = ? AND pkg.status = 'published' AND pkg.departure_date IS NOT NULL
		GROUP BY pkg.id, pkg.name, pkg.departure_date, pkg.price, pkg.quota
		ORDER BY pkg.departure_date ASC
		LIMIT 5
	`
	pkgRows, err := r.db.QueryContext(ctx, packageQuery, tenantID, tenantID)
	if err != nil {
		return nil, err
	}
	defer pkgRows.Close()

	for pkgRows.Next() {
		var item UpcomingPackageItem
		var depDate sql.NullTime
		if err := pkgRows.Scan(&item.ID, &item.Name, &depDate, &item.Price, &item.Quota, &item.BookedSeats); err != nil {
			return nil, err
		}
		if depDate.Valid {
			item.DepartureDate = &depDate.Time
		}
		rem := item.Quota - item.BookedSeats
		if rem < 0 {
			rem = 0
		}
		item.RemainingSeats = rem
		data.UpcomingPackages = append(data.UpcomingPackages, item)
	}
	if err := pkgRows.Err(); err != nil {
		return nil, err
	}

	// 9. Prospect Trends by Channel (Last 30 days)
	trendQuery := `
		SELECT 
			DATE_FORMAT(p.created_at, '%Y-%m-%d') as date_str,
			CASE 
				WHEN p.agent_id IS NOT NULL OR p.source_channel = 'agen' THEN 'agent'
				WHEN p.source_channel IN ('paid', 'paid_ads', 'ads', 'meta_ads', 'google_ads') THEN 'paid_ads'
				ELSE 'organik'
			END AS ch,
			COUNT(*) as cnt
		FROM prospects p
		WHERE p.tenant_id = ? AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
		GROUP BY date_str, ch
		ORDER BY date_str ASC
	`
	trendRows, err := r.db.QueryContext(ctx, trendQuery, tenantID)
	if err != nil {
		return nil, err
	}
	defer trendRows.Close()

	for trendRows.Next() {
		var item ProspectTrendRaw
		if err := trendRows.Scan(&item.DateStr, &item.Channel, &item.Count); err != nil {
			return nil, err
		}
		data.ProspectTrends = append(data.ProspectTrends, item)
	}
	if err := trendRows.Err(); err != nil {
		return nil, err
	}

	// 10. Pending Pipeline Value and Pax (status IN ('baru', 'dihubungi', 'tertarik'))
	var avgPackagePrice float64
	_ = r.db.QueryRowContext(ctx,
		`SELECT COALESCE(AVG(price), 30000000) FROM packages WHERE tenant_id = ? AND status = 'published'`,
		tenantID,
	).Scan(&avgPackagePrice)
	if avgPackagePrice <= 0 {
		avgPackagePrice = 30000000
	}

	pipelineQuery := `
		SELECT 
			p.status,
			COUNT(*) as prospect_count,
			COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0) as total_pax,
			COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1) * COALESCE(pkg.price, ?)), 0) as total_value
		FROM prospects p
		LEFT JOIN packages pkg ON p.package_id = pkg.id AND pkg.tenant_id = ?
		WHERE p.tenant_id = ? AND p.status IN ('baru', 'dihubungi', 'tertarik')
		GROUP BY p.status
		ORDER BY FIELD(p.status, 'baru', 'dihubungi', 'tertarik')
	`
	pipeRows, err := r.db.QueryContext(ctx, pipelineQuery, avgPackagePrice, tenantID, tenantID)
	if err != nil {
		return nil, err
	}
	defer pipeRows.Close()

	for pipeRows.Next() {
		var st PendingStageRaw
		if err := pipeRows.Scan(&st.Status, &st.ProspectCount, &st.TotalPax, &st.TotalValue); err != nil {
			return nil, err
		}
		data.PendingPipeline.TotalProspects += st.ProspectCount
		data.PendingPipeline.TotalPax += st.TotalPax
		data.PendingPipeline.TotalValue += st.TotalValue
		data.PendingPipeline.Stages = append(data.PendingPipeline.Stages, st)
	}
	if err := pipeRows.Err(); err != nil {
		return nil, err
	}

	if data.PendingPipeline.TotalPax > 0 {
		data.PendingPipeline.AvgValuePerPax = data.PendingPipeline.TotalValue / float64(data.PendingPipeline.TotalPax)
	} else {
		data.PendingPipeline.AvgValuePerPax = avgPackagePrice
	}

	return data, nil
}
