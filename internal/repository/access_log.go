package repository

import (
	"context"
	"database/sql"
	"time"
)

// Access log action identifiers recorded when KlikUmroh staff touches tenant data.
const (
	AccessActionViewTenantDetail   = "lihat_detail_travel"
	AccessActionImpersonateStart   = "mulai_impersonasi"
	AccessActionImpersonateRequest = "akses_dashboard"
	AccessActionResetAdminPassword = "reset_password_admin"
	AccessActionUpdateSubscription = "ubah_langganan"
)

// AccessLog represents one audit record of a staff member accessing tenant data.
type AccessLog struct {
	ID         uint64    `json:"id"`
	TenantID   uint64    `json:"tenant_id"`
	StaffID    uint64    `json:"staff_id"`
	StaffName  string    `json:"staff_name"`
	Action     string    `json:"action"`
	HTTPMethod *string   `json:"http_method,omitempty"`
	Path       *string   `json:"path,omitempty"`
	SessionID  *uint64   `json:"session_id,omitempty"`
	Reason     *string   `json:"reason,omitempty"`
	AccessedAt time.Time `json:"accessed_at"`
}

// AccessLogRepository defines access methods for the access_logs audit trail.
// All methods enforce tenant_id isolation. There is intentionally no update or delete method:
// the audit trail is append-only so staff cannot erase their own traces.
type AccessLogRepository interface {
	Create(ctx context.Context, tenantID uint64, log *AccessLog) error
	ListByTenant(ctx context.Context, tenantID uint64, limit int) ([]AccessLog, error)
	// ExistsRecentRequest reports whether an identical impersonation request (same session, method, and path)
	// was already logged for the tenant within the given window. Used to avoid flooding the log with polling requests.
	ExistsRecentRequest(ctx context.Context, tenantID uint64, sessionID uint64, method, path string, window time.Duration) (bool, error)
}

type mysqlAccessLogRepository struct {
	db *sql.DB
}

// NewAccessLogRepository creates a new AccessLogRepository instance.
func NewAccessLogRepository(db *sql.DB) AccessLogRepository {
	return &mysqlAccessLogRepository{db: db}
}

func (r *mysqlAccessLogRepository) Create(ctx context.Context, tenantID uint64, log *AccessLog) error {
	query := `
		INSERT INTO access_logs (
			tenant_id, staff_id, action, http_method, path, session_id, reason
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	log.TenantID = tenantID

	result, err := r.db.ExecContext(ctx, query,
		tenantID,
		log.StaffID,
		log.Action,
		log.HTTPMethod,
		log.Path,
		log.SessionID,
		log.Reason,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	log.ID = uint64(id)
	return nil
}

func (r *mysqlAccessLogRepository) ListByTenant(ctx context.Context, tenantID uint64, limit int) ([]AccessLog, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	query := `
		SELECT al.id, al.tenant_id, al.staff_id, COALESCE(su.name, ''), al.action,
			al.http_method, al.path, al.session_id, al.reason, al.accessed_at
		FROM access_logs al
		LEFT JOIN staff_users su ON su.id = al.staff_id
		WHERE al.tenant_id = ?
		ORDER BY al.accessed_at DESC, al.id DESC
		LIMIT ?
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := make([]AccessLog, 0)
	for rows.Next() {
		var l AccessLog
		if err := rows.Scan(
			&l.ID,
			&l.TenantID,
			&l.StaffID,
			&l.StaffName,
			&l.Action,
			&l.HTTPMethod,
			&l.Path,
			&l.SessionID,
			&l.Reason,
			&l.AccessedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return logs, nil
}

func (r *mysqlAccessLogRepository) ExistsRecentRequest(ctx context.Context, tenantID uint64, sessionID uint64, method, path string, window time.Duration) (bool, error) {
	// The window is evaluated with the database clock (NOW()) so it matches accessed_at's
	// CURRENT_TIMESTAMP default regardless of the Go process timezone.
	query := `
		SELECT EXISTS (
			SELECT 1 FROM access_logs
			WHERE tenant_id = ? AND session_id = ? AND http_method = ? AND path = ?
				AND accessed_at >= NOW() - INTERVAL ? SECOND
		)
	`
	var exists bool
	err := r.db.QueryRowContext(ctx, query, tenantID, sessionID, method, path, int(window.Seconds())).Scan(&exists)
	return exists, err
}
