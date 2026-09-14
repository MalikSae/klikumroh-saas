package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// AgentTarget represents a target period set by the travel admin for agents.
type AgentTarget struct {
	ID                uint64    `json:"id"`
	TenantID          uint64    `json:"tenant_id"`
	Title             *string   `json:"title"`
	MetricType        string    `json:"metric_type"` // 'closing_pax' or 'mitra_baru_count'
	MetricValue       int       `json:"metric_value"`
	RewardDescription *string   `json:"reward_description"`
	PeriodStart       string    `json:"period_start"` // YYYY-MM-DD
	PeriodEnd         string    `json:"period_end"`   // YYYY-MM-DD
	Status            string    `json:"status"`       // 'active' or 'closed'
	CreatedBy         *uint64   `json:"created_by"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// AgentTargetAchievement records an agent who achieved a target when closed.
type AgentTargetAchievement struct {
	ID                        uint64     `json:"id"`
	TenantID                  uint64     `json:"tenant_id"`
	TargetID                  uint64     `json:"target_id"`
	AgentID                   uint64     `json:"agent_id"`
	AchievedValue             int        `json:"achieved_value"`
	AchievedAt                time.Time  `json:"achieved_at"`
	RewardStatus              string     `json:"reward_status"` // 'pending' or 'given'
	RewardGivenAt             *time.Time `json:"reward_given_at"`
	RewardGivenBy             *uint64    `json:"reward_given_by"`
	RewardDescriptionSnapshot *string    `json:"reward_description_snapshot"`
	Notes                     *string    `json:"notes"`
	CreatedAt                 time.Time  `json:"created_at"`
	UpdatedAt                 time.Time  `json:"updated_at"`
}

// AgentTargetProgressRow represents the progress of an individual agent towards a target.
type AgentTargetProgressRow struct {
	AgentID       uint64  `json:"agent_id"`
	AgentName     string  `json:"agent_name"`
	AgentPhone    *string `json:"agent_phone"`
	AchievedValue int     `json:"achieved_value"`
	TargetValue   int     `json:"target_value"`
	Achieved      bool    `json:"achieved"`
	AchievementID *uint64 `json:"achievement_id"`
	RewardStatus  *string `json:"reward_status"`
}

// AgentTargetRepository defines the tenant-isolated data access layer for agent targets and achievements.
type AgentTargetRepository interface {
	Create(ctx context.Context, tenantID uint64, target *AgentTarget) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*AgentTarget, error)
	ListByTenant(ctx context.Context, tenantID uint64, statusFilter *string) ([]AgentTarget, error)
	Update(ctx context.Context, tenantID uint64, target *AgentTarget) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	Close(ctx context.Context, tenantID uint64, id uint64) error
	GetAgentProgress(ctx context.Context, tenantID uint64, agentID uint64, metricType string, periodStart, periodEnd string) (int, error)
	ListAgentProgress(ctx context.Context, tenantID uint64, targetID uint64) ([]AgentTargetProgressRow, error)
	CreateAchievement(ctx context.Context, tenantID uint64, achievement *AgentTargetAchievement) error
	ListAchievementsByTarget(ctx context.Context, tenantID uint64, targetID uint64) ([]AgentTargetAchievement, error)
	GetAchievementByID(ctx context.Context, tenantID uint64, id uint64) (*AgentTargetAchievement, error)
	UpdateRewardStatus(ctx context.Context, tenantID uint64, achievementID, adminUserID uint64, status string, notes *string) error
	HasAchievements(ctx context.Context, tenantID uint64, targetID uint64) (bool, error)
}

type mysqlAgentTargetRepository struct {
	db *sql.DB
}

// NewAgentTargetRepository creates a new mysqlAgentTargetRepository instance.
func NewAgentTargetRepository(db *sql.DB) AgentTargetRepository {
	return &mysqlAgentTargetRepository{db: db}
}

func (r *mysqlAgentTargetRepository) Create(ctx context.Context, tenantID uint64, target *AgentTarget) error {
	query := `
		INSERT INTO agent_targets (
			tenant_id, title, metric_type, metric_value, reward_description,
			period_start, period_end, status, created_by
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	status := target.Status
	if status == "" {
		status = "active"
	}
	res, err := r.db.ExecContext(ctx, query,
		tenantID,
		target.Title,
		target.MetricType,
		target.MetricValue,
		target.RewardDescription,
		target.PeriodStart,
		target.PeriodEnd,
		status,
		target.CreatedBy,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	target.ID = uint64(id)
	target.TenantID = tenantID
	target.Status = status
	return nil
}

func (r *mysqlAgentTargetRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*AgentTarget, error) {
	query := `
		SELECT id, tenant_id, title, metric_type, metric_value, reward_description,
		       period_start, period_end, status, created_by, created_at, updated_at
		FROM agent_targets
		WHERE tenant_id = ? AND id = ?
	`
	var t AgentTarget
	var title, rewardDesc sql.NullString
	var createdBy sql.NullInt64
	var periodStart, periodEnd time.Time

	err := r.db.QueryRowContext(ctx, query, tenantID, id).Scan(
		&t.ID,
		&t.TenantID,
		&title,
		&t.MetricType,
		&t.MetricValue,
		&rewardDesc,
		&periodStart,
		&periodEnd,
		&t.Status,
		&createdBy,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if title.Valid {
		t.Title = &title.String
	}
	if rewardDesc.Valid {
		t.RewardDescription = &rewardDesc.String
	}
	if createdBy.Valid {
		val := uint64(createdBy.Int64)
		t.CreatedBy = &val
	}
	t.PeriodStart = periodStart.Format("2006-01-02")
	t.PeriodEnd = periodEnd.Format("2006-01-02")
	return &t, nil
}

func (r *mysqlAgentTargetRepository) ListByTenant(ctx context.Context, tenantID uint64, statusFilter *string) ([]AgentTarget, error) {
	query := `
		SELECT id, tenant_id, title, metric_type, metric_value, reward_description,
		       period_start, period_end, status, created_by, created_at, updated_at
		FROM agent_targets
		WHERE tenant_id = ?
	`
	var args []interface{}
	args = append(args, tenantID)

	if statusFilter != nil && *statusFilter != "" {
		query += " AND status = ?"
		args = append(args, *statusFilter)
	}
	query += " ORDER BY period_end DESC, id DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []AgentTarget
	for rows.Next() {
		var t AgentTarget
		var title, rewardDesc sql.NullString
		var createdBy sql.NullInt64
		var periodStart, periodEnd time.Time

		if err := rows.Scan(
			&t.ID,
			&t.TenantID,
			&title,
			&t.MetricType,
			&t.MetricValue,
			&rewardDesc,
			&periodStart,
			&periodEnd,
			&t.Status,
			&createdBy,
			&t.CreatedAt,
			&t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if title.Valid {
			t.Title = &title.String
		}
		if rewardDesc.Valid {
			t.RewardDescription = &rewardDesc.String
		}
		if createdBy.Valid {
			val := uint64(createdBy.Int64)
			t.CreatedBy = &val
		}
		t.PeriodStart = periodStart.Format("2006-01-02")
		t.PeriodEnd = periodEnd.Format("2006-01-02")
		targets = append(targets, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return targets, nil
}

func (r *mysqlAgentTargetRepository) Update(ctx context.Context, tenantID uint64, target *AgentTarget) error {
	query := `
		UPDATE agent_targets
		SET title = ?, metric_value = ?, reward_description = ?,
		    period_start = ?, period_end = ?, updated_at = NOW()
		WHERE tenant_id = ? AND id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		target.Title,
		target.MetricValue,
		target.RewardDescription,
		target.PeriodStart,
		target.PeriodEnd,
		tenantID,
		target.ID,
	)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM agent_targets WHERE tenant_id = ? AND id = ?", tenantID, target.ID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlAgentTargetRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM agent_targets WHERE tenant_id = ? AND id = ?`
	res, err := r.db.ExecContext(ctx, query, tenantID, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM agent_targets WHERE tenant_id = ? AND id = ?", tenantID, id).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlAgentTargetRepository) Close(ctx context.Context, tenantID uint64, id uint64) error {
	query := `UPDATE agent_targets SET status = 'closed', updated_at = NOW() WHERE tenant_id = ? AND id = ?`
	res, err := r.db.ExecContext(ctx, query, tenantID, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM agent_targets WHERE tenant_id = ? AND id = ?", tenantID, id).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlAgentTargetRepository) GetAgentProgress(ctx context.Context, tenantID uint64, agentID uint64, metricType string, periodStart, periodEnd string) (int, error) {
	if metricType == "mitra_baru_count" {
		query := `
			SELECT COUNT(DISTINCT d.id)
			FROM agents d
			WHERE d.tenant_id = ? AND d.parent_agent_id = ?
			  AND EXISTS (
			    SELECT 1 FROM prospect_status_history h
			    JOIN prospects p ON p.id = h.prospect_id AND p.tenant_id = h.tenant_id
			    WHERE h.tenant_id = d.tenant_id AND p.agent_id = d.id AND h.new_status = 'closing'
			      AND h.changed_at >= ? AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
			  )
		`
		var count int
		err := r.db.QueryRowContext(ctx, query, tenantID, agentID, periodStart, periodEnd).Scan(&count)
		if err != nil {
			return 0, err
		}
		return count, nil
	}

	// Default to closing_pax
	query := `
		SELECT COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0)
		FROM prospect_status_history h
		JOIN prospects p ON p.id = h.prospect_id AND p.tenant_id = h.tenant_id
		WHERE h.tenant_id = ? AND p.agent_id = ? AND h.new_status = 'closing'
		  AND h.changed_at >= ? AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
	`
	var sum int
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID, periodStart, periodEnd).Scan(&sum)
	if err != nil {
		return 0, err
	}
	return sum, nil
}

func (r *mysqlAgentTargetRepository) ListAgentProgress(ctx context.Context, tenantID uint64, targetID uint64) ([]AgentTargetProgressRow, error) {
	target, err := r.GetByID(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}

	var query string
	var args []interface{}

	if target.MetricType == "mitra_baru_count" {
		query = `
			SELECT 
			    a.id AS agent_id,
			    a.name AS agent_name,
			    a.phone AS agent_phone,
			    COALESCE(ata.achieved_value, prog.val, 0) AS achieved_value,
			    ? AS target_value,
			    (CASE WHEN COALESCE(ata.achieved_value, prog.val, 0) >= ? THEN 1 ELSE 0 END) AS achieved,
			    ata.id AS achievement_id,
			    ata.reward_status
			FROM agents a
			LEFT JOIN (
			    SELECT d.parent_agent_id, COUNT(DISTINCT d.id) AS val
			    FROM agents d
			    WHERE d.tenant_id = ? 
			      AND d.parent_agent_id IS NOT NULL
			      AND EXISTS (
			        SELECT 1 FROM prospect_status_history h
			        JOIN prospects p ON p.id = h.prospect_id AND p.tenant_id = h.tenant_id
			        WHERE h.tenant_id = d.tenant_id AND p.agent_id = d.id AND h.new_status = 'closing'
			          AND h.changed_at >= ? AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
			      )
			    GROUP BY d.parent_agent_id
			) prog ON prog.parent_agent_id = a.id
			LEFT JOIN agent_target_achievements ata ON ata.tenant_id = a.tenant_id AND ata.target_id = ? AND ata.agent_id = a.id
			WHERE a.tenant_id = ? AND a.status = 'active'
			ORDER BY achieved DESC, achieved_value DESC, a.name ASC
		`
		args = []interface{}{
			target.MetricValue,
			target.MetricValue,
			tenantID,
			target.PeriodStart,
			target.PeriodEnd,
			targetID,
			tenantID,
		}
	} else {
		query = `
			SELECT 
			    a.id AS agent_id,
			    a.name AS agent_name,
			    a.phone AS agent_phone,
			    COALESCE(ata.achieved_value, prog.val, 0) AS achieved_value,
			    ? AS target_value,
			    (CASE WHEN COALESCE(ata.achieved_value, prog.val, 0) >= ? THEN 1 ELSE 0 END) AS achieved,
			    ata.id AS achievement_id,
			    ata.reward_status
			FROM agents a
			LEFT JOIN (
			    SELECT p.agent_id, COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0) AS val
			    FROM prospect_status_history h
			    JOIN prospects p ON p.id = h.prospect_id AND p.tenant_id = h.tenant_id
			    WHERE h.tenant_id = ?
			      AND h.new_status = 'closing'
			      AND h.changed_at >= ? AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
			    GROUP BY p.agent_id
			) prog ON prog.agent_id = a.id
			LEFT JOIN agent_target_achievements ata ON ata.tenant_id = a.tenant_id AND ata.target_id = ? AND ata.agent_id = a.id
			WHERE a.tenant_id = ? AND a.status = 'active'
			ORDER BY achieved DESC, achieved_value DESC, a.name ASC
		`
		args = []interface{}{
			target.MetricValue,
			target.MetricValue,
			tenantID,
			target.PeriodStart,
			target.PeriodEnd,
			targetID,
			tenantID,
		}
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []AgentTargetProgressRow
	for rows.Next() {
		var row AgentTargetProgressRow
		var phone, rewardStatus sql.NullString
		var achID sql.NullInt64
		var achievedInt int

		if err := rows.Scan(
			&row.AgentID,
			&row.AgentName,
			&phone,
			&row.AchievedValue,
			&row.TargetValue,
			&achievedInt,
			&achID,
			&rewardStatus,
		); err != nil {
			return nil, err
		}
		if phone.Valid {
			row.AgentPhone = &phone.String
		}
		if achID.Valid {
			val := uint64(achID.Int64)
			row.AchievementID = &val
		}
		if rewardStatus.Valid {
			row.RewardStatus = &rewardStatus.String
		}
		row.Achieved = achievedInt == 1
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *mysqlAgentTargetRepository) CreateAchievement(ctx context.Context, tenantID uint64, achievement *AgentTargetAchievement) error {
	query := `
		INSERT INTO agent_target_achievements (
			tenant_id, target_id, agent_id, achieved_value, achieved_at,
			reward_status, reward_description_snapshot, notes
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			achieved_value = VALUES(achieved_value),
			reward_description_snapshot = VALUES(reward_description_snapshot),
			updated_at = NOW()
	`
	achievedAt := achievement.AchievedAt
	if achievedAt.IsZero() {
		achievedAt = time.Now()
	}
	rewardStatus := achievement.RewardStatus
	if rewardStatus == "" {
		rewardStatus = "pending"
	}
	res, err := r.db.ExecContext(ctx, query,
		tenantID,
		achievement.TargetID,
		achievement.AgentID,
		achievement.AchievedValue,
		achievedAt,
		rewardStatus,
		achievement.RewardDescriptionSnapshot,
		achievement.Notes,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil && id > 0 {
		achievement.ID = uint64(id)
	}
	achievement.TenantID = tenantID
	achievement.RewardStatus = rewardStatus
	achievement.AchievedAt = achievedAt
	return nil
}

func (r *mysqlAgentTargetRepository) ListAchievementsByTarget(ctx context.Context, tenantID uint64, targetID uint64) ([]AgentTargetAchievement, error) {
	query := `
		SELECT id, tenant_id, target_id, agent_id, achieved_value, achieved_at,
		       reward_status, reward_given_at, reward_given_by, reward_description_snapshot, notes,
		       created_at, updated_at
		FROM agent_target_achievements
		WHERE tenant_id = ? AND target_id = ?
		ORDER BY achieved_at DESC, id DESC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, targetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var achievements []AgentTargetAchievement
	for rows.Next() {
		var a AgentTargetAchievement
		var rewardGivenAt sql.NullTime
		var rewardGivenBy sql.NullInt64
		var rewardDescSnap, notes sql.NullString

		if err := rows.Scan(
			&a.ID,
			&a.TenantID,
			&a.TargetID,
			&a.AgentID,
			&a.AchievedValue,
			&a.AchievedAt,
			&a.RewardStatus,
			&rewardGivenAt,
			&rewardGivenBy,
			&rewardDescSnap,
			&notes,
			&a.CreatedAt,
			&a.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if rewardGivenAt.Valid {
			a.RewardGivenAt = &rewardGivenAt.Time
		}
		if rewardGivenBy.Valid {
			val := uint64(rewardGivenBy.Int64)
			a.RewardGivenBy = &val
		}
		if rewardDescSnap.Valid {
			a.RewardDescriptionSnapshot = &rewardDescSnap.String
		}
		if notes.Valid {
			a.Notes = &notes.String
		}
		achievements = append(achievements, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return achievements, nil
}

func (r *mysqlAgentTargetRepository) GetAchievementByID(ctx context.Context, tenantID uint64, id uint64) (*AgentTargetAchievement, error) {
	query := `
		SELECT id, tenant_id, target_id, agent_id, achieved_value, achieved_at,
		       reward_status, reward_given_at, reward_given_by, reward_description_snapshot, notes,
		       created_at, updated_at
		FROM agent_target_achievements
		WHERE tenant_id = ? AND id = ?
	`
	var a AgentTargetAchievement
	var rewardGivenAt sql.NullTime
	var rewardGivenBy sql.NullInt64
	var rewardDescSnap, notes sql.NullString

	err := r.db.QueryRowContext(ctx, query, tenantID, id).Scan(
		&a.ID,
		&a.TenantID,
		&a.TargetID,
		&a.AgentID,
		&a.AchievedValue,
		&a.AchievedAt,
		&a.RewardStatus,
		&rewardGivenAt,
		&rewardGivenBy,
		&rewardDescSnap,
		&notes,
		&a.CreatedAt,
		&a.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if rewardGivenAt.Valid {
		a.RewardGivenAt = &rewardGivenAt.Time
	}
	if rewardGivenBy.Valid {
		val := uint64(rewardGivenBy.Int64)
		a.RewardGivenBy = &val
	}
	if rewardDescSnap.Valid {
		a.RewardDescriptionSnapshot = &rewardDescSnap.String
	}
	if notes.Valid {
		a.Notes = &notes.String
	}
	return &a, nil
}

func (r *mysqlAgentTargetRepository) UpdateRewardStatus(ctx context.Context, tenantID uint64, achievementID, adminUserID uint64, status string, notes *string) error {
	var query string
	var args []interface{}

	if status == "given" {
		query = `
			UPDATE agent_target_achievements
			SET reward_status = ?,
			    reward_given_at = NOW(),
			    reward_given_by = ?,
			    notes = COALESCE(?, notes),
			    updated_at = NOW()
			WHERE tenant_id = ? AND id = ?
		`
		args = []interface{}{status, adminUserID, notes, tenantID, achievementID}
	} else {
		query = `
			UPDATE agent_target_achievements
			SET reward_status = ?,
			    reward_given_at = NULL,
			    reward_given_by = NULL,
			    notes = COALESCE(?, notes),
			    updated_at = NOW()
			WHERE tenant_id = ? AND id = ?
		`
		args = []interface{}{status, notes, tenantID, achievementID}
	}

	res, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		var exists int
		checkErr := r.db.QueryRowContext(ctx, "SELECT 1 FROM agent_target_achievements WHERE tenant_id = ? AND id = ?", tenantID, achievementID).Scan(&exists)
		if checkErr != nil {
			if errors.Is(checkErr, sql.ErrNoRows) {
				return ErrNotFound
			}
			return checkErr
		}
	}
	return nil
}

func (r *mysqlAgentTargetRepository) HasAchievements(ctx context.Context, tenantID uint64, targetID uint64) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM agent_target_achievements WHERE tenant_id = ? AND target_id = ?
		)
	`
	var exists bool
	err := r.db.QueryRowContext(ctx, query, tenantID, targetID).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

