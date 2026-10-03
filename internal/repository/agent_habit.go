package repository

import (
	"context"
	"database/sql"
)

// AgentHabitDay is one habit done by an agent on one business day (WIB, "YYYY-MM-DD").
type AgentHabitDay struct {
	Date string
	Key  string
}

// AgentHabitRepository stores the agent habit tracker and the "99 sumber jamaah" progress.
// Every method is scoped to the tenant and the agent.
type AgentHabitRepository interface {
	// LogHabit records that the agent did habitKey on date ("YYYY-MM-DD"); a repeat on the same day is a no-op.
	LogHabit(ctx context.Context, tenantID, agentID uint64, habitKey, date string) error
	// ListHabitDays returns the habits done between from and to (inclusive dates): the logged ones plus
	// "contact" from the agent's status changes and "note" from the agent's prospect notes.
	ListHabitDays(ctx context.Context, tenantID, agentID uint64, from, to string) ([]AgentHabitDay, error)
	// ListSumberDone returns the ids of the "sumber jamaah" the agent marked as tried.
	ListSumberDone(ctx context.Context, tenantID, agentID uint64) ([]int, error)
	// SetSumberDone marks (done=true) or unmarks a "sumber jamaah" for the agent.
	SetSumberDone(ctx context.Context, tenantID, agentID uint64, sumberID int, done bool) error
	// AwardBadge records a streak milestone for the agent; true only the first time (newly earned).
	AwardBadge(ctx context.Context, tenantID, agentID uint64, days int) (bool, error)
	// ListBadges returns the agent's milestones, smallest first.
	ListBadges(ctx context.Context, tenantID, agentID uint64) ([]AgentHabitBadge, error)
	// TopBadgeByAgent returns each agent's highest milestone in the tenant (agents without one are absent).
	TopBadgeByAgent(ctx context.Context, tenantID uint64) (map[uint64]int, error)
	// ListTenantHabitDays returns the habits of every agent of the tenant between from and to (inclusive).
	ListTenantHabitDays(ctx context.Context, tenantID uint64, from, to string) ([]AgentHabitDayOf, error)
}

type mysqlAgentHabitRepository struct {
	db *sql.DB
}

// NewAgentHabitRepository creates a new AgentHabitRepository.
func NewAgentHabitRepository(db *sql.DB) AgentHabitRepository {
	return &mysqlAgentHabitRepository{db: db}
}

func (r *mysqlAgentHabitRepository) LogHabit(ctx context.Context, tenantID, agentID uint64, habitKey, date string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT IGNORE INTO agent_habit_logs (tenant_id, agent_id, habit_key, log_date)
		SELECT a.tenant_id, a.id, ?, ?
		FROM agents a
		WHERE a.tenant_id = ? AND a.id = ?`,
		habitKey, date, tenantID, agentID)
	return err
}

func (r *mysqlAgentHabitRepository) ListHabitDays(ctx context.Context, tenantID, agentID uint64, from, to string) ([]AgentHabitDay, error) {
	// The session time zone is WIB (repository.MySQLDSN), so DATE() of a timestamp is the business day.
	rows, err := r.db.QueryContext(ctx, `
		SELECT DATE_FORMAT(l.log_date, '%Y-%m-%d') AS d, l.habit_key
		FROM agent_habit_logs l
		WHERE l.tenant_id = ? AND l.agent_id = ? AND l.log_date BETWEEN ? AND ?
		UNION
		SELECT DATE_FORMAT(h.changed_at, '%Y-%m-%d') AS d, 'contact'
		FROM prospect_status_history h
		WHERE h.tenant_id = ? AND h.changed_by_type = 'agent' AND h.changed_by_id = ?
		  AND h.changed_at >= ? AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
		UNION
		SELECT DATE_FORMAT(n.created_at, '%Y-%m-%d') AS d, 'note'
		FROM prospect_notes n
		WHERE n.tenant_id = ? AND n.author_type = 'agent' AND n.author_id = ?
		  AND n.created_at >= ? AND n.created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
		tenantID, agentID, from, to,
		tenantID, agentID, from, to,
		tenantID, agentID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var days []AgentHabitDay
	for rows.Next() {
		var d AgentHabitDay
		if err := rows.Scan(&d.Date, &d.Key); err != nil {
			return nil, err
		}
		days = append(days, d)
	}
	return days, rows.Err()
}

func (r *mysqlAgentHabitRepository) ListSumberDone(ctx context.Context, tenantID, agentID uint64) ([]int, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT sumber_id FROM agent_sumber_progress
		WHERE tenant_id = ? AND agent_id = ?
		ORDER BY sumber_id`, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *mysqlAgentHabitRepository) SetSumberDone(ctx context.Context, tenantID, agentID uint64, sumberID int, done bool) error {
	if !done {
		_, err := r.db.ExecContext(ctx, `
			DELETE FROM agent_sumber_progress
			WHERE tenant_id = ? AND agent_id = ? AND sumber_id = ?`, tenantID, agentID, sumberID)
		return err
	}
	// The agent must belong to the tenant: insert through the agents row, never a bare id.
	_, err := r.db.ExecContext(ctx, `
		INSERT IGNORE INTO agent_sumber_progress (tenant_id, agent_id, sumber_id)
		SELECT a.tenant_id, a.id, ?
		FROM agents a
		WHERE a.tenant_id = ? AND a.id = ?`, sumberID, tenantID, agentID)
	return err
}

// AgentHabitBadge is a streak milestone (7, 30 or 100 days) the agent has reached.
type AgentHabitBadge struct {
	Days       int    `json:"days"`
	AchievedAt string `json:"achieved_at"` // "YYYY-MM-DD" (WIB)
}

func (r *mysqlAgentHabitRepository) AwardBadge(ctx context.Context, tenantID, agentID uint64, days int) (bool, error) {
	// Through the agents row, so a badge can only go to an agent of this tenant. A repeat is a no-op.
	res, err := r.db.ExecContext(ctx, `
		INSERT IGNORE INTO agent_habit_badges (tenant_id, agent_id, days)
		SELECT a.tenant_id, a.id, ?
		FROM agents a
		WHERE a.tenant_id = ? AND a.id = ?`, days, tenantID, agentID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

func (r *mysqlAgentHabitRepository) ListBadges(ctx context.Context, tenantID, agentID uint64) ([]AgentHabitBadge, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT days, DATE_FORMAT(achieved_at, '%Y-%m-%d')
		FROM agent_habit_badges
		WHERE tenant_id = ? AND agent_id = ?
		ORDER BY days`, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	badges := []AgentHabitBadge{}
	for rows.Next() {
		var b AgentHabitBadge
		if err := rows.Scan(&b.Days, &b.AchievedAt); err != nil {
			return nil, err
		}
		badges = append(badges, b)
	}
	return badges, rows.Err()
}

func (r *mysqlAgentHabitRepository) TopBadgeByAgent(ctx context.Context, tenantID uint64) (map[uint64]int, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT agent_id, MAX(days)
		FROM agent_habit_badges
		WHERE tenant_id = ?
		GROUP BY agent_id`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	top := map[uint64]int{}
	for rows.Next() {
		var id uint64
		var days int
		if err := rows.Scan(&id, &days); err != nil {
			return nil, err
		}
		top[id] = days
	}
	return top, rows.Err()
}

// AgentHabitDayOf is one habit done by one agent of the tenant on one business day.
type AgentHabitDayOf struct {
	AgentID uint64
	Date    string
	Key     string
}

func (r *mysqlAgentHabitRepository) ListTenantHabitDays(ctx context.Context, tenantID uint64, from, to string) ([]AgentHabitDayOf, error) {
	// Same three sources as ListHabitDays, for every agent of the tenant at once (dashboard overview).
	rows, err := r.db.QueryContext(ctx, `
		SELECT l.agent_id, DATE_FORMAT(l.log_date, '%Y-%m-%d') AS d, l.habit_key
		FROM agent_habit_logs l
		WHERE l.tenant_id = ? AND l.log_date BETWEEN ? AND ?
		UNION
		SELECT h.changed_by_id, DATE_FORMAT(h.changed_at, '%Y-%m-%d') AS d, 'contact'
		FROM prospect_status_history h
		WHERE h.tenant_id = ? AND h.changed_by_type = 'agent'
		  AND h.changed_at >= ? AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
		UNION
		SELECT n.author_id, DATE_FORMAT(n.created_at, '%Y-%m-%d') AS d, 'note'
		FROM prospect_notes n
		WHERE n.tenant_id = ? AND n.author_type = 'agent'
		  AND n.created_at >= ? AND n.created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
		tenantID, from, to,
		tenantID, from, to,
		tenantID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var days []AgentHabitDayOf
	for rows.Next() {
		var d AgentHabitDayOf
		if err := rows.Scan(&d.AgentID, &d.Date, &d.Key); err != nil {
			return nil, err
		}
		days = append(days, d)
	}
	return days, rows.Err()
}
