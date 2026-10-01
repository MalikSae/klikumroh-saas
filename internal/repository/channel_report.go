package repository

import (
	"context"
	"database/sql"
	"time"
)

// channelExpr classifies a prospect into the three dashboard channels. Same rule as the overview's
// channel attribution: an agent referral wins, then a paid ad click, everything else is the website.
const channelExpr = `CASE
		WHEN agent_id IS NOT NULL OR source_channel = 'agen' THEN 'agen'
		WHEN source_channel IN ('paid', 'paid_ads', 'ads', 'meta_ads', 'google_ads') THEN 'ads'
		ELSE 'web'
	END`

// ChannelStat is one channel's prospects that came in during the period and where they are now in the
// pipeline (AGENTS.md 3.6: Baru, Dihubungi, Tertarik, Closing, Tidak Lanjut).
type ChannelStat struct {
	Channel       string `json:"channel"`
	Prospects     int    `json:"prospects"`
	Processed     int    `json:"processed"`
	Closing       int    `json:"closing"`
	ClosingJamaah int    `json:"closing_jamaah"`
	Lost          int    `json:"lost"`
}

// CampaignStat groups ad prospects by their UTM source and campaign.
type CampaignStat struct {
	Source        string `json:"source"`
	Campaign      string `json:"campaign"`
	Prospects     int    `json:"prospects"`
	Closing       int    `json:"closing"`
	ClosingJamaah int    `json:"closing_jamaah"`
}

// ChannelDay is the number of new prospects per channel on one day.
type ChannelDay struct {
	Date string `json:"date"`
	Web  int    `json:"web"`
	Ads  int    `json:"ads"`
	Agen int    `json:"agen"`
}

// ChannelReport covers the last Days days (today included) and the same length before it.
type ChannelReport struct {
	Days      int            `json:"days"`
	From      string         `json:"from"`
	To        string         `json:"to"`
	Channels  []ChannelStat  `json:"channels"`
	Previous  []ChannelStat  `json:"previous"`
	Campaigns []CampaignStat `json:"campaigns"`
	Daily     []ChannelDay   `json:"daily"`
}

// ChannelReportRepository reads the channel report. Every query is scoped by tenant_id.
type ChannelReportRepository interface {
	Report(ctx context.Context, tenantID uint64, days int) (*ChannelReport, error)
}

type mysqlChannelReportRepository struct{ db *sql.DB }

func NewChannelReportRepository(db *sql.DB) ChannelReportRepository {
	return &mysqlChannelReportRepository{db: db}
}

func emptyChannels() map[string]*ChannelStat {
	return map[string]*ChannelStat{"web": {Channel: "web"}, "ads": {Channel: "ads"}, "agen": {Channel: "agen"}}
}

func orderedChannels(m map[string]*ChannelStat) []ChannelStat {
	return []ChannelStat{*m["web"], *m["ads"], *m["agen"]}
}

func (r *mysqlChannelReportRepository) Report(ctx context.Context, tenantID uint64, days int) (*ChannelReport, error) {
	// Dates come from the database clock, like the overview's daily KPIs.
	var today string
	if err := r.db.QueryRowContext(ctx, `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d')`).Scan(&today); err != nil {
		return nil, err
	}
	end, err := time.Parse("2006-01-02", today)
	if err != nil {
		return nil, err
	}
	start := end.AddDate(0, 0, -(days - 1))
	rep := &ChannelReport{Days: days, From: start.Format("2006-01-02"), To: today}

	// 1. Current and previous period per channel, by the day the prospect came in.
	cur, prev := emptyChannels(), emptyChannels()
	rows, err := r.db.QueryContext(ctx, `
		SELECT
			CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) THEN 'cur' ELSE 'prev' END AS period,
			`+channelExpr+` AS ch,
			COUNT(*),
			COALESCE(SUM(CASE WHEN status <> 'baru' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN COALESCE(jumlah_jamaah, 1) ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'tidak_lanjut' THEN 1 ELSE 0 END), 0)
		FROM prospects
		WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
		GROUP BY period, ch`, days-1, tenantID, 2*days-1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var period, ch string
		var s ChannelStat
		if err := rows.Scan(&period, &ch, &s.Prospects, &s.Processed, &s.Closing, &s.ClosingJamaah, &s.Lost); err != nil {
			return nil, err
		}
		s.Channel = ch
		if period == "cur" {
			*cur[ch] = s
		} else {
			*prev[ch] = s
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rep.Channels, rep.Previous = orderedChannels(cur), orderedChannels(prev)

	// 2. Ad prospects by UTM source and campaign.
	rep.Campaigns = []CampaignStat{}
	cRows, err := r.db.QueryContext(ctx, `
		SELECT
			COALESCE(NULLIF(TRIM(utm_source), ''), '') AS src,
			COALESCE(NULLIF(TRIM(utm_campaign), ''), '') AS cmp,
			COUNT(*),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status = 'closing' THEN COALESCE(jumlah_jamaah, 1) ELSE 0 END), 0)
		FROM prospects
		WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND `+channelExpr+` = 'ads'
		GROUP BY src, cmp
		ORDER BY COUNT(*) DESC, src, cmp
		LIMIT 50`, tenantID, days-1)
	if err != nil {
		return nil, err
	}
	defer cRows.Close()
	for cRows.Next() {
		var c CampaignStat
		if err := cRows.Scan(&c.Source, &c.Campaign, &c.Prospects, &c.Closing, &c.ClosingJamaah); err != nil {
			return nil, err
		}
		rep.Campaigns = append(rep.Campaigns, c)
	}
	if err := cRows.Err(); err != nil {
		return nil, err
	}

	// 3. New prospects per day and channel, zero-filled over the period.
	byDay := make(map[string]*ChannelDay, days)
	rep.Daily = make([]ChannelDay, 0, days)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		rep.Daily = append(rep.Daily, ChannelDay{Date: d.Format("2006-01-02")})
	}
	for i := range rep.Daily {
		byDay[rep.Daily[i].Date] = &rep.Daily[i]
	}
	dRows, err := r.db.QueryContext(ctx, `
		SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, `+channelExpr+` AS ch, COUNT(*)
		FROM prospects
		WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
		GROUP BY d, ch`, tenantID, days-1)
	if err != nil {
		return nil, err
	}
	defer dRows.Close()
	for dRows.Next() {
		var d, ch string
		var n int
		if err := dRows.Scan(&d, &ch, &n); err != nil {
			return nil, err
		}
		day, ok := byDay[d]
		if !ok {
			continue
		}
		switch ch {
		case "web":
			day.Web = n
		case "ads":
			day.Ads = n
		case "agen":
			day.Agen = n
		}
	}
	return rep, dRows.Err()
}
