package repository

import (
	"context"
	"database/sql"
	"time"
)

// AgentPerformance is one agent's funnel for the agent list: referral clicks, their prospects per
// pipeline stage (same statuses as the prospect pipeline, AGENTS.md 3.6), jamaah closed and commission.
type AgentPerformance struct {
	AgentID        uint64     `json:"agent_id"`
	Clicks         int        `json:"clicks"`
	Clicks30d      int        `json:"clicks_30d"`
	Baru           int        `json:"baru"`
	Dihubungi      int        `json:"dihubungi"`
	Tertarik       int        `json:"tertarik"`
	Closing        int        `json:"closing"`
	TidakLanjut    int        `json:"tidak_lanjut"`
	ClosingJamaah  int        `json:"closing_jamaah"`
	CommissionEarn float64    `json:"commission_earned"`
	LastProspectAt *time.Time `json:"last_prospect_at"`
}

// AgentPerformanceRepository reads agent funnels. Every query is scoped by tenant_id.
type AgentPerformanceRepository interface {
	ListByTenant(ctx context.Context, tenantID uint64) ([]AgentPerformance, error)
}

type mysqlAgentPerformanceRepository struct{ db *sql.DB }

// NewAgentPerformanceRepository creates the MySQL agent performance repository.
func NewAgentPerformanceRepository(db *sql.DB) AgentPerformanceRepository {
	return &mysqlAgentPerformanceRepository{db: db}
}

func (r *mysqlAgentPerformanceRepository) ListByTenant(ctx context.Context, tenantID uint64) ([]AgentPerformance, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT a.id,
			COALESCE(c.clicks, 0), COALESCE(c.clicks_30d, 0),
			COALESCE(p.baru, 0), COALESCE(p.dihubungi, 0), COALESCE(p.tertarik, 0),
			COALESCE(p.closing, 0), COALESCE(p.tidak_lanjut, 0), COALESCE(p.closing_jamaah, 0),
			COALESCE(l.earned, 0), p.last_at
		FROM agents a
		LEFT JOIN (
			SELECT agent_id, COUNT(*) AS clicks,
				SUM(clicked_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS clicks_30d
			FROM referral_clicks WHERE tenant_id = ? GROUP BY agent_id
		) c ON c.agent_id = a.id
		LEFT JOIN (
			SELECT agent_id,
				SUM(status = 'baru') AS baru, SUM(status = 'dihubungi') AS dihubungi,
				SUM(status = 'tertarik') AS tertarik, SUM(status = 'closing') AS closing,
				SUM(status = 'tidak_lanjut') AS tidak_lanjut,
				SUM(CASE WHEN status = 'closing' THEN COALESCE(jumlah_jamaah, 1) ELSE 0 END) AS closing_jamaah,
				MAX(created_at) AS last_at
			FROM prospects WHERE tenant_id = ? AND agent_id IS NOT NULL GROUP BY agent_id
		) p ON p.agent_id = a.id
		LEFT JOIN (
			SELECT agent_id, SUM(amount) AS earned FROM commission_ledger WHERE tenant_id = ? GROUP BY agent_id
		) l ON l.agent_id = a.id
		WHERE a.tenant_id = ?
		ORDER BY a.id`, tenantID, tenantID, tenantID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgentPerformance{}
	for rows.Next() {
		var p AgentPerformance
		var last sql.NullTime
		if err := rows.Scan(&p.AgentID, &p.Clicks, &p.Clicks30d, &p.Baru, &p.Dihubungi, &p.Tertarik, &p.Closing, &p.TidakLanjut, &p.ClosingJamaah, &p.CommissionEarn, &last); err != nil {
			return nil, err
		}
		if last.Valid {
			t := last.Time
			p.LastProspectAt = &t
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
