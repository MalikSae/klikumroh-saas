package repository

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
)

// Affiliator KlikUmroh: platform-level data (like staff_users and coupons), not tenant data. Every
// method an affiliator can reach through the portal takes the affiliator ID and filters on it, so one
// affiliator never reads another's travels, commissions, or payouts.

var (
	// ErrPayoutBelowMinimum: the commission available for payout is under the platform minimum.
	ErrPayoutBelowMinimum = errors.New("saldo komisi yang bisa dicairkan belum mencapai minimal pencairan")
	// ErrPayoutPending: the affiliator already has a payout waiting for staff.
	ErrPayoutPending = errors.New("masih ada pengajuan pencairan yang sedang diproses")
)

// Affiliator is a person who brings travels to subscribe to KlikUmroh.
type Affiliator struct {
	ID                uint64    `json:"id"`
	Name              string    `json:"name"`
	Email             string    `json:"email"`
	PasswordHash      string    `json:"-"`
	WhatsApp          *string   `json:"whatsapp,omitempty"`
	LinkCode          string    `json:"link_code"`
	Status            string    `json:"status"`
	FirstRate         *float64  `json:"first_rate"`
	RenewalRate       *float64  `json:"renewal_rate"`
	BankName          *string   `json:"bank_name"`
	BankAccountNumber *string   `json:"bank_account_number"`
	BankAccountHolder *string   `json:"bank_account_holder"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// AffiliatorSession is a logged-in affiliator portal session.
type AffiliatorSession struct {
	ID           uint64
	AffiliatorID uint64
	Token        string
	ExpiresAt    time.Time
}

// AffiliatorTenant is what an affiliator may see about a travel it brought: name and subscription status
// only, never prospects, agents, or jamaah.
type AffiliatorTenant struct {
	TenantID              uint64     `json:"tenant_id"`
	Name                  string     `json:"name"`
	// Status is the derived subscription status (DeriveSubscriptionStatus): active, expired, suspended,
	// pending, no_plan or demo.
	Status                string     `json:"status"`
	SubscriptionExpiresAt *time.Time `json:"subscription_expires_at"`
	Source                string     `json:"source"`
	AffiliatedAt          time.Time  `json:"affiliated_at"`
}

// AffiliatorCommission is one commission for one approved payment.
type AffiliatorCommission struct {
	ID                    uint64    `json:"id"`
	AffiliatorID          uint64    `json:"affiliator_id"`
	TenantID              uint64    `json:"tenant_id"`
	TenantName            string    `json:"tenant_name"`
	PaymentVerificationID uint64    `json:"payment_verification_id"`
	Kind                  string    `json:"kind"` // 'first' | 'renewal'
	BaseAmount            float64   `json:"base_amount"`
	Rate                  float64   `json:"rate"`
	Amount                float64   `json:"amount"`
	AvailableAt           time.Time `json:"available_at"`
	PayoutID              *uint64   `json:"payout_id"`
	CreatedAt             time.Time `json:"created_at"`
}

// AffiliatorPayout is a payout request; the bank details are a snapshot taken when it was requested.
type AffiliatorPayout struct {
	ID                uint64  `json:"id"`
	AffiliatorID      uint64  `json:"affiliator_id"`
	AffiliatorName    string  `json:"affiliator_name,omitempty"`
	Amount            float64 `json:"amount"`
	Status            string  `json:"status"` // 'pending' | 'paid' | 'rejected'
	BankName          string  `json:"bank_name"`
	BankAccountNumber string  `json:"bank_account_number"`
	BankAccountHolder string  `json:"bank_account_holder"`
	// RequestedByStaffID / RequestedByStaffName: the staff who requested the payout on the affiliator's
	// behalf (StaffRequestPayout); nil when the affiliator requested it from the portal. Staff-facing
	// only: the affiliator portal responses leave both out (handler.affiliatorPortalPayout).
	RequestedByStaffID   *uint64    `json:"requested_by_staff_id"`
	RequestedByStaffName *string    `json:"requested_by_staff_name"`
	RejectionReason      *string    `json:"rejection_reason"`
	ReviewedBy           *uint64    `json:"reviewed_by"`
	ReviewedAt           *time.Time `json:"reviewed_at"`
	CreatedAt            time.Time  `json:"created_at"`
}

// AffiliatorBalance sums an affiliator's commissions by stage.
type AffiliatorBalance struct {
	Held      float64 `json:"held"`      // still inside the holding period
	Available float64 `json:"available"` // can be requested now
	Requested float64 `json:"requested"` // in a pending payout
	Paid      float64 `json:"paid"`
}

// AffiliatorListItem is one row of the staff affiliator list.
type AffiliatorListItem struct {
	Affiliator
	CouponCode  *string `json:"coupon_code"`
	TenantCount int     `json:"tenant_count"`
	TotalEarned float64 `json:"total_earned"`
}

// AffiliatorRepository is the only access path to affiliator data.
type AffiliatorRepository interface {
	Create(ctx context.Context, a *Affiliator) error
	GetByID(ctx context.Context, id uint64) (*Affiliator, error)
	FindByEmail(ctx context.Context, email string) (*Affiliator, error)
	FindActiveByLinkCode(ctx context.Context, code string) (*Affiliator, error)
	UpdateBank(ctx context.Context, id uint64, bankName, accountNumber, accountHolder string) error
	SetStatus(ctx context.Context, id uint64, status string) error
	SetRates(ctx context.Context, id uint64, firstRate, renewalRate *float64) error
	SetPassword(ctx context.Context, id uint64, passwordHash string) error
	List(ctx context.Context) ([]AffiliatorListItem, error)

	CreateSession(ctx context.Context, s *AffiliatorSession) error
	FindSessionByToken(ctx context.Context, token string) (*AffiliatorSession, *Affiliator, error)
	DeleteSession(ctx context.Context, token string) error
	DeleteSessionsByAffiliator(ctx context.Context, affiliatorID uint64) error
	DeleteOtherSessions(ctx context.Context, affiliatorID uint64, keepToken string) error

	ActiveCoupon(ctx context.Context, affiliatorID uint64) (*Coupon, error)
	ReplaceCoupon(ctx context.Context, affiliatorID uint64, code string, discount float64) (*Coupon, error)
	DeactivateCoupons(ctx context.Context, affiliatorID uint64) error
	SetCouponDiscount(ctx context.Context, discount float64) error

	RecordClick(ctx context.Context, affiliatorID uint64, ip string) error
	CountClicks(ctx context.Context, affiliatorID uint64) (int, error)

	// RecordLogin keeps the IP of a registration or login; HasLoginFromIP reports whether the affiliator
	// used that IP within the last withinDays days (self-referral guard at travel signup).
	RecordLogin(ctx context.Context, affiliatorID uint64, ip string) error
	HasLoginFromIP(ctx context.Context, affiliatorID uint64, ip string, withinDays int) (bool, error)

	AttributeTenant(ctx context.Context, tenantID, affiliatorID uint64, source string) error
	TenantAffiliator(ctx context.Context, tenantID uint64) (*Affiliator, error)
	ListTenants(ctx context.Context, affiliatorID uint64) ([]AffiliatorTenant, error)

	CreateCommission(ctx context.Context, c *AffiliatorCommission) error
	ListCommissions(ctx context.Context, affiliatorID uint64) ([]AffiliatorCommission, error)
	Balance(ctx context.Context, affiliatorID uint64, now time.Time) (*AffiliatorBalance, error)

	RequestPayout(ctx context.Context, affiliatorID uint64, minAmount float64, now time.Time, bankName, accountNumber, accountHolder string, requestedByStaffID *uint64) (*AffiliatorPayout, error)
	ListPayouts(ctx context.Context, affiliatorID uint64) ([]AffiliatorPayout, error)
	ListAllPayouts(ctx context.Context, status string) ([]AffiliatorPayout, error)
	MarkPayoutPaid(ctx context.Context, payoutID, staffUserID uint64) error
	RejectPayout(ctx context.Context, payoutID, staffUserID uint64, reason string) error
}

type mysqlAffiliatorRepository struct {
	db *sql.DB
}

// NewAffiliatorRepository creates a new AffiliatorRepository.
func NewAffiliatorRepository(db *sql.DB) AffiliatorRepository {
	return &mysqlAffiliatorRepository{db: db}
}

func isDuplicateKey(err error) bool {
	var mysqlErr *mysql.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062
}

const affiliatorColumns = `a.id, a.name, a.email, a.password_hash, a.whatsapp, a.link_code, a.status, a.first_rate,
	a.renewal_rate, a.bank_name, a.bank_account_number, a.bank_account_holder, a.created_at, a.updated_at`

func scanAffiliator(row rowScanner, extra ...any) (*Affiliator, error) {
	var a Affiliator
	var wa, bankName, accNum, accHolder sql.NullString
	var firstRate, renewalRate sql.NullFloat64
	dest := []any{&a.ID, &a.Name, &a.Email, &a.PasswordHash, &wa, &a.LinkCode, &a.Status, &firstRate,
		&renewalRate, &bankName, &accNum, &accHolder, &a.CreatedAt, &a.UpdatedAt}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	a.WhatsApp = nullStringPtr(wa)
	a.BankName = nullStringPtr(bankName)
	a.BankAccountNumber = nullStringPtr(accNum)
	a.BankAccountHolder = nullStringPtr(accHolder)
	if firstRate.Valid {
		a.FirstRate = &firstRate.Float64
	}
	if renewalRate.Valid {
		a.RenewalRate = &renewalRate.Float64
	}
	return &a, nil
}

func (r *mysqlAffiliatorRepository) Create(ctx context.Context, a *Affiliator) error {
	status := a.Status
	if status == "" {
		status = "active"
	}
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO affiliators (name, email, password_hash, whatsapp, link_code, status) VALUES (?, ?, ?, ?, ?, ?)`,
		a.Name, strings.ToLower(strings.TrimSpace(a.Email)), a.PasswordHash, a.WhatsApp, a.LinkCode, status)
	if err != nil {
		if isDuplicateKey(err) {
			return ErrDuplicate
		}
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	a.ID = uint64(id)
	a.Status = status
	return nil
}

func (r *mysqlAffiliatorRepository) GetByID(ctx context.Context, id uint64) (*Affiliator, error) {
	return scanAffiliator(r.db.QueryRowContext(ctx, `SELECT `+affiliatorColumns+` FROM affiliators a WHERE a.id = ?`, id))
}

func (r *mysqlAffiliatorRepository) FindByEmail(ctx context.Context, email string) (*Affiliator, error) {
	return scanAffiliator(r.db.QueryRowContext(ctx, `SELECT `+affiliatorColumns+` FROM affiliators a WHERE a.email = ?`,
		strings.ToLower(strings.TrimSpace(email))))
}

func (r *mysqlAffiliatorRepository) FindActiveByLinkCode(ctx context.Context, code string) (*Affiliator, error) {
	return scanAffiliator(r.db.QueryRowContext(ctx,
		`SELECT `+affiliatorColumns+` FROM affiliators a WHERE a.link_code = ? AND a.status = 'active'`,
		strings.ToUpper(strings.TrimSpace(code))))
}

func execAffected(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *mysqlAffiliatorRepository) UpdateBank(ctx context.Context, id uint64, bankName, accountNumber, accountHolder string) error {
	// MySQL reports 0 affected rows when nothing changed, so check existence separately.
	if _, err := r.GetByID(ctx, id); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE affiliators SET bank_name = ?, bank_account_number = ?, bank_account_holder = ? WHERE id = ?`,
		bankName, accountNumber, accountHolder, id)
	return err
}

func (r *mysqlAffiliatorRepository) SetStatus(ctx context.Context, id uint64, status string) error {
	if _, err := r.GetByID(ctx, id); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `UPDATE affiliators SET status = ? WHERE id = ?`, status, id)
	return err
}

func (r *mysqlAffiliatorRepository) SetRates(ctx context.Context, id uint64, firstRate, renewalRate *float64) error {
	if _, err := r.GetByID(ctx, id); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `UPDATE affiliators SET first_rate = ?, renewal_rate = ? WHERE id = ?`,
		firstRate, renewalRate, id)
	return err
}

func (r *mysqlAffiliatorRepository) SetPassword(ctx context.Context, id uint64, passwordHash string) error {
	if _, err := r.GetByID(ctx, id); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `UPDATE affiliators SET password_hash = ? WHERE id = ?`, passwordHash, id)
	return err
}

func (r *mysqlAffiliatorRepository) List(ctx context.Context) ([]AffiliatorListItem, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT `+affiliatorColumns+`,
			(SELECT c.code FROM coupons c WHERE c.affiliator_id = a.id AND c.status = 'active' ORDER BY c.id DESC LIMIT 1),
			(SELECT COUNT(*) FROM tenants t WHERE t.affiliator_id = a.id),
			(SELECT COALESCE(SUM(ac.amount), 0) FROM affiliator_commissions ac WHERE ac.affiliator_id = a.id)
		FROM affiliators a
		ORDER BY a.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AffiliatorListItem{}
	for rows.Next() {
		var coupon sql.NullString
		var item AffiliatorListItem
		a, err := scanAffiliator(rows, &coupon, &item.TenantCount, &item.TotalEarned)
		if err != nil {
			return nil, err
		}
		item.Affiliator = *a
		item.CouponCode = nullStringPtr(coupon)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *mysqlAffiliatorRepository) CreateSession(ctx context.Context, s *AffiliatorSession) error {
	res, err := r.db.ExecContext(ctx, `INSERT INTO affiliator_sessions (affiliator_id, token, expires_at) VALUES (?, ?, ?)`,
		s.AffiliatorID, s.Token, s.ExpiresAt)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	s.ID = uint64(id)
	return nil
}

// FindSessionByToken returns only unexpired sessions of active affiliators.
func (r *mysqlAffiliatorRepository) FindSessionByToken(ctx context.Context, token string) (*AffiliatorSession, *Affiliator, error) {
	var s AffiliatorSession
	a, err := scanAffiliator(r.db.QueryRowContext(ctx, `
		SELECT `+affiliatorColumns+`, s.id, s.affiliator_id, s.token, s.expires_at
		FROM affiliator_sessions s
		JOIN affiliators a ON a.id = s.affiliator_id
		WHERE s.token = ? AND s.expires_at > NOW() AND a.status = 'active'`, token),
		&s.ID, &s.AffiliatorID, &s.Token, &s.ExpiresAt)
	if err != nil {
		return nil, nil, err
	}
	return &s, a, nil
}

func (r *mysqlAffiliatorRepository) DeleteSession(ctx context.Context, token string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM affiliator_sessions WHERE token = ?`, token)
	return err
}

// DeleteSessionsByAffiliator signs the affiliator out everywhere (after a password reset).
func (r *mysqlAffiliatorRepository) DeleteSessionsByAffiliator(ctx context.Context, affiliatorID uint64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM affiliator_sessions WHERE affiliator_id = ?`, affiliatorID)
	return err
}

// DeleteOtherSessions signs the affiliator out on every other device, keeping the current session.
func (r *mysqlAffiliatorRepository) DeleteOtherSessions(ctx context.Context, affiliatorID uint64, keepToken string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM affiliator_sessions WHERE affiliator_id = ? AND token <> ?`, affiliatorID, keepToken)
	return err
}

func (r *mysqlAffiliatorRepository) ActiveCoupon(ctx context.Context, affiliatorID uint64) (*Coupon, error) {
	var c Coupon
	err := r.db.QueryRowContext(ctx, `
		SELECT id, code, discount_percentage, used_count, status, created_at, updated_at
		FROM coupons WHERE affiliator_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, affiliatorID).
		Scan(&c.ID, &c.Code, &c.DiscountPercentage, &c.UsedCount, &c.Status, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	id := affiliatorID
	c.AffiliatorID = &id
	return &c, nil
}

// ReplaceCoupon deactivates the affiliator's current coupon and creates the new one in one transaction:
// an affiliator has one active coupon. ErrDuplicate when the code is taken by any coupon.
func (r *mysqlAffiliatorRepository) ReplaceCoupon(ctx context.Context, affiliatorID uint64, code string, discount float64) (*Coupon, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		`UPDATE coupons SET status = 'inactive' WHERE affiliator_id = ? AND status = 'active'`, affiliatorID); err != nil {
		return nil, err
	}
	code = strings.ToUpper(strings.TrimSpace(code))

	// The affiliator's own earlier coupon with this code (e.g. deactivated with the affiliator) is
	// reactivated instead of inserted again, which the unique code would refuse. A code owned by another
	// affiliator or by the platform is not touched and still ends in ErrDuplicate below.
	var ownID uint64
	var usedCount int
	var createdAt time.Time
	err = tx.QueryRowContext(ctx,
		`SELECT id, used_count, created_at FROM coupons WHERE code = ? AND affiliator_id = ? FOR UPDATE`, code, affiliatorID).
		Scan(&ownID, &usedCount, &createdAt)
	switch {
	case err == nil:
		if _, err := tx.ExecContext(ctx,
			`UPDATE coupons SET status = 'active', discount_percentage = ? WHERE id = ? AND affiliator_id = ?`,
			discount, ownID, affiliatorID); err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		aid := affiliatorID
		return &Coupon{ID: ownID, Code: code, DiscountPercentage: discount, UsedCount: usedCount, Status: "active",
			AffiliatorID: &aid, CreatedAt: createdAt}, nil
	case !errors.Is(err, sql.ErrNoRows):
		return nil, err
	}

	res, err := tx.ExecContext(ctx, `
		INSERT INTO coupons (code, discount_percentage, plan_id, max_uses, used_count, expires_at, status, affiliator_id)
		VALUES (?, ?, NULL, NULL, 0, NULL, 'active', ?)`, code, discount, affiliatorID)
	if err != nil {
		if isDuplicateKey(err) {
			return nil, ErrDuplicate
		}
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	aid := affiliatorID
	return &Coupon{ID: uint64(id), Code: code, DiscountPercentage: discount, Status: "active", AffiliatorID: &aid}, nil
}

func (r *mysqlAffiliatorRepository) DeactivateCoupons(ctx context.Context, affiliatorID uint64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE coupons SET status = 'inactive' WHERE affiliator_id = ? AND status = 'active'`, affiliatorID)
	return err
}

// SetCouponDiscount applies the platform's affiliator coupon discount to every active affiliator coupon
// (the discount is the same for all affiliators).
func (r *mysqlAffiliatorRepository) SetCouponDiscount(ctx context.Context, discount float64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE coupons SET discount_percentage = ? WHERE affiliator_id IS NOT NULL AND status = 'active'`, discount)
	return err
}

func (r *mysqlAffiliatorRepository) RecordLogin(ctx context.Context, affiliatorID uint64, ip string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO affiliator_logins (affiliator_id, ip_address) VALUES (?, ?)`, affiliatorID, ip)
	return err
}

func (r *mysqlAffiliatorRepository) HasLoginFromIP(ctx context.Context, affiliatorID uint64, ip string, withinDays int) (bool, error) {
	// The window is computed by MySQL (NOW()), the same clock that filled logged_in_at. IPv6 addresses
	// match by /64 (bug hunt putaran 5): privacy addresses rotate inside the prefix one household or phone
	// controls, so an exact match would almost never catch a self-referral on IPv6 mobile networks.
	rows, err := r.db.QueryContext(ctx, `
		SELECT DISTINCT ip_address FROM affiliator_logins
		WHERE affiliator_id = ? AND ip_address IS NOT NULL AND logged_in_at >= NOW() - INTERVAL ? DAY`,
		affiliatorID, withinDays)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var stored string
		if err := rows.Scan(&stored); err != nil {
			return false, err
		}
		if SameClientNetwork(stored, ip) {
			return true, nil
		}
	}
	return false, rows.Err()
}

// SameClientNetwork reports whether two client addresses belong to the same client: equal IPv4 addresses
// (IPv4-mapped IPv6 included), or IPv6 addresses in the same /64.
func SameClientNetwork(a, b string) bool {
	ipA, ipB := net.ParseIP(strings.TrimSpace(a)), net.ParseIP(strings.TrimSpace(b))
	if ipA == nil || ipB == nil {
		return strings.TrimSpace(a) != "" && strings.TrimSpace(a) == strings.TrimSpace(b)
	}
	if v4a, v4b := ipA.To4(), ipB.To4(); v4a != nil || v4b != nil {
		return v4a != nil && v4b != nil && v4a.Equal(v4b)
	}
	mask := net.CIDRMask(64, 128)
	return ipA.Mask(mask).Equal(ipB.Mask(mask))
}

func (r *mysqlAffiliatorRepository) RecordClick(ctx context.Context, affiliatorID uint64, ip string) error {
	var ipVal any
	if ip != "" {
		ipVal = ip
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO affiliator_clicks (affiliator_id, ip_address) VALUES (?, ?)`, affiliatorID, ipVal)
	return err
}

func (r *mysqlAffiliatorRepository) CountClicks(ctx context.Context, affiliatorID uint64) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM affiliator_clicks WHERE affiliator_id = ?`, affiliatorID).Scan(&n)
	return n, err
}

// AttributeTenant links a travel to an affiliator once: a travel that already has one keeps it.
func (r *mysqlAffiliatorRepository) AttributeTenant(ctx context.Context, tenantID, affiliatorID uint64, source string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tenants SET affiliator_id = ?, affiliator_source = ?, affiliated_at = NOW()
		WHERE id = ? AND affiliator_id IS NULL`, affiliatorID, source, tenantID)
	return err
}

// TenantAffiliator returns the affiliator that brought the travel, or ErrNotFound.
func (r *mysqlAffiliatorRepository) TenantAffiliator(ctx context.Context, tenantID uint64) (*Affiliator, error) {
	return scanAffiliator(r.db.QueryRowContext(ctx, `
		SELECT `+affiliatorColumns+` FROM tenants t JOIN affiliators a ON a.id = t.affiliator_id WHERE t.id = ?`, tenantID))
}

func (r *mysqlAffiliatorRepository) ListTenants(ctx context.Context, affiliatorID uint64) ([]AffiliatorTenant, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT t.id, t.name, t.status, t.subscription_expires_at, t.affiliator_source, t.affiliated_at,
		       t.is_demo, t.current_plan_id IS NOT NULL
		FROM tenants t
		WHERE t.affiliator_id = ?
		ORDER BY t.affiliated_at DESC, t.id DESC`, affiliatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AffiliatorTenant{}
	now := time.Now()
	for rows.Next() {
		var t AffiliatorTenant
		var expires sql.NullTime
		var source sql.NullString
		var affiliatedAt sql.NullTime
		var isDemo, hasPlan bool
		if err := rows.Scan(&t.TenantID, &t.Name, &t.Status, &expires, &source, &affiliatedAt, &isDemo, &hasPlan); err != nil {
			return nil, err
		}
		if expires.Valid {
			t.SubscriptionExpiresAt = &expires.Time
		}
		// The subscription status, not tenants.status (which stays "active" after expiry): same rule
		// as the super admin list, so an expired or suspended travel is never reported as active.
		t.Status = DeriveSubscriptionStatus(isDemo, t.Status, hasPlan, t.SubscriptionExpiresAt, now)
		t.Source = source.String
		t.AffiliatedAt = affiliatedAt.Time
		out = append(out, t)
	}
	return out, rows.Err()
}

// CreateCommission returns ErrDuplicate when the payment already has a commission.
func (r *mysqlAffiliatorRepository) CreateCommission(ctx context.Context, c *AffiliatorCommission) error {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO affiliator_commissions
			(affiliator_id, tenant_id, payment_verification_id, kind, base_amount, rate, amount, available_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		c.AffiliatorID, c.TenantID, c.PaymentVerificationID, c.Kind, c.BaseAmount, c.Rate, c.Amount, c.AvailableAt)
	if err != nil {
		if isDuplicateKey(err) {
			return ErrDuplicate
		}
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	c.ID = uint64(id)
	return nil
}

func (r *mysqlAffiliatorRepository) ListCommissions(ctx context.Context, affiliatorID uint64) ([]AffiliatorCommission, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT ac.id, ac.affiliator_id, ac.tenant_id, t.name, ac.payment_verification_id, ac.kind, ac.base_amount,
			ac.rate, ac.amount, ac.available_at, ac.payout_id, ac.created_at
		FROM affiliator_commissions ac
		JOIN tenants t ON t.id = ac.tenant_id
		WHERE ac.affiliator_id = ?
		ORDER BY ac.id DESC`, affiliatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AffiliatorCommission{}
	for rows.Next() {
		var c AffiliatorCommission
		var payoutID sql.NullInt64
		if err := rows.Scan(&c.ID, &c.AffiliatorID, &c.TenantID, &c.TenantName, &c.PaymentVerificationID, &c.Kind,
			&c.BaseAmount, &c.Rate, &c.Amount, &c.AvailableAt, &payoutID, &c.CreatedAt); err != nil {
			return nil, err
		}
		if payoutID.Valid {
			v := uint64(payoutID.Int64)
			c.PayoutID = &v
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *mysqlAffiliatorRepository) Balance(ctx context.Context, affiliatorID uint64, now time.Time) (*AffiliatorBalance, error) {
	var b AffiliatorBalance
	err := r.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN ac.payout_id IS NULL AND ac.available_at > ? THEN ac.amount END), 0),
			COALESCE(SUM(CASE WHEN ac.payout_id IS NULL AND ac.available_at <= ? THEN ac.amount END), 0),
			COALESCE(SUM(CASE WHEN p.status = 'pending' THEN ac.amount END), 0),
			COALESCE(SUM(CASE WHEN p.status = 'paid' THEN ac.amount END), 0)
		FROM affiliator_commissions ac
		LEFT JOIN affiliator_payouts p ON p.id = ac.payout_id
		WHERE ac.affiliator_id = ?`, now, now, affiliatorID).
		Scan(&b.Held, &b.Available, &b.Requested, &b.Paid)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// RequestPayout moves every available commission of the affiliator into a new pending payout, in one
// transaction with the affiliator row locked so two requests cannot claim the same commissions.
// requestedByStaffID is the staff requesting on the affiliator's behalf, nil for a self-request.
func (r *mysqlAffiliatorRepository) RequestPayout(ctx context.Context, affiliatorID uint64, minAmount float64, now time.Time,
	bankName, accountNumber, accountHolder string, requestedByStaffID *uint64) (*AffiliatorPayout, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var lockedID uint64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM affiliators WHERE id = ? FOR UPDATE`, affiliatorID).Scan(&lockedID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	var pending int
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM affiliator_payouts WHERE affiliator_id = ? AND status = 'pending'`, affiliatorID).Scan(&pending); err != nil {
		return nil, err
	}
	if pending > 0 {
		return nil, ErrPayoutPending
	}
	// Lock and read the commissions with one locking (current) read, then sum and link exactly those ids:
	// with hold_days = 0 a commission approved between a plain SUM and the UPDATE used to be linked to
	// the payout (and marked paid with it) without being counted in its amount.
	rows, err := tx.QueryContext(ctx, `
		SELECT id, amount FROM affiliator_commissions
		WHERE affiliator_id = ? AND payout_id IS NULL AND available_at <= ?
		FOR UPDATE`, affiliatorID, now)
	if err != nil {
		return nil, err
	}
	var ids []any
	var cents int64
	for rows.Next() {
		var id uint64
		var amount float64
		if err := rows.Scan(&id, &amount); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
		cents += int64(math.Round(amount * 100))
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	available := float64(cents) / 100
	if len(ids) == 0 || available <= 0 || available < minAmount {
		return nil, ErrPayoutBelowMinimum
	}
	res, err := tx.ExecContext(ctx, `
		INSERT INTO affiliator_payouts (affiliator_id, amount, status, bank_name, bank_account_number, bank_account_holder,
			requested_by_staff_id)
		VALUES (?, ?, 'pending', ?, ?, ?, ?)`, affiliatorID, available, bankName, accountNumber, accountHolder, requestedByStaffID)
	if err != nil {
		return nil, err
	}
	payoutID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := append([]any{payoutID, affiliatorID}, ids...)
	res, err = tx.ExecContext(ctx, `
		UPDATE affiliator_commissions SET payout_id = ?
		WHERE affiliator_id = ? AND payout_id IS NULL AND id IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return nil, err
	} else if n != int64(len(ids)) {
		return nil, ErrStatusConflict // the locked set changed; nothing is committed
	}
	var staffName *string
	if requestedByStaffID != nil {
		var name string
		if err := tx.QueryRowContext(ctx, `SELECT name FROM staff_users WHERE id = ?`, *requestedByStaffID).Scan(&name); err != nil {
			return nil, err
		}
		staffName = &name
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &AffiliatorPayout{
		ID: uint64(payoutID), AffiliatorID: affiliatorID, Amount: available, Status: "pending",
		BankName: bankName, BankAccountNumber: accountNumber, BankAccountHolder: accountHolder,
		RequestedByStaffID: requestedByStaffID, RequestedByStaffName: staffName, CreatedAt: now,
	}, nil
}

const payoutColumns = `p.id, p.affiliator_id, a.name, p.amount, p.status, p.bank_name, p.bank_account_number,
	p.bank_account_holder, p.requested_by_staff_id, rs.name, p.rejection_reason, p.reviewed_by, p.reviewed_at, p.created_at`

func (r *mysqlAffiliatorRepository) queryPayouts(ctx context.Context, where string, args ...any) ([]AffiliatorPayout, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+payoutColumns+`
		FROM affiliator_payouts p JOIN affiliators a ON a.id = p.affiliator_id
		LEFT JOIN staff_users rs ON rs.id = p.requested_by_staff_id `+where+` ORDER BY p.id DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AffiliatorPayout{}
	for rows.Next() {
		var p AffiliatorPayout
		var reason, staffName sql.NullString
		var reviewedBy, requestedBy sql.NullInt64
		var reviewedAt sql.NullTime
		if err := rows.Scan(&p.ID, &p.AffiliatorID, &p.AffiliatorName, &p.Amount, &p.Status, &p.BankName,
			&p.BankAccountNumber, &p.BankAccountHolder, &requestedBy, &staffName, &reason, &reviewedBy, &reviewedAt,
			&p.CreatedAt); err != nil {
			return nil, err
		}
		if requestedBy.Valid {
			v := uint64(requestedBy.Int64)
			p.RequestedByStaffID = &v
			p.RequestedByStaffName = nullStringPtr(staffName)
		}
		p.RejectionReason = nullStringPtr(reason)
		if reviewedBy.Valid {
			v := uint64(reviewedBy.Int64)
			p.ReviewedBy = &v
		}
		if reviewedAt.Valid {
			p.ReviewedAt = &reviewedAt.Time
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *mysqlAffiliatorRepository) ListPayouts(ctx context.Context, affiliatorID uint64) ([]AffiliatorPayout, error) {
	return r.queryPayouts(ctx, `WHERE p.affiliator_id = ?`, affiliatorID)
}

// ListAllPayouts is for staff only (every affiliator). An empty status lists all.
func (r *mysqlAffiliatorRepository) ListAllPayouts(ctx context.Context, status string) ([]AffiliatorPayout, error) {
	if status == "" || status == "all" {
		return r.queryPayouts(ctx, ``)
	}
	return r.queryPayouts(ctx, `WHERE p.status = ?`, status)
}

func (r *mysqlAffiliatorRepository) MarkPayoutPaid(ctx context.Context, payoutID, staffUserID uint64) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE affiliator_payouts SET status = 'paid', reviewed_by = ?, reviewed_at = NOW()
		WHERE id = ? AND status = 'pending'`, staffUserID, payoutID)
	if err := execAffected(res, err); err != nil {
		if errors.Is(err, ErrNotFound) {
			return r.payoutMissingOrConflict(ctx, payoutID)
		}
		return err
	}
	return nil
}

// RejectPayout closes the payout and returns its commissions to the available balance.
func (r *mysqlAffiliatorRepository) RejectPayout(ctx context.Context, payoutID, staffUserID uint64, reason string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `
		UPDATE affiliator_payouts SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
		WHERE id = ? AND status = 'pending'`, reason, staffUserID, payoutID)
	if err := execAffected(res, err); err != nil {
		if errors.Is(err, ErrNotFound) {
			return r.payoutMissingOrConflict(ctx, payoutID)
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE affiliator_commissions SET payout_id = NULL WHERE payout_id = ?`, payoutID); err != nil {
		return err
	}
	return tx.Commit()
}

// payoutMissingOrConflict explains a conditional payout UPDATE that changed nothing: ErrNotFound for an
// id that does not exist (404), ErrStatusConflict for a payout no longer pending (409).
func (r *mysqlAffiliatorRepository) payoutMissingOrConflict(ctx context.Context, payoutID uint64) error {
	var n int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM affiliator_payouts WHERE id = ?`, payoutID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return ErrStatusConflict
}
