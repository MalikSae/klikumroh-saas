package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math"
	"math/big"
	"net"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Affiliator KlikUmroh (sprint-plan.md, keputusan pendiri 4 Okt 2026): anyone can sign up and is active
// at once; the commission is a share of each approved subscription payment of the travels they bring
// (first payment and renewals, rates from platform settings or a per-affiliator override), held for a
// few days, then paid out manually by staff.

var (
	ErrAffiliatorInvalidCredentials = errors.New("email atau kata sandi salah")
	ErrAffiliatorEmailInUse         = errors.New("email sudah terdaftar sebagai affiliator")
	ErrAffiliatorNameRequired       = errors.New("nama wajib diisi")
	ErrAffiliatorInvalidEmail       = errors.New("format email tidak valid")
	ErrAffiliatorInvalidWhatsApp    = errors.New("nomor WhatsApp tidak valid")
	ErrAffiliatorCouponFormat       = errors.New("kode kupon 4-20 karakter, hanya huruf dan angka")
	ErrAffiliatorCouponTaken        = errors.New("kode kupon sudah dipakai, pilih kode lain")
	ErrAffiliatorBankRequired       = errors.New("nama bank, nomor rekening, dan nama pemilik rekening wajib diisi")
	ErrAffiliatorBankMissing        = errors.New("lengkapi data rekening sebelum mengajukan pencairan")
	ErrAffiliatorInvalidSettings    = errors.New("nilai pengaturan affiliator tidak valid")
	ErrAffiliatorInvalidStatus      = errors.New("status affiliator tidak valid")
	ErrAffiliatorWrongPassword      = errors.New("kata sandi saat ini salah")
	// ErrAffiliatorCouponSignupOnly: affiliator coupons only discount a new travel's first payment.
	ErrAffiliatorCouponSignupOnly = errors.New("kupon affiliator hanya berlaku untuk pendaftaran travel baru")
)

// Platform settings keys (platform_settings), defaults inserted by migration 000059.
const (
	settingAffiliatorFirstRate      = "affiliator_first_rate"
	settingAffiliatorRenewalRate    = "affiliator_renewal_rate"
	settingAffiliatorCouponDiscount = "affiliator_coupon_discount"
	settingAffiliatorHoldDays       = "affiliator_hold_days"
	settingAffiliatorMinPayout      = "affiliator_min_payout"

	affiliatorSessionTTL = 30 * 24 * time.Hour
)

var affiliatorCouponPattern = regexp.MustCompile(`^[A-Z0-9]{4,20}$`)

// AffiliatorSettings are the platform-wide affiliator program values set by staff.
type AffiliatorSettings struct {
	FirstRate      float64 `json:"first_rate"`
	RenewalRate    float64 `json:"renewal_rate"`
	CouponDiscount float64 `json:"coupon_discount"`
	HoldDays       int     `json:"hold_days"`
	MinPayout      float64 `json:"min_payout"`
}

// AffiliatorRegisterRequest is the public signup form.
type AffiliatorRegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	WhatsApp string `json:"whatsapp,omitempty"`
	// ClientIP is set by the handler (never from the body), for the self-referral guard.
	ClientIP string `json:"-"`
}

// AffiliatorBankRequest is the payout account.
type AffiliatorBankRequest struct {
	BankName          string `json:"bank_name"`
	BankAccountNumber string `json:"bank_account_number"`
	BankAccountHolder string `json:"bank_account_holder"`
}

// AffiliatorLoginResult is returned by register and login.
type AffiliatorLoginResult struct {
	Token      string                 `json:"token"`
	ExpiresAt  time.Time              `json:"expires_at"`
	Affiliator *repository.Affiliator `json:"affiliator"`
}

// AffiliatorOverview is the portal home: who I am, my link and coupon, and my numbers.
type AffiliatorOverview struct {
	Affiliator     *repository.Affiliator        `json:"affiliator"`
	CouponCode     *string                       `json:"coupon_code"`
	CouponDiscount float64                       `json:"coupon_discount"`
	FirstRate      float64                       `json:"first_rate"`
	RenewalRate    float64                       `json:"renewal_rate"`
	HoldDays       int                           `json:"hold_days"`
	MinPayout      float64                       `json:"min_payout"`
	Clicks         int                           `json:"clicks"`
	TenantCount    int                           `json:"tenant_count"`
	ActiveTenants  int                           `json:"active_tenants"`
	Balance        *repository.AffiliatorBalance `json:"balance"`
}

// AffiliatorDetail is the staff view of one affiliator.
type AffiliatorDetail struct {
	AffiliatorOverview
	Tenants     []repository.AffiliatorTenant     `json:"tenants"`
	Commissions []repository.AffiliatorCommission `json:"commissions"`
	Payouts     []repository.AffiliatorPayout     `json:"payouts"`
}

// AffiliatorCommissionRecorder is called when staff approve a subscription payment.
type AffiliatorCommissionRecorder interface {
	RecordCommission(ctx context.Context, pv *repository.PaymentVerification, approvedAt time.Time)
	// IsAffiliatorActive tells payment approval whether an inactive affiliator coupon was merely replaced
	// (affiliator still active: honored) or switched off with its affiliator (refused).
	IsAffiliatorActive(ctx context.Context, affiliatorID uint64) (bool, error)
	// TenantAffiliatorID is the affiliator the travel signed up through (nil when none): only that
	// affiliator's coupon may discount the travel's first payment.
	TenantAffiliatorID(ctx context.Context, tenantID uint64) (*uint64, error)
}

// AffiliatorAttributor links a newly signed-up travel to the affiliator that brought it.
type AffiliatorAttributor interface {
	AttributeSignup(ctx context.Context, tenantID uint64, couponCode, linkCode, adminEmail, adminWhatsApp, signupIP string)
}

// AffiliatorService is the business logic of the Affiliator KlikUmroh program.
type AffiliatorService interface {
	AffiliatorCommissionRecorder
	AffiliatorAttributor

	Register(ctx context.Context, req AffiliatorRegisterRequest) (*AffiliatorLoginResult, error)
	Login(ctx context.Context, email, password, clientIP string) (*AffiliatorLoginResult, error)
	Logout(ctx context.Context, token string) error
	ChangePassword(ctx context.Context, affiliatorID uint64, currentToken, currentPassword, newPassword string) error
	Overview(ctx context.Context, affiliatorID uint64) (*AffiliatorOverview, error)
	SetCoupon(ctx context.Context, affiliatorID uint64, code string) (*repository.Coupon, error)
	UpdateBank(ctx context.Context, affiliatorID uint64, req AffiliatorBankRequest) error
	ListTenants(ctx context.Context, affiliatorID uint64) ([]repository.AffiliatorTenant, error)
	ListCommissions(ctx context.Context, affiliatorID uint64) ([]repository.AffiliatorCommission, error)
	ListPayouts(ctx context.Context, affiliatorID uint64) ([]repository.AffiliatorPayout, error)
	RequestPayout(ctx context.Context, affiliatorID uint64) (*repository.AffiliatorPayout, error)
	RecordClick(ctx context.Context, linkCode, ip string) error

	// Staff
	GetSettings(ctx context.Context) (*AffiliatorSettings, error)
	UpdateSettings(ctx context.Context, s AffiliatorSettings) (*AffiliatorSettings, error)
	ListAffiliators(ctx context.Context) ([]repository.AffiliatorListItem, error)
	GetDetail(ctx context.Context, affiliatorID uint64) (*AffiliatorDetail, error)
	SetStatus(ctx context.Context, affiliatorID uint64, status string) error
	SetRates(ctx context.Context, affiliatorID uint64, firstRate, renewalRate *float64) error
	ResetPassword(ctx context.Context, affiliatorID uint64, newPassword string, staffUserID uint64) error
	ListAllPayouts(ctx context.Context, status string) ([]repository.AffiliatorPayout, error)
	MarkPayoutPaid(ctx context.Context, payoutID, staffUserID uint64) error
	RejectPayout(ctx context.Context, payoutID, staffUserID uint64, reason string) error
}

type affiliatorService struct {
	repo     repository.AffiliatorRepository
	coupons  repository.CouponRepository
	pvRepo   repository.PaymentVerificationRepository
	settings repository.PlatformSettingsRepository
	now      func() time.Time
}

// NewAffiliatorService creates the Affiliator KlikUmroh service.
func NewAffiliatorService(
	repo repository.AffiliatorRepository,
	coupons repository.CouponRepository,
	pvRepo repository.PaymentVerificationRepository,
	settings repository.PlatformSettingsRepository,
) AffiliatorService {
	return &affiliatorService{repo: repo, coupons: coupons, pvRepo: pvRepo, settings: settings, now: time.Now}
}

func (s *affiliatorService) GetSettings(ctx context.Context) (*AffiliatorSettings, error) {
	all, err := s.settings.GetAll(ctx)
	if err != nil {
		return nil, err
	}
	num := func(key string, def float64) float64 {
		if v, err := strconv.ParseFloat(strings.TrimSpace(all[key]), 64); err == nil {
			return v
		}
		return def
	}
	return &AffiliatorSettings{
		FirstRate:      num(settingAffiliatorFirstRate, 30),
		RenewalRate:    num(settingAffiliatorRenewalRate, 10),
		CouponDiscount: num(settingAffiliatorCouponDiscount, 20),
		HoldDays:       int(num(settingAffiliatorHoldDays, 14)),
		MinPayout:      num(settingAffiliatorMinPayout, 100000),
	}, nil
}

func validRate(v float64) bool { return v >= 0 && v <= 100 }

func (s *affiliatorService) UpdateSettings(ctx context.Context, in AffiliatorSettings) (*AffiliatorSettings, error) {
	if !validRate(in.FirstRate) || !validRate(in.RenewalRate) || in.CouponDiscount <= 0 || in.CouponDiscount > 100 ||
		in.HoldDays < 0 || in.HoldDays > 365 || in.MinPayout < 0 {
		return nil, ErrAffiliatorInvalidSettings
	}
	format := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	if err := s.settings.SetMany(ctx, map[string]string{
		settingAffiliatorFirstRate:      format(in.FirstRate),
		settingAffiliatorRenewalRate:    format(in.RenewalRate),
		settingAffiliatorCouponDiscount: format(in.CouponDiscount),
		settingAffiliatorHoldDays:       strconv.Itoa(in.HoldDays),
		settingAffiliatorMinPayout:      format(in.MinPayout),
	}); err != nil {
		return nil, err
	}
	// The coupon discount is the same for every affiliator: apply the new value to existing coupons too.
	if err := s.repo.SetCouponDiscount(ctx, in.CouponDiscount); err != nil {
		return nil, err
	}
	return s.GetSettings(ctx)
}

const linkCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I: easy to read aloud

func newLinkCode() (string, error) {
	b := make([]byte, 8)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(linkCodeAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = linkCodeAlphabet[n.Int64()]
	}
	return string(b), nil
}

func (s *affiliatorService) Register(ctx context.Context, req AffiliatorRegisterRequest) (*AffiliatorLoginResult, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, ErrAffiliatorNameRequired
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		return nil, ErrAffiliatorInvalidEmail
	}
	if len(req.Password) < 8 {
		return nil, ErrPasswordTooShort
	}
	var wa *string
	if raw := strings.TrimSpace(req.WhatsApp); raw != "" {
		n := util.NormalizePhoneToWhatsApp(raw)
		if len(n) < 10 || len(n) > 16 || !strings.HasPrefix(n, "62") {
			return nil, ErrAffiliatorInvalidWhatsApp
		}
		wa = &n
	}
	if existing, err := s.repo.FindByEmail(ctx, email); err == nil && existing != nil {
		return nil, ErrAffiliatorEmailInUse
	} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	a := &repository.Affiliator{Name: name, Email: email, PasswordHash: string(hash), WhatsApp: wa, Status: "active"}
	// The link code is random; retry on the rare collision. A duplicate email (lost race) is reported as such.
	for attempt := 0; ; attempt++ {
		if a.LinkCode, err = newLinkCode(); err != nil {
			return nil, err
		}
		err = s.repo.Create(ctx, a)
		if err == nil {
			break
		}
		if !errors.Is(err, repository.ErrDuplicate) {
			return nil, err
		}
		if existing, findErr := s.repo.FindByEmail(ctx, email); findErr == nil && existing != nil {
			return nil, ErrAffiliatorEmailInUse
		}
		if attempt >= 4 {
			return nil, err
		}
	}
	return s.startSession(ctx, a, req.ClientIP)
}

func (s *affiliatorService) startSession(ctx context.Context, a *repository.Affiliator, clientIP string) (*AffiliatorLoginResult, error) {
	if guardableIP(clientIP) {
		// Logged, never blocks the login: a missing row only weakens the self-referral guard.
		if err := s.repo.RecordLogin(ctx, a.ID, clientIP); err != nil {
			log.Printf("[Affiliator] %d: cannot record login IP: %v", a.ID, err)
		}
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	session := &repository.AffiliatorSession{
		AffiliatorID: a.ID,
		Token:        hex.EncodeToString(b),
		ExpiresAt:    s.now().Add(affiliatorSessionTTL),
	}
	if err := s.repo.CreateSession(ctx, session); err != nil {
		return nil, err
	}
	return &AffiliatorLoginResult{Token: session.Token, ExpiresAt: session.ExpiresAt, Affiliator: a}, nil
}

func (s *affiliatorService) Login(ctx context.Context, email, password, clientIP string) (*AffiliatorLoginResult, error) {
	a, err := s.repo.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrAffiliatorInvalidCredentials
		}
		return nil, err
	}
	// Same error for a wrong password and an inactive account: no hint about which accounts exist.
	if bcrypt.CompareHashAndPassword([]byte(a.PasswordHash), []byte(password)) != nil || a.Status != "active" {
		return nil, ErrAffiliatorInvalidCredentials
	}
	return s.startSession(ctx, a, clientIP)
}

func (s *affiliatorService) Logout(ctx context.Context, token string) error {
	if strings.TrimSpace(token) == "" {
		return nil
	}
	return s.repo.DeleteSession(ctx, token)
}

// ChangePassword: the affiliator changes its own password (current one required). Other sessions end;
// the one making the change stays signed in.
func (s *affiliatorService) ChangePassword(ctx context.Context, affiliatorID uint64, currentToken, currentPassword, newPassword string) error {
	a, err := s.repo.GetByID(ctx, affiliatorID)
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(a.PasswordHash), []byte(currentPassword)) != nil {
		return ErrAffiliatorWrongPassword
	}
	if len(newPassword) < 8 {
		return ErrPasswordTooShort
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.repo.SetPassword(ctx, affiliatorID, string(hash)); err != nil {
		return err
	}
	return s.repo.DeleteOtherSessions(ctx, affiliatorID, currentToken)
}

// effectiveRates are the affiliator's override, else the platform defaults.
func effectiveRates(a *repository.Affiliator, st *AffiliatorSettings) (first, renewal float64) {
	first, renewal = st.FirstRate, st.RenewalRate
	if a.FirstRate != nil {
		first = *a.FirstRate
	}
	if a.RenewalRate != nil {
		renewal = *a.RenewalRate
	}
	return first, renewal
}

func (s *affiliatorService) Overview(ctx context.Context, affiliatorID uint64) (*AffiliatorOverview, error) {
	a, err := s.repo.GetByID(ctx, affiliatorID)
	if err != nil {
		return nil, err
	}
	st, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	o := &AffiliatorOverview{
		Affiliator:     a,
		CouponDiscount: st.CouponDiscount,
		HoldDays:       st.HoldDays,
		MinPayout:      st.MinPayout,
	}
	o.FirstRate, o.RenewalRate = effectiveRates(a, st)
	if c, err := s.repo.ActiveCoupon(ctx, affiliatorID); err == nil {
		o.CouponCode = &c.Code
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	}
	if o.Clicks, err = s.repo.CountClicks(ctx, affiliatorID); err != nil {
		return nil, err
	}
	tenants, err := s.repo.ListTenants(ctx, affiliatorID)
	if err != nil {
		return nil, err
	}
	o.TenantCount = len(tenants)
	for _, t := range tenants {
		if t.Status == "active" {
			o.ActiveTenants++
		}
	}
	if o.Balance, err = s.repo.Balance(ctx, affiliatorID, s.now()); err != nil {
		return nil, err
	}
	return o, nil
}

func (s *affiliatorService) SetCoupon(ctx context.Context, affiliatorID uint64, code string) (*repository.Coupon, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if !affiliatorCouponPattern.MatchString(code) {
		return nil, ErrAffiliatorCouponFormat
	}
	if current, err := s.repo.ActiveCoupon(ctx, affiliatorID); err == nil && current.Code == code {
		return current, nil
	}
	st, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	c, err := s.repo.ReplaceCoupon(ctx, affiliatorID, code, st.CouponDiscount)
	if errors.Is(err, repository.ErrDuplicate) {
		return nil, ErrAffiliatorCouponTaken
	}
	return c, err
}

func (s *affiliatorService) UpdateBank(ctx context.Context, affiliatorID uint64, req AffiliatorBankRequest) error {
	bank, num, holder := strings.TrimSpace(req.BankName), strings.TrimSpace(req.BankAccountNumber), strings.TrimSpace(req.BankAccountHolder)
	if bank == "" || num == "" || holder == "" {
		return ErrAffiliatorBankRequired
	}
	return s.repo.UpdateBank(ctx, affiliatorID, bank, num, holder)
}

func (s *affiliatorService) ListTenants(ctx context.Context, affiliatorID uint64) ([]repository.AffiliatorTenant, error) {
	return s.repo.ListTenants(ctx, affiliatorID)
}

func (s *affiliatorService) ListCommissions(ctx context.Context, affiliatorID uint64) ([]repository.AffiliatorCommission, error) {
	return s.repo.ListCommissions(ctx, affiliatorID)
}

func (s *affiliatorService) ListPayouts(ctx context.Context, affiliatorID uint64) ([]repository.AffiliatorPayout, error) {
	return s.repo.ListPayouts(ctx, affiliatorID)
}

func (s *affiliatorService) RequestPayout(ctx context.Context, affiliatorID uint64) (*repository.AffiliatorPayout, error) {
	a, err := s.repo.GetByID(ctx, affiliatorID)
	if err != nil {
		return nil, err
	}
	if a.BankName == nil || a.BankAccountNumber == nil || a.BankAccountHolder == nil ||
		*a.BankName == "" || *a.BankAccountNumber == "" || *a.BankAccountHolder == "" {
		return nil, ErrAffiliatorBankMissing
	}
	st, err := s.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return s.repo.RequestPayout(ctx, affiliatorID, st.MinPayout, s.now(), *a.BankName, *a.BankAccountNumber, *a.BankAccountHolder)
}

// RecordClick logs a click on an active affiliator's link. Unknown codes are ignored.
func (s *affiliatorService) RecordClick(ctx context.Context, linkCode, ip string) error {
	a, err := s.repo.FindActiveByLinkCode(ctx, linkCode)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return err
	}
	return s.repo.RecordClick(ctx, a.ID, ip)
}

// selfReferralIPWindowDays is how far back an affiliator's login IPs count against a travel signup.
const selfReferralIPWindowDays = 30

// guardableIP reports whether an IP can be used for the self-referral guard. Loopback and unspecified
// addresses are what every request shows when the proxy does not forward the visitor IP (or in local
// dev); matching on them would refuse every attribution, so they are ignored.
func guardableIP(ip string) bool {
	parsed := net.ParseIP(strings.TrimSpace(ip))
	return parsed != nil && !parsed.IsLoopback() && !parsed.IsUnspecified()
}

// AttributeSignup: the coupon wins over the link (keputusan pendiri). An affiliator never gets credit
// for a travel registered with its own email or WhatsApp, or signed up from an IP the affiliator itself
// registered or logged in from in the last 30 days (keputusan pendiri 4 Okt 2026: block, accepting that a
// shared network can refuse a genuine referral). The coupon discount still applies; only the attribution,
// and so the commission, is refused. Failures are logged, never block the signup.
func (s *affiliatorService) AttributeSignup(ctx context.Context, tenantID uint64, couponCode, linkCode, adminEmail, adminWhatsApp, signupIP string) {
	var a *repository.Affiliator
	source := ""
	if code := strings.TrimSpace(couponCode); code != "" {
		if c, err := s.coupons.FindByCode(ctx, code); err == nil && c.AffiliatorID != nil {
			if found, err := s.repo.GetByID(ctx, *c.AffiliatorID); err == nil {
				a, source = found, "coupon"
			}
		}
	}
	if a == nil && strings.TrimSpace(linkCode) != "" {
		if found, err := s.repo.FindActiveByLinkCode(ctx, linkCode); err == nil {
			a, source = found, "link"
		}
	}
	if a == nil || a.Status != "active" {
		return
	}
	if strings.EqualFold(strings.TrimSpace(adminEmail), a.Email) {
		return
	}
	if a.WhatsApp != nil && strings.TrimSpace(adminWhatsApp) != "" &&
		util.NormalizePhoneToWhatsApp(adminWhatsApp) == *a.WhatsApp {
		return
	}
	if guardableIP(signupIP) {
		same, err := s.repo.HasLoginFromIP(ctx, a.ID, strings.TrimSpace(signupIP), selfReferralIPWindowDays)
		if err != nil {
			// Fail closed: without the check the travel could be the affiliator's own.
			log.Printf("[Affiliator] tenant %d: cannot check self-referral IP for affiliator %d, not attributed: %v", tenantID, a.ID, err)
			return
		}
		if same {
			log.Printf("[Affiliator] tenant %d: signup IP matches a login of affiliator %d, not attributed (self-referral guard)", tenantID, a.ID)
			return
		}
	}
	if err := s.repo.AttributeTenant(ctx, tenantID, a.ID, source); err != nil {
		log.Printf("[Affiliator] tenant %d: cannot attribute to affiliator %d: %v", tenantID, a.ID, err)
	}
}

// RecordCommission creates the commission of an approved payment, once (UNIQUE per payment). The base
// is the transfer without the unique code (the bill after discount). The first approved payment of the
// travel uses the first-payment rate, later ones the renewal rate. Errors are logged: the approval and
// the travel's activation never fail because of the affiliate program.
func (s *affiliatorService) IsAffiliatorActive(ctx context.Context, affiliatorID uint64) (bool, error) {
	a, err := s.repo.GetByID(ctx, affiliatorID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return a.Status == "active", nil
}

func (s *affiliatorService) TenantAffiliatorID(ctx context.Context, tenantID uint64) (*uint64, error) {
	a, err := s.repo.TenantAffiliator(ctx, tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil
		}
		return nil, err
	}
	id := a.ID
	return &id, nil
}

func (s *affiliatorService) RecordCommission(ctx context.Context, pv *repository.PaymentVerification, approvedAt time.Time) {
	a, err := s.repo.TenantAffiliator(ctx, pv.TenantID)
	if err != nil {
		if !errors.Is(err, repository.ErrNotFound) {
			log.Printf("[Affiliator] payment %d: cannot read affiliator: %v", pv.ID, err)
		}
		return
	}
	if a.Status != "active" {
		return
	}
	base := pv.FinalAmount - float64(pv.UniqueCode)
	if base <= 0 {
		return
	}
	st, err := s.GetSettings(ctx)
	if err != nil {
		log.Printf("[Affiliator] payment %d: cannot read settings: %v", pv.ID, err)
		return
	}
	kind := "first"
	history, err := s.pvRepo.ListByTenant(ctx, pv.TenantID)
	if err != nil {
		log.Printf("[Affiliator] payment %d: cannot read payment history: %v", pv.ID, err)
		return
	}
	for _, h := range history {
		if h.ID != pv.ID && h.Status == "approved" {
			kind = "renewal"
			break
		}
	}
	firstRate, renewalRate := effectiveRates(a, st)
	rate := firstRate
	if kind == "renewal" {
		rate = renewalRate
	}
	amount := math.Round(base * rate / 100)
	if amount <= 0 {
		return
	}
	c := &repository.AffiliatorCommission{
		AffiliatorID:          a.ID,
		TenantID:              pv.TenantID,
		PaymentVerificationID: pv.ID,
		Kind:                  kind,
		BaseAmount:            base,
		Rate:                  rate,
		Amount:                amount,
		AvailableAt:           approvedAt.AddDate(0, 0, st.HoldDays),
	}
	if err := s.repo.CreateCommission(ctx, c); err != nil && !errors.Is(err, repository.ErrDuplicate) {
		log.Printf("[Affiliator] payment %d: cannot record commission for affiliator %d: %v", pv.ID, a.ID, err)
	}
}

func (s *affiliatorService) ListAffiliators(ctx context.Context) ([]repository.AffiliatorListItem, error) {
	return s.repo.List(ctx)
}

func (s *affiliatorService) GetDetail(ctx context.Context, affiliatorID uint64) (*AffiliatorDetail, error) {
	o, err := s.Overview(ctx, affiliatorID)
	if err != nil {
		return nil, err
	}
	d := &AffiliatorDetail{AffiliatorOverview: *o}
	if d.Tenants, err = s.repo.ListTenants(ctx, affiliatorID); err != nil {
		return nil, err
	}
	if d.Commissions, err = s.repo.ListCommissions(ctx, affiliatorID); err != nil {
		return nil, err
	}
	if d.Payouts, err = s.repo.ListPayouts(ctx, affiliatorID); err != nil {
		return nil, err
	}
	return d, nil
}

// SetStatus: an inactive affiliator cannot log in, its coupon stops working, and it earns no new
// commissions. Commissions already recorded stay payable by staff.
func (s *affiliatorService) SetStatus(ctx context.Context, affiliatorID uint64, status string) error {
	if status != "active" && status != "inactive" {
		return ErrAffiliatorInvalidStatus
	}
	if err := s.repo.SetStatus(ctx, affiliatorID, status); err != nil {
		return err
	}
	if status == "inactive" {
		return s.repo.DeactivateCoupons(ctx, affiliatorID)
	}
	return nil
}

func (s *affiliatorService) SetRates(ctx context.Context, affiliatorID uint64, firstRate, renewalRate *float64) error {
	if (firstRate != nil && !validRate(*firstRate)) || (renewalRate != nil && !validRate(*renewalRate)) {
		return fmt.Errorf("%w: persen komisi 0-100", ErrAffiliatorInvalidSettings)
	}
	return s.repo.SetRates(ctx, affiliatorID, firstRate, renewalRate)
}

// ResetPassword is done by staff for an affiliator who forgot its password: the new password is set and
// every existing session is ended. The password itself is never logged.
func (s *affiliatorService) ResetPassword(ctx context.Context, affiliatorID uint64, newPassword string, staffUserID uint64) error {
	if len(newPassword) < 8 {
		return ErrPasswordTooShort
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.repo.SetPassword(ctx, affiliatorID, string(hash)); err != nil {
		return err
	}
	if err := s.repo.DeleteSessionsByAffiliator(ctx, affiliatorID); err != nil {
		return err
	}
	log.Printf("[Affiliator] staff %d reset the password of affiliator %d", staffUserID, affiliatorID)
	return nil
}

func (s *affiliatorService) ListAllPayouts(ctx context.Context, status string) ([]repository.AffiliatorPayout, error) {
	return s.repo.ListAllPayouts(ctx, status)
}

func (s *affiliatorService) MarkPayoutPaid(ctx context.Context, payoutID, staffUserID uint64) error {
	return s.repo.MarkPayoutPaid(ctx, payoutID, staffUserID)
}

func (s *affiliatorService) RejectPayout(ctx context.Context, payoutID, staffUserID uint64, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return ErrRejectionReasonRequired
	}
	return s.repo.RejectPayout(ctx, payoutID, staffUserID, reason)
}
