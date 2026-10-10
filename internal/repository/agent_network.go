package repository

import (
	"context"
	"database/sql"
	"time"
)

// AgentNetworkMember is one agent recruited directly by an upline, with the figures the upline sees on the
// "Jaringan Saya" page. Only direct recruits exist here: the product supports one level of override and no
// multi-level tree (PRD section on Permenag 8/2018).
type AgentNetworkMember struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	Phone     *string   `json:"phone"`
	PhotoURL  *string   `json:"photo_url"`
	Status    string    `json:"status"` // pending, active or inactive (rejected recruits are not listed)
	CreatedAt time.Time `json:"created_at"`

	ProspectCount int `json:"prospect_count"`
	// ClosingJamaah is the number of jamaah (pax) in the recruit's closed prospects, the same unit as the
	// leaderboard: a prospect with 3 jamaah counts 3.
	ClosingJamaah int `json:"closing_jamaah"`
	// OverrideReleased / OverrideHeld: the Komisi Pembinaan this recruit's closings gave the upline (override ledger rows and
	// their corrections), split into withdrawable and still on hold until the jamaah is paid off.
	OverrideReleased float64 `json:"override_released"`
	OverrideHeld     float64 `json:"override_held"`
}

// AgentNetworkRepository reads the downline of an agent. Every method is scoped by tenantID.
type AgentNetworkRepository interface {
	// ListDirectRecruits returns the agents whose parent is parentAgentID, newest first. Rejected sign-ups are
	// left out. Agents of other travels never match: tenant_id is part of every condition.
	ListDirectRecruits(ctx context.Context, tenantID uint64, parentAgentID uint64) ([]AgentNetworkMember, error)
}

type mysqlAgentNetworkRepository struct {
	db *sql.DB
}

// NewAgentNetworkRepository creates the repository.
func NewAgentNetworkRepository(db *sql.DB) AgentNetworkRepository {
	return &mysqlAgentNetworkRepository{db: db}
}

func (r *mysqlAgentNetworkRepository) ListDirectRecruits(ctx context.Context, tenantID uint64, parentAgentID uint64) ([]AgentNetworkMember, error) {
	// The ledger rows that belong to a recruit are the parent's rows whose prospect is owned by that recruit:
	// the parent's own direct commissions sit on prospects owned by the parent, so they never match.
	const q = `
		SELECT a.id, a.name, a.phone, a.photo_url, a.status, a.created_at,
		       (SELECT COUNT(*) FROM prospects p
		         WHERE p.tenant_id = a.tenant_id AND p.agent_id = a.id) AS prospect_count,
		       COALESCE((SELECT SUM(COALESCE(p.jumlah_jamaah, 1)) FROM prospects p
		         WHERE p.tenant_id = a.tenant_id AND p.agent_id = a.id AND p.status = 'closing'), 0) AS closing_jamaah,
		       COALESCE((SELECT SUM(cl.amount) FROM commission_ledger cl
		                  JOIN prospects p ON p.id = cl.prospect_id AND p.tenant_id = cl.tenant_id
		                 WHERE cl.tenant_id = a.tenant_id AND cl.agent_id = a.parent_agent_id
		                   AND p.agent_id = a.id AND cl.released_at IS NOT NULL), 0) AS override_released,
		       COALESCE((SELECT SUM(cl.amount) FROM commission_ledger cl
		                  JOIN prospects p ON p.id = cl.prospect_id AND p.tenant_id = cl.tenant_id
		                 WHERE cl.tenant_id = a.tenant_id AND cl.agent_id = a.parent_agent_id
		                   AND p.agent_id = a.id AND cl.released_at IS NULL), 0) AS override_held
		  FROM agents a
		 WHERE a.tenant_id = ? AND a.parent_agent_id = ? AND a.status <> 'rejected'
		 ORDER BY a.created_at DESC, a.id DESC`

	rows, err := r.db.QueryContext(ctx, q, tenantID, parentAgentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []AgentNetworkMember{}
	for rows.Next() {
		var m AgentNetworkMember
		var phone, photo sql.NullString
		if err := rows.Scan(&m.ID, &m.Name, &phone, &photo, &m.Status, &m.CreatedAt,
			&m.ProspectCount, &m.ClosingJamaah, &m.OverrideReleased, &m.OverrideHeld); err != nil {
			return nil, err
		}
		if phone.Valid {
			v := phone.String
			m.Phone = &v
		}
		if photo.Valid {
			v := photo.String
			m.PhotoURL = &v
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
