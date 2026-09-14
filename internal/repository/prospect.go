package repository

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// Prospect represents the data model for the prospects table.
type Prospect struct {
	ID            uint64    `json:"id"`
	TenantID      uint64    `json:"tenant_id"`
	PackageID     *uint64   `json:"package_id"`
	PackageName   string    `json:"package_name"`
	AgentID       *uint64   `json:"agent_id"`
	Name          string    `json:"name"`
	Phone         string    `json:"phone"`
	JumlahJamaah  *int      `json:"jumlah_jamaah"`
	Email         *string   `json:"email"`
	SourceChannel string    `json:"source_channel"`
	EntryMethod   string    `json:"entry_method"`
	Status        string    `json:"status"`
	LostReason    *string   `json:"lost_reason"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ProspectFilter defines optional filtering parameters for listing prospects.
type ProspectFilter struct {
	Status    *string
	Source    *string
	Search    *string
	PackageID *uint64
}

// AgentProspectItem represents a prospect row in the agent jamaah list with package details.
type AgentProspectItem struct {
	ID           uint64    `json:"id"`
	TenantID     uint64    `json:"tenant_id"`
	PackageID    *uint64   `json:"package_id"`
	PackageName  string    `json:"package_name"`
	AgentID      uint64    `json:"agent_id"`
	Name         string    `json:"name"`
	Phone        string    `json:"phone"`
	JumlahJamaah int       `json:"jumlah_jamaah"`
	Status       string    `json:"status"`
	EntryMethod  string    `json:"entry_method"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AgentFunnelSummary represents the funnel aggregation for a specific agent.
type AgentFunnelSummary struct {
	Baru     int `json:"baru"`
	Diproses int `json:"diproses"`
	Closing  int `json:"closing"`
}

// AgentClosingStat represents total closing jamaah for an agent.
type AgentClosingStat struct {
	AgentID     uint64 `json:"agent_id"`
	TotalJamaah int    `json:"total_jamaah"`
}

// ProspectRepository defines access methods for prospect records.
// All methods require tenantID as the first scoping parameter.
type ProspectRepository interface {
	Create(ctx context.Context, tenantID uint64, prospect *Prospect) error
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*Prospect, error)
	List(ctx context.Context, tenantID uint64, statusFilter *string) ([]Prospect, error)
	ListWithFilter(ctx context.Context, tenantID uint64, filter ProspectFilter) ([]Prospect, error)
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]AgentProspectItem, error)
	Update(ctx context.Context, tenantID uint64, prospect *Prospect) error
	UpdateStatus(ctx context.Context, tenantID uint64, id uint64, newStatus string, lostReason *string) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	GetAgentFunnelSummary(ctx context.Context, tenantID uint64, agentID uint64) (*AgentFunnelSummary, error)
	GetActiveAgentsClosingStats(ctx context.Context, tenantID uint64) ([]AgentClosingStat, error)
	GetAgentPendingCommissionAndCount(ctx context.Context, tenantID uint64, agentID uint64) (saldoTertunda float64, count int, err error)
	GetAgentTargetProgress(ctx context.Context, tenantID uint64, agentID uint64, startDate string, endDate string) (int, error)
	GetAgentReferralClicksCount(ctx context.Context, tenantID uint64, agentID uint64) (int, error)
	RecordReferralClick(ctx context.Context, tenantID uint64, agentID uint64, ipAddress string) error
	CountByTenant(ctx context.Context, tenantID uint64) (int, error)
}

type mysqlProspectRepository struct {
	db *sql.DB
}

// NewProspectRepository creates a new ProspectRepository instance.
func NewProspectRepository(db *sql.DB) ProspectRepository {
	return &mysqlProspectRepository{db: db}
}

func (r *mysqlProspectRepository) Create(ctx context.Context, tenantID uint64, prospect *Prospect) error {
	if prospect.EntryMethod == "" {
		prospect.EntryMethod = "web_form"
	}
	query := `
		INSERT INTO prospects (
			tenant_id, package_id, agent_id, name, phone, jumlah_jamaah, email, source_channel, entry_method, status, lost_reason
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	prospect.TenantID = tenantID
	if prospect.Status == "" {
		prospect.Status = "baru"
	}

	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		prospect.PackageID,
		prospect.AgentID,
		prospect.Name,
		prospect.Phone,
		prospect.JumlahJamaah,
		prospect.Email,
		prospect.SourceChannel,
		prospect.EntryMethod,
		prospect.Status,
		prospect.LostReason,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	prospect.ID = uint64(id)
	return nil
}

func (r *mysqlProspectRepository) GetByID(ctx context.Context, tenantID uint64, id uint64) (*Prospect, error) {
	query := `
		SELECT 
			p.id, p.tenant_id, p.package_id, p.agent_id, p.name, p.phone, p.jumlah_jamaah, p.email, p.source_channel, p.entry_method, p.status, p.lost_reason, p.created_at, p.updated_at,
			COALESCE(pkg.name, '') as package_name
		FROM prospects p
		LEFT JOIN packages pkg ON p.package_id = pkg.id AND pkg.tenant_id = p.tenant_id
		WHERE p.id = ? AND p.tenant_id = ?
	`
	row := r.db.QueryRowContext(ctx, query, id, tenantID)
	return r.scanProspect(row)
}

func (r *mysqlProspectRepository) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]Prospect, error) {
	return r.ListWithFilter(ctx, tenantID, ProspectFilter{Status: statusFilter})
}

func (r *mysqlProspectRepository) ListWithFilter(ctx context.Context, tenantID uint64, filter ProspectFilter) ([]Prospect, error) {
	query := `
		SELECT 
			p.id, p.tenant_id, p.package_id, p.agent_id, p.name, p.phone, p.jumlah_jamaah, p.email, p.source_channel, p.entry_method, p.status, p.lost_reason, p.created_at, p.updated_at,
			COALESCE(pkg.name, '') as package_name
		FROM prospects p
		LEFT JOIN packages pkg ON p.package_id = pkg.id AND pkg.tenant_id = p.tenant_id
		WHERE p.tenant_id = ?
	`
	args := []interface{}{tenantID}

	if filter.Status != nil && *filter.Status != "" && *filter.Status != "all" {
		query += " AND p.status = ?"
		args = append(args, *filter.Status)
	}

	if filter.Source != nil && *filter.Source != "" && *filter.Source != "all" {
		src := strings.ToLower(strings.TrimSpace(*filter.Source))
		switch src {
		case "agent", "agen":
			query += " AND (p.agent_id IS NOT NULL OR p.source_channel = 'agen')"
		case "paid", "paid_ads", "meta_ads", "ads":
			query += " AND (p.source_channel IN ('paid', 'paid_ads', 'meta_ads', 'google_ads', 'ads'))"
		case "organik", "organic":
			query += " AND (p.agent_id IS NULL AND (p.source_channel = 'organik' OR p.source_channel IS NULL OR p.source_channel = ''))"
		default:
			query += " AND p.source_channel = ?"
			args = append(args, src)
		}
	}

	if filter.Search != nil && strings.TrimSpace(*filter.Search) != "" {
		s := "%" + strings.TrimSpace(*filter.Search) + "%"
		query += " AND (p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ? OR COALESCE(pkg.name, '') LIKE ?)"
		args = append(args, s, s, s, s)
	}

	if filter.PackageID != nil && *filter.PackageID > 0 {
		query += " AND p.package_id = ?"
		args = append(args, *filter.PackageID)
	}

	query += " ORDER BY p.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prospects []Prospect
	for rows.Next() {
		var p Prospect
		var packageID, agentID, jumlahJamaah sql.NullInt64
		var email, lostReason sql.NullString

		if err := rows.Scan(
			&p.ID,
			&p.TenantID,
			&packageID,
			&agentID,
			&p.Name,
			&p.Phone,
			&jumlahJamaah,
			&email,
			&p.SourceChannel,
			&p.EntryMethod,
			&p.Status,
			&lostReason,
			&p.CreatedAt,
			&p.UpdatedAt,
			&p.PackageName,
		); err != nil {
			return nil, err
		}

		if packageID.Valid {
			pkgID := uint64(packageID.Int64)
			p.PackageID = &pkgID
		}
		if agentID.Valid {
			agID := uint64(agentID.Int64)
			p.AgentID = &agID
		}
		if jumlahJamaah.Valid {
			jj := int(jumlahJamaah.Int64)
			p.JumlahJamaah = &jj
		}
		if email.Valid {
			p.Email = &email.String
		}
		if lostReason.Valid {
			p.LostReason = &lostReason.String
		}
		prospects = append(prospects, p)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return prospects, nil
}

func (r *mysqlProspectRepository) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]AgentProspectItem, error) {
	var query string
	var args []interface{}

	if statusFilter != nil && *statusFilter != "" {
		query = `
			SELECT 
				pr.id, pr.tenant_id, pr.package_id, COALESCE(pk.name, 'Umroh') AS package_name,
				pr.agent_id, pr.name, pr.phone, COALESCE(pr.jumlah_jamaah, 1) AS jumlah_jamaah,
				pr.status, pr.entry_method, pr.created_at, pr.updated_at
			FROM prospects pr
			LEFT JOIN packages pk ON pk.id = pr.package_id AND pk.tenant_id = pr.tenant_id
			WHERE pr.tenant_id = ? AND pr.agent_id = ? AND pr.status = ?
			ORDER BY pr.created_at DESC
		`
		args = append(args, tenantID, agentID, *statusFilter)
	} else {
		query = `
			SELECT 
				pr.id, pr.tenant_id, pr.package_id, COALESCE(pk.name, 'Umroh') AS package_name,
				pr.agent_id, pr.name, pr.phone, COALESCE(pr.jumlah_jamaah, 1) AS jumlah_jamaah,
				pr.status, pr.entry_method, pr.created_at, pr.updated_at
			FROM prospects pr
			LEFT JOIN packages pk ON pk.id = pr.package_id AND pk.tenant_id = pr.tenant_id
			WHERE pr.tenant_id = ? AND pr.agent_id = ?
			ORDER BY pr.created_at DESC
		`
		args = append(args, tenantID, agentID)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []AgentProspectItem
	for rows.Next() {
		var item AgentProspectItem
		var packageID sql.NullInt64
		if err := rows.Scan(
			&item.ID,
			&item.TenantID,
			&packageID,
			&item.PackageName,
			&item.AgentID,
			&item.Name,
			&item.Phone,
			&item.JumlahJamaah,
			&item.Status,
			&item.EntryMethod,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if packageID.Valid {
			pkgID := uint64(packageID.Int64)
			item.PackageID = &pkgID
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if items == nil {
		items = []AgentProspectItem{}
	}
	return items, nil
}

func (r *mysqlProspectRepository) Update(ctx context.Context, tenantID uint64, prospect *Prospect) error {
	query := `
		UPDATE prospects
		SET name = ?, phone = ?, package_id = ?, jumlah_jamaah = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		prospect.Name,
		prospect.Phone,
		prospect.PackageID,
		prospect.JumlahJamaah,
		prospect.ID,
		tenantID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		err := r.db.QueryRowContext(ctx, "SELECT 1 FROM prospects WHERE id = ? AND tenant_id = ?", prospect.ID, tenantID).Scan(&exists)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		return nil
	}
	return nil
}

func (r *mysqlProspectRepository) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, newStatus string, lostReason *string) error {
	query := `
		UPDATE prospects
		SET status = ?, lost_reason = ?
		WHERE id = ? AND tenant_id = ?
	`
	res, err := r.db.ExecContext(ctx, query,
		newStatus,
		lostReason,
		id,
		tenantID,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		var exists int
		err := r.db.QueryRowContext(ctx, "SELECT 1 FROM prospects WHERE id = ? AND tenant_id = ?", id, tenantID).Scan(&exists)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		return nil
	}
	return nil
}

func (r *mysqlProspectRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	query := `DELETE FROM prospects WHERE id = ? AND tenant_id = ?`
	res, err := r.db.ExecContext(ctx, query, id, tenantID)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlProspectRepository) scanProspect(row *sql.Row) (*Prospect, error) {
	var p Prospect
	var packageID, agentID, jumlahJamaah sql.NullInt64
	var email, lostReason sql.NullString

	err := row.Scan(
		&p.ID,
		&p.TenantID,
		&packageID,
		&agentID,
		&p.Name,
		&p.Phone,
		&jumlahJamaah,
		&email,
		&p.SourceChannel,
		&p.EntryMethod,
		&p.Status,
		&lostReason,
		&p.CreatedAt,
		&p.UpdatedAt,
		&p.PackageName,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	if packageID.Valid {
		pkgID := uint64(packageID.Int64)
		p.PackageID = &pkgID
	}
	if agentID.Valid {
		agID := uint64(agentID.Int64)
		p.AgentID = &agID
	}
	if jumlahJamaah.Valid {
		jj := int(jumlahJamaah.Int64)
		p.JumlahJamaah = &jj
	}
	if email.Valid {
		p.Email = &email.String
	}
	if lostReason.Valid {
		p.LostReason = &lostReason.String
	}

	return &p, nil
}

func (r *mysqlProspectRepository) GetAgentFunnelSummary(ctx context.Context, tenantID uint64, agentID uint64) (*AgentFunnelSummary, error) {
	query := `
		SELECT
			COALESCE(SUM(CASE WHEN status = 'baru' THEN 1 ELSE 0 END), 0) AS baru,
			COALESCE(SUM(CASE WHEN status IN ('dihubungi', 'tertarik') THEN 1 ELSE 0 END), 0) AS diproses,
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0) AS closing
		FROM prospects
		WHERE tenant_id = ? AND agent_id = ?
	`
	var summary AgentFunnelSummary
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID).Scan(&summary.Baru, &summary.Diproses, &summary.Closing)
	if err != nil {
		return nil, err
	}
	return &summary, nil
}

func (r *mysqlProspectRepository) GetActiveAgentsClosingStats(ctx context.Context, tenantID uint64) ([]AgentClosingStat, error) {
	query := `
		SELECT 
			a.id, 
			COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN COALESCE(p.jumlah_jamaah, 1) ELSE 0 END), 0) AS total_jamaah
		FROM agents a
		LEFT JOIN prospects p ON p.tenant_id = a.tenant_id AND p.agent_id = a.id AND p.status = 'closing'
		WHERE a.tenant_id = ? AND a.status = 'active'
		GROUP BY a.id
		ORDER BY total_jamaah DESC, a.id ASC
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []AgentClosingStat
	for rows.Next() {
		var stat AgentClosingStat
		if err := rows.Scan(&stat.AgentID, &stat.TotalJamaah); err != nil {
			return nil, err
		}
		stats = append(stats, stat)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return stats, nil
}

func (r *mysqlProspectRepository) GetAgentPendingCommissionAndCount(ctx context.Context, tenantID uint64, agentID uint64) (float64, int, error) {
	query := `
		SELECT
			COALESCE(SUM(COALESCE(pkg.commission_amount, 0) * COALESCE(p.jumlah_jamaah, 1)), 0) AS saldo_tertunda,
			COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0) AS jamaah_tertunda_count
		FROM prospects p
		LEFT JOIN packages pkg ON pkg.id = p.package_id AND pkg.tenant_id = p.tenant_id
		WHERE p.tenant_id = ?
		  AND p.agent_id = ?
		  AND p.status NOT IN ('closing', 'tidak_lanjut')
	`
	var saldoTertunda float64
	var count int
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID).Scan(&saldoTertunda, &count)
	if err != nil {
		return 0, 0, err
	}
	return saldoTertunda, count, nil
}

func (r *mysqlProspectRepository) GetAgentTargetProgress(ctx context.Context, tenantID uint64, agentID uint64, startDate string, endDate string) (int, error) {
	query := `
		SELECT COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0)
		FROM prospect_status_history h
		JOIN prospects p ON p.id = h.prospect_id AND p.tenant_id = h.tenant_id
		WHERE h.tenant_id = ?
		  AND p.agent_id = ?
		  AND h.new_status = 'closing'
		  AND DATE(h.changed_at) >= ?
		  AND DATE(h.changed_at) <= ?
	`
	var progress int
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID, startDate, endDate).Scan(&progress)
	if err != nil {
		return 0, err
	}
	return progress, nil
}

func (r *mysqlProspectRepository) GetAgentReferralClicksCount(ctx context.Context, tenantID uint64, agentID uint64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM referral_clicks WHERE tenant_id = ? AND agent_id = ?", tenantID, agentID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func (r *mysqlProspectRepository) RecordReferralClick(ctx context.Context, tenantID uint64, agentID uint64, ipAddress string) error {
	query := `
		INSERT INTO referral_clicks (tenant_id, agent_id, ip_address, clicked_at)
		VALUES (?, ?, ?, NOW())
	`
	_, err := r.db.ExecContext(ctx, query, tenantID, agentID, ipAddress)
	return err
}

func (r *mysqlProspectRepository) CountByTenant(ctx context.Context, tenantID uint64) (int, error) {
	query := `SELECT COUNT(*) FROM prospects WHERE tenant_id = ?`
	var count int
	if err := r.db.QueryRowContext(ctx, query, tenantID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}


