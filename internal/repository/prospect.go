package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// OpenProspectStatuses are the pipeline stages where a prospect is still being worked on. A jamaah who
// submits again while one of their prospects is in these stages keeps that prospect (first owner wins).
var OpenProspectStatuses = []string{"baru", "dihubungi", "tertarik"}

// Prospect represents the data model for the prospects table.
type Prospect struct {
	ID              uint64  `json:"id"`
	TenantID        uint64  `json:"tenant_id"`
	PackageID       *uint64 `json:"package_id"`
	PackageName     string  `json:"package_name"`
	AgentID         *uint64 `json:"agent_id"`
	AgentName       string  `json:"agent_name"`
	Name            string  `json:"name"`
	Phone           string  `json:"phone"`
	PhoneNormalized *string `json:"-"`
	JumlahJamaah    *int    `json:"jumlah_jamaah"`
	// DeparturePlan is the planned departure month ("YYYY-MM"), Domicile the jamaah's city.
	DeparturePlan *string `json:"departure_plan"`
	Domicile      *string `json:"domicile"`
	Email         *string `json:"email"`
	SourceChannel string  `json:"source_channel"`
	EntryMethod   string  `json:"entry_method"`
	UTMSource     *string `json:"utm_source"`
	UTMMedium     *string `json:"utm_medium"`
	UTMCampaign   *string `json:"utm_campaign"`
	Fbclid        *string `json:"-"`
	// MetaFbp / MetaFbc: the visitor's _fbp / _fbc cookies at lead time, for Meta Conversions API matching.
	MetaFbp *string `json:"-"`
	MetaFbc *string `json:"-"`
	// MetaDisclosedAt: the jamaah's consent text said their data (hashed) goes to Meta. Only then is
	// their data sent to Meta's Conversions API.
	MetaDisclosedAt *time.Time `json:"-"`
	// ConsentAt: when the jamaah agreed to be contacted (UU PDP), from the public interest form.
	ConsentAt  *time.Time `json:"consent_at"`
	Status     string     `json:"status"`
	LostReason *string    `json:"lost_reason"`
	// LostReasonCategory is the fixed reason for 'tidak_lanjut' (see service.LostReasonCategories).
	LostReasonCategory *string `json:"lost_reason_category"`
	// PaidOffAt: kapan admin menandai jamaah lunas (komisi agen dilepas). Bukan status pipeline.
	PaidOffAt *time.Time `json:"paid_off_at"`
	// AnonymizedAt: personal data removed on the jamaah's request (UU PDP right to erasure).
	AnonymizedAt *time.Time `json:"anonymized_at"`
	ClosedAt     *time.Time `json:"closed_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// ProspectFilter defines optional filtering parameters for listing prospects.
// Limit 0 means "no limit" (used by the CSV export).
type ProspectFilter struct {
	Status    *string
	Source    *string
	Search    *string
	PackageID *uint64
	AgentID   *uint64
	// Payoff filters closed prospects: "pending" = DP, belum lunas; "done" = lunas.
	Payoff *string
	// DeparturePlan filters on the planned departure month ("YYYY-MM"), or "none" for not filled in.
	DeparturePlan *string
	Limit         int
	Offset        int
}

// ProspectStatusSummary holds pipeline counters for the whole tenant (independent of list filters).
type ProspectStatusSummary struct {
	Total       int `json:"total"`
	Baru        int `json:"baru"`
	Dihubungi   int `json:"dihubungi"`
	Tertarik    int `json:"tertarik"`
	Closing     int `json:"closing"`
	TidakLanjut int `json:"tidak_lanjut"`
	// StaleBaru counts prospects still 'baru' more than 24 hours after they came in.
	StaleBaru int `json:"stale_baru"`
	// AwaitingPayoff counts closings (DP) not yet marked lunas; AwaitingPayoffWithAgent is the part of
	// them that belongs to an agent (whose commission is still held).
	AwaitingPayoff          int `json:"awaiting_payoff"`
	AwaitingPayoffWithAgent int `json:"awaiting_payoff_with_agent"`
	// LostReasons counts 'tidak_lanjut' prospects per reason category (see service.LostReasonCategories).
	LostReasons map[string]int `json:"lost_reasons"`
	// ConversionCohort: prospects created in the last 30 days and how many of them are Closing now
	// (same contract and window as the dashboard overview's conversion_cohort).
	ConversionCohort ConversionCohort `json:"conversion_cohort"`
}

// AgentProspectItem represents a prospect row in the agent jamaah list with package details.
type AgentProspectItem struct {
	ID           uint64  `json:"id"`
	TenantID     uint64  `json:"tenant_id"`
	PackageID    *uint64 `json:"package_id"`
	PackageName  string  `json:"package_name"`
	AgentID      uint64  `json:"agent_id"`
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	JumlahJamaah int     `json:"jumlah_jamaah"`
	Status       string  `json:"status"`
	EntryMethod  string  `json:"entry_method"`
	// PaidOffAt: jamaah sudah ditandai lunas (komisi dilepas).
	PaidOffAt *time.Time `json:"paid_off_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// AgentFunnelSummary represents the funnel aggregation for a specific agent.
type AgentFunnelSummary struct {
	Baru     int `json:"baru"`
	Diproses int `json:"diproses"`
	Closing  int `json:"closing"`
	// Batal counts prospects that reached closing (DP) and were cancelled afterwards.
	Batal int `json:"batal"`
}

// AgentClosingStat represents total closing jamaah for an agent.
// AgentProspectCount is how many prospects an agent brought in.
type AgentProspectCount struct {
	AgentID uint64
	Count   int
}

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
	CountWithFilter(ctx context.Context, tenantID uint64, filter ProspectFilter) (int, error)
	StatusSummary(ctx context.Context, tenantID uint64) (*ProspectStatusSummary, error)
	FindOpenByPhone(ctx context.Context, tenantID uint64, phoneNormalized string) (*Prospect, error)
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]AgentProspectItem, error)
	Update(ctx context.Context, tenantID uint64, prospect *Prospect) error
	UpdateStatus(ctx context.Context, tenantID uint64, id uint64, newStatus string, lostReason *string) error
	// TransitionStatus changes the status only while the prospect is still in fromStatus. It returns
	// ErrStatusConflict when another request changed it first, so side effects (commission) run once.
	TransitionStatus(ctx context.Context, tenantID uint64, id uint64, fromStatus, toStatus string, lostReason, lostReasonCategory *string) error
	// FindLatestClosingByPhone returns the most recent prospect with this phone that is (still) closing.
	FindLatestClosingByPhone(ctx context.Context, tenantID uint64, phoneNormalized string) (*Prospect, error)
	// ListByAgentPage is ListByAgent with an optional search (name, phone, package), paging and the total count.
	ListByAgentPage(ctx context.Context, tenantID uint64, agentID uint64, statusFilter, search *string, limit, offset int) ([]AgentProspectItem, int, error)
	// MarkPaidOff sets paid_off_at on a closed prospect exactly once (ErrStatusConflict if not closing or already set).
	MarkPaidOff(ctx context.Context, tenantID uint64, id uint64) error
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	GetAgentFunnelSummary(ctx context.Context, tenantID uint64, agentID uint64) (*AgentFunnelSummary, error)
	GetActiveAgentsClosingStats(ctx context.Context, tenantID uint64) ([]AgentClosingStat, error)
	// GetAgentClosingJamaah sums the jamaah (pax) of one agent's prospects currently in 'closing',
	// regardless of the agent's own status (admin detail of an inactive/pending agent).
	GetAgentClosingJamaah(ctx context.Context, tenantID uint64, agentID uint64) (int, error)
	// GetActiveAgentsClosingStatsSince counts only closings whose latest move into 'closing' is at or after
	// since (a "YYYY-MM-DD HH:MM:SS" time in the business time zone). Used by the agent leaderboard periods.
	GetActiveAgentsClosingStatsSince(ctx context.Context, tenantID uint64, since string) ([]AgentClosingStat, error)
	// GetAgentProspectCountsSince counts the prospects each agent of the tenant brought in since the given
	// time ("YYYY-MM-DD HH:MM:SS", WIB); agents without any are absent.
	GetAgentProspectCountsSince(ctx context.Context, tenantID uint64, since string) ([]AgentProspectCount, error)
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

// prospectSelect is shared by every read so the scan order stays in one place.
// closed_at comes from the status history (latest transition into 'closing').
const prospectSelect = `
	SELECT
		p.id, p.tenant_id, p.package_id, p.agent_id, p.name, p.phone, p.phone_normalized, p.jumlah_jamaah,
		p.departure_plan, p.domicile, p.email,
		p.source_channel, p.entry_method, p.utm_source, p.utm_medium, p.utm_campaign, p.fbclid, p.meta_fbp, p.meta_fbc, p.meta_disclosed_at, p.consent_at,
		p.status, p.lost_reason, p.lost_reason_category, p.paid_off_at, p.anonymized_at, p.created_at, p.updated_at,
		COALESCE(pkg.name, '') AS package_name,
		COALESCE(ag.name, '') AS agent_name,
		(SELECT MAX(h.changed_at) FROM prospect_status_history h
			WHERE h.tenant_id = p.tenant_id AND h.prospect_id = p.id AND h.new_status = 'closing') AS closed_at
	FROM prospects p
	LEFT JOIN packages pkg ON pkg.id = p.package_id AND pkg.tenant_id = p.tenant_id
	LEFT JOIN agents ag ON ag.id = p.agent_id AND ag.tenant_id = p.tenant_id
`

type rowScanner interface {
	Scan(dest ...interface{}) error
}

func scanProspectRow(row rowScanner) (*Prospect, error) {
	var p Prospect
	var packageID, agentID, jumlahJamaah sql.NullInt64
	var phoneNorm, departurePlan, domicile, email, utmSource, utmMedium, utmCampaign, fbclid, metaFbp, metaFbc, lostReason, lostCategory sql.NullString
	var closedAt, paidOffAt, consentAt, anonymizedAt, metaDisclosedAt sql.NullTime

	if err := row.Scan(
		&p.ID, &p.TenantID, &packageID, &agentID, &p.Name, &p.Phone, &phoneNorm, &jumlahJamaah,
		&departurePlan, &domicile, &email,
		&p.SourceChannel, &p.EntryMethod, &utmSource, &utmMedium, &utmCampaign, &fbclid, &metaFbp, &metaFbc, &metaDisclosedAt, &consentAt,
		&p.Status, &lostReason, &lostCategory, &paidOffAt, &anonymizedAt, &p.CreatedAt, &p.UpdatedAt,
		&p.PackageName, &p.AgentName, &closedAt,
	); err != nil {
		return nil, err
	}

	if packageID.Valid {
		v := uint64(packageID.Int64)
		p.PackageID = &v
	}
	if agentID.Valid {
		v := uint64(agentID.Int64)
		p.AgentID = &v
	}
	if jumlahJamaah.Valid {
		v := int(jumlahJamaah.Int64)
		p.JumlahJamaah = &v
	}
	p.PhoneNormalized = nullStringPtr(phoneNorm)
	p.Email = nullStringPtr(email)
	p.UTMSource = nullStringPtr(utmSource)
	p.UTMMedium = nullStringPtr(utmMedium)
	p.UTMCampaign = nullStringPtr(utmCampaign)
	p.Fbclid = nullStringPtr(fbclid)
	p.MetaFbp = nullStringPtr(metaFbp)
	p.MetaFbc = nullStringPtr(metaFbc)
	p.LostReason = nullStringPtr(lostReason)
	p.LostReasonCategory = nullStringPtr(lostCategory)
	p.DeparturePlan = nullStringPtr(departurePlan)
	p.Domicile = nullStringPtr(domicile)
	if consentAt.Valid {
		t := consentAt.Time
		p.ConsentAt = &t
	}
	if paidOffAt.Valid {
		t := paidOffAt.Time
		p.PaidOffAt = &t
	}
	if anonymizedAt.Valid {
		t := anonymizedAt.Time
		p.AnonymizedAt = &t
	}
	if metaDisclosedAt.Valid {
		t := metaDisclosedAt.Time
		p.MetaDisclosedAt = &t
	}
	if closedAt.Valid {
		t := closedAt.Time
		p.ClosedAt = &t
	}
	return &p, nil
}

func nullStringPtr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

func (r *mysqlProspectRepository) Create(ctx context.Context, tenantID uint64, prospect *Prospect) error {
	if prospect.EntryMethod == "" {
		prospect.EntryMethod = "web_form"
	}
	query := `
		INSERT INTO prospects (
			tenant_id, package_id, agent_id, name, phone, phone_normalized, jumlah_jamaah, departure_plan, domicile,
			email, source_channel, entry_method, utm_source, utm_medium, utm_campaign, fbclid, meta_fbp, meta_fbc, meta_disclosed_at, consent_at,
			status, lost_reason, lost_reason_category
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		prospect.PhoneNormalized,
		prospect.JumlahJamaah,
		prospect.DeparturePlan,
		prospect.Domicile,
		prospect.Email,
		prospect.SourceChannel,
		prospect.EntryMethod,
		prospect.UTMSource,
		prospect.UTMMedium,
		prospect.UTMCampaign,
		prospect.Fbclid,
		prospect.MetaFbp,
		prospect.MetaFbc,
		prospect.MetaDisclosedAt,
		prospect.ConsentAt,
		prospect.Status,
		prospect.LostReason,
		prospect.LostReasonCategory,
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
	row := r.db.QueryRowContext(ctx, prospectSelect+` WHERE p.id = ? AND p.tenant_id = ?`, id, tenantID)
	p, err := scanProspectRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *mysqlProspectRepository) FindOpenByPhone(ctx context.Context, tenantID uint64, phoneNormalized string) (*Prospect, error) {
	if phoneNormalized == "" {
		return nil, ErrNotFound
	}
	row := r.db.QueryRowContext(ctx,
		prospectSelect+` WHERE p.tenant_id = ? AND p.phone_normalized = ? AND p.status IN ('baru', 'dihubungi', 'tertarik')
		ORDER BY p.created_at ASC, p.id ASC LIMIT 1`,
		tenantID, phoneNormalized)
	p, err := scanProspectRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *mysqlProspectRepository) FindLatestClosingByPhone(ctx context.Context, tenantID uint64, phoneNormalized string) (*Prospect, error) {
	if phoneNormalized == "" {
		return nil, ErrNotFound
	}
	row := r.db.QueryRowContext(ctx,
		prospectSelect+` WHERE p.tenant_id = ? AND p.phone_normalized = ? AND p.status = 'closing'
		ORDER BY p.created_at DESC, p.id DESC LIMIT 1`,
		tenantID, phoneNormalized)
	p, err := scanProspectRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *mysqlProspectRepository) List(ctx context.Context, tenantID uint64, statusFilter *string) ([]Prospect, error) {
	return r.ListWithFilter(ctx, tenantID, ProspectFilter{Status: statusFilter})
}

// buildFilterWhere returns the WHERE clause (always scoped to tenant) and its args.
func buildFilterWhere(tenantID uint64, filter ProspectFilter) (string, []interface{}) {
	where := " WHERE p.tenant_id = ?"
	args := []interface{}{tenantID}

	if filter.Status != nil && *filter.Status != "" && *filter.Status != "all" {
		where += " AND p.status = ?"
		args = append(args, *filter.Status)
	}

	if filter.Source != nil && *filter.Source != "" && *filter.Source != "all" {
		switch strings.ToLower(strings.TrimSpace(*filter.Source)) {
		case "agent", "agen":
			where += " AND p.source_channel = 'agen'"
		case "paid", "paid_ads", "meta_ads", "ads":
			where += " AND p.source_channel = 'paid'"
		case "organik", "organic":
			where += " AND p.source_channel = 'organik'"
		default:
			where += " AND 1 = 0"
		}
	}

	if filter.Search != nil && strings.TrimSpace(*filter.Search) != "" {
		s := "%" + escapeLike(strings.TrimSpace(*filter.Search)) + "%"
		where += " AND (p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ? OR p.domicile LIKE ? OR COALESCE(pkg.name, '') LIKE ? OR COALESCE(ag.name, '') LIKE ?"
		args = append(args, s, s, s, s, s, s)
		if phone := phoneSearchPattern(*filter.Search); phone != "" {
			where += " OR p.phone_normalized LIKE ?"
			args = append(args, phone)
		}
		where += ")"
	}

	if filter.PackageID != nil && *filter.PackageID > 0 {
		where += " AND p.package_id = ?"
		args = append(args, *filter.PackageID)
	}

	if filter.AgentID != nil && *filter.AgentID > 0 {
		where += " AND p.agent_id = ?"
		args = append(args, *filter.AgentID)
	}

	if filter.DeparturePlan != nil {
		if *filter.DeparturePlan == "none" {
			where += " AND p.departure_plan IS NULL"
		} else {
			where += " AND p.departure_plan = ?"
			args = append(args, *filter.DeparturePlan)
		}
	}

	if filter.Payoff != nil {
		switch *filter.Payoff {
		case "pending":
			where += " AND p.status = 'closing' AND p.paid_off_at IS NULL"
		case "done":
			where += " AND p.status = 'closing' AND p.paid_off_at IS NOT NULL"
		}
	}

	return where, args
}

// phoneSearchPattern turns a search text that looks like a phone number into a LIKE pattern on
// phone_normalized (62xxxxxxxx): "0812 3456" and "+62 812-3456" both become "%628123456%".
// It returns "" when the text has fewer than 4 digits or contains letters.
func phoneSearchPattern(search string) string {
	var digits strings.Builder
	for _, r := range strings.TrimSpace(search) {
		switch {
		case r >= '0' && r <= '9':
			digits.WriteRune(r)
		case r == ' ' || r == '-' || r == '.' || r == '+' || r == '(' || r == ')':
		default:
			return ""
		}
	}
	d := digits.String()
	if len(d) < 4 {
		return ""
	}
	if strings.HasPrefix(d, "0") {
		d = "62" + d[1:]
	}
	return "%" + d + "%"
}

// escapeLike makes user input match literally inside a LIKE pattern.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (r *mysqlProspectRepository) ListWithFilter(ctx context.Context, tenantID uint64, filter ProspectFilter) ([]Prospect, error) {
	where, args := buildFilterWhere(tenantID, filter)
	query := prospectSelect + where + " ORDER BY p.created_at DESC, p.id DESC"
	if filter.Limit > 0 {
		query += " LIMIT ? OFFSET ?"
		offset := filter.Offset
		if offset < 0 {
			offset = 0
		}
		args = append(args, filter.Limit, offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	prospects := []Prospect{}
	for rows.Next() {
		p, err := scanProspectRow(rows)
		if err != nil {
			return nil, err
		}
		prospects = append(prospects, *p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return prospects, nil
}

func (r *mysqlProspectRepository) CountWithFilter(ctx context.Context, tenantID uint64, filter ProspectFilter) (int, error) {
	where, args := buildFilterWhere(tenantID, filter)
	query := `SELECT COUNT(*) FROM prospects p
		LEFT JOIN packages pkg ON pkg.id = p.package_id AND pkg.tenant_id = p.tenant_id
		LEFT JOIN agents ag ON ag.id = p.agent_id AND ag.tenant_id = p.tenant_id` + where
	var total int
	if err := r.db.QueryRowContext(ctx, query, args...).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (r *mysqlProspectRepository) StatusSummary(ctx context.Context, tenantID uint64) (*ProspectStatusSummary, error) {
	query := `
		SELECT
			COUNT(*),
			COALESCE(SUM(status = 'baru'), 0),
			COALESCE(SUM(status = 'dihubungi'), 0),
			COALESCE(SUM(status = 'tertarik'), 0),
			COALESCE(SUM(status = 'closing'), 0),
			COALESCE(SUM(status = 'tidak_lanjut'), 0),
			COALESCE(SUM(status = 'baru' AND created_at <= NOW() - INTERVAL 24 HOUR), 0),
			COALESCE(SUM(status = 'closing' AND paid_off_at IS NULL), 0),
			COALESCE(SUM(status = 'closing' AND paid_off_at IS NULL AND agent_id IS NOT NULL), 0)
		FROM prospects
		WHERE tenant_id = ?
	`
	var s ProspectStatusSummary
	if err := r.db.QueryRowContext(ctx, query, tenantID).Scan(
		&s.Total, &s.Baru, &s.Dihubungi, &s.Tertarik, &s.Closing, &s.TidakLanjut, &s.StaleBaru, &s.AwaitingPayoff, &s.AwaitingPayoffWithAgent,
	); err != nil {
		return nil, err
	}

	s.LostReasons = map[string]int{}
	rows, err := r.db.QueryContext(ctx, `
		SELECT COALESCE(lost_reason_category, 'lainnya'), COUNT(*)
		FROM prospects
		WHERE tenant_id = ? AND status = 'tidak_lanjut'
		GROUP BY COALESCE(lost_reason_category, 'lainnya')`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var category string
		var n int
		if err := rows.Scan(&category, &n); err != nil {
			return nil, err
		}
		s.LostReasons[category] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	s.ConversionCohort, err = queryConversionCohort(ctx, r.db, tenantID, ConversionCohortWindowDays)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *mysqlProspectRepository) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]AgentProspectItem, error) {
	return r.listByAgent(ctx, tenantID, agentID, statusFilter, nil, 0, 0)
}

// agentListWhere is the WHERE clause of an agent's jamaah list: always scoped to tenant and agent.
func agentListWhere(tenantID, agentID uint64, statusFilter, search *string) (string, []interface{}) {
	where := " WHERE pr.tenant_id = ? AND pr.agent_id = ?"
	args := []interface{}{tenantID, agentID}
	if statusFilter != nil && *statusFilter != "" {
		where += " AND pr.status = ?"
		args = append(args, *statusFilter)
	}
	if search != nil && strings.TrimSpace(*search) != "" {
		s := "%" + escapeLike(strings.TrimSpace(*search)) + "%"
		where += " AND (pr.name LIKE ? OR pr.phone LIKE ? OR COALESCE(pk.name, '') LIKE ?"
		args = append(args, s, s, s)
		if phone := phoneSearchPattern(*search); phone != "" {
			where += " OR pr.phone_normalized LIKE ?"
			args = append(args, phone)
		}
		where += ")"
	}
	return where, args
}

func (r *mysqlProspectRepository) ListByAgentPage(ctx context.Context, tenantID uint64, agentID uint64, statusFilter, search *string, limit, offset int) ([]AgentProspectItem, int, error) {
	where, args := agentListWhere(tenantID, agentID, statusFilter, search)
	countQuery := `SELECT COUNT(*) FROM prospects pr
		LEFT JOIN packages pk ON pk.id = pr.package_id AND pk.tenant_id = pr.tenant_id` + where
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	items, err := r.listByAgent(ctx, tenantID, agentID, statusFilter, search, limit, offset)
	return items, total, err
}

// AgentStatusCounts counts all of an agent's jamaah per pipeline status (for the status tabs),
// independent of the page being shown. The "total" key holds the overall count.
func (r *mysqlProspectRepository) AgentStatusCounts(ctx context.Context, tenantID uint64, agentID uint64) (map[string]int, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT status, COUNT(*) FROM prospects WHERE tenant_id = ? AND agent_id = ? GROUP BY status`, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := map[string]int{"total": 0}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		counts[status] = n
		counts["total"] += n
	}
	return counts, rows.Err()
}

func (r *mysqlProspectRepository) listByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter, search *string, limit, offset int) ([]AgentProspectItem, error) {
	where, args := agentListWhere(tenantID, agentID, statusFilter, search)
	query := `
		SELECT
			pr.id, pr.tenant_id, pr.package_id, COALESCE(pk.name, 'Umroh') AS package_name,
			pr.agent_id, pr.name, pr.phone, COALESCE(pr.jumlah_jamaah, 1) AS jumlah_jamaah,
			pr.status, pr.entry_method, pr.paid_off_at, pr.created_at, pr.updated_at
		FROM prospects pr
		LEFT JOIN packages pk ON pk.id = pr.package_id AND pk.tenant_id = pr.tenant_id
	` + where
	query += " ORDER BY pr.created_at DESC, pr.id DESC"
	if limit > 0 {
		if offset < 0 {
			offset = 0
		}
		query += " LIMIT ? OFFSET ?"
		args = append(args, limit, offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []AgentProspectItem{}
	for rows.Next() {
		var item AgentProspectItem
		var packageID sql.NullInt64
		var paidOffAt sql.NullTime
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
			&paidOffAt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if paidOffAt.Valid {
			t := paidOffAt.Time
			item.PaidOffAt = &t
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
	return items, nil
}

func (r *mysqlProspectRepository) Update(ctx context.Context, tenantID uint64, prospect *Prospect) error {
	query := `
		UPDATE prospects
		SET name = ?, phone = ?, phone_normalized = ?, package_id = ?, jumlah_jamaah = ?, departure_plan = ?, domicile = ?
		WHERE id = ? AND tenant_id = ? AND anonymized_at IS NULL
	`
	res, err := r.db.ExecContext(ctx, query,
		prospect.Name,
		prospect.Phone,
		prospect.PhoneNormalized,
		prospect.PackageID,
		prospect.JumlahJamaah,
		prospect.DeparturePlan,
		prospect.Domicile,
		prospect.ID,
		tenantID,
	)
	if err != nil {
		return err
	}
	return r.existsIfUnchanged(ctx, res, tenantID, prospect.ID)
}

func (r *mysqlProspectRepository) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, newStatus string, lostReason *string) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE prospects SET status = ?, lost_reason = ? WHERE id = ? AND tenant_id = ?`,
		newStatus, lostReason, id, tenantID)
	if err != nil {
		return err
	}
	return r.existsIfUnchanged(ctx, res, tenantID, id)
}

func (r *mysqlProspectRepository) TransitionStatus(ctx context.Context, tenantID uint64, id uint64, fromStatus, toStatus string, lostReason, lostReasonCategory *string) error {
	res, err := r.db.ExecContext(ctx,
		// "Lunas" belongs to a closing: leaving closing (Batalkan Closing) clears it, so a later
		// re-closing books held commission again instead of releasing it straight away.
		`UPDATE prospects
		 SET status = ?, lost_reason = ?, lost_reason_category = ?, paid_off_at = IF(? = 'closing', paid_off_at, NULL)
		 WHERE id = ? AND tenant_id = ? AND status = ?`,
		toStatus, lostReason, lostReasonCategory, toStatus, id, tenantID, fromStatus)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}
	var current string
	err = r.db.QueryRowContext(ctx, "SELECT status FROM prospects WHERE id = ? AND tenant_id = ?", id, tenantID).Scan(&current)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if current == fromStatus {
		// Same status and same values: MySQL reports 0 affected rows for a no-op update.
		return nil
	}
	return ErrStatusConflict
}

// existsIfUnchanged turns "0 rows affected" into ErrNotFound only when the row really is missing
// (MySQL also reports 0 for an update that sets identical values).
func (r *mysqlProspectRepository) existsIfUnchanged(ctx context.Context, res sql.Result, tenantID, id uint64) error {
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected > 0 {
		return nil
	}
	var exists int
	err = r.db.QueryRowContext(ctx, "SELECT 1 FROM prospects WHERE id = ? AND tenant_id = ?", id, tenantID).Scan(&exists)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return nil
}

// FillMissingDetails completes an open prospect with details the jamaah gave when submitting again.
// Only empty columns are filled: nothing the admin or agent already recorded is overwritten.
func (r *mysqlProspectRepository) FillMissingDetails(ctx context.Context, tenantID uint64, id uint64, packageID *uint64, jumlahJamaah *int, departurePlan, domicile *string, consentAt, metaDisclosedAt *time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE prospects
		SET package_id = COALESCE(package_id, ?),
		    jumlah_jamaah = COALESCE(jumlah_jamaah, ?),
		    departure_plan = COALESCE(departure_plan, ?),
		    domicile = COALESCE(domicile, ?),
		    consent_at = COALESCE(consent_at, ?),
		    meta_disclosed_at = COALESCE(meta_disclosed_at, ?)
		WHERE id = ? AND tenant_id = ? AND anonymized_at IS NULL`,
		packageID, jumlahJamaah, departurePlan, domicile, consentAt, metaDisclosedAt, id, tenantID)
	return err
}

// ClaimMetaPurchase marks that the Meta Purchase event of this prospect is being reported. It returns
// true only the first time, so a closing that is cancelled and closed again is reported once.
func (r *mysqlProspectRepository) ClaimMetaPurchase(ctx context.Context, tenantID uint64, id uint64) (bool, error) {
	res, err := r.db.ExecContext(ctx,
		`UPDATE prospects SET meta_purchase_sent_at = NOW() WHERE id = ? AND tenant_id = ? AND meta_purchase_sent_at IS NULL`,
		id, tenantID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

// ReleaseMetaPurchase undoes ClaimMetaPurchase after a failed delivery, so a later closing can report it.
func (r *mysqlProspectRepository) ReleaseMetaPurchase(ctx context.Context, tenantID uint64, id uint64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE prospects SET meta_purchase_sent_at = NULL WHERE id = ? AND tenant_id = ?`, id, tenantID)
	return err
}

// AnonymizedName replaces the jamaah's name after their personal data was removed.
const AnonymizedName = "Data dihapus (UU PDP)"

// anonymizedMention replaces the jamaah's name inside notification texts; the text keeps the word
// "jamaah" before it ("... jamaah (data dihapus) sudah bisa dicairkan").
const anonymizedMention = "(data dihapus)"

// Ledger notes written by Anonymize in place of the admin's free-text reasons.
const (
	AnonymizedCancelNote = "Pembatalan closing: alasan dihapus (UU PDP)"
	AnonymizedLedgerNote = "alasan dihapus (UU PDP)"
)

// jamaahNotificationTypes are the notification types whose text can name a jamaah.
const jamaahNotificationTypes = `'prospect_new', 'prospect_repeat', 'prospect_already_closed', 'prospect_status_updated',
	'prospect_closing_cancelled', 'commission_earned', 'commission_override_earned', 'commission_released'`

// Anonymize removes a jamaah's personal data (UU PDP right to erasure) but keeps the prospect row,
// its status history and its commission ledger, so the agent's earnings trail stays intact.
// Free-text notes and linked notifications are deleted because they can contain personal data.
// Returns ErrNotFound for another tenant's prospect and ErrStatusConflict if already anonymized.
//
// An anonymized prospect can no longer be edited, so one that is still open (baru, dihubungi,
// tertarik) is moved out of the pipeline to 'tidak_lanjut' with the system category
// LostCategoryDataDeleted in the same transaction (status history records it as the admin's change).
// Otherwise it would count in the pipeline, the stale-prospect alert and the agent funnel for good.
func (r *mysqlProspectRepository) Anonymize(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// The current name is needed to scrub it from notifications that do not link to this prospect
	// (e.g. commission notifications linking to the agent's commission history).
	var oldName, status string
	var agentID sql.NullInt64
	var anonymized sql.NullTime
	err = tx.QueryRowContext(ctx, `SELECT name, status, agent_id, anonymized_at FROM prospects WHERE id = ? AND tenant_id = ? FOR UPDATE`, id, tenantID).
		Scan(&oldName, &status, &agentID, &anonymized)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if anonymized.Valid {
		return ErrStatusConflict
	}

	newStatus := status
	var category *string // nil keeps the current category
	if isOpenProspectStatus(status) {
		newStatus = "tidak_lanjut"
		c := LostCategoryDataDeleted
		category = &c
	}
	res, err := tx.ExecContext(ctx, `
		UPDATE prospects
		SET name = ?, phone = '', phone_normalized = NULL, email = NULL, domicile = NULL,
		    fbclid = NULL, meta_fbp = NULL, meta_fbc = NULL, lost_reason = NULL, anonymized_at = NOW(),
		    lost_reason_category = COALESCE(?, lost_reason_category), status = ?
		WHERE id = ? AND tenant_id = ? AND anonymized_at IS NULL`, AnonymizedName, category, newStatus, id, tenantID)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM prospects WHERE id = ? AND tenant_id = ?`, id, tenantID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return ErrNotFound
		}
		return ErrStatusConflict
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM prospect_notes WHERE tenant_id = ? AND prospect_id = ?`, tenantID, id); err != nil {
		return err
	}
	if err := scrubClosingReferenceNotes(ctx, tx, tenantID, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE referral_clicks SET prospect_id = NULL, ip_address = NULL WHERE tenant_id = ? AND prospect_id = ?`, tenantID, id); err != nil {
		return err
	}
	// Commission ledger notes hold the admin's free-text cancel/correction reasons, which often name the
	// jamaah. The amounts stay; the text is replaced. The "Pembatalan closing: " prefix is kept because it
	// marks where a cancelled closing ends in the ledger (service.currentClosingLedgers).
	if _, err := tx.ExecContext(ctx, `
		UPDATE commission_ledger
		SET notes = CASE WHEN notes LIKE 'Pembatalan closing: %' THEN ? ELSE ? END
		WHERE tenant_id = ? AND prospect_id = ? AND notes IS NOT NULL AND notes <> ''`,
		AnonymizedCancelNote, AnonymizedLedgerNote, tenantID, id); err != nil {
		return err
	}
	if newStatus != status {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status)
			VALUES (?, ?, 'admin', ?, ?, ?)`, tenantID, id, adminUserID, status, newStatus); err != nil {
			return err
		}
	}
	if err := scrubProspectNotifications(ctx, tx, tenantID, id, oldName, agentID); err != nil {
		return err
	}
	return tx.Commit()
}

// LostCategoryDataDeleted is the system 'Tidak Lanjut' category set when an open prospect is
// anonymized (UU PDP); it is never selectable by an admin or agent (see service.LostReasonCategories).
const LostCategoryDataDeleted = "data_dihapus"

func isOpenProspectStatus(status string) bool {
	return status == "baru" || status == "dihubungi" || status == "tertarik"
}

// scrubProspectNotifications removes the traces of a jamaah from the tenant's notifications when their
// prospect is anonymized or deleted: notifications linking to the prospect are deleted, and the name is
// replaced in the other jamaah-related notifications that can name this jamaah without linking to it
// (commission ones linking to the commission history). Those are limited to jamaah-related types sent
// to the agents of this prospect (its owner and every agent with a ledger row for it), and the name is
// replaced only as a whole word: a short name like "Al" or "Siti" must not rewrite "Alhamdulillah" or
// "Siti Aminah" in another jamaah's notification. Must run before the prospect (and its cascading
// ledger rows) is deleted.
func scrubProspectNotifications(ctx context.Context, tx *sql.Tx, tenantID, id uint64, name string, agentID sql.NullInt64) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM notifications WHERE tenant_id = ? AND link_url IN (?, ?)`,
		tenantID, fmt.Sprintf("/prospects/%d", id), fmt.Sprintf("/agen/jamaah/%d", id)); err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	ownerID := uint64(0)
	if agentID.Valid && agentID.Int64 > 0 {
		ownerID = uint64(agentID.Int64)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT n.id, n.title, n.body
		FROM notifications n
		WHERE n.tenant_id = ? AND n.recipient_type = 'agent' AND n.type IN (`+jamaahNotificationTypes+`)
		  AND (n.recipient_id = ? OR n.recipient_id IN (
			SELECT l.agent_id FROM commission_ledger l WHERE l.tenant_id = ? AND l.prospect_id = ?))
		  AND (n.title LIKE ? OR n.body LIKE ?)
		FOR UPDATE`,
		tenantID, ownerID, tenantID, id, "%"+escapeLike(name)+"%", "%"+escapeLike(name)+"%")
	if err != nil {
		return err
	}
	type change struct {
		id          uint64
		title, body string
	}
	var changes []change
	for rows.Next() {
		var c change
		if err := rows.Scan(&c.id, &c.title, &c.body); err != nil {
			rows.Close()
			return err
		}
		title, t := replaceJamaahMention(c.title, name)
		body, b := replaceJamaahMention(c.body, name)
		if t || b {
			changes = append(changes, change{c.id, title, body})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, c := range changes {
		if _, err := tx.ExecContext(ctx, `UPDATE notifications SET title = ?, body = ? WHERE id = ? AND tenant_id = ?`,
			c.title, c.body, c.id, tenantID); err != nil {
			return err
		}
	}
	return nil
}

// jamaahMentionSuffixes are the texts that follow the jamaah's name in the commission notifications
// that do not link to the prospect ("... jamaah <name> sudah bisa dicairkan", "... jamaah <name>
// tercatat", "Jamaah <name> sudah lunas"; service/prospect.go and prospect_closing.go).
var jamaahMentionSuffixes = []string{" sudah", " tercatat"}

// replaceJamaahMention replaces the jamaah's name in a notification text only where it is the whole
// name in the "jamaah <name> sudah/tercatat" shape the notifications use. Anonymizing "Siti" therefore
// leaves "jamaah Siti Aminah sudah ..." of another jamaah alone, and a name like "Al" never rewrites
// "Alhamdulillah". Case-sensitive for the name, like the stored text.
func replaceJamaahMention(s, name string) (string, bool) {
	if name == "" {
		return s, false
	}
	var b strings.Builder
	changed := false
	rest := s
	for {
		i := strings.Index(rest, name)
		if i < 0 {
			b.WriteString(rest)
			break
		}
		end := i + len(name)
		prefixOK := i >= len("jamaah ") && strings.EqualFold(rest[i-len("jamaah "):i], "jamaah ")
		suffixOK := false
		for _, suf := range jamaahMentionSuffixes {
			if strings.HasPrefix(rest[end:], suf) {
				suffixOK = true
				break
			}
		}
		if !prefixOK || !suffixOK {
			// Not this jamaah's mention: keep it and continue after its first rune.
			_, size := utf8.DecodeRuneInString(rest[i:])
			b.WriteString(rest[:i+size])
			rest = rest[i+size:]
			continue
		}
		b.WriteString(rest[:i])
		b.WriteString(anonymizedMention)
		rest = rest[end:]
		changed = true
	}
	return b.String(), changed
}

// ErrProspectNotDeletable: DeleteIfDeletable found the prospect in Closing or with commission rows.
var ErrProspectNotDeletable = errors.New("prospect is closing or has commission records")

// Delete removes a prospect (spam, test data, or a jamaah without commission history asking to be
// forgotten), including its notifications and the jamaah's name in other notifications.
func (r *mysqlProspectRepository) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	return r.deleteProspect(ctx, tenantID, id, false)
}

// DeleteIfDeletable is Delete with the "not Closing, no commission rows" rule checked inside the
// transaction, under the prospect's row lock: a closing booked by another admin between the service's
// check and the delete would otherwise be removed together with its fresh commission rows.
// ErrProspectNotDeletable when the rule fails.
func (r *mysqlProspectRepository) DeleteIfDeletable(ctx context.Context, tenantID uint64, id uint64) error {
	return r.deleteProspect(ctx, tenantID, id, true)
}

func (r *mysqlProspectRepository) deleteProspect(ctx context.Context, tenantID uint64, id uint64, guard bool) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var name, status string
	var agentID sql.NullInt64
	err = tx.QueryRowContext(ctx, `SELECT name, status, agent_id FROM prospects WHERE id = ? AND tenant_id = ? FOR UPDATE`, id, tenantID).Scan(&name, &status, &agentID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if guard {
		if status == "closing" {
			return ErrProspectNotDeletable
		}
		var ledgerRows int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ?`, tenantID, id).Scan(&ledgerRows); err != nil {
			return err
		}
		if ledgerRows > 0 {
			return ErrProspectNotDeletable
		}
	}
	if err := scrubClosingReferenceNotes(ctx, tx, tenantID, id); err != nil {
		return err
	}
	// Before the delete: the scrub finds the prospect's agents through its (cascading) ledger rows.
	if err := scrubProspectNotifications(ctx, tx, tenantID, id, name, agentID); err != nil {
		return err
	}
	// referral_clicks.prospect_id has no ON DELETE rule; detach clicks first so the delete can't fail.
	if _, err := tx.ExecContext(ctx, `UPDATE referral_clicks SET prospect_id = NULL, ip_address = NULL WHERE tenant_id = ? AND prospect_id = ?`, tenantID, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM prospects WHERE id = ? AND tenant_id = ?`, id, tenantID); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *mysqlProspectRepository) GetAgentFunnelSummary(ctx context.Context, tenantID uint64, agentID uint64) (*AgentFunnelSummary, error) {
	query := `
		SELECT
			COALESCE(SUM(CASE WHEN status = 'baru' THEN 1 ELSE 0 END), 0) AS baru,
			COALESCE(SUM(CASE WHEN status IN ('dihubungi', 'tertarik') THEN 1 ELSE 0 END), 0) AS diproses,
			COALESCE(SUM(CASE WHEN status = 'closing' THEN 1 ELSE 0 END), 0) AS closing,
			COALESCE(SUM(CASE WHEN status = 'tidak_lanjut' AND EXISTS (
				SELECT 1 FROM prospect_status_history h
				WHERE h.tenant_id = prospects.tenant_id AND h.prospect_id = prospects.id AND h.old_status = 'closing'
			) THEN 1 ELSE 0 END), 0) AS batal
		FROM prospects
		WHERE tenant_id = ? AND agent_id = ?
	`
	var summary AgentFunnelSummary
	err := r.db.QueryRowContext(ctx, query, tenantID, agentID).Scan(&summary.Baru, &summary.Diproses, &summary.Closing, &summary.Batal)
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
	return r.queryClosingStats(ctx, query, tenantID)
}

func (r *mysqlProspectRepository) GetAgentClosingJamaah(ctx context.Context, tenantID uint64, agentID uint64) (int, error) {
	var total int
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0)
		FROM prospects p
		WHERE p.tenant_id = ? AND p.agent_id = ? AND p.status = 'closing'`, tenantID, agentID).Scan(&total)
	if err != nil {
		return 0, err
	}
	return total, nil
}

func (r *mysqlProspectRepository) GetActiveAgentsClosingStatsSince(ctx context.Context, tenantID uint64, since string) ([]AgentClosingStat, error) {
	query := `
		SELECT
			a.id,
			COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN COALESCE(p.jumlah_jamaah, 1) ELSE 0 END), 0) AS total_jamaah
		FROM agents a
		LEFT JOIN prospects p ON p.tenant_id = a.tenant_id AND p.agent_id = a.id AND p.status = 'closing'
			AND (
				SELECT MAX(h.changed_at) FROM prospect_status_history h
				WHERE h.tenant_id = p.tenant_id AND h.prospect_id = p.id AND h.new_status = 'closing'
			) >= ?
		WHERE a.tenant_id = ? AND a.status = 'active'
		GROUP BY a.id
		ORDER BY total_jamaah DESC, a.id ASC
	`
	return r.queryClosingStats(ctx, query, since, tenantID)
}

func (r *mysqlProspectRepository) GetAgentProspectCountsSince(ctx context.Context, tenantID uint64, since string) ([]AgentProspectCount, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT p.agent_id, COUNT(*)
		FROM prospects p
		JOIN agents a ON a.id = p.agent_id AND a.tenant_id = p.tenant_id
		WHERE p.tenant_id = ? AND p.agent_id IS NOT NULL AND p.created_at >= ?
		GROUP BY p.agent_id`, tenantID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []AgentProspectCount
	for rows.Next() {
		var c AgentProspectCount
		if err := rows.Scan(&c.AgentID, &c.Count); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *mysqlProspectRepository) queryClosingStats(ctx context.Context, query string, args ...interface{}) ([]AgentClosingStat, error) {
	rows, err := r.db.QueryContext(ctx, query, args...)
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
	// Only prospects that are still closing count (a closing cancelled after DP must not count towards
	// the target), each once, dated by its latest move into closing (a re-closed prospect is not
	// counted twice or in two periods).
	query := `
		SELECT COALESCE(SUM(COALESCE(p.jumlah_jamaah, 1)), 0)
		FROM prospects p
		WHERE p.tenant_id = ?
		  AND p.agent_id = ?
		  AND p.status = 'closing'
		  AND DATE((
			SELECT MAX(h.changed_at) FROM prospect_status_history h
			WHERE h.tenant_id = p.tenant_id AND h.prospect_id = p.id AND h.new_status = 'closing'
		  )) BETWEEN ? AND ?
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
	// One click per visitor (IP) per agent per 24 hours: refreshing or re-opening the link must not
	// inflate the agent's click count and distort the click → prospect funnel.
	query := `
		INSERT INTO referral_clicks (tenant_id, agent_id, ip_address, clicked_at)
		SELECT ?, ?, ?, NOW()
		FROM DUAL
		WHERE NOT EXISTS (
			SELECT 1 FROM referral_clicks
			WHERE tenant_id = ? AND agent_id = ? AND ip_address <=> ? AND clicked_at > NOW() - INTERVAL 24 HOUR
		)
	`
	var ip interface{}
	if ipAddress != "" {
		ip = ipAddress
	}
	_, err := r.db.ExecContext(ctx, query, tenantID, agentID, ip, tenantID, agentID, ip)
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

// WithPhoneLock runs fn while holding a MySQL advisory lock for (tenant, normalized phone), so the
// duplicate check + insert of two simultaneous submissions of the same jamaah cannot interleave.
// The lock is tenant-scoped by name; if it cannot be taken within 5 seconds, fn is not run.
func (r *mysqlProspectRepository) WithPhoneLock(ctx context.Context, tenantID uint64, phoneNormalized string, fn func() error) error {
	conn, err := r.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	name := fmt.Sprintf("ku_prospect_%d_%s", tenantID, phoneNormalized)
	var got sql.NullInt64
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 5)", name).Scan(&got); err != nil {
		return err
	}
	if !got.Valid || got.Int64 != 1 {
		return errors.New("prospect phone lock timeout")
	}
	defer func() {
		// Release on the same connection; use a fresh context so a cancelled request still releases.
		_, _ = conn.ExecContext(context.Background(), "SELECT RELEASE_LOCK(?)", name)
	}()
	return fn()
}

func (r *mysqlProspectRepository) MarkPaidOff(ctx context.Context, tenantID uint64, id uint64) error {
	res, err := r.db.ExecContext(ctx,
		"UPDATE prospects SET paid_off_at = NOW() WHERE id = ? AND tenant_id = ? AND status = 'closing' AND paid_off_at IS NULL",
		id, tenantID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}
	var exists int
	if err := r.db.QueryRowContext(ctx, "SELECT 1 FROM prospects WHERE id = ? AND tenant_id = ?", id, tenantID).Scan(&exists); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	return ErrStatusConflict
}

// closingReferenceMarker is how the duplicate-closing warning (service.flagEarlierClosing) cites the
// earlier closing on ANOTHER prospect's note: "... di prospek #<id> (<jamaah name>, agen <agent name>). ...".
const closingReferenceMarker = "di prospek #%d ("

// closingReferenceEnd closes the parenthetical in that warning.
const closingReferenceEnd = "). Pastikan"

// AnonymizedClosingReference replaces "(<jamaah name>, agen <agent name>)" in that warning once the cited
// prospect is anonymized or deleted (UU PDP).
const AnonymizedClosingReference = "(data dihapus (UU PDP))"

// scrubClosingReferenceNotes removes the cited jamaah's name and owning agent's name from the system
// notes on other prospects of the same travel that refer to prospect id ("prospek #<id> (...)"). The
// "(" right after the id keeps #12 from matching #123. Only system notes are touched.
func scrubClosingReferenceNotes(ctx context.Context, tx *sql.Tx, tenantID, id uint64) error {
	marker := fmt.Sprintf(closingReferenceMarker, id)
	rows, err := tx.QueryContext(ctx, `
		SELECT id, note_text FROM prospect_notes
		WHERE tenant_id = ? AND author_type = 'system' AND prospect_id <> ? AND note_text LIKE ?
		FOR UPDATE`,
		tenantID, id, "%"+escapeLike(marker)+"%")
	if err != nil {
		return err
	}
	type change struct {
		id   uint64
		text string
	}
	var changes []change
	for rows.Next() {
		var noteID uint64
		var text string
		if err := rows.Scan(&noteID, &text); err != nil {
			rows.Close()
			return err
		}
		if scrubbed, ok := scrubClosingReference(text, marker); ok {
			changes = append(changes, change{noteID, scrubbed})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, c := range changes {
		if _, err := tx.ExecContext(ctx, `UPDATE prospect_notes SET note_text = ? WHERE id = ? AND tenant_id = ?`, c.text, c.id, tenantID); err != nil {
			return err
		}
	}
	return nil
}

// scrubClosingReference replaces the parenthetical after each marker (up to "). Pastikan") with
// AnonymizedClosingReference. Without the closing text the rest of the note after the marker is dropped
// up to the end, so a name is never left behind.
func scrubClosingReference(text, marker string) (string, bool) {
	var b strings.Builder
	rest := text
	changed := false
	for {
		i := strings.Index(rest, marker)
		if i < 0 {
			b.WriteString(rest)
			break
		}
		start := i + len(marker) - 1 // at "("
		b.WriteString(rest[:start])
		b.WriteString(AnonymizedClosingReference)
		changed = true
		tail := rest[start:]
		if j := strings.Index(tail, closingReferenceEnd); j >= 0 {
			rest = tail[j+1:] // keep ". Pastikan ..."
		} else {
			rest = ""
		}
	}
	return b.String(), changed
}
