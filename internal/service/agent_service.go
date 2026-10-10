package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math"
	"net/mail"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// MinAgentPasswordLength applies to sign-up, password change and admin reset alike.
const MinAgentPasswordLength = 8

// ErrReferralAgentNotActive: the referral code given at sign-up belongs to an agent of this travel that is
// not active (pending, rejected or deactivated).
var ErrReferralAgentNotActive = errors.New("kode referral pengajak sudah tidak aktif. Kosongkan kolom kode referral untuk mendaftar tanpa pengajak, atau minta kode dari agen lain")

var (
	ErrTermsRequired       = errors.New("Syarat & Ketentuan wajib disetujui")
	ErrInvalidPaymentState = errors.New("hanya agen dengan status menunggu bukti transfer yang dapat mengunggah bukti pembayaran")
	ErrMissingBankInfo     = errors.New("informasi rekening bank (nama bank, nomor rekening, nama pemilik) wajib diisi untuk mode pendaftaran berbayar")
	ErrAgentNotActive      = errors.New("Akun belum aktif")
	// ErrAgentPhoneRequired: the agent's WhatsApp number cannot be emptied from the admin edit.
	ErrAgentPhoneRequired = errors.New("nomor WhatsApp agen wajib diisi")
	// ErrInvalidAgentPhone: the agent's WhatsApp number must be a valid Indonesian number (same rule as
	// prospects). Without this, "abc" normalized to "" was stored and blocked the next invalid one as a
	// "duplicate".
	ErrInvalidAgentPhone = errors.New("nomor WhatsApp agen tidak valid, gunakan format 08xx atau 62xx")
	// ErrAgentEmailRequired: the agent's email (its login) cannot be emptied from the admin edit.
	ErrAgentEmailRequired = errors.New("email agen wajib diisi (dipakai agen untuk login)")
	// ErrInvalidAgentEmail: the sign-up email is not a single valid address (or longer than the column).
	ErrInvalidAgentEmail = errors.New("format email tidak valid")
	// ErrAgentRegistrationClosed: the travel's subscription is pending or suspended.
	ErrAgentRegistrationClosed = errors.New("pendaftaran agen sementara tidak dibuka karena layanan travel belum aktif atau sedang ditangguhkan")
	// ErrAgentPasswordTooShort: one rule for sign-up, password change and admin reset.
	ErrAgentPasswordTooShort = errors.New("password minimal 8 karakter")
	ErrInvalidPeriodRange    = errors.New("target_period_end harus setelah target_period_start")
	// ErrAgentApproveState / ErrAgentRejectState: approve/reject only apply to a registration under review.
	ErrAgentApproveState = errors.New("hanya pendaftaran agen yang menunggu persetujuan atau pernah ditolak yang dapat disetujui")
	ErrAgentRejectState  = errors.New("hanya pendaftaran agen yang menunggu persetujuan yang dapat ditolak; agen aktif dinonaktifkan lewat tombol Nonaktifkan")
	// ErrAgentDomisiliTooLong / ErrAgentNameTooLong: column limits (agents.domisili VARCHAR(150),
	// agents.name VARCHAR(255)), refused with a readable message instead of a raw MySQL error.
	ErrAgentDomisiliTooLong = fmt.Errorf("domisili maksimal %d karakter", maxAgentDomisiliLength)
	ErrAgentNameTooLong     = fmt.Errorf("nama agen maksimal %d karakter", maxAgentNameLength)
	// Admin actions on an agent (ToggleAgentStatus, UpdateTargetSettings): client errors answered 400.
	ErrAgentDeactivateState  = errors.New("hanya agen dengan status aktif yang dapat dinonaktifkan")
	ErrAgentActivateState    = errors.New("hanya agen dengan status nonaktif yang dapat diaktifkan kembali")
	ErrInvalidAgentAction    = errors.New("aksi tidak valid, gunakan 'activate' atau 'deactivate'")
	ErrInvalidTargetDateForm = errors.New("format tanggal harus YYYY-MM-DD")
)

const (
	maxAgentDomisiliLength = 150
	maxAgentNameLength     = 255
)

// validateAgentProfileLengths refuses values longer than their column.
// ErrAgentFieldTooLong: a profile field is longer than its column; the message names the field.
type agentFieldTooLongError struct{ msg string }

func (e *agentFieldTooLongError) Error() string { return e.msg }

// ErrAgentFieldTooLong matches every agentFieldTooLongError with errors.Is.
var ErrAgentFieldTooLong = errors.New("data agen terlalu panjang")

func (e *agentFieldTooLongError) Is(target error) bool { return target == ErrAgentFieldTooLong }

// validateAgentContactFields checks a submitted (non-blank) email like Register does, and the email and
// bank fields against their column sizes (email 255, bank 100, account number 50, holder 150), so bad
// input is a 400 instead of a database error or an unusable login.
func validateAgentContactFields(email, bankName, accountNumber, accountHolder *string) error {
	if email != nil {
		if e := strings.TrimSpace(*email); e != "" {
			if len(e) > 255 {
				return &agentFieldTooLongError{"email maksimal 255 karakter"}
			}
			if addr, err := mail.ParseAddress(e); err != nil || addr.Address != e {
				return ErrInvalidAgentEmail
			}
		}
	}
	limits := []struct {
		v   *string
		max int
		msg string
	}{
		{bankName, 100, "nama bank maksimal 100 karakter"},
		{accountNumber, 50, "nomor rekening maksimal 50 karakter"},
		{accountHolder, 150, "nama pemilik rekening maksimal 150 karakter"},
	}
	for _, l := range limits {
		if l.v != nil && utf8.RuneCountInString(strings.TrimSpace(*l.v)) > l.max {
			return &agentFieldTooLongError{l.msg}
		}
	}
	return nil
}

func validateAgentProfileLengths(name, domisili *string) error {
	if name != nil && utf8.RuneCountInString(strings.TrimSpace(*name)) > maxAgentNameLength {
		return ErrAgentNameTooLong
	}
	if domisili != nil && utf8.RuneCountInString(strings.TrimSpace(*domisili)) > maxAgentDomisiliLength {
		return ErrAgentDomisiliTooLong
	}
	return nil
}

// phoneChanged reports whether a submitted phone differs from the stored one after normalization. Only a
// changed number is validated, so a legacy agent whose stored number fails today's rule can still have
// the other fields edited (the clients always resend the phone).
func phoneChanged(submitted string, stored *string) bool {
	if stored == nil {
		return true
	}
	return util.NormalizePhoneToWhatsApp(submitted) != util.NormalizePhoneToWhatsApp(*stored)
}

// PublicConsultant is what a visitor who arrived through an agent's referral link sees of that agent
// (called "konsultan" on public pages). Only public-facing fields: no phone, email, bank or status. The
// visitor reaches the agent through the interest form, which then opens WhatsApp with them.
type PublicConsultant struct {
	Name         string  `json:"name"`
	PhotoURL     *string `json:"photo_url"`
	ReferralCode string  `json:"referral_code"`
}

type AgentRegistrationInfo struct {
	TenantName             string   `json:"tenant_name"`
	BrandPrimaryColor      *string  `json:"brand_primary_color"`
	BrandLogoURL           *string  `json:"brand_logo_url"`
	Mode                   string   `json:"mode"` // "gratis" | "berbayar"
	RegistrationFee        *float64 `json:"registration_fee"`
	AgentRegistrationFee   *float64 `json:"agent_registration_fee"`
	RegistrationBenefits   *string  `json:"registration_benefits"`
	HasTermsConditions     bool     `json:"has_terms_conditions"`
	TermsConditions        *string  `json:"terms_conditions"`
	AgentRegistrationTerms *string  `json:"agent_registration_terms"`
	AgentBankName          *string  `json:"agent_bank_name"`
	AgentBankAccountNumber *string  `json:"agent_bank_account_number"`
	AgentBankAccountHolder *string  `json:"agent_bank_account_holder"`
	AgentPosterURL         *string  `json:"agent_poster_url"`
}

type RegisterAgentRequest struct {
	Name          string  `json:"name"`
	Phone         string  `json:"phone"`
	Email         string  `json:"email"`
	Domisili      string  `json:"domisili"`
	Password      string  `json:"password"`
	TermsAccepted bool    `json:"terms_accepted"`
	ReferralCode  *string `json:"referral_code"`
	// ReferralFromLink is true when the code came from an agent's link (cookie or the link's ?ref=), not from
	// something the applicant typed. Such a code is not the applicant's mistake when its agent is no longer
	// active, so the sign-up goes on without an upline instead of failing with an error they cannot fix.
	ReferralFromLink bool `json:"referral_from_link"`
}

type AgentPaymentInfo struct {
	RegistrationFee   *float64 `json:"registration_fee"`
	BankAccountName   *string  `json:"bank_name"`
	BankAccountNumber *string  `json:"bank_account_number"`
	BankAccountHolder *string  `json:"bank_account_holder"`
}

type AgentProfileResult struct {
	// TravelSuspended: the travel's subscription lapsed past the grace period; writes are blocked.
	TravelSuspended   bool              `json:"travel_suspended"`
	ID                uint64            `json:"id"`
	TenantID          uint64            `json:"tenant_id"`
	Name              string            `json:"name"`
	Phone             *string           `json:"phone"`
	Email             *string           `json:"email"`
	Domisili          *string           `json:"domisili"`
	PhotoURL          *string           `json:"photo_url"`
	BankName          *string           `json:"bank_name"`
	BankAccountNumber *string           `json:"bank_account_number"`
	BankAccountHolder *string           `json:"bank_account_holder"`
	Status            string            `json:"status"`
	PaymentStatus     string            `json:"payment_status"`
	PaymentProofURL   *string           `json:"payment_proof_url"`
	RejectionReason   *string           `json:"rejection_reason,omitempty"`
	ReferralCode      string            `json:"referral_code"`
	TenantName        string            `json:"tenant_name,omitempty"`
	PaymentInfo       *AgentPaymentInfo `json:"payment_info,omitempty"`
	CreatedAt         time.Time         `json:"created_at"`
}

type AgentAuthResult struct {
	Token     string              `json:"token"`
	ExpiresAt time.Time           `json:"expires_at"`
	Agent     *AgentProfileResult `json:"agent"`
}

type LeaderboardPreview struct {
	RankSaya  int `json:"rank_saya"`
	TotalAgen int `json:"total_agen"`
}

type TargetBulanan struct {
	TargetJamaah   int    `json:"target_jamaah"`
	ProgressJamaah int    `json:"progress_jamaah"`
	PeriodLabel    string `json:"period_label"`
}

type AgentDashboardSummary struct {
	Name          string  `json:"name"`
	SaldoSiapCair float64 `json:"saldo_siap_cair"`
	SaldoTertunda float64 `json:"saldo_tertunda"`
	// SaldoTertahan: komisi dari jamaah yang sudah closing (DP) tapi belum ditandai lunas.
	SaldoTertahan float64 `json:"saldo_tertahan"`
	// TotalKomisi: commission from paid-off jamaah (released), before withdrawals. Held commission is not counted.
	TotalKomisi         float64                       `json:"total_komisi"`
	JamaahTertundaCount int                           `json:"jamaah_tertunda_count"`
	TargetBulanan       *TargetBulanan                `json:"target_bulanan"`
	Targets             []AgentTargetView             `json:"targets"`
	MinimumPayoutAmount *float64                      `json:"minimum_payout_amount"`
	ReferralLink        string                        `json:"referral_link"`
	RecruitLink         string                        `json:"recruit_link"` // agent sign-up page with ?ref=<code>: the friend is linked to this agent as upline
	FunnelRingkasan     repository.AgentFunnelSummary `json:"funnel_ringkasan"`
	LeaderboardPreview  LeaderboardPreview            `json:"leaderboard_preview"`
	PhotoURL            *string                       `json:"photo_url"`
	TotalClicks         int                           `json:"total_clicks"`
	TenantName          string                        `json:"tenant_name,omitempty"`
	// TravelSuspended: the travel's subscription lapsed past the grace period; the portal is read-only.
	TravelSuspended bool `json:"travel_suspended"`
}

type LeaderboardEntry struct {
	// Rank: tied agents share a rank (1, 1, 3); 0 means no rank (no closed jamaah in the period).
	Rank               int    `json:"rank"`
	Name               string `json:"name"`
	TotalJamaahClosing int    `json:"total_jamaah_closing"`
	IsMe               bool   `json:"is_me"`
	// PhotoURL is the agent's profile photo (shown on the podium); nil when the agent has none.
	PhotoURL *string `json:"photo_url"`
	// HabitBadge is the agent's highest habit streak badge in days (7, 30, 100); 0 when none.
	HabitBadge int `json:"habit_badge"`
}

type AgentPayoutInfoResponse struct {
	SaldoTersedia       float64                             `json:"saldo_tersedia"`
	MinimumPayoutAmount *float64                            `json:"minimum_payout_amount"`
	BankName            *string                             `json:"bank_name"`
	BankAccountNumber   *string                             `json:"bank_account_number"`
	BankAccountHolder   *string                             `json:"bank_account_holder"`
	PendingRequest      *repository.CommissionPayoutRequest `json:"pending_request"`
}

type AgentCreatePayoutRequestInput struct {
	AmountRequested   float64 `json:"amount_requested"`
	BankName          string  `json:"bank_name"`
	BankAccountNumber string  `json:"bank_account_number"`
	BankAccountHolder string  `json:"bank_account_holder"`
}

type CommissionHistoryItem struct {
	ID          uint64  `json:"id"`
	Source      string  `json:"source"` // "ledger" or "payout"
	Type        string  `json:"type"`   // "direct", "override", "correction", "payout"
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Direction   string  `json:"direction"`        // "masuk" or "keluar"
	Status      string  `json:"status,omitempty"` // "pending", "approved", "rejected", "paid"
	// Held: commission entry not withdrawable yet (jamaah belum lunas). Ledger entries only.
	Held bool `json:"held,omitempty"`
	// CountsAgainstBalance is sent only as false, on a rejected payout request: it never left the balance,
	// so clients show it neutrally instead of as a deduction. Absent means the row counts as usual.
	CountsAgainstBalance *bool `json:"counts_against_balance,omitempty"`
	// RejectionReason: the travel admin's reason on a rejected payout request (also an approved one the
	// admin cancelled after a failed transfer). Payout rows only, always the agent's own; omitted otherwise.
	RejectionReason *string `json:"rejection_reason,omitempty"`
	// ProspectID: the prospect a ledger entry belongs to. For override entries that is a downline agent's
	// prospect, so the agent view clears it; the admin view keeps it to link the entry to the prospect.
	ProspectID uint64 `json:"prospect_id,omitempty"`
	// prospectName is only used to build the admin description of override entries.
	prospectName string
	// fromNetwork: the entry's prospect belongs to another agent (an upline's override or a correction of
	// it), so the agent view must not reveal the prospect or the admin's free-text reason.
	fromNetwork bool
	CreatedAt   time.Time `json:"created_at"`
}

type UpdateProfileRequest struct {
	Name              *string `json:"name"`
	Phone             *string `json:"phone"`
	Email             *string `json:"email"`
	Domisili          *string `json:"domisili"`
	BankName          *string `json:"bank_name"`
	BankAccountNumber *string `json:"bank_account_number"`
	BankAccountHolder *string `json:"bank_account_holder"`
}

type UpdatePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	// KeepToken is the session making the change (set by the handler): it stays signed in, every other
	// session of the agent is signed out.
	KeepToken string `json:"-"`
}

type AgentPayoutHistoryItem struct {
	ID        uint64    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	Amount    float64   `json:"amount"`
	Status    string    `json:"status"`
	// RejectionReason: set on rejected requests (also approved ones cancelled by the admin).
	RejectionReason *string `json:"rejection_reason,omitempty"`
}

type AgentDashboardDetail struct {
	ID                 uint64                        `json:"id"`
	TenantID           uint64                        `json:"tenant_id"`
	Name               string                        `json:"name"`
	Phone              *string                       `json:"phone"`
	Email              *string                       `json:"email"`
	Domisili           *string                       `json:"domisili"`
	PhotoURL           *string                       `json:"photo_url"`
	Status             string                        `json:"status"`
	PaymentStatus      string                        `json:"payment_status"`
	PaymentProofURL    *string                       `json:"payment_proof_url,omitempty"`
	RejectionReason    *string                       `json:"rejection_reason,omitempty"`
	ReferralCode       string                        `json:"referral_code"`
	CreatedAt          time.Time                     `json:"created_at"`
	ParentAgentID      *uint64                       `json:"parent_agent_id,omitempty"`
	ParentAgentName    *string                       `json:"parent_agent_name,omitempty"`
	RingkasanJamaah    repository.AgentFunnelSummary `json:"ringkasan_jamaah"`
	TotalJamaahClosing int                           `json:"total_jamaah_closing"`
	SaldoSiapCair      float64                       `json:"saldo_siap_cair"`
	SaldoTertunda      float64                       `json:"saldo_tertunda"`
	SaldoTertahan      float64                       `json:"saldo_tertahan"`
	RiwayatPencairan   []AgentPayoutHistoryItem      `json:"riwayat_pencairan"`
	RiwayatKomisi      []CommissionHistoryItem       `json:"riwayat_komisi"`
	// The agent's stored bank details, shown only to its own travel's admins (e.g. when the admin starts a
	// payout for the agent). Omitted when not set.
	BankName          *string `json:"bank_name,omitempty"`
	BankAccountNumber *string `json:"bank_account_number,omitempty"`
	BankAccountHolder *string `json:"bank_account_holder,omitempty"`
}

type UpdateDashboardAgentRequest struct {
	Name     *string `json:"name"`
	Phone    *string `json:"phone"`
	Email    *string `json:"email"`
	Domisili *string `json:"domisili"`
}

type AgentService interface {
	GetRegistrationInfo(ctx context.Context, tenantID uint64) (*AgentRegistrationInfo, error)
	GetPublicConsultant(ctx context.Context, tenantID uint64, referralCode string) (*PublicConsultant, error)
	Register(ctx context.Context, tenantID uint64, req *RegisterAgentRequest) (*AgentAuthResult, error)
	Login(ctx context.Context, tenantID uint64, email, password string) (*AgentAuthResult, error)
	// DemoLogin signs in as the demo agent account of the demo travel, without a password. ErrNotFound
	// when the travel is not marked is_demo.
	DemoLogin(ctx context.Context, tenantID uint64) (*AgentAuthResult, error)
	Logout(ctx context.Context, token string) error
	GetProfile(ctx context.Context, tenantID uint64, agentID uint64) (*AgentProfileResult, error)
	UpdateProfile(ctx context.Context, tenantID uint64, agentID uint64, req *UpdateProfileRequest) (*AgentProfileResult, error)
	UpdatePhoto(ctx context.Context, tenantID uint64, agentID uint64, photoURL string) (*AgentProfileResult, error)
	RemovePhoto(ctx context.Context, tenantID uint64, agentID uint64) (*AgentProfileResult, error)
	UpdatePassword(ctx context.Context, tenantID uint64, agentID uint64, req *UpdatePasswordRequest) error
	GetDashboardSummary(ctx context.Context, tenantID uint64, agentID uint64, host string) (*AgentDashboardSummary, error)
	GetDashboardAgentDetail(ctx context.Context, tenantID uint64, agentID uint64) (*AgentDashboardDetail, error)
	UpdateDashboardAgentProfile(ctx context.Context, tenantID uint64, agentID uint64, req *UpdateDashboardAgentRequest) (*AgentDashboardDetail, error)
	ResetAgentPassword(ctx context.Context, tenantID uint64, agentID uint64, newPassword string) error
	ToggleAgentStatus(ctx context.Context, tenantID uint64, agentID uint64, action string) error
	GetPayoutInfo(ctx context.Context, tenantID uint64, agentID uint64) (*AgentPayoutInfoResponse, error)
	CreatePayoutRequest(ctx context.Context, tenantID uint64, agentID uint64, input AgentCreatePayoutRequestInput) (*repository.CommissionPayoutRequest, error)
	GetCommissionHistory(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionHistoryItem, error)
	GetCommissionHistoryForAdmin(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionHistoryItem, error)
	ListPayoutRequests(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.CommissionPayoutRequestItem, error)
	ApprovePayoutRequest(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error
	MarkPayoutRequestPaid(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error
	// RejectPayoutRequest rejects a pending request or cancels an approved one (transfer failed).
	RejectPayoutRequest(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, reason string) error
	// CreatePayoutForAgent: the travel admin starts a payout of the agent's whole withdrawable balance.
	CreatePayoutForAgent(ctx context.Context, tenantID uint64, agentID uint64, adminUserID uint64) (*repository.CommissionPayoutRequestItem, error)
	// GetLeaderboard ranks active agents by closed jamaah. period: LeaderboardPeriodMonth, LeaderboardPeriodYear
	// or "" / LeaderboardPeriodAll (since joining).
	GetLeaderboard(ctx context.Context, tenantID uint64, currentAgentID uint64, period string) ([]LeaderboardEntry, error)
	ListAgents(ctx context.Context, tenantID uint64, statusFilter string) ([]repository.Agent, error)
	ApproveAgent(ctx context.Context, tenantID uint64, agentID uint64) error
	RejectAgent(ctx context.Context, tenantID uint64, agentID uint64, reason string) error
	GetAgentSettings(ctx context.Context, tenantID uint64) (*repository.TenantAgentSettings, error)
	UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error
	UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error
	UpdatePaymentProof(ctx context.Context, tenantID uint64, agentID uint64, proofURL string) (*AgentProfileResult, error)
	GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error)
	UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error
}

type agentService struct {
	agentRepo            repository.AgentRepository
	agentSessionRepo     repository.AgentSessionRepository
	tenantRepo           repository.TenantRepository
	commissionLedgerRepo repository.CommissionLedgerRepository
	prospectRepo         repository.ProspectRepository
	payoutRepo           repository.CommissionPayoutRequestRepository
	adminUserRepo        repository.AdminUserRepository
	notifService         NotificationService
	targetService        AgentTargetService
	habitRepo            repository.AgentHabitRepository // optional (WithHabitBadges)
}

func NewAgentService(
	agentRepo repository.AgentRepository,
	agentSessionRepo repository.AgentSessionRepository,
	tenantRepo repository.TenantRepository,
	commissionLedgerRepo repository.CommissionLedgerRepository,
	prospectRepo repository.ProspectRepository,
	payoutRepo repository.CommissionPayoutRequestRepository,
	adminUserRepo repository.AdminUserRepository,
	notifService NotificationService,
	targetService AgentTargetService,
	opts ...AgentServiceOption,
) AgentService {
	s := &agentService{
		agentRepo:            agentRepo,
		agentSessionRepo:     agentSessionRepo,
		tenantRepo:           tenantRepo,
		commissionLedgerRepo: commissionLedgerRepo,
		prospectRepo:         prospectRepo,
		payoutRepo:           payoutRepo,
		adminUserRepo:        adminUserRepo,
		notifService:         notifService,
		targetService:        targetService,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// AgentServiceOption adds an optional dependency to the agent service.
type AgentServiceOption func(*agentService)

// WithHabitBadges lets the leaderboard show each agent's highest habit streak badge.
func WithHabitBadges(habitRepo repository.AgentHabitRepository) AgentServiceOption {
	return func(s *agentService) { s.habitRepo = habitRepo }
}

// GetPublicConsultant resolves a referral code to the active agent of this travel. Unknown codes, codes of
// another travel and inactive agents are all ErrNotFound (the page then falls back to the travel's contact).
func (s *agentService) GetPublicConsultant(ctx context.Context, tenantID uint64, referralCode string) (*PublicConsultant, error) {
	code := strings.TrimSpace(referralCode)
	if code == "" {
		return nil, repository.ErrNotFound
	}
	agent, err := s.agentRepo.GetActiveByReferralCode(ctx, tenantID, code)
	if err != nil {
		return nil, err
	}
	if agent == nil || agent.TenantID != tenantID {
		return nil, repository.ErrNotFound
	}
	return &PublicConsultant{
		Name:         agent.Name,
		PhotoURL:     agent.PhotoURL,
		ReferralCode: agent.ReferralCode,
	}, nil
}

func (s *agentService) GetRegistrationInfo(ctx context.Context, tenantID uint64) (*AgentRegistrationInfo, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	mode := "gratis"
	if tenant.AgentRegistrationFee != nil && *tenant.AgentRegistrationFee > 0 {
		mode = "berbayar"
	}

	hasTerms := tenant.AgentTermsConditions != nil && strings.TrimSpace(*tenant.AgentTermsConditions) != ""

	return &AgentRegistrationInfo{
		TenantName:             tenant.Name,
		BrandPrimaryColor:      tenant.BrandPrimaryColor,
		BrandLogoURL:           tenant.BrandLogoURL,
		Mode:                   mode,
		RegistrationFee:        tenant.AgentRegistrationFee,
		AgentRegistrationFee:   tenant.AgentRegistrationFee,
		RegistrationBenefits:   tenant.AgentRegistrationBenefits,
		HasTermsConditions:     hasTerms,
		TermsConditions:        tenant.AgentTermsConditions,
		AgentRegistrationTerms: tenant.AgentTermsConditions,
		AgentBankName:          tenant.AgentBankName,
		AgentBankAccountNumber: tenant.AgentBankAccountNumber,
		AgentBankAccountHolder: tenant.AgentBankAccountHolder,
		AgentPosterURL:         tenant.AgentPosterURL,
	}, nil
}

func (s *agentService) Register(ctx context.Context, tenantID uint64, req *RegisterAgentRequest) (*AgentAuthResult, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	if tenant.Status == "pending" || util.IsTravelSuspended(tenant.Status, tenant.SubscriptionExpiresAt, time.Now()) {
		return nil, ErrAgentRegistrationClosed
	}

	if err := checkNewPassword(req.Password, ErrAgentPasswordTooShort); err != nil {
		return nil, err
	}

	// 1. Validate terms if tenant has terms configured
	hasTerms := tenant.AgentTermsConditions != nil && strings.TrimSpace(*tenant.AgentTermsConditions) != ""
	if hasTerms && !req.TermsAccepted {
		return nil, ErrTermsRequired
	}

	// 2. Validate cross-tenant referral code if provided
	var parentAgentID *uint64
	if req.ReferralCode != nil && strings.TrimSpace(*req.ReferralCode) != "" {
		code := strings.TrimSpace(*req.ReferralCode)
		parentAgent, err := s.agentRepo.GetByReferralCode(ctx, code)
		if err == nil && parentAgent.TenantID == tenantID {
			// A pending, rejected or deactivated agent cannot recruit: it earns no override and its link
			// produces no leads, so the person is told instead of being silently placed under it.
			if parentAgent.Status != "active" {
				if !req.ReferralFromLink {
					return nil, ErrReferralAgentNotActive
				}
			} else {
				pID := parentAgent.ID
				parentAgentID = &pID
			}
		}
		// If referral code belongs to another tenant or not found, parentAgentID remains nil (cross-tenant safety)
	}

	// 3. Hash password
	hashedPassword, err := util.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	// 4. Initial payment status
	paymentStatus := "not_applicable"
	if tenant.AgentRegistrationFee != nil && *tenant.AgentRegistrationFee > 0 {
		paymentStatus = "awaiting_proof"
	}

	// 5. Generate unique 8-character referral code for this agent
	refCode, err := s.generateUniqueReferralCode(ctx)
	if err != nil {
		return nil, err
	}

	var termsAcceptedAt *time.Time
	if req.TermsAccepted {
		now := time.Now()
		termsAcceptedAt = &now
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	domisili := strings.TrimSpace(req.Domisili)
	phone := strings.TrimSpace(req.Phone)
	if err := validateAgentProfileLengths(&name, &domisili); err != nil {
		return nil, err
	}
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email || len(email) > 255 {
		return nil, ErrInvalidAgentEmail
	}
	if err := validateAgentPhone(phone); err != nil {
		return nil, err
	}

	agent := &repository.Agent{
		TenantID:        tenantID,
		Name:            name,
		Phone:           &phone,
		Email:           &email,
		PasswordHash:    &hashedPassword,
		Domisili:        &domisili,
		PaymentStatus:   paymentStatus,
		TermsAcceptedAt: termsAcceptedAt,
		ReferralCode:    refCode,
		Status:          "pending", // SELALU pending
		ParentAgentID:   parentAgentID,
	}

	// 6. Create in DB (repository explicitly validates duplicate email & phone per tenant)
	if err := s.agentRepo.Create(ctx, tenantID, agent); err != nil {
		return nil, err
	}

	// Trigger 2: In-app notification to all active admin users of this tenant
	if s.notifService != nil && s.adminUserRepo != nil {
		admins, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
		if err != nil {
			log.Printf("[Notification] Failed to list admins for tenant %d: %v", tenantID, err)
		} else {
			for _, admin := range admins {
				if admin.Status != "active" {
					continue
				}
				tID := tenantID
				_, notifErr := s.notifService.CreateNotification(
					ctx,
					&tID,
					"admin",
					admin.ID,
					"agent_registered",
					"Agen baru mendaftar",
					fmt.Sprintf("%s mendaftar sebagai mitra agen", agent.Name),
					"/agents/pending",
				)
				if notifErr != nil {
					log.Printf("[Notification] Failed to create agent registration notification for admin %d: %v", admin.ID, notifErr)
				}
			}
		}
	}

	// 7. Auto-login session creation
	sessionToken, expiresAt, err := s.createSession(ctx, agent.ID)
	if err != nil {
		return nil, err
	}

	profile := s.buildProfile(agent, tenant)
	return &AgentAuthResult{
		Token:     sessionToken,
		ExpiresAt: expiresAt,
		Agent:     profile,
	}, nil
}

func (s *agentService) Login(ctx context.Context, tenantID uint64, email, password string) (*AgentAuthResult, error) {
	email = strings.TrimSpace(email)
	agent, err := s.agentRepo.GetByEmail(ctx, tenantID, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if agent.PasswordHash == nil || !util.CheckPasswordHash(password, *agent.PasswordHash) {
		return nil, ErrInvalidCredentials
	}

	// NOTE: Status check is intentionally omitted. Agents with status pending/rejected/active/inactive can all log in.
	sessionToken, expiresAt, err := s.createSession(ctx, agent.ID)
	if err != nil {
		return nil, err
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	profile := s.buildProfile(agent, tenant)
	return &AgentAuthResult{
		Token:     sessionToken,
		ExpiresAt: expiresAt,
		Agent:     profile,
	}, nil
}

// DemoLogin: see AgentService. The demo agent is the active agent of the demo travel that has a password
// (cmd/seed-demo gives a password to that one account only).
func (s *agentService) DemoLogin(ctx context.Context, tenantID uint64) (*AgentAuthResult, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	if tenant == nil || !tenant.IsDemo {
		return nil, repository.ErrNotFound
	}
	agents, err := s.agentRepo.List(ctx, tenantID, "active")
	if err != nil {
		return nil, err
	}
	for i := range agents {
		a := &agents[i]
		if a.PasswordHash == nil || *a.PasswordHash == "" {
			continue
		}
		sessionToken, expiresAt, err := s.createSession(ctx, a.ID)
		if err != nil {
			return nil, err
		}
		return &AgentAuthResult{Token: sessionToken, ExpiresAt: expiresAt, Agent: s.buildProfile(a, tenant)}, nil
	}
	return nil, repository.ErrNotFound
}

func (s *agentService) Logout(ctx context.Context, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	err := s.agentSessionRepo.DeleteByToken(ctx, token)
	if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return err
	}
	return nil
}

func (s *agentService) GetProfile(ctx context.Context, tenantID uint64, agentID uint64) (*AgentProfileResult, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return s.buildProfile(agent, tenant), nil
}

func (s *agentService) GetDashboardSummary(ctx context.Context, tenantID uint64, agentID uint64, host string) (*AgentDashboardSummary, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	if agent.Status != "active" {
		return nil, ErrAgentNotActive
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	saldoSiapCair, saldoTertunda, countTertunda, err := s.calculateAgentBalances(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	funnel, err := s.prospectRepo.GetAgentFunnelSummary(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	stats, err := s.prospectRepo.GetActiveAgentsClosingStats(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	totalAgen := len(stats)
	rankSaya := closingRank(stats, agentID)

	// Calculate TargetBulanan
	var targetBulanan *TargetBulanan
	if tenant.TargetPeriodStart != nil && tenant.TargetPeriodEnd != nil && tenant.TargetJamaah != nil {
		progress, err := s.prospectRepo.GetAgentTargetProgress(ctx, tenantID, agentID, *tenant.TargetPeriodStart, *tenant.TargetPeriodEnd)
		if err == nil {
			targetBulanan = &TargetBulanan{
				TargetJamaah:   *tenant.TargetJamaah,
				ProgressJamaah: progress,
				PeriodLabel:    formatPeriodLabel(*tenant.TargetPeriodStart, *tenant.TargetPeriodEnd),
			}
		}
	}

	// Calculate Targets
	var targets []AgentTargetView
	if s.targetService != nil {
		views, err := s.targetService.GetTargetsForAgent(ctx, tenantID, agentID)
		if err == nil {
			targets = views
		}
	}
	if targets == nil {
		targets = []AgentTargetView{}
	}

	refLink := fmt.Sprintf("%s%s/ref/%s", linkScheme(host), host, agent.ReferralCode)
	recruitLink := fmt.Sprintf("%s%s/agen/daftar?ref=%s", linkScheme(host), host, url.QueryEscape(agent.ReferralCode))

	return &AgentDashboardSummary{
		Name:                agent.Name,
		TenantName:          tenant.Name,
		TravelSuspended:     util.IsTravelSuspended(tenant.Status, tenant.SubscriptionExpiresAt, time.Now()),
		SaldoSiapCair:       saldoSiapCair,
		SaldoTertunda:       saldoTertunda,
		SaldoTertahan:       s.heldCommission(ctx, tenantID, agentID),
		TotalKomisi:         s.totalCommission(ctx, tenantID, agentID),
		JamaahTertundaCount: countTertunda,
		TargetBulanan:       targetBulanan,
		Targets:             targets,
		MinimumPayoutAmount: tenant.MinimumPayoutAmount,
		ReferralLink:        refLink,
		RecruitLink:         recruitLink,
		FunnelRingkasan:     *funnel,
		LeaderboardPreview: LeaderboardPreview{
			RankSaya:  rankSaya,
			TotalAgen: totalAgen,
		},
		PhotoURL: agent.PhotoURL,
		TotalClicks: func() int {
			c, err := s.prospectRepo.GetAgentReferralClicksCount(ctx, tenantID, agentID)
			if err != nil {
				return 0
			}
			return c
		}(),
	}, nil
}

func (s *agentService) UpdatePaymentProof(ctx context.Context, tenantID uint64, agentID uint64, proofURL string) (*AgentProfileResult, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	if agent.PaymentStatus != "awaiting_proof" && agent.Status != "rejected" {
		return nil, ErrInvalidPaymentState
	}

	wasRejected := agent.Status == "rejected"
	if agent.Status == "rejected" {
		if err := s.agentRepo.ResetToPendingWithProof(ctx, tenantID, agentID, proofURL); err != nil {
			return nil, err
		}
		agent.Status = "pending"
		agent.RejectionReason = nil
	} else {
		if err := s.agentRepo.UpdatePaymentProof(ctx, tenantID, agentID, proofURL); err != nil {
			return nil, err
		}
	}

	agent.PaymentProofURL = &proofURL
	agent.PaymentStatus = "pending_verification"

	// The admins verify the proof: tell them it arrived (a rejected agent re-applying goes back to pending).
	title, body := "Bukti pembayaran agen masuk", fmt.Sprintf("%s mengunggah bukti pembayaran pendaftaran agen. Periksa lalu setujui atau tolak.", agent.Name)
	if wasRejected {
		title, body = "Agen mendaftar ulang", fmt.Sprintf("%s mengunggah ulang bukti pembayaran setelah ditolak. Periksa lalu setujui atau tolak.", agent.Name)
	}
	s.notifyAgentAdmins(ctx, tenantID, "agent_payment_proof_uploaded", title, body, "/agents/pending")

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return s.buildProfile(agent, tenant), nil
}

func (s *agentService) ListAgents(ctx context.Context, tenantID uint64, statusFilter string) ([]repository.Agent, error) {
	if statusFilter != "" {
		return s.agentRepo.List(ctx, tenantID, statusFilter)
	}
	return s.agentRepo.List(ctx, tenantID)
}

func (s *agentService) ApproveAgent(ctx context.Context, tenantID uint64, agentID uint64) error {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return err
	}
	if agent.Status != "pending" && agent.Status != "rejected" {
		return ErrAgentApproveState
	}
	// The repository update is conditional on the status too, so a concurrent change is not overwritten.
	if err := s.agentRepo.Approve(ctx, tenantID, agentID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrAgentApproveState
		}
		return err
	}

	if s.notifService != nil {
		tID := tenantID
		_, notifErr := s.notifService.CreateNotification(
			ctx,
			&tID,
			"agent",
			agentID,
			"agent_approved",
			"Pendaftaran agen disetujui",
			"Selamat! Pendaftaran kemitraan agen Anda telah disetujui.",
			"/agen/dashboard",
		)
		if notifErr != nil {
			log.Printf("[Notification] Failed to notify agent %d of approval: %v", agentID, notifErr)
		}
	}

	return nil
}

func (s *agentService) RejectAgent(ctx context.Context, tenantID uint64, agentID uint64, reason string) error {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return err
	}
	if agent.Status != "pending" {
		return ErrAgentRejectState
	}
	if err := s.agentRepo.Reject(ctx, tenantID, agentID, reason); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrAgentRejectState
		}
		return err
	}

	// Invalidate any active sessions for the rejected agent
	_ = s.agentSessionRepo.DeleteByAgentID(ctx, agentID)

	if s.notifService != nil {
		tID := tenantID
		msg := "Mohon maaf, pendaftaran kemitraan agen Anda belum disetujui."
		if strings.TrimSpace(reason) != "" {
			msg = fmt.Sprintf("Mohon maaf, pendaftaran kemitraan agen Anda belum disetujui: %s", strings.TrimSpace(reason))
		}
		_, notifErr := s.notifService.CreateNotification(
			ctx,
			&tID,
			"agent",
			agentID,
			"agent_rejected",
			"Pendaftaran agen ditolak",
			msg,
			"/agen/status",
		)
		if notifErr != nil {
			log.Printf("[Notification] Failed to notify agent %d of rejection: %v", agentID, notifErr)
		}
	}

	return nil
}

func (s *agentService) GetAgentSettings(ctx context.Context, tenantID uint64) (*repository.TenantAgentSettings, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return &repository.TenantAgentSettings{
		AgentRegistrationFee:      tenant.AgentRegistrationFee,
		AgentRegistrationBenefits: tenant.AgentRegistrationBenefits,
		AgentBankName:             tenant.AgentBankName,
		AgentBankAccountNumber:    tenant.AgentBankAccountNumber,
		AgentBankAccountHolder:    tenant.AgentBankAccountHolder,
		AgentTermsConditions:      tenant.AgentTermsConditions,
		AgentPosterURL:            tenant.AgentPosterURL,
		MinimumPayoutAmount:       tenant.MinimumPayoutAmount,
	}, nil
}

func (s *agentService) UpdateAgentSettings(ctx context.Context, tenantID uint64, settings *repository.TenantAgentSettings) error {
	// Validation: if fee > 0, bank fields are mandatory
	if settings.AgentRegistrationFee != nil && *settings.AgentRegistrationFee > 0 {
		hasBankName := settings.AgentBankName != nil && strings.TrimSpace(*settings.AgentBankName) != ""
		hasAccountNo := settings.AgentBankAccountNumber != nil && strings.TrimSpace(*settings.AgentBankAccountNumber) != ""
		hasHolder := settings.AgentBankAccountHolder != nil && strings.TrimSpace(*settings.AgentBankAccountHolder) != ""

		if !hasBankName || !hasAccountNo || !hasHolder {
			return ErrMissingBankInfo
		}
	}

	return s.tenantRepo.UpdateAgentSettings(ctx, tenantID, settings)
}

func (s *agentService) UpdateAgentPoster(ctx context.Context, tenantID uint64, posterURL *string) error {
	return s.tenantRepo.UpdateAgentPoster(ctx, tenantID, posterURL)
}

func (s *agentService) createSession(ctx context.Context, agentID uint64) (string, time.Time, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", time.Time{}, err
	}
	token := hex.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // 7 days

	session := &repository.AgentSession{
		AgentID:   agentID,
		Token:     token,
		ExpiresAt: expiresAt,
	}

	if err := s.agentSessionRepo.Create(ctx, session); err != nil {
		return "", time.Time{}, err
	}

	return token, expiresAt, nil
}

func (s *agentService) generateUniqueReferralCode(ctx context.Context) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 32 characters, avoiding confusing 0/O, 1/I
	b := make([]byte, 8)

	for attempts := 0; attempts < 10; attempts++ {
		randomBytes := make([]byte, 8)
		if _, err := rand.Read(randomBytes); err != nil {
			return "", err
		}
		for i := range b {
			b[i] = charset[randomBytes[i]%byte(len(charset))]
		}
		code := string(b)

		// Check uniqueness
		_, err := s.agentRepo.GetByReferralCode(ctx, code)
		if errors.Is(err, repository.ErrNotFound) {
			return code, nil
		}
	}

	return "", fmt.Errorf("failed to generate unique referral code after 10 attempts")
}

func (s *agentService) buildProfile(agent *repository.Agent, tenant *repository.Tenant) *AgentProfileResult {
	profile := &AgentProfileResult{
		ID:                agent.ID,
		TenantID:          agent.TenantID,
		Name:              agent.Name,
		Phone:             agent.Phone,
		Email:             agent.Email,
		Domisili:          agent.Domisili,
		PhotoURL:          agent.PhotoURL,
		BankName:          agent.BankName,
		BankAccountNumber: agent.BankAccountNumber,
		BankAccountHolder: agent.BankAccountHolder,
		Status:            agent.Status,
		TravelSuspended:   tenant != nil && util.IsTravelSuspended(tenant.Status, tenant.SubscriptionExpiresAt, time.Now()),
		PaymentStatus:     agent.PaymentStatus,
		PaymentProofURL:   agent.PaymentProofURL,
		RejectionReason:   agent.RejectionReason,
		ReferralCode:      agent.ReferralCode,
		CreatedAt:         agent.CreatedAt,
	}

	if tenant != nil {
		profile.TenantName = tenant.Name
	}

	// Conditional payment info: if payment_status == 'awaiting_proof' or status == 'rejected'
	if (agent.PaymentStatus == "awaiting_proof" || agent.Status == "rejected") && tenant != nil {
		profile.PaymentInfo = &AgentPaymentInfo{
			RegistrationFee:   tenant.AgentRegistrationFee,
			BankAccountName:   tenant.AgentBankName,
			BankAccountNumber: tenant.AgentBankAccountNumber,
			BankAccountHolder: tenant.AgentBankAccountHolder,
		}
	}

	return profile
}

func (s *agentService) GetTargetSettings(ctx context.Context, tenantID uint64) (*repository.TenantTargetSettings, error) {
	return s.tenantRepo.GetTargetSettings(ctx, tenantID)
}

func (s *agentService) UpdateTargetSettings(ctx context.Context, tenantID uint64, settings *repository.TenantTargetSettings) error {
	if settings.TargetPeriodStart != nil && settings.TargetPeriodEnd != nil && *settings.TargetPeriodStart != "" && *settings.TargetPeriodEnd != "" {
		startDate, err1 := time.Parse("2006-01-02", *settings.TargetPeriodStart)
		endDate, err2 := time.Parse("2006-01-02", *settings.TargetPeriodEnd)
		if err1 != nil || err2 != nil {
			return ErrInvalidTargetDateForm
		}
		if !endDate.After(startDate) {
			return ErrInvalidPeriodRange
		}
	}
	return s.tenantRepo.UpdateTargetSettings(ctx, tenantID, settings)
}

// Leaderboard periods (query parameter "period" of GET /api/agent/leaderboard).
const (
	LeaderboardPeriodAll   = "semua"
	LeaderboardPeriodMonth = "bulan"
	LeaderboardPeriodYear  = "tahun"
)

// ValidLeaderboardPeriod reports whether p is a known period ("" means all time).
func ValidLeaderboardPeriod(p string) bool {
	return p == "" || p == LeaderboardPeriodAll || p == LeaderboardPeriodMonth || p == LeaderboardPeriodYear
}

// leaderboardSince is the start of the period in the business time zone (WIB), formatted for MySQL.
func leaderboardSince(period string, now time.Time) string {
	loc, err := time.LoadLocation(repository.BusinessTimeZone)
	if err != nil {
		loc = time.FixedZone("WIB", 7*60*60)
	}
	n := now.In(loc)
	start := time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, loc)
	if period == LeaderboardPeriodYear {
		start = time.Date(n.Year(), time.January, 1, 0, 0, 0, 0, loc)
	}
	return start.Format("2006-01-02 15:04:05")
}

func (s *agentService) GetLeaderboard(ctx context.Context, tenantID uint64, currentAgentID uint64, period string) ([]LeaderboardEntry, error) {
	// Sign-up is public: only approved, active partners may see other agents' names and closings.
	me, err := s.agentRepo.GetByID(ctx, tenantID, currentAgentID)
	if err != nil {
		return nil, err
	}
	if me.Status != "active" {
		return nil, ErrAgentNotActive
	}

	// All time reuses GetActiveAgentsClosingStats; a month or year counts closings from the period start.
	var stats []repository.AgentClosingStat
	if period == LeaderboardPeriodMonth || period == LeaderboardPeriodYear {
		stats, err = s.prospectRepo.GetActiveAgentsClosingStatsSince(ctx, tenantID, leaderboardSince(period, time.Now()))
	} else {
		stats, err = s.prospectRepo.GetActiveAgentsClosingStats(ctx, tenantID)
	}
	if err != nil {
		return nil, err
	}

	agents, err := s.agentRepo.List(ctx, tenantID, "active")
	if err != nil {
		return nil, err
	}

	agentNameMap := make(map[uint64]string, len(agents))
	agentPhotoMap := make(map[uint64]*string, len(agents))
	for _, a := range agents {
		agentNameMap[a.ID] = a.Name
		agentPhotoMap[a.ID] = a.PhotoURL
	}

	// Streak badges are a decoration: without the store, or if it fails, the leaderboard still shows.
	badges := map[uint64]int{}
	if s.habitRepo != nil {
		if top, err := s.habitRepo.TopBadgeByAgent(ctx, tenantID); err == nil {
			badges = top
		} else {
			log.Printf("[Leaderboard] read habit badges of tenant %d: %v", tenantID, err)
		}
	}

	ranks := leaderboardRanks(stats)
	entries := make([]LeaderboardEntry, 0, len(stats))
	for i, stat := range stats {
		name := agentNameMap[stat.AgentID]
		if name == "" {
			name = "Mitra Agen"
		}

		entries = append(entries, LeaderboardEntry{
			Rank:               ranks[i],
			Name:               name,
			TotalJamaahClosing: stat.TotalJamaah,
			IsMe:               stat.AgentID == currentAgentID,
			PhotoURL:           agentPhotoMap[stat.AgentID],
			HabitBadge:         badges[stat.AgentID],
		})
	}

	return entries, nil
}

// leaderboardRanks gives each leaderboard row the same rank as the home tile (closingRank): agents with
// the same total share a rank (1 + the number of agents with strictly more), and an agent without any
// closed jamaah gets 0 (no rank). stats is ordered by total_jamaah DESC, so a shared rank is the position
// of the first agent with that total.
func leaderboardRanks(stats []repository.AgentClosingStat) []int {
	ranks := make([]int, len(stats))
	rank := 0
	for i, st := range stats {
		if i == 0 || st.TotalJamaah != stats[i-1].TotalJamaah {
			rank = i + 1
		}
		if st.TotalJamaah > 0 {
			ranks[i] = rank
		}
	}
	return ranks
}

func formatPeriodLabel(startStr, endStr string) string {
	startDate, err1 := time.Parse("2006-01-02", startStr)
	endDate, err2 := time.Parse("2006-01-02", endStr)
	if err1 != nil || err2 != nil {
		return fmt.Sprintf("%s - %s", startStr, endStr)
	}

	monthsID := []string{
		"", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
		"Jul", "Agu", "Sep", "Okt", "Nov", "Des",
	}

	startMonth := monthsID[startDate.Month()]
	endMonth := monthsID[endDate.Month()]

	if startDate.Year() == endDate.Year() {
		if startDate.Month() == endDate.Month() {
			return fmt.Sprintf("%d-%d %s", startDate.Day(), endDate.Day(), startMonth)
		}
		return fmt.Sprintf("%d %s - %d %s", startDate.Day(), startMonth, endDate.Day(), endMonth)
	}
	return fmt.Sprintf("%d %s %d - %d %s %d", startDate.Day(), startMonth, startDate.Year(), endDate.Day(), endMonth, endDate.Year())
}

func (s *agentService) GetPayoutInfo(ctx context.Context, tenantID uint64, agentID uint64) (*AgentPayoutInfoResponse, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	if agent.Status != "active" {
		return nil, ErrAgentNotActive
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	totalEarned, err := s.commissionLedgerRepo.SumReleasedByAgent(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	var totalReserved float64
	if s.payoutRepo != nil {
		r, err := s.payoutRepo.SumPendingApprovedPaidByAgent(ctx, tenantID, agentID)
		if err != nil {
			return nil, err
		}
		totalReserved = r
	}

	saldoTersedia := totalEarned - totalReserved
	if saldoTersedia < 0 {
		saldoTersedia = 0
	}

	var pendingReq *repository.CommissionPayoutRequest
	if s.payoutRepo != nil {
		active, err := s.payoutRepo.GetActiveRequestByAgent(ctx, tenantID, agentID)
		if err == nil {
			pendingReq = active
		}
	}

	return &AgentPayoutInfoResponse{
		SaldoTersedia:       saldoTersedia,
		MinimumPayoutAmount: tenant.MinimumPayoutAmount,
		BankName:            agent.BankName,
		BankAccountNumber:   agent.BankAccountNumber,
		BankAccountHolder:   agent.BankAccountHolder,
		PendingRequest:      pendingReq,
	}, nil
}

// payoutLocker is implemented by the MySQL payout repository (see WithAgentPayoutLock).
type payoutLocker interface {
	WithAgentPayoutLock(ctx context.Context, tenantID uint64, agentID uint64, fn func() error) error
}

func (s *agentService) withPayoutLock(ctx context.Context, tenantID, agentID uint64, fn func() error) error {
	if locker, ok := s.payoutRepo.(payoutLocker); ok {
		return locker.WithAgentPayoutLock(ctx, tenantID, agentID, fn)
	}
	return fn()
}

func (s *agentService) CreatePayoutRequest(ctx context.Context, tenantID uint64, agentID uint64, input AgentCreatePayoutRequestInput) (*repository.CommissionPayoutRequest, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	if agent.Status != "active" {
		return nil, ErrAgentNotActive
	}

	bankName := strings.TrimSpace(input.BankName)
	accountNumber := strings.TrimSpace(input.BankAccountNumber)
	accountHolder := strings.TrimSpace(input.BankAccountHolder)

	if bankName == "" || accountNumber == "" || accountHolder == "" {
		return nil, ErrPayoutBankInfoRequired
	}
	// Snapshot column limits (migration 000026): longer input would fail at the database as a 500.
	switch {
	case utf8.RuneCountInString(bankName) > 100:
		return nil, payoutInvalid("nama bank maksimal 100 karakter")
	case utf8.RuneCountInString(accountNumber) > 50:
		return nil, payoutInvalid("nomor rekening maksimal 50 karakter")
	case utf8.RuneCountInString(accountHolder) > 150:
		return nil, payoutInvalid("nama pemilik rekening maksimal 150 karakter")
	}

	// The column is DECIMAL(15,2): work in whole cents, so 0.001 cannot be stored as a 0.00 request that
	// blocks real ones, and 99999.995 cannot pass a 99999.99 balance and be stored as 100000.00.
	if math.IsNaN(input.AmountRequested) || math.IsInf(input.AmountRequested, 0) {
		return nil, ErrPayoutAmountNotPositive
	}
	input.AmountRequested = math.Round(input.AmountRequested*100) / 100
	if input.AmountRequested <= 0 {
		return nil, ErrPayoutAmountNotPositive
	}
	if s.payoutRepo == nil {
		return nil, errors.New("payout repository not initialized")
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	// TOLAK kalau amount_requested < minimum_payout_amount
	if tenant.MinimumPayoutAmount != nil && *tenant.MinimumPayoutAmount > 0 {
		if input.AmountRequested < *tenant.MinimumPayoutAmount {
			return nil, payoutInvalid(fmt.Sprintf("jumlah penarikan minimal Rp %.0f", *tenant.MinimumPayoutAmount))
		}
	}

	payoutReq := &repository.CommissionPayoutRequest{
		TenantID:                  tenantID,
		AgentID:                   agentID,
		AmountRequested:           input.AmountRequested,
		Status:                    "pending",
		BankNameSnapshot:          bankName,
		BankAccountNumberSnapshot: accountNumber,
		BankAccountHolderSnapshot: accountHolder,
	}

	// The active-request check, the balance check and the insert run under a per-agent lock:
	// simultaneous requests used to both pass the checks and reserve the same balance twice.
	err = s.withPayoutLock(ctx, tenantID, agentID, func() error {
		// TOLAK kalau agent masih punya request berstatus 'pending' ATAU 'approved'
		active, err := s.payoutRepo.GetActiveRequestByAgent(ctx, tenantID, agentID)
		if err == nil && active != nil {
			return ErrPayoutActiveRequestExists
		}

		// TOLAK kalau amount_requested > saldo_tersedia (hitung ulang di server)
		totalEarned, err := s.commissionLedgerRepo.SumReleasedByAgent(ctx, tenantID, agentID)
		if err != nil {
			return err
		}
		totalReserved, err := s.payoutRepo.SumPendingApprovedPaidByAgent(ctx, tenantID, agentID)
		if err != nil {
			return err
		}
		saldoTersedia := totalEarned - totalReserved
		if saldoTersedia < 0 {
			saldoTersedia = 0
		}
		if math.Round(input.AmountRequested*100) > math.Round(saldoTersedia*100) {
			return ErrPayoutExceedsBalance
		}

		// Simpan/update bank details ke agents table
		// Best effort: the request keeps its own bank snapshot, so a failed profile update must not
		// block the payout — but it is logged instead of silently dropped.
		if err := s.agentRepo.UpdateBankInfo(ctx, tenantID, agentID, bankName, accountNumber, accountHolder); err != nil {
			log.Printf("[Payout] failed to save bank info for agent %d (tenant %d): %v", agentID, tenantID, err)
		}

		// Insert commission_payout_requests dengan snapshot rekening dari body request
		return s.payoutRepo.Create(ctx, tenantID, payoutReq)
	})
	if err != nil {
		return nil, err
	}

	// Trigger 3: In-app notification to all active admin users of this tenant
	if s.notifService != nil && s.adminUserRepo != nil {
		admins, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
		if err != nil {
			log.Printf("[Notification] Failed to list admins for tenant %d: %v", tenantID, err)
		} else {
			for _, admin := range admins {
				if admin.Status != "active" {
					continue
				}
				tID := tenantID
				_, notifErr := s.notifService.CreateNotification(
					ctx,
					&tID,
					"admin",
					admin.ID,
					"payout_requested",
					"Pengajuan pencairan baru",
					fmt.Sprintf("Agen %s mengajukan pencairan Rp %s", agent.Name, util.FormatRupiah(input.AmountRequested)),
					"/payouts",
				)
				if notifErr != nil {
					log.Printf("[Notification] Failed to create payout notification for admin %d: %v", admin.ID, notifErr)
				}
			}
		}
	}

	return payoutReq, nil
}

func (s *agentService) ListPayoutRequests(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.CommissionPayoutRequestItem, error) {
	if s.payoutRepo == nil {
		return []repository.CommissionPayoutRequestItem{}, nil
	}
	items, err := s.payoutRepo.List(ctx, tenantID, statusFilter)
	if err != nil {
		return nil, err
	}
	if items == nil {
		// An empty list is [] in JSON, never null.
		items = []repository.CommissionPayoutRequestItem{}
	}
	return items, nil
}

// payoutStatusLabels are the words the travel admin sees for a payout status (never the raw keys).
var payoutStatusLabels = map[string]string{
	"pending":  "menunggu persetujuan",
	"approved": "sudah disetujui",
	"rejected": "sudah ditolak",
	"paid":     "sudah ditransfer",
}

func payoutStatusLabel(status string) string {
	if l, ok := payoutStatusLabels[status]; ok {
		return l
	}
	return "sudah berubah"
}

// payoutWithdrawableExcluding is the agent's withdrawable balance with the given request left out: the
// same math as calculateAgentBalances (released commission minus pending/approved/paid payouts), plus
// the request's own amount back since it is one of those payouts. Must run under withPayoutLock.
func (s *agentService) payoutWithdrawableExcluding(ctx context.Context, tenantID uint64, req *repository.CommissionPayoutRequest) (float64, error) {
	released, err := s.commissionLedgerRepo.SumReleasedByAgent(ctx, tenantID, req.AgentID)
	if err != nil {
		return 0, err
	}
	reserved, err := s.payoutRepo.SumPendingApprovedPaidByAgent(ctx, tenantID, req.AgentID)
	if err != nil {
		return 0, err
	}
	if req.Status == "pending" || req.Status == "approved" || req.Status == "paid" {
		reserved -= req.AmountRequested
	}
	available := released - reserved
	if available < 0 {
		available = 0
	}
	return available, nil
}

// checkPayoutStillCovered refuses an approve or mark-paid when the agent's commission no longer covers
// the request (for example a closing was cancelled after the request was made), so the travel does not
// pay money that is no longer owed.
func (s *agentService) checkPayoutStillCovered(ctx context.Context, tenantID uint64, req *repository.CommissionPayoutRequest) error {
	available, err := s.payoutWithdrawableExcluding(ctx, tenantID, req)
	if err != nil {
		return err
	}
	if math.Round(req.AmountRequested*100) > math.Round(available*100) {
		return payoutStatusConflict(fmt.Sprintf("Saldo agen sudah tidak cukup untuk pengajuan ini (saldo tersedia Rp %s). Tolak pengajuan ini.", util.FormatRupiah(available)))
	}
	return nil
}

func (s *agentService) ApprovePayoutRequest(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error {
	if s.payoutRepo == nil {
		return errors.New("payout repository not initialized")
	}
	req, err := s.payoutRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	err = s.withPayoutLock(ctx, tenantID, req.AgentID, func() error {
		// Re-read under the lock: the status and the balance are checked against the current state.
		req, err = s.payoutRepo.GetByID(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if req.Status != "pending" {
			return payoutStatusConflict(fmt.Sprintf("Pengajuan ini tidak bisa disetujui karena statusnya %s.", payoutStatusLabel(req.Status)))
		}
		if err := s.checkPayoutStillCovered(ctx, tenantID, req); err != nil {
			return err
		}
		now := time.Now().UTC()
		return s.payoutRepo.UpdateStatus(ctx, tenantID, id, "pending", "approved", &adminUserID, &now, nil)
	})
	if err != nil {
		return err
	}

	// Trigger 5: In-app notification to agent on payout approval
	s.notifyPayoutAgent(ctx, tenantID, req.AgentID, "payout_approved", "Pengajuan pencairan disetujui",
		fmt.Sprintf("Pengajuan pencairan dana sebesar Rp %s telah disetujui", util.FormatRupiah(req.AmountRequested)))
	return nil
}

// MarkPayoutRequestPaid records that the approved amount was transferred. Only the status changes: the
// approval's reviewed_by/reviewed_at stay, so the record keeps who approved the payout.
func (s *agentService) MarkPayoutRequestPaid(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error {
	if s.payoutRepo == nil {
		return errors.New("payout repository not initialized")
	}
	req, err := s.payoutRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	err = s.withPayoutLock(ctx, tenantID, req.AgentID, func() error {
		req, err = s.payoutRepo.GetByID(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if req.Status != "approved" {
			return payoutStatusConflict(fmt.Sprintf("Pengajuan ini tidak bisa ditandai sudah ditransfer karena statusnya %s. Hanya pengajuan yang sudah disetujui yang bisa ditandai sudah ditransfer.", payoutStatusLabel(req.Status)))
		}
		if err := s.checkPayoutStillCovered(ctx, tenantID, req); err != nil {
			return err
		}
		return s.payoutRepo.UpdateStatus(ctx, tenantID, id, "approved", "paid", req.ReviewedBy, req.ReviewedAt, req.RejectionReason)
	})
	if err != nil {
		return err
	}
	log.Printf("[Payout] request %d (tenant %d, agent %d) marked paid by admin %d", id, tenantID, req.AgentID, adminUserID)

	s.notifyPayoutAgent(ctx, tenantID, req.AgentID, "payout_paid", "Pencairan sudah ditransfer",
		fmt.Sprintf("Pencairan dana sebesar Rp %s sudah ditransfer ke rekening %s a.n. %s.",
			util.FormatRupiah(req.AmountRequested), req.BankNameSnapshot, req.BankAccountHolderSnapshot))
	return nil
}

// RejectPayoutRequest rejects a pending request, or cancels an approved one whose transfer failed (for
// example wrong account details). Either way the reserved amount is freed and the agent is told why.
func (s *agentService) RejectPayoutRequest(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, reason string) error {
	if s.payoutRepo == nil {
		return errors.New("payout repository not initialized")
	}
	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		return ErrPayoutRejectReasonRequired
	}
	req, err := s.payoutRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if req.Status != "pending" && req.Status != "approved" {
		return payoutStatusConflict(fmt.Sprintf("Pengajuan ini tidak bisa ditolak karena statusnya %s.", payoutStatusLabel(req.Status)))
	}
	fromStatus := req.Status
	now := time.Now().UTC()
	if err := s.payoutRepo.UpdateStatus(ctx, tenantID, id, fromStatus, "rejected", &adminUserID, &now, &trimmedReason); err != nil {
		return err
	}

	title := "Pengajuan pencairan ditolak"
	body := fmt.Sprintf("Pengajuan pencairan dana sebesar Rp %s ditolak: %s", util.FormatRupiah(req.AmountRequested), trimmedReason)
	if fromStatus == "approved" {
		log.Printf("[Payout] approved request %d (tenant %d, agent %d) cancelled by admin %d", id, tenantID, req.AgentID, adminUserID)
		title = "Pencairan dibatalkan"
		body = fmt.Sprintf("Pencairan dana sebesar Rp %s yang sudah disetujui dibatalkan: %s. Saldo kembali dan bisa diajukan lagi.", util.FormatRupiah(req.AmountRequested), trimmedReason)
	}
	// Trigger 5: In-app notification to agent on payout rejection
	s.notifyPayoutAgent(ctx, tenantID, req.AgentID, "payout_rejected", title, body)
	return nil
}

// Errors of the travel-admin-initiated payout (CreatePayoutForAgent).
var (
	ErrAdminPayoutActiveExists = payoutStatusConflict("Masih ada pencairan yang sedang diproses untuk agen ini.")
	ErrAdminPayoutNoBalance    = payoutInvalid("Tidak ada komisi yang bisa dicairkan.")
	ErrAdminPayoutBankMissing  = payoutInvalid("Data rekening agen belum lengkap.")
)

// CreatePayoutForAgent lets the travel admin start a payout for one of its agents, active or
// deactivated (a deactivated agent cannot request one itself). The amount is the agent's whole
// withdrawable balance and the bank snapshot is the agent's stored bank details; the program's minimum
// payout does not apply. The request then follows the normal approve and mark-paid flow.
func (s *agentService) CreatePayoutForAgent(ctx context.Context, tenantID uint64, agentID uint64, adminUserID uint64) (*repository.CommissionPayoutRequestItem, error) {
	if s.payoutRepo == nil {
		return nil, errors.New("payout repository not initialized")
	}
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	bankName := strings.TrimSpace(derefString(agent.BankName))
	accountNumber := strings.TrimSpace(derefString(agent.BankAccountNumber))
	accountHolder := strings.TrimSpace(derefString(agent.BankAccountHolder))

	payoutReq := &repository.CommissionPayoutRequest{
		TenantID:                  tenantID,
		AgentID:                   agentID,
		Status:                    "pending",
		BankNameSnapshot:          bankName,
		BankAccountNumberSnapshot: accountNumber,
		BankAccountHolderSnapshot: accountHolder,
	}
	err = s.withPayoutLock(ctx, tenantID, agentID, func() error {
		active, err := s.payoutRepo.GetActiveRequestByAgent(ctx, tenantID, agentID)
		if err != nil {
			return err
		}
		if active != nil {
			return ErrAdminPayoutActiveExists
		}
		released, err := s.commissionLedgerRepo.SumReleasedByAgent(ctx, tenantID, agentID)
		if err != nil {
			return err
		}
		reserved, err := s.payoutRepo.SumPendingApprovedPaidByAgent(ctx, tenantID, agentID)
		if err != nil {
			return err
		}
		amount := math.Round((released-reserved)*100) / 100
		if amount <= 0 {
			return ErrAdminPayoutNoBalance
		}
		if bankName == "" || accountNumber == "" || accountHolder == "" ||
			utf8.RuneCountInString(bankName) > 100 || utf8.RuneCountInString(accountNumber) > 50 ||
			utf8.RuneCountInString(accountHolder) > 150 {
			return ErrAdminPayoutBankMissing
		}
		payoutReq.AmountRequested = amount
		return s.payoutRepo.Create(ctx, tenantID, payoutReq)
	})
	if err != nil {
		return nil, err
	}
	// No column records who asked (no migration): the admin is logged.
	log.Printf("[Payout] request %d (tenant %d, agent %d, Rp %.2f) created by admin %d on the agent's behalf",
		payoutReq.ID, tenantID, agentID, payoutReq.AmountRequested, adminUserID)

	s.notifyPayoutAgent(ctx, tenantID, agentID, "payout_requested_by_admin", "Pencairan diajukan admin travel",
		fmt.Sprintf("Admin travel mengajukan pencairan komisi Anda sebesar Rp %s ke rekening %s a.n. %s.",
			util.FormatRupiah(payoutReq.AmountRequested), bankName, accountHolder))

	item := &repository.CommissionPayoutRequestItem{CommissionPayoutRequest: *payoutReq, AgentName: agent.Name, AgentPhone: agent.Phone}
	return item, nil
}

func derefString(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// notifyPayoutAgent sends a payout notification to the agent; a failure is logged, never returned.
func (s *agentService) notifyPayoutAgent(ctx context.Context, tenantID, agentID uint64, kind, title, body string) {
	if s.notifService == nil {
		return
	}
	tID := tenantID
	if _, err := s.notifService.CreateNotification(ctx, &tID, "agent", agentID, kind, title, body, "/agen/riwayat-komisi"); err != nil {
		log.Printf("[Notification] Failed to notify agent %d (%s): %v", agentID, kind, err)
	}
}

func assembleCommissionHistory(ledgers []repository.CommissionLedgerWithProspect, payouts []repository.CommissionPayoutRequest) []CommissionHistoryItem {
	items := make([]CommissionHistoryItem, 0, len(ledgers)+len(payouts))

	for _, l := range ledgers {
		var desc string
		direction := "masuk"

		switch l.Type {
		case "direct":
			count := l.ProspectJumlahJamaah
			if count <= 0 {
				count = 1
			}
			desc = fmt.Sprintf("Komisi dari %s (%d jamaah)", l.ProspectName, count)
		case "override":
			desc = "Komisi override dari jaringan Anda"
		case "correction":
			if l.Notes != nil && *l.Notes != "" {
				desc = fmt.Sprintf("Koreksi komisi: %s", *l.Notes)
			} else {
				desc = "Koreksi komisi"
			}
			if l.Amount < 0 {
				direction = "keluar"
			}
		default:
			desc = "Komisi"
		}

		items = append(items, CommissionHistoryItem{
			ID:           l.ID,
			Source:       "ledger",
			Type:         l.Type,
			Description:  desc,
			Amount:       l.Amount,
			Direction:    direction,
			Held:         l.ReleasedAt == nil,
			ProspectID:   l.ProspectID,
			prospectName: l.ProspectName,
			fromNetwork:  l.ProspectAgentID != 0 && l.ProspectAgentID != l.AgentID,
			CreatedAt:    l.CreatedAt,
		})
	}

	for _, p := range payouts {
		var reason *string
		var counts *bool
		if p.Status == "rejected" {
			f := false
			counts = &f
			reason = nonBlank(p.RejectionReason)
		}
		items = append(items, CommissionHistoryItem{
			ID:          p.ID,
			Source:      "payout",
			Type:        "payout",
			Description: "Pengajuan pencairan",
			Amount:      p.AmountRequested,
			Direction:   "keluar",
			Status:      p.Status,
			CreatedAt:   p.CreatedAt,

			CountsAgainstBalance: counts,
			RejectionReason:      reason,
		})
	}

	// Sort created_at DESC, id DESC
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})

	return items
}

func (s *agentService) getCommissionHistoryRaw(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionHistoryItem, error) {
	ledgers, err := s.commissionLedgerRepo.ListByAgentWithProspect(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	var payouts []repository.CommissionPayoutRequest
	if s.payoutRepo != nil {
		pList, err := s.payoutRepo.ListByAgent(ctx, tenantID, agentID)
		if err != nil {
			return nil, err
		}
		payouts = pList
	}

	return assembleCommissionHistory(ledgers, payouts), nil
}

func (s *agentService) GetCommissionHistory(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionHistoryItem, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	if agent.Status != "active" {
		return nil, ErrAgentNotActive
	}

	items, err := s.getCommissionHistoryRaw(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	// An override comes from a downline agent's prospect: the agent must not learn which one.
	// A correction booked to this agent for a downline's prospect is the same: its notes carry the admin's
	// reason, which often names the jamaah, so a generic description replaces it.
	for i := range items {
		if items[i].Type == "override" {
			items[i].ProspectID = 0
		}
		if items[i].Type == "correction" && items[i].fromNetwork {
			items[i].ProspectID = 0
			items[i].Description = "Koreksi komisi override dari jaringan Anda"
		}
	}
	return items, nil
}

func (s *agentService) GetCommissionHistoryForAdmin(ctx context.Context, tenantID uint64, agentID uint64) ([]CommissionHistoryItem, error) {
	_, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	items, err := s.getCommissionHistoryRaw(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	// The travel admin may see which prospect an override came from.
	for i := range items {
		if items[i].Type == "override" && items[i].prospectName != "" {
			items[i].Description = fmt.Sprintf("Komisi override dari %s", items[i].prospectName)
		}
	}
	return items, nil
}

// validateAgentPhone applies the prospect phone rule (Indonesian WhatsApp, 62 + 8-13 digits) to an agent.
func validateAgentPhone(raw string) error {
	if _, _, err := validateProspectPhone(raw); err != nil {
		return ErrInvalidAgentPhone
	}
	return nil
}

func (s *agentService) UpdateProfile(ctx context.Context, tenantID uint64, agentID uint64, req *UpdateProfileRequest) (*AgentProfileResult, error) {
	if err := validateAgentProfileLengths(req.Name, req.Domisili); err != nil {
		return nil, err
	}
	if err := validateAgentContactFields(req.Email, req.BankName, req.BankAccountNumber, req.BankAccountHolder); err != nil {
		return nil, err
	}
	if req.Phone != nil && strings.TrimSpace(*req.Phone) != "" {
		current, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
		if err != nil {
			return nil, err
		}
		if phoneChanged(*req.Phone, current.Phone) {
			if err := validateAgentPhone(*req.Phone); err != nil {
				return nil, err
			}
		}
	}
	params := repository.UpdateAgentProfileParams{
		Name:              req.Name,
		Phone:             req.Phone,
		Email:             req.Email,
		Domisili:          req.Domisili,
		BankName:          req.BankName,
		BankAccountNumber: req.BankAccountNumber,
		BankAccountHolder: req.BankAccountHolder,
	}

	updatedAgent, err := s.agentRepo.UpdateProfile(ctx, tenantID, agentID, params)
	if err != nil {
		return nil, err
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return s.buildProfile(updatedAgent, tenant), nil
}

func (s *agentService) UpdatePhoto(ctx context.Context, tenantID uint64, agentID uint64, photoURL string) (*AgentProfileResult, error) {
	if err := s.agentRepo.UpdatePhotoURL(ctx, tenantID, agentID, photoURL); err != nil {
		return nil, err
	}

	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return s.buildProfile(agent, tenant), nil
}

func (s *agentService) RemovePhoto(ctx context.Context, tenantID uint64, agentID uint64) (*AgentProfileResult, error) {
	if err := s.agentRepo.ClearPhotoURL(ctx, tenantID, agentID); err != nil {
		return nil, err
	}

	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	return s.buildProfile(agent, tenant), nil
}

func (s *agentService) UpdatePassword(ctx context.Context, tenantID uint64, agentID uint64, req *UpdatePasswordRequest) error {
	if err := checkNewPassword(req.NewPassword, errNewPasswordTooShort); err != nil {
		return err
	}

	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return err
	}

	if agent.PasswordHash == nil || !util.CheckPasswordHash(req.CurrentPassword, *agent.PasswordHash) {
		return ErrInvalidCredentials
	}

	hashed, err := util.HashPassword(req.NewPassword)
	if err != nil {
		return err
	}

	if err := s.agentRepo.UpdatePassword(ctx, tenantID, agentID, hashed); err != nil {
		return err
	}
	// A changed password signs out the agent's other devices (e.g. a session someone else obtained).
	if keeper, ok := s.agentSessionRepo.(agentSessionKeeper); ok && req.KeepToken != "" {
		_ = keeper.DeleteByAgentIDExceptToken(ctx, agentID, req.KeepToken)
	} else {
		_ = s.agentSessionRepo.DeleteByAgentID(ctx, agentID)
	}
	return nil
}

// agentSessionKeeper is implemented by the MySQL agent session repository.
type agentSessionKeeper interface {
	DeleteByAgentIDExceptToken(ctx context.Context, agentID uint64, keepToken string) error
}

// heldCommission is commission booked at closing (DP) that is not withdrawable until the jamaah is paid off.
func (s *agentService) heldCommission(ctx context.Context, tenantID, agentID uint64) float64 {
	held, err := s.commissionLedgerRepo.SumHeldByAgent(ctx, tenantID, agentID)
	if err != nil || held < 0 {
		return 0
	}
	return held
}

// totalCommission is the commission from paid-off jamaah (released). Withdrawals do not lower it;
// held commission (jamaah not yet paid off) is not counted.
func (s *agentService) totalCommission(ctx context.Context, tenantID, agentID uint64) float64 {
	released, err := s.commissionLedgerRepo.SumReleasedByAgent(ctx, tenantID, agentID)
	if err != nil || released < 0 {
		return 0
	}
	return released
}

func (s *agentService) calculateAgentBalances(ctx context.Context, tenantID, agentID uint64) (float64, float64, int, error) {
	totalEarned, err := s.commissionLedgerRepo.SumReleasedByAgent(ctx, tenantID, agentID)
	if err != nil {
		return 0, 0, 0, err
	}

	var totalReserved float64
	if s.payoutRepo != nil {
		r, err := s.payoutRepo.SumPendingApprovedPaidByAgent(ctx, tenantID, agentID)
		if err != nil {
			return 0, 0, 0, err
		}
		totalReserved = r
	}

	saldoSiapCair := totalEarned - totalReserved
	if saldoSiapCair < 0 {
		saldoSiapCair = 0
	}

	saldoTertunda, countTertunda, err := s.prospectRepo.GetAgentPendingCommissionAndCount(ctx, tenantID, agentID)
	if err != nil {
		return 0, 0, 0, err
	}

	return saldoSiapCair, saldoTertunda, countTertunda, nil
}

func (s *agentService) GetDashboardAgentDetail(ctx context.Context, tenantID uint64, agentID uint64) (*AgentDashboardDetail, error) {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	var parentAgentName *string
	if agent.ParentAgentID != nil {
		parent, err := s.agentRepo.GetByID(ctx, tenantID, *agent.ParentAgentID)
		if err == nil && parent != nil {
			name := parent.Name
			parentAgentName = &name
		}
	}

	funnel, err := s.prospectRepo.GetAgentFunnelSummary(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	// Per-agent pax without the active-agent filter of the leaderboard stats: an inactive or pending
	// agent's closings still belong in its admin detail.
	totalClosing, err := s.prospectRepo.GetAgentClosingJamaah(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	saldoSiapCair, saldoTertunda, _, err := s.calculateAgentBalances(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}

	var riwayatPencairan []AgentPayoutHistoryItem
	if s.payoutRepo != nil {
		payouts, err := s.payoutRepo.ListByAgent(ctx, tenantID, agentID)
		if err == nil {
			riwayatPencairan = make([]AgentPayoutHistoryItem, len(payouts))
			for i, p := range payouts {
				riwayatPencairan[i] = AgentPayoutHistoryItem{
					ID:              p.ID,
					CreatedAt:       p.CreatedAt,
					Amount:          p.AmountRequested,
					Status:          p.Status,
					RejectionReason: rejectionReasonOf(p),
				}
			}
		}
	}
	if riwayatPencairan == nil {
		riwayatPencairan = []AgentPayoutHistoryItem{}
	}

	var recentKomisi []CommissionHistoryItem
	komisiList, err := s.getCommissionHistoryRaw(ctx, tenantID, agentID)
	if err == nil {
		if len(komisiList) > 5 {
			recentKomisi = komisiList[:5]
		} else {
			recentKomisi = komisiList
		}
	}
	if recentKomisi == nil {
		recentKomisi = []CommissionHistoryItem{}
	}

	return &AgentDashboardDetail{
		ID:                 agent.ID,
		TenantID:           agent.TenantID,
		Name:               agent.Name,
		Phone:              agent.Phone,
		Email:              agent.Email,
		Domisili:           agent.Domisili,
		PhotoURL:           agent.PhotoURL,
		Status:             agent.Status,
		PaymentStatus:      agent.PaymentStatus,
		PaymentProofURL:    agent.PaymentProofURL,
		RejectionReason:    agent.RejectionReason,
		ReferralCode:       agent.ReferralCode,
		CreatedAt:          agent.CreatedAt,
		ParentAgentID:      agent.ParentAgentID,
		ParentAgentName:    parentAgentName,
		RingkasanJamaah:    *funnel,
		TotalJamaahClosing: totalClosing,
		SaldoSiapCair:      saldoSiapCair,
		SaldoTertunda:      saldoTertunda,
		SaldoTertahan:      s.heldCommission(ctx, tenantID, agentID),
		RiwayatPencairan:   riwayatPencairan,
		RiwayatKomisi:      recentKomisi,
		BankName:           nonBlank(agent.BankName),
		BankAccountNumber:  nonBlank(agent.BankAccountNumber),
		BankAccountHolder:  nonBlank(agent.BankAccountHolder),
	}, nil
}

func (s *agentService) UpdateDashboardAgentProfile(ctx context.Context, tenantID uint64, agentID uint64, req *UpdateDashboardAgentRequest) (*AgentDashboardDetail, error) {
	// WhatsApp number and email are both required: the agent logs in with its email, so clearing it would
	// lock the agent out. A blank value is refused (400) instead of being silently kept.
	if req.Phone != nil && strings.TrimSpace(*req.Phone) == "" {
		return nil, ErrAgentPhoneRequired
	}
	if req.Email != nil && strings.TrimSpace(*req.Email) == "" {
		return nil, ErrAgentEmailRequired
	}
	if err := validateAgentProfileLengths(req.Name, req.Domisili); err != nil {
		return nil, err
	}
	if err := validateAgentContactFields(req.Email, nil, nil, nil); err != nil {
		return nil, err
	}
	if req.Phone != nil {
		current, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
		if err != nil {
			return nil, err
		}
		// Only a changed number is validated (legacy agents keep an old number while other fields change).
		if phoneChanged(*req.Phone, current.Phone) {
			if err := validateAgentPhone(*req.Phone); err != nil {
				return nil, err
			}
		}
	}
	params := repository.UpdateAgentProfileParams{
		Name:     req.Name,
		Phone:    req.Phone,
		Email:    req.Email,
		Domisili: req.Domisili,
	}

	_, err := s.agentRepo.UpdateProfile(ctx, tenantID, agentID, params)
	if err != nil {
		return nil, err
	}

	return s.GetDashboardAgentDetail(ctx, tenantID, agentID)
}

func (s *agentService) ResetAgentPassword(ctx context.Context, tenantID uint64, agentID uint64, newPassword string) error {
	if err := checkNewPassword(newPassword, ErrAgentPasswordTooShort); err != nil {
		return err
	}

	// Verify agent exists and belongs to tenant
	_, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return err
	}

	hashed, err := util.HashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := s.agentRepo.UpdatePassword(ctx, tenantID, agentID, hashed); err != nil {
		return err
	}
	// An admin reset signs the agent out everywhere: a reset is often done because the account was misused.
	_ = s.agentSessionRepo.DeleteByAgentID(ctx, agentID)
	return nil
}

func (s *agentService) ToggleAgentStatus(ctx context.Context, tenantID uint64, agentID uint64, action string) error {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return err
	}

	switch action {
	case "deactivate":
		if agent.Status != "active" {
			return ErrAgentDeactivateState
		}
		if err := s.agentRepo.UpdateStatus(ctx, tenantID, agentID, "inactive"); err != nil {
			return err
		}
		_ = s.agentSessionRepo.DeleteByAgentID(ctx, agentID)
		return nil
	case "activate":
		if agent.Status != "inactive" {
			return ErrAgentActivateState
		}
		return s.agentRepo.UpdateStatus(ctx, tenantID, agentID, "active")
	default:
		return ErrInvalidAgentAction
	}
}

// closingRank is the agent's leaderboard position by closed jamaah: 0 (no rank) while the agent has no
// closing of its own, so nobody is "#1" only because of account age when no agent has closed yet. Agents
// with the same total share a rank (1 + the number of agents with strictly more).
func closingRank(stats []repository.AgentClosingStat, agentID uint64) int {
	own := -1
	for _, st := range stats {
		if st.AgentID == agentID {
			own = st.TotalJamaah
			break
		}
	}
	if own <= 0 {
		return 0
	}
	rank := 1
	for _, st := range stats {
		if st.TotalJamaah > own {
			rank++
		}
	}
	return rank
}

// nonBlank returns nil for a nil or whitespace-only value, so an unset field is omitted from JSON.
func nonBlank(p *string) *string {
	if p == nil || strings.TrimSpace(*p) == "" {
		return nil
	}
	return p
}

// notifyAgentAdmins sends an in-app notification to every active admin of the travel; failures are logged.
func (s *agentService) notifyAgentAdmins(ctx context.Context, tenantID uint64, kind, title, body, link string) {
	if s.notifService == nil || s.adminUserRepo == nil {
		return
	}
	admins, err := s.adminUserRepo.ListByTenant(ctx, tenantID)
	if err != nil {
		log.Printf("[Notification] Failed to list admins for tenant %d: %v", tenantID, err)
		return
	}
	for _, admin := range admins {
		if admin.Status != "active" {
			continue
		}
		tID := tenantID
		if _, err := s.notifService.CreateNotification(ctx, &tID, "admin", admin.ID, kind, title, body, link); err != nil {
			log.Printf("[Notification] Failed to notify admin %d (%s): %v", admin.ID, kind, err)
		}
	}
}

// rejectionReasonOf returns the admin's reason of a rejected payout request, nil for any other status.
func rejectionReasonOf(p repository.CommissionPayoutRequest) *string {
	if p.Status != "rejected" {
		return nil
	}
	return nonBlank(p.RejectionReason)
}

// linkScheme is the scheme of links to the travel website: http only for a local development host
// (localhost, 127.0.0.1 or a travel subdomain of localhost such as ibrahim.localhost:3000, which has no
// TLS), https everywhere else.
func linkScheme(host string) string {
	h := strings.ToLower(host)
	if i := strings.LastIndex(h, ":"); i >= 0 && !strings.Contains(h[i:], "]") {
		h = h[:i]
	}
	if h == "localhost" || h == "127.0.0.1" || strings.HasSuffix(h, ".localhost") {
		return "http://"
	}
	return "https://"
}
