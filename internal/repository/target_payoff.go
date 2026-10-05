package repository

import (
	"context"
	"database/sql"
)

// TargetPayoffRepository answers whether the closings behind an agent's target reward are paid off.
// Targets count closings (DP) so agents are rewarded for what they control; the reward itself should
// only be handed out once those jamaah are lunas (or when the travel releases commission at DP).
type TargetPayoffRepository interface {
	// CountUnpaidClosings counts the jamaah (pax, jumlah_jamaah) of the agent's prospects that are still closing, were closed in the
	// period (latest move into closing) and are not marked lunas yet.
	CountUnpaidClosings(ctx context.Context, tenantID uint64, agentID uint64, periodStart, periodEnd string) (int, error)
}

type mysqlTargetPayoffRepository struct {
	db *sql.DB
}

// NewTargetPayoffRepository creates a new TargetPayoffRepository.
func NewTargetPayoffRepository(db *sql.DB) TargetPayoffRepository {
	return &mysqlTargetPayoffRepository{db: db}
}

func (r *mysqlTargetPayoffRepository) CountUnpaidClosings(ctx context.Context, tenantID uint64, agentID uint64, periodStart, periodEnd string) (int, error) {
	query := `
		SELECT COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0)
		FROM prospects p
		WHERE p.tenant_id = ? AND p.agent_id = ? AND p.status = 'closing' AND p.paid_off_at IS NULL
		  AND ` + latestClosingInPeriod
	var n int
	if err := r.db.QueryRowContext(ctx, query, tenantID, agentID, periodStart, periodEnd).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}
