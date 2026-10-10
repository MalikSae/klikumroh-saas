package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// AgentNetworkMember is one agent recruited directly by an upline, with the figures the upline sees on the
// "Agen binaan saya" page. Only direct recruits exist here: the product supports one level of Komisi Pembinaan
// and no multi-level tree (PRD section on Permenag 8/2018).
type AgentNetworkMember struct {
	ID       uint64  `json:"id"`
	Name     string  `json:"name"`
	Phone    *string `json:"phone"`
	Domisili *string `json:"domisili"`
	PhotoURL *string `json:"photo_url"`
	// Status is pending (in process), active or inactive. Rejected sign-ups are never listed.
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`

	ProspectCount int `json:"prospect_count"`
	// ClosingJamaah is the number of jamaah (pax) in the recruit's closed prospects, the same unit as the
	// leaderboard: a prospect with 3 jamaah counts 3.
	ClosingJamaah int `json:"closing_jamaah"`
	// OverrideReleased / OverrideHeld: the Komisi Pembinaan this recruit's closings gave the upline (override
	// ledger rows and their corrections), split into withdrawable and still on hold until the jamaah is paid off.
	OverrideReleased float64 `json:"override_released"`
	OverrideHeld     float64 `json:"override_held"`
}

// AgentNetworkSummary are the totals of the whole downline. They never depend on the list filter or page.
type AgentNetworkSummary struct {
	Active           int     `json:"active"`
	Inactive         int     `json:"inactive"`
	Pending          int     `json:"pending"`
	OverrideReleased float64 `json:"override_released"`
	OverrideHeld     float64 `json:"override_held"`
}

// AgentNetworkFilter selects one page of the downline.
type AgentNetworkFilter struct {
	// Status is "", "active", "inactive" or "pending" ("" = everyone that is listed).
	Status string
	// Query matches the name, the WhatsApp number or the domicile (substring, case-insensitive).
	Query  string
	Limit  int
	Offset int
}

// AgentNetworkRepository reads the downline of an agent. Every method is scoped by tenantID.
type AgentNetworkRepository interface {
	// Summary counts the direct recruits per status and sums their Komisi Pembinaan.
	Summary(ctx context.Context, tenantID uint64, parentAgentID uint64) (*AgentNetworkSummary, error)
	// ListDirectRecruits returns one page of the agents whose parent is parentAgentID, newest first, and how
	// many match the filter in total. Rejected sign-ups are left out. Agents of other travels never match:
	// tenant_id is part of every condition.
	ListDirectRecruits(ctx context.Context, tenantID uint64, parentAgentID uint64, f AgentNetworkFilter) ([]AgentNetworkMember, int, error)
}

type mysqlAgentNetworkRepository struct {
	db *sql.DB
}

// NewAgentNetworkRepository creates the repository.
func NewAgentNetworkRepository(db *sql.DB) AgentNetworkRepository {
	return &mysqlAgentNetworkRepository{db: db}
}

func (r *mysqlAgentNetworkRepository) Summary(ctx context.Context, tenantID uint64, parentAgentID uint64) (*AgentNetworkSummary, error) {
	out := &AgentNetworkSummary{}
	rows, err := r.db.QueryContext(ctx, `
		SELECT status, COUNT(*) FROM agents
		 WHERE tenant_id = ? AND parent_agent_id = ? AND status <> 'rejected'
		 GROUP BY status`, tenantID, parentAgentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		switch status {
		case "active":
			out.Active = n
		case "inactive":
			out.Inactive = n
		case "pending":
			out.Pending = n
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// The ledger rows that belong to the downline are the parent's rows whose prospect is owned by one of its
	// recruits: the parent's own direct commissions sit on prospects owned by the parent, so they never match.
	err = r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(CASE WHEN cl.released_at IS NOT NULL THEN cl.amount END), 0),
		       COALESCE(SUM(CASE WHEN cl.released_at IS NULL THEN cl.amount END), 0)
		  FROM commission_ledger cl
		  JOIN prospects p ON p.id = cl.prospect_id AND p.tenant_id = cl.tenant_id
		  JOIN agents a ON a.id = p.agent_id AND a.tenant_id = p.tenant_id
		 WHERE cl.tenant_id = ? AND cl.agent_id = ? AND a.parent_agent_id = cl.agent_id`,
		tenantID, parentAgentID).Scan(&out.OverrideReleased, &out.OverrideHeld)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// likeEscape makes a user-typed term safe inside LIKE: the wildcards % and _ and the escape character match
// themselves.
func likeEscape(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}

func (r *mysqlAgentNetworkRepository) ListDirectRecruits(ctx context.Context, tenantID uint64, parentAgentID uint64, f AgentNetworkFilter) ([]AgentNetworkMember, int, error) {
	where := []string{"a.tenant_id = ?", "a.parent_agent_id = ?", "a.status <> 'rejected'"}
	args := []interface{}{tenantID, parentAgentID}

	switch f.Status {
	case "active", "inactive", "pending":
		where = append(where, "a.status = ?")
		args = append(args, f.Status)
	}

	if q := strings.TrimSpace(f.Query); q != "" {
		like := "%" + likeEscape(strings.ToLower(q)) + "%"
		conds := []string{"LOWER(a.name) LIKE ?", "LOWER(a.domisili) LIKE ?"}
		args = append(args, like, like)
		// A number is stored in international form (62812...) while people type 0812...: match both.
		if d := digitsOnly(q); len(d) >= 3 {
			conds = append(conds, "a.phone LIKE ?")
			args = append(args, "%"+d+"%")
			if strings.HasPrefix(d, "0") {
				conds = append(conds, "a.phone LIKE ?")
				args = append(args, "%62"+d[1:]+"%")
			}
		}
		where = append(where, "("+strings.Join(conds, " OR ")+")")
	}
	cond := strings.Join(where, " AND ")

	var total int
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents a WHERE "+cond, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 10
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	q := `
		SELECT a.id, a.name, a.phone, a.domisili, a.photo_url, a.status, a.created_at,
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
		 WHERE ` + cond + `
		 ORDER BY a.created_at DESC, a.id DESC
		 LIMIT ? OFFSET ?`
	pageArgs := append(append([]interface{}{}, args...), limit, offset)

	rows, err := r.db.QueryContext(ctx, q, pageArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []AgentNetworkMember{}
	for rows.Next() {
		var m AgentNetworkMember
		var phone, domisili, photo sql.NullString
		if err := rows.Scan(&m.ID, &m.Name, &phone, &domisili, &photo, &m.Status, &m.CreatedAt,
			&m.ProspectCount, &m.ClosingJamaah, &m.OverrideReleased, &m.OverrideHeld); err != nil {
			return nil, 0, err
		}
		if phone.Valid {
			v := phone.String
			m.Phone = &v
		}
		if domisili.Valid {
			v := domisili.String
			m.Domisili = &v
		}
		if photo.Valid {
			v := photo.String
			m.PhotoURL = &v
		}
		out = append(out, m)
	}
	return out, total, rows.Err()
}
