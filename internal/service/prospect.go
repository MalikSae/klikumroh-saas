package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

var (
	// ErrPackageNotFound is returned when the package does not exist for this tenant.
	ErrPackageNotFound = errors.New("paket tidak ditemukan")
	// ErrInvalidProspectStatus is returned when status is not in the whitelist pipeline.
	ErrInvalidProspectStatus = errors.New("status prospek tidak valid, harus salah satu dari: baru, dihubungi, tertarik, closing, tidak_lanjut")
	// ErrProspectNameRequired is returned when prospect name is empty.
	ErrProspectNameRequired = errors.New("nama prospek wajib diisi")
	// ErrProspectPhoneRequired is returned when prospect phone is empty.
	ErrProspectPhoneRequired = errors.New("nomor telepon prospek wajib diisi")
	// ErrInvalidJumlahJamaah is returned when jumlah_jamaah is <= 0.
	ErrInvalidJumlahJamaah = errors.New("jumlah jamaah harus lebih besar dari 0")
	// ErrAgentCannotClose is returned when an agent attempts to set status to closing.
	ErrAgentCannotClose = errors.New("Hanya admin yang dapat mengubah status menjadi Closing")
	// ErrProspectAlreadyClosed is returned when attempting to change status of an already closed prospect.
	ErrProspectAlreadyClosed = errors.New("Status closing bersifat final dan tidak dapat diubah lagi")
	// ErrProspectStatusConflict is returned when another request changed the status first.
	ErrProspectStatusConflict = errors.New("status prospek baru saja diubah oleh pengguna lain, muat ulang halaman lalu coba lagi")
	// ErrProspectCannotDelete is returned when deleting a prospect that already carries commission records.
	ErrProspectCannotDelete = errors.New("prospek yang sudah Closing atau memiliki catatan komisi tidak dapat dihapus")
	// ErrCorrectionReasonRequired is returned when editing commission-relevant data of a closed prospect without a reason.
	ErrCorrectionReasonRequired = errors.New("alasan koreksi wajib diisi saat mengubah paket atau jumlah jamaah pada prospek yang sudah closing")
	// ErrProspectAlreadyInYourList is returned when an agent adds a jamaah who is already in their open list.
	ErrProspectAlreadyInYourList = errors.New("calon jamaah dengan nomor ini sudah ada di daftar Anda dan masih diproses")
	// ErrProspectOwnedByOther is returned when an agent adds a jamaah who is already an open prospect of the travel.
	// The owner is intentionally not revealed.
	ErrProspectOwnedByOther = errors.New("nomor ini sudah terdaftar sebagai calon jamaah yang sedang diproses travel, hubungi admin travel")
	// ErrProspectNotClosing is returned for closing-only actions (tandai lunas, batalkan closing).
	ErrProspectNotClosing = errors.New("aksi ini hanya untuk prospek berstatus Closing")
	// ErrProspectAlreadyPaidOff is returned when the jamaah was already marked as paid off.
	ErrProspectAlreadyPaidOff = errors.New("jamaah ini sudah ditandai lunas")
	// ErrCancelReasonRequired is returned when cancelling a closing without a reason.
	ErrCancelReasonRequired = errors.New("alasan pembatalan wajib diisi (maksimal 200 karakter)")
	// ErrProspectAnonymized is returned when changing a prospect whose personal data was removed (UU PDP).
	ErrProspectAnonymized = errors.New("data pribadi jamaah ini sudah dihapus (UU PDP), datanya tidak dapat diubah lagi")
	// ErrInvalidReleasePolicy is returned for an unknown commission release policy.
	ErrInvalidReleasePolicy = errors.New("pilihan pencairan komisi tidak valid, gunakan 'lunas' atau 'dp'")
)

// Pipeline status whitelist per AGENTS.md Bagian 3.6:
// Baru → Dihubungi → Tertarik → Closing / Tidak Lanjut
var validProspectStatuses = map[string]bool{
	"baru":         true,
	"dihubungi":    true,
	"tertarik":     true,
	"closing":      true,
	"tidak_lanjut": true,
}

// Default and maximum page sizes for the dashboard prospect list.
const (
	DefaultProspectPageSize = 25
	MaxProspectPageSize     = 100
)

// AgentCreateProspectInput is used when an agent manually adds a prospect.
type AgentCreateProspectInput struct {
	Name          string  `json:"name"`
	Phone         string  `json:"phone"`
	JumlahJamaah  *int    `json:"jumlah_jamaah"`
	DeparturePlan *string `json:"departure_plan"`
	Domicile      *string `json:"domicile"`
	// Consent: the agent confirms the jamaah agreed to be contacted by the travel (UU PDP). Required.
	Consent     bool    `json:"consent"`
	PackageID   *uint64 `json:"package_id"`
	CatatanAwal *string `json:"catatan_awal"`
}

// PublicProspectInput is the payload submitted by leads on the public web portal.
// source_channel is decided server-side (referral agent / ad attribution); a client value is ignored.
type PublicProspectInput struct {
	Name          string               `json:"name"`
	Phone         string               `json:"phone"`
	Email         *string              `json:"email"`
	PackageID     *uint64              `json:"package_id"`
	AgentID       *uint64              `json:"agent_id"`
	ReferralCode  *string              `json:"referral_code"`
	JumlahJamaah  *int                 `json:"jumlah_jamaah"`
	SourceChannel string               `json:"source_channel"`
	Attribution   *ProspectAttribution `json:"attribution"`
	// Consent: the visitor ticked "saya setuju dihubungi" (UU PDP). Required.
	Consent       bool    `json:"consent"`
	DeparturePlan *string `json:"departure_plan"`
	Domicile      *string `json:"domicile"`
	// Website is a honeypot field: hidden from people, filled in by bots.
	Website string `json:"website"`
	// Meta holds the visitor's Meta browser identifiers for Conversions API matching (optional).
	Meta *PublicMetaContext `json:"meta"`
	// ConsentMeta: the consent text the visitor accepted mentioned that their data (hashed) is sent to
	// Meta. Without it nothing about this jamaah is sent to Meta's Conversions API.
	ConsentMeta bool `json:"consent_meta"`
	// ClientIP and UserAgent are set by the handler from the request, never from the JSON body.
	ClientIP  string `json:"-"`
	UserAgent string `json:"-"`
}

// PublicMetaContext is sent by the public site: the _fbp / _fbc cookies and the page URL.
type PublicMetaContext struct {
	Fbp            string `json:"fbp"`
	Fbc            string `json:"fbc"`
	EventSourceURL string `json:"event_source_url"`
}

// PublicProspectResponse is returned after a public submission. It deliberately carries no record data
// (ids, tenant id) — the visitor only needs where to continue the conversation.
type PublicProspectResponse struct {
	Message             string  `json:"message"`
	WhatsAppRedirectURL *string `json:"whatsapp_redirect_url"`
	// MetaEventID is set only for a new lead: the browser pixel sends its Lead event with this ID so
	// Meta deduplicates it against the server (CAPI) Lead event. A random value, not a record id.
	MetaEventID string `json:"meta_event_id,omitempty"`
}

// UpdateProspectInput is used when admin updates prospect details.
type UpdateProspectInput struct {
	Name             string  `json:"name"`
	Phone            string  `json:"phone"`
	PackageID        *uint64 `json:"package_id"`
	JumlahJamaah     *int    `json:"jumlah_jamaah"`
	DeparturePlan    *string `json:"departure_plan"`
	Domicile         *string `json:"domicile"`
	CorrectionReason *string `json:"correction_reason"`
}

// ProspectCommissionInfo holds calculated commission info for display.
type ProspectCommissionInfo struct {
	Type           string  `json:"type"` // "potensi" or "final"
	DirectAmount   float64 `json:"direct_amount"`
	OverrideAmount float64 `json:"override_amount"`
	TotalAmount    float64 `json:"total_amount"`
	RatePerJamaah  float64 `json:"rate_per_jamaah"`
	// For final commission: part still held (jamaah belum lunas) and part withdrawable.
	HeldAmount     float64 `json:"held_amount"`
	ReleasedAmount float64 `json:"released_amount"`
	// The owning agent's own share only (without the upline's override): what the agent sees.
	AgentHeldAmount     float64 `json:"agent_held_amount"`
	AgentReleasedAmount float64 `json:"agent_released_amount"`
}

// CancelClosingResult tells the admin what happened to the commission of a cancelled closing.
type CancelClosingResult struct {
	ReversedHeld     float64 `json:"reversed_held"`
	ReversedReleased float64 `json:"reversed_released"`
}

// ProspectDetailResponse is the detailed view returned for a single prospect.
type ProspectDetailResponse struct {
	Prospect      *repository.Prospect               `json:"prospect"`
	Package       *repository.Package                `json:"package,omitempty"`
	Agent         *repository.Agent                  `json:"agent,omitempty"`
	InfoKomisi    *ProspectCommissionInfo            `json:"info_komisi"`
	StatusHistory []repository.ProspectStatusHistory `json:"status_history"`
	Notes         []repository.ProspectNote          `json:"notes"`
}

// ProspectListPage is one page of the dashboard prospect list.
type ProspectListPage struct {
	Items    []repository.Prospect `json:"items"`
	Total    int                   `json:"total"`
	Page     int                   `json:"page"`
	PageSize int                   `json:"page_size"`
}

// ProspectService defines business logic for managing Prospects.
type ProspectService interface {
	CreatePublic(ctx context.Context, tenantID uint64, input PublicProspectInput) (*PublicProspectResponse, error)
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Prospect, error)
	List(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]repository.Prospect, error)
	ListPage(ctx context.Context, tenantID uint64, filter repository.ProspectFilter, page, pageSize int) (*ProspectListPage, error)
	Summary(ctx context.Context, tenantID uint64) (*repository.ProspectStatusSummary, error)
	UpdateStatus(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, newStatus string, lostReason, lostReasonCategory *string) error
	ExportCSV(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]byte, error)
	CalculateAndRecordCommission(ctx context.Context, tenantID uint64, prospectID uint64) error
	GetDetail(ctx context.Context, tenantID uint64, id uint64) (*ProspectDetailResponse, error)
	UpdateDetail(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, input UpdateProspectInput) error
	AddNote(ctx context.Context, tenantID uint64, prospectID uint64, adminUserID uint64, noteText string) (*repository.ProspectNote, error)
	Delete(ctx context.Context, tenantID uint64, id uint64) error
	MarkPaidOff(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error
	CancelClosing(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, reason string) (*CancelClosingResult, error)
	GetCommissionReleaseOn(ctx context.Context, tenantID uint64) (string, error)
	SetCommissionReleaseOn(ctx context.Context, tenantID uint64, releaseOn string) error
	SetCommissionPolicyRepo(repo repository.CommissionPolicyRepository)
	// SetMetaTracker enables Meta Conversions API events (Lead, Purchase) for travels that configured it.
	SetMetaTracker(tracker MetaEventTracker)
	// Anonymize removes the jamaah's personal data on their request (UU PDP) and keeps the commission trail.
	Anonymize(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error

	// Agent-specific methods
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]repository.AgentProspectItem, error)
	ListByAgentPage(ctx context.Context, tenantID uint64, agentID uint64, statusFilter, search *string, page, pageSize int) (*AgentProspectPage, error)
	GetDetailForAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64) (*ProspectDetailResponse, error)
	UpdateStatusByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, newStatus string, lostReason, lostReasonCategory *string) error
	AddNoteByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, noteText string) (*repository.ProspectNote, error)
	CreateManualByAgent(ctx context.Context, tenantID uint64, agentID uint64, input AgentCreateProspectInput) (*repository.Prospect, error)
	RecordReferralClick(ctx context.Context, tenantID uint64, referralCode string, ipAddress string) error
}

type prospectService struct {
	prospectRepo         repository.ProspectRepository
	packageRepo          repository.PackageRepository
	agentRepo            repository.AgentRepository
	tenantRepo           repository.TenantRepository
	commissionLedgerRepo repository.CommissionLedgerRepository
	statusHistoryRepo    repository.ProspectStatusHistoryRepository
	noteRepo             repository.ProspectNoteRepository
	adminUserRepo        repository.AdminUserRepository
	notifService         NotificationService
	policyRepo           repository.CommissionPolicyRepository
	meta                 MetaEventTracker
}

func (s *prospectService) SetMetaTracker(tracker MetaEventTracker) {
	s.meta = tracker
}

// NewProspectService creates a new ProspectService instance.
func NewProspectService(
	prospectRepo repository.ProspectRepository,
	packageRepo repository.PackageRepository,
	agentRepo repository.AgentRepository,
	tenantRepo repository.TenantRepository,
	commissionLedgerRepo repository.CommissionLedgerRepository,
	statusHistoryRepo repository.ProspectStatusHistoryRepository,
	noteRepo repository.ProspectNoteRepository,
	adminUserRepo repository.AdminUserRepository,
	notifService NotificationService,
) ProspectService {
	return &prospectService{
		prospectRepo:         prospectRepo,
		packageRepo:          packageRepo,
		agentRepo:            agentRepo,
		tenantRepo:           tenantRepo,
		commissionLedgerRepo: commissionLedgerRepo,
		statusHistoryRepo:    statusHistoryRepo,
		noteRepo:             noteRepo,
		adminUserRepo:        adminUserRepo,
		notifService:         notifService,
	}
}

// notifyActiveAdmins sends an in-app notification to every active admin of the tenant.
func (s *prospectService) notifyActiveAdmins(ctx context.Context, tenantID uint64, kind, title, body, link string) {
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
			log.Printf("[Notification] Failed to notify admin %d: %v", admin.ID, err)
		}
	}
}

func (s *prospectService) notifyAgent(ctx context.Context, tenantID, agentID uint64, kind, title, body, link string) {
	if s.notifService == nil {
		return
	}
	tID := tenantID
	if _, err := s.notifService.CreateNotification(ctx, &tID, "agent", agentID, kind, title, body, link); err != nil {
		log.Printf("[Notification] Failed to notify agent %d: %v", agentID, err)
	}
}

func (s *prospectService) recordHistory(ctx context.Context, tenantID, prospectID uint64, byType string, byID uint64, oldStatus, newStatus string) {
	if s.statusHistoryRepo == nil {
		return
	}
	history := &repository.ProspectStatusHistory{
		TenantID:      tenantID,
		ProspectID:    prospectID,
		ChangedByType: byType,
		ChangedByID:   byID,
		OldStatus:     oldStatus,
		NewStatus:     newStatus,
	}
	if err := s.statusHistoryRepo.Create(ctx, tenantID, history); err != nil {
		log.Printf("[Prospect] Failed to record status history for prospect %d (%s -> %s): %v", prospectID, oldStatus, newStatus, err)
	}
}

func (s *prospectService) addSystemNote(ctx context.Context, tenantID, prospectID uint64, text string) {
	if s.noteRepo == nil {
		return
	}
	note := &repository.ProspectNote{
		TenantID:   tenantID,
		ProspectID: prospectID,
		AuthorType: "system",
		AuthorID:   0,
		NoteText:   text,
	}
	if err := s.noteRepo.Create(ctx, tenantID, note); err != nil {
		log.Printf("[Prospect] Failed to add system note to prospect %d: %v", prospectID, err)
	}
}

// phoneLocker is implemented by the MySQL prospect repository: it serialises the duplicate check +
// insert for one (tenant, phone) so two simultaneous submissions cannot both create a prospect.
type phoneLocker interface {
	WithPhoneLock(ctx context.Context, tenantID uint64, phoneNormalized string, fn func() error) error
}

func (s *prospectService) withPhoneLock(ctx context.Context, tenantID uint64, phoneNormalized string, fn func() error) error {
	if locker, ok := s.prospectRepo.(phoneLocker); ok {
		return locker.WithPhoneLock(ctx, tenantID, phoneNormalized, fn)
	}
	return fn()
}

// Optional repository capabilities implemented by the MySQL prospect repository.
type prospectDetailFiller interface {
	FillMissingDetails(ctx context.Context, tenantID uint64, id uint64, packageID *uint64, jumlahJamaah *int, departurePlan, domicile *string, consentAt, metaDisclosedAt *time.Time) error
}

type prospectAnonymizer interface {
	Anonymize(ctx context.Context, tenantID uint64, id uint64) error
}

type agentStatusCounter interface {
	AgentStatusCounts(ctx context.Context, tenantID uint64, agentID uint64) (map[string]int, error)
}

// flagEarlierClosing marks a new prospect whose phone already has a closing (DP) prospect, e.g. the
// same jamaah coming back through another agent's link. The prospect is kept (it can be a family
// member or a next umroh), but admins see it before closing it, so commission is not paid twice.
func (s *prospectService) flagEarlierClosing(ctx context.Context, tenantID uint64, prospect *repository.Prospect) {
	if prospect.PhoneNormalized == nil {
		return
	}
	prior, err := s.prospectRepo.FindLatestClosingByPhone(ctx, tenantID, *prospect.PhoneNormalized)
	if err != nil || prior == nil || prior.ID == prospect.ID {
		return
	}
	owner := "tanpa agen"
	if prior.AgentName != "" {
		owner = "agen " + prior.AgentName
	}
	since := ""
	if prior.ClosedAt != nil {
		since = " sejak " + formatWIB(*prior.ClosedAt) + " WIB"
	}
	s.addSystemNote(ctx, tenantID, prospect.ID, fmt.Sprintf(
		"Perhatian: nomor ini sudah Closing (DP)%s di prospek #%d (%s, %s). Pastikan ini bukan jamaah yang sama sebelum closing, agar komisi tidak dibayar dua kali.",
		since, prior.ID, prior.Name, owner))
	s.notifyActiveAdmins(ctx, tenantID, "prospect_already_closed", "Nomor sudah pernah closing",
		fmt.Sprintf("%s masuk sebagai prospek baru, padahal nomornya sudah Closing di prospek #%d.", prospect.Name, prior.ID),
		fmt.Sprintf("/prospects/%d", prospect.ID))
}

// whatsAppTarget picks who the visitor chats with: the owning agent, otherwise the travel's number.
func (s *prospectService) whatsAppTarget(ctx context.Context, tenantID uint64, agent *repository.Agent) string {
	// The demo travel never opens WhatsApp: its numbers are made up and could belong to a real person.
	if s.tenantRepo != nil {
		if t, err := s.tenantRepo.GetByID(ctx, tenantID); err == nil && t != nil && t.IsDemo {
			return ""
		}
	}
	if agent != nil && agent.Phone != nil && strings.TrimSpace(*agent.Phone) != "" {
		if p := NormalizePhoneToWhatsApp(*agent.Phone); p != "" {
			return p
		}
	}
	if s.tenantRepo != nil {
		tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
		if err == nil && tenant != nil && tenant.WhatsAppNumber != nil && strings.TrimSpace(*tenant.WhatsAppNumber) != "" {
			return NormalizePhoneToWhatsApp(*tenant.WhatsAppNumber)
		}
	}
	return ""
}

func buildWhatsAppURL(phone, name, packageName string, jumlahJamaah *int) *string {
	if phone == "" {
		return nil
	}
	var msg string
	if jumlahJamaah != nil && *jumlahJamaah > 0 {
		msg = fmt.Sprintf("Halo, saya %s tertarik dengan paket %s untuk %d orang. Mohon informasinya.", name, packageName, *jumlahJamaah)
	} else {
		msg = fmt.Sprintf("Halo, saya %s tertarik dengan paket %s. Mohon informasinya.", name, packageName)
	}
	u := fmt.Sprintf("https://wa.me/%s?text=%s", phone, url.QueryEscape(msg))
	return &u
}

func (s *prospectService) CreatePublic(ctx context.Context, tenantID uint64, input PublicProspectInput) (*PublicProspectResponse, error) {
	name, err := validateProspectName(input.Name)
	if err != nil {
		return nil, err
	}
	phone, phoneNormalized, err := validateProspectPhone(input.Phone)
	if err != nil {
		return nil, err
	}
	if err := validateJumlahJamaah(input.JumlahJamaah); err != nil {
		return nil, err
	}
	emailPtr, err := validateProspectEmail(input.Email)
	if err != nil {
		return nil, err
	}
	departurePlan, err := validateDeparturePlan(input.DeparturePlan)
	if err != nil {
		return nil, err
	}
	domicile, err := validateDomicile(input.Domicile)
	if err != nil {
		return nil, err
	}
	// UU PDP 27/2022: personal data is collected only with the visitor's explicit consent.
	if !input.Consent {
		return nil, ErrConsentRequired
	}
	consentAt := time.Now()

	// Tenant service suspended (after the 7-day grace period)
	if s.tenantRepo != nil {
		tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
		if err == nil && tenant != nil {
			if util.IsTravelSuspended(tenant.Status, tenant.SubscriptionExpiresAt, time.Now()) {
				return nil, ErrTenantServiceSuspended
			}
		}
	}

	// MANDATORY CROSS-TENANT VALIDATION: the package must belong strictly to this tenant.
	// A package that is not (or no longer) published, or has already departed, is not linked, but the
	// lead is still kept: the visitor may have had the page open while the package went offline.
	packageName := "Umroh"
	packageID := input.PackageID
	if input.PackageID != nil {
		pkg, err := s.packageRepo.GetByID(ctx, tenantID, *input.PackageID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrPackageNotFound
			}
			return nil, err
		}
		if pkg.Status == "published" && !PackageDeparted(pkg, time.Now()) {
			packageName = pkg.Name
		} else {
			packageID = nil
		}
	}

	// Referral agent (must be active and of this tenant)
	var referralAgent *repository.Agent
	if s.agentRepo != nil {
		if input.ReferralCode != nil && strings.TrimSpace(*input.ReferralCode) != "" {
			agent, err := s.agentRepo.GetByReferralCode(ctx, strings.TrimSpace(*input.ReferralCode))
			if err == nil && agent != nil && agent.TenantID == tenantID && agent.Status == "active" {
				referralAgent = agent
			}
		} else if input.AgentID != nil {
			agent, err := s.agentRepo.GetByID(ctx, tenantID, *input.AgentID)
			if err == nil && agent != nil && agent.Status == "active" {
				referralAgent = agent
			}
		}
	}

	// Source is decided here, never taken from the client: agent referral > ad click > organic.
	var attribution ProspectAttribution
	if input.Attribution != nil {
		attribution = *input.Attribution
	}
	sourceChannel := "organik"
	if referralAgent != nil {
		sourceChannel = "agen"
	} else if attribution.isPaid() {
		sourceChannel = "paid"
	}

	// First owner wins: the same jamaah submitting again while their prospect is still open does not
	// create a second prospect (and cannot move it to another agent). The admins and the owning agent
	// are told, and the chat goes to whoever already handles this jamaah.
	var agentID *uint64
	if referralAgent != nil {
		agentID = &referralAgent.ID
	}
	prospect := &repository.Prospect{
		TenantID:        tenantID,
		PackageID:       packageID,
		AgentID:         agentID,
		Name:            name,
		Phone:           phone,
		PhoneNormalized: &phoneNormalized,
		JumlahJamaah:    input.JumlahJamaah,
		DeparturePlan:   departurePlan,
		Domicile:        domicile,
		ConsentAt:       &consentAt,
		Email:           emailPtr,
		SourceChannel:   sourceChannel,
		UTMSource:       truncatedPtr(attribution.UTMSource, 100),
		UTMMedium:       truncatedPtr(attribution.UTMMedium, 100),
		UTMCampaign:     truncatedPtr(attribution.UTMCampaign, 150),
		Fbclid:          truncatedPtr(attribution.Fbclid, 255),
		Status:          "baru", // Force initial status to 'baru' server-side
	}
	if input.ConsentMeta {
		prospect.MetaDisclosedAt = &consentAt
	}
	var eventSourceURL string
	if input.Meta != nil {
		prospect.MetaFbp = cleanMetaCookie(input.Meta.Fbp)
		prospect.MetaFbc = cleanMetaCookie(input.Meta.Fbc)
		if u := strings.TrimSpace(input.Meta.EventSourceURL); strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
			eventSourceURL = truncate(u, 1000)
		}
	}
	// No _fbc cookie but the visitor came from a Meta ad click: build fbc from fbclid as Meta documents.
	if prospect.MetaFbc == nil && prospect.Fbclid != nil {
		prospect.MetaFbc = cleanMetaCookie(fmt.Sprintf("fb.1.%d.%s", time.Now().UnixMilli(), *prospect.Fbclid))
	}

	var existing *repository.Prospect
	err = s.withPhoneLock(ctx, tenantID, phoneNormalized, func() error {
		found, err := s.prospectRepo.FindOpenByPhone(ctx, tenantID, phoneNormalized)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return err
		}
		if found != nil {
			existing = found
			return nil
		}
		return s.prospectRepo.Create(ctx, tenantID, prospect)
	})
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return s.handleRepeatSubmission(ctx, tenantID, existing, prospect, packageName, referralAgent)
	}
	s.flagEarlierClosing(ctx, tenantID, prospect)

	s.notifyActiveAdmins(ctx, tenantID, "prospect_new", "Prospek baru",
		fmt.Sprintf("%s tertarik paket %s", name, packageName),
		fmt.Sprintf("/prospects/%d", prospect.ID))

	if referralAgent != nil {
		s.notifyAgent(ctx, tenantID, referralAgent.ID, "prospect_new", "Prospek Baru Masuk",
			fmt.Sprintf("%s mendaftar melalui link referral Anda (Paket %s)", name, packageName),
			fmt.Sprintf("/agen/jamaah/%d", prospect.ID))
	}

	// The browser pixel's Lead carries no personal data; the server event does, so it is sent only when
	// the visitor's consent text mentioned Meta.
	eventID := newMetaEventID()
	if s.meta != nil && prospect.MetaDisclosedAt != nil {
		ev := MetaLeadEvent{
			EventID:     eventID,
			EventTime:   consentAt,
			SourceURL:   eventSourceURL,
			User:        metaUserFromProspect(tenantID, prospect),
			ContentName: packageName,
		}
		ev.User.ClientIP = strings.TrimSpace(input.ClientIP)
		ev.User.UserAgent = truncate(strings.TrimSpace(input.UserAgent), 500)
		if prospect.PackageID != nil {
			ev.ContentID = strconv.FormatUint(*prospect.PackageID, 10)
		}
		s.meta.TrackLead(tenantID, ev)
	}

	return &PublicProspectResponse{
		Message:             "Terima kasih, tim kami akan segera menghubungi Anda",
		WhatsAppRedirectURL: buildWhatsAppURL(s.whatsAppTarget(ctx, tenantID, referralAgent), name, packageName, input.JumlahJamaah),
		MetaEventID:         eventID,
	}, nil
}

// metaUserFromProspect is the Meta matching data of a prospect (hashed later by the Meta service).
func metaUserFromProspect(tenantID uint64, p *repository.Prospect) MetaUserData {
	u := MetaUserData{Name: p.Name, ExternalID: metaExternalID(tenantID, p.ID)}
	if p.PhoneNormalized != nil {
		u.Phone = *p.PhoneNormalized
	}
	if p.Email != nil {
		u.Email = *p.Email
	}
	if p.Domicile != nil {
		u.City = *p.Domicile
	}
	if p.MetaFbp != nil {
		u.Fbp = *p.MetaFbp
	}
	if p.MetaFbc != nil {
		u.Fbc = *p.MetaFbc
	}
	return u
}

// metaPurchaseClaimer is implemented by the MySQL prospect repository (one Purchase per prospect).
type metaPurchaseClaimer interface {
	ClaimMetaPurchase(ctx context.Context, tenantID uint64, id uint64) (bool, error)
	ReleaseMetaPurchase(ctx context.Context, tenantID uint64, id uint64) error
}

// trackPurchase sends the Meta Purchase event for a closing (DP paid) of a web-form lead with consent.
// Leads typed in by agents never came through the website/ads, so they are not reported. It is sent
// once per prospect: a closing cancelled and closed again does not count twice in the ad reports.
func (s *prospectService) trackPurchase(ctx context.Context, tenantID uint64, p *repository.Prospect) {
	if s.meta == nil || p.EntryMethod != "web_form" || p.ConsentAt == nil || p.MetaDisclosedAt == nil || p.AnonymizedAt != nil {
		return
	}
	if !s.meta.Enabled(ctx, tenantID) {
		return
	}
	claimer, ok := s.prospectRepo.(metaPurchaseClaimer)
	if !ok {
		return
	}
	if first, err := claimer.ClaimMetaPurchase(ctx, tenantID, p.ID); err != nil || !first {
		if err != nil {
			log.Printf("[Meta] tenant %d: cannot claim Purchase for prospect %d: %v", tenantID, p.ID, err)
		}
		return
	}
	jamaah := 1
	if p.JumlahJamaah != nil && *p.JumlahJamaah > 0 {
		jamaah = *p.JumlahJamaah
	}
	ev := MetaPurchaseEvent{
		EventID:   fmt.Sprintf("purchase-%d-%d", tenantID, p.ID),
		EventTime: time.Now(),
		User:      metaUserFromProspect(tenantID, p),
		NumItems:  jamaah,
		// Delivery failed (e.g. expired token): release the claim so a later closing can report it.
		OnFailed: func() {
			if err := claimer.ReleaseMetaPurchase(context.Background(), tenantID, p.ID); err != nil {
				log.Printf("[Meta] tenant %d: cannot release Purchase claim of prospect %d: %v", tenantID, p.ID, err)
			}
		},
	}
	if p.PackageID != nil {
		ev.ContentID = strconv.FormatUint(*p.PackageID, 10)
		if pkg, err := s.packageRepo.GetByID(ctx, tenantID, *p.PackageID); err == nil {
			ev.ContentName = pkg.Name
			if pkg.Price != nil && *pkg.Price > 0 {
				ev.Value = *pkg.Price * float64(jamaah)
			}
		}
	}
	s.meta.TrackPurchase(tenantID, ev)
}

// handleRepeatSubmission handles a jamaah who submits again while their prospect is still open:
// no second prospect, but the details they gave now complete the empty fields of the open one.
func (s *prospectService) handleRepeatSubmission(
	ctx context.Context,
	tenantID uint64,
	existing *repository.Prospect,
	incoming *repository.Prospect,
	packageName string,
	referralAgent *repository.Agent,
) (*PublicProspectResponse, error) {
	name, jumlahJamaah := incoming.Name, incoming.JumlahJamaah
	via := "form web"
	switch {
	case referralAgent != nil && (existing.AgentID == nil || *existing.AgentID != referralAgent.ID):
		via = fmt.Sprintf("link agen %s (bukan pemilik prospek, prospek tetap di pemilik awal)", referralAgent.Name)
	case referralAgent != nil:
		via = "link agen yang sama"
	case incoming.SourceChannel == "paid":
		via = "iklan"
	}
	detail := fmt.Sprintf("paket diminati: %s", packageName)
	if jumlahJamaah != nil && *jumlahJamaah > 0 {
		detail += fmt.Sprintf(", jumlah jamaah: %d", *jumlahJamaah)
	}
	if incoming.DeparturePlan != nil {
		detail += ", rencana berangkat: " + formatDeparturePlanLabel(*incoming.DeparturePlan)
	}
	if incoming.Domicile != nil {
		detail += ", domisili: " + *incoming.Domicile
	}
	if filler, ok := s.prospectRepo.(prospectDetailFiller); ok {
		if err := filler.FillMissingDetails(ctx, tenantID, existing.ID, incoming.PackageID, incoming.JumlahJamaah,
			incoming.DeparturePlan, incoming.Domicile, incoming.ConsentAt, incoming.MetaDisclosedAt); err != nil {
			log.Printf("[Prospect] Failed to complete prospect %d from repeat submission: %v", existing.ID, err)
		}
	}
	s.addSystemNote(ctx, tenantID, existing.ID, fmt.Sprintf("Calon jamaah mendaftar lagi lewat %s (%s). Nama yang diisi: %s. Kolom yang masih kosong dilengkapi dari pendaftaran ini.", via, detail, name))

	s.notifyActiveAdmins(ctx, tenantID, "prospect_repeat", "Prospek mendaftar lagi",
		fmt.Sprintf("%s mendaftar lagi (paket %s). Prospek lama tetap dipakai.", existing.Name, packageName),
		fmt.Sprintf("/prospects/%d", existing.ID))

	var owner *repository.Agent
	if existing.AgentID != nil {
		s.notifyAgent(ctx, tenantID, *existing.AgentID, "prospect_repeat", "Calon jamaah Anda menghubungi lagi",
			fmt.Sprintf("%s mendaftar lagi (paket %s). Segera follow up.", existing.Name, packageName),
			fmt.Sprintf("/agen/jamaah/%d", existing.ID))
		if s.agentRepo != nil {
			if a, err := s.agentRepo.GetByID(ctx, tenantID, *existing.AgentID); err == nil && a != nil && a.Status == "active" {
				owner = a
			}
		}
	}

	return &PublicProspectResponse{
		Message:             "Terima kasih, tim kami akan segera menghubungi Anda",
		WhatsAppRedirectURL: buildWhatsAppURL(s.whatsAppTarget(ctx, tenantID, owner), name, packageName, jumlahJamaah),
	}, nil
}

func (s *prospectService) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Prospect, error) {
	return s.prospectRepo.GetByID(ctx, tenantID, id)
}

func normalizeStatusFilter(filter *repository.ProspectFilter) error {
	if filter.Status != nil && *filter.Status != "" && *filter.Status != "all" {
		status := strings.ToLower(strings.TrimSpace(*filter.Status))
		if !validProspectStatuses[status] {
			return ErrInvalidProspectStatus
		}
		filter.Status = &status
	}
	return nil
}

func (s *prospectService) List(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]repository.Prospect, error) {
	if err := normalizeStatusFilter(&filter); err != nil {
		return nil, err
	}
	return s.prospectRepo.ListWithFilter(ctx, tenantID, filter)
}

func (s *prospectService) ListPage(ctx context.Context, tenantID uint64, filter repository.ProspectFilter, page, pageSize int) (*ProspectListPage, error) {
	if err := normalizeStatusFilter(&filter); err != nil {
		return nil, err
	}
	if pageSize <= 0 {
		pageSize = DefaultProspectPageSize
	}
	if pageSize > MaxProspectPageSize {
		pageSize = MaxProspectPageSize
	}
	if page <= 0 {
		page = 1
	}
	filter.Limit = pageSize
	filter.Offset = (page - 1) * pageSize

	total, err := s.prospectRepo.CountWithFilter(ctx, tenantID, filter)
	if err != nil {
		return nil, err
	}
	items, err := s.prospectRepo.ListWithFilter(ctx, tenantID, filter)
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []repository.Prospect{}
	}
	return &ProspectListPage{Items: items, Total: total, Page: page, PageSize: pageSize}, nil
}

func (s *prospectService) Summary(ctx context.Context, tenantID uint64) (*repository.ProspectStatusSummary, error) {
	return s.prospectRepo.StatusSummary(ctx, tenantID)
}

func sameStringPtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func (s *prospectService) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, newStatus string, lostReason, lostReasonCategory *string) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}

	// Personal data removed (UU PDP): the prospect stays as a record only, it never re-enters the pipeline.
	if prospect.AnonymizedAt != nil {
		return ErrProspectAnonymized
	}

	// GUARD PALING AWAL: kalau status LAMA prospek sudah 'closing', tolak
	if prospect.Status == "closing" {
		return ErrProspectAlreadyClosed
	}

	status := strings.ToLower(strings.TrimSpace(newStatus))
	if !validProspectStatuses[status] {
		return ErrInvalidProspectStatus
	}
	reason, category, err := cleanLostReasonWithCategory(status, lostReason, lostReasonCategory, false)
	if err != nil {
		return err
	}

	oldStatus := prospect.Status
	if oldStatus == status && sameStringPtr(reason, prospect.LostReason) && sameStringPtr(category, prospect.LostReasonCategory) {
		return nil
	}

	// Claim the transition atomically: only one of several concurrent requests (double click, two
	// admins) moves the prospect out of oldStatus, so commission is booked exactly once.
	if err := s.prospectRepo.TransitionStatus(ctx, tenantID, id, oldStatus, status, reason, category); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return ErrProspectStatusConflict
		}
		return err
	}

	if status == "closing" {
		if err := s.CalculateAndRecordCommission(ctx, tenantID, id); err != nil {
			// Commission could not be booked: give the closing back so the admin can retry, instead of
			// leaving a final 'closing' without commission.
			if revertErr := s.prospectRepo.TransitionStatus(ctx, tenantID, id, "closing", oldStatus, prospect.LostReason, prospect.LostReasonCategory); revertErr != nil {
				log.Printf("[Prospect] CRITICAL: failed to revert prospect %d to %s after commission error (%v): %v", id, oldStatus, err, revertErr)
			}
			return err
		}
	}

	if oldStatus != status {
		s.recordHistory(ctx, tenantID, id, "admin", adminUserID, oldStatus, status)
	}
	if status == "closing" {
		s.trackPurchase(ctx, tenantID, prospect)
	}

	// In-app notification to the agent who owns the prospect
	if oldStatus != status && prospect.AgentID != nil {
		title := fmt.Sprintf("Status Prospek: %s", humanProspectStatus(status))
		body := fmt.Sprintf("Status calon jamaah %s diperbarui menjadi %s", prospect.Name, humanProspectStatus(status))
		if status == "closing" {
			title = "Alhamdulillah! Prospek Closing"
			body = fmt.Sprintf("Calon jamaah %s telah berhasil closing!", prospect.Name)
		}
		s.notifyAgent(ctx, tenantID, *prospect.AgentID, "prospect_status_updated", title, body, fmt.Sprintf("/agen/jamaah/%d", prospect.ID))
	}

	return nil
}

// ledgerBatchCreator is implemented by the MySQL ledger repository: all entries of one booking are
// written in a single transaction (all or nothing).
type ledgerBatchCreator interface {
	CreateBatch(ctx context.Context, tenantID uint64, entries []*repository.CommissionLedger) error
}

func (s *prospectService) createLedgers(ctx context.Context, tenantID uint64, entries []*repository.CommissionLedger) error {
	if s.commissionLedgerRepo == nil || len(entries) == 0 {
		return nil
	}
	if batch, ok := s.commissionLedgerRepo.(ledgerBatchCreator); ok {
		return batch.CreateBatch(ctx, tenantID, entries)
	}
	for _, e := range entries {
		if err := s.commissionLedgerRepo.Create(ctx, tenantID, e); err != nil {
			return err
		}
	}
	return nil
}

// overridePercentage returns the tenant's override percentage for a sub-agent, or 0 when override is
// off or the agent has no parent.
func (s *prospectService) overrideFor(ctx context.Context, tenantID uint64, agentID uint64) (parentID *uint64, pct float64) {
	if s.tenantRepo == nil || s.agentRepo == nil {
		return nil, 0
	}
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err != nil || tenant == nil || !tenant.CommissionOverrideEnabled || tenant.CommissionOverridePercentage == nil || *tenant.CommissionOverridePercentage <= 0 {
		return nil, 0
	}
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil || agent == nil || agent.ParentAgentID == nil {
		return nil, 0
	}
	// An upline earns override only while active (founder decision, 30 Sep 2026): a deactivated upline
	// gets nothing for closings made while inactive, and nothing is paid back after reactivation.
	// Override booked before the deactivation stays theirs.
	parent, err := s.agentRepo.GetByID(ctx, tenantID, *agent.ParentAgentID)
	if err != nil || parent == nil || parent.Status != "active" {
		return nil, 0
	}
	return agent.ParentAgentID, *tenant.CommissionOverridePercentage
}

func (s *prospectService) CalculateAndRecordCommission(ctx context.Context, tenantID uint64, prospectID uint64) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, prospectID)
	if err != nil {
		return err
	}

	// Only prospects with an assigned agent and a package receive commissions.
	if prospect.AgentID == nil || prospect.PackageID == nil {
		return nil
	}

	pkg, err := s.packageRepo.GetByID(ctx, tenantID, *prospect.PackageID)
	if err != nil {
		return err
	}
	if pkg.CommissionAmount == nil || *pkg.CommissionAmount <= 0 {
		return nil
	}

	jamaah := 1
	if prospect.JumlahJamaah != nil && *prospect.JumlahJamaah > 0 {
		jamaah = *prospect.JumlahJamaah
	}
	directAmount := *pkg.CommissionAmount * float64(jamaah)
	pkgID := pkg.ID
	releasedAt := s.releaseTimeFor(ctx, tenantID, prospect)

	entries := []*repository.CommissionLedger{{
		TenantID:   tenantID,
		AgentID:    *prospect.AgentID,
		ProspectID: prospect.ID,
		PackageID:  &pkgID,
		Type:       "direct",
		Amount:     directAmount,
		ReleasedAt: releasedAt,
	}}

	var overrideAmount float64
	parentID, pct := s.overrideFor(ctx, tenantID, *prospect.AgentID)
	if parentID != nil {
		overrideAmount = (pct / 100.0) * directAmount
		entries = append(entries, &repository.CommissionLedger{
			TenantID:   tenantID,
			AgentID:    *parentID,
			ProspectID: prospect.ID,
			PackageID:  &pkgID,
			Type:       "override",
			Amount:     overrideAmount,
			ReleasedAt: releasedAt,
		})
	}

	if err := s.createLedgers(ctx, tenantID, entries); err != nil {
		return err
	}

	if directAmount > 0 {
		body := fmt.Sprintf("Komisi Rp %s dari closing jamaah %s sudah bisa dicairkan.", util.FormatRupiah(directAmount), prospect.Name)
		if releasedAt == nil {
			body = fmt.Sprintf("Komisi Rp %s dari closing (DP) jamaah %s tercatat. Komisi tertahan dan bisa dicairkan setelah jamaah lunas.", util.FormatRupiah(directAmount), prospect.Name)
		}
		s.notifyAgent(ctx, tenantID, *prospect.AgentID, "commission_earned", "Komisi baru tercatat", body, "/agen/riwayat-komisi")
	}
	if parentID != nil && overrideAmount > 0 {
		body := fmt.Sprintf("Komisi override Rp %s dari jaringan Anda sudah bisa dicairkan.", util.FormatRupiah(overrideAmount))
		if releasedAt == nil {
			body = fmt.Sprintf("Komisi override Rp %s dari jaringan Anda tercatat dan tertahan sampai jamaah lunas.", util.FormatRupiah(overrideAmount))
		}
		s.notifyAgent(ctx, tenantID, *parentID, "commission_override_earned", "Komisi override tercatat", body, "/agen/riwayat-komisi")
	}
	return nil
}

func (s *prospectService) UpdateDetail(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, input UpdateProspectInput) error {
	name, err := validateProspectName(input.Name)
	if err != nil {
		return err
	}
	phone, phoneNormalized, err := validateProspectPhone(input.Phone)
	if err != nil {
		return err
	}
	if err := validateJumlahJamaah(input.JumlahJamaah); err != nil {
		return err
	}
	domicile, err := validateDomicile(input.Domicile)
	if err != nil {
		return err
	}

	var newPkg *repository.Package
	if input.PackageID != nil {
		p, err := s.packageRepo.GetByID(ctx, tenantID, *input.PackageID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return ErrPackageNotFound
			}
			return err
		}
		newPkg = p
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if prospect.AnonymizedAt != nil {
		return ErrProspectAnonymized
	}

	// An unchanged planned month is kept even if it is in the past by now; the "upcoming month" rule
	// only applies when the admin picks a new month (otherwise an old prospect could never be edited).
	departurePlan := prospect.DeparturePlan
	if !sameStringPtr(trimmedPtr(input.DeparturePlan), prospect.DeparturePlan) {
		departurePlan, err = validateDeparturePlan(input.DeparturePlan)
		if err != nil {
			return err
		}
	}

	// A new number must not collide with another prospect that is still being worked on.
	if prospect.PhoneNormalized == nil || *prospect.PhoneNormalized != phoneNormalized {
		other, err := s.prospectRepo.FindOpenByPhone(ctx, tenantID, phoneNormalized)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return err
		}
		if other != nil && other.ID != prospect.ID {
			return fmt.Errorf("%w (prospek #%d atas nama %s)", ErrPhoneUsedByOpenProspect, other.ID, other.Name)
		}
	}

	if prospect.Status == "closing" {
		if err := s.correctClosedCommission(ctx, tenantID, prospect, newPkg, input); err != nil {
			return err
		}
	}

	prospect.Name = name
	prospect.Phone = phone
	prospect.PhoneNormalized = &phoneNormalized
	prospect.PackageID = input.PackageID
	prospect.JumlahJamaah = input.JumlahJamaah
	prospect.DeparturePlan = departurePlan
	prospect.Domicile = domicile

	return s.prospectRepo.Update(ctx, tenantID, prospect)
}

// correctClosedCommission books correction entries when the package or jamaah count of a closed
// prospect changes, so the agent's commission always equals (package commission × jamaah).
// Earlier entries are never edited or deleted (audit trail).
func (s *prospectService) correctClosedCommission(ctx context.Context, tenantID uint64, prospect *repository.Prospect, newPkg *repository.Package, input UpdateProspectInput) error {
	oldJamaah := 1
	if prospect.JumlahJamaah != nil && *prospect.JumlahJamaah > 0 {
		oldJamaah = *prospect.JumlahJamaah
	}
	newJamaah := 1
	if input.JumlahJamaah != nil && *input.JumlahJamaah > 0 {
		newJamaah = *input.JumlahJamaah
	}
	packageChanged := !sameUint64Ptr(prospect.PackageID, input.PackageID)
	if oldJamaah == newJamaah && !packageChanged {
		return nil
	}

	var reason string
	if input.CorrectionReason != nil {
		reason = strings.TrimSpace(*input.CorrectionReason)
	}
	if reason == "" {
		return ErrCorrectionReasonRequired
	}

	if prospect.AgentID == nil || s.commissionLedgerRepo == nil {
		return nil
	}
	agentID := *prospect.AgentID

	ledgers, err := s.commissionLedgerRepo.ListByProspect(ctx, tenantID, prospect.ID)
	if err != nil {
		return err
	}

	// Net totals (original rows + corrections) say what is booked now; the original rows alone, which are
	// never edited, say what override share the prospect was closed with.
	var directTotal, overrideTotal, origDirect, origOverride float64
	var overrideAgentID *uint64
	for i := range ledgers {
		l := ledgers[i]
		switch l.Type {
		case "direct":
			origDirect += l.Amount
		case "override":
			origOverride += l.Amount
		}
		switch {
		case l.Type == "direct" || (l.Type == "correction" && l.AgentID == agentID):
			directTotal += l.Amount
		default:
			overrideTotal += l.Amount
			if overrideAgentID == nil {
				a := l.AgentID
				overrideAgentID = &a
			}
		}
	}

	rate := 0.0
	var pkgID *uint64
	if newPkg != nil {
		id := newPkg.ID
		pkgID = &id
		if newPkg.CommissionAmount != nil && *newPkg.CommissionAmount > 0 {
			rate = *newPkg.CommissionAmount
		}
	}
	targetDirect := rate * float64(newJamaah)

	// Keep the override share the prospect was closed with. It comes from the original rows, not the net
	// totals: after an edit to a zero-commission package the net direct is 0, and deriving the share from
	// it would drop the upline's override for good when the package is changed back. If the closing had
	// no commission to take a share from, use the tenant's current override setting.
	var targetOverride float64
	switch {
	case overrideAgentID != nil && origDirect > 0:
		targetOverride = targetDirect * (origOverride / origDirect)
	case overrideAgentID != nil && directTotal > 0:
		targetOverride = targetDirect * (overrideTotal / directTotal)
	default:
		if parentID, pct := s.overrideFor(ctx, tenantID, agentID); parentID != nil {
			if overrideAgentID == nil {
				overrideAgentID = parentID
			}
			targetOverride = (pct / 100.0) * targetDirect
		}
	}

	releasedAt := s.releaseTimeFor(ctx, tenantID, prospect)
	var entries []*repository.CommissionLedger
	if diff := targetDirect - directTotal; diff != 0 {
		entries = append(entries, &repository.CommissionLedger{
			TenantID: tenantID, AgentID: agentID, ProspectID: prospect.ID, PackageID: pkgID,
			Type: "correction", Amount: diff, Notes: &reason, ReleasedAt: releasedAt,
		})
	}
	if overrideAgentID != nil {
		if diff := targetOverride - overrideTotal; diff != 0 {
			entries = append(entries, &repository.CommissionLedger{
				TenantID: tenantID, AgentID: *overrideAgentID, ProspectID: prospect.ID, PackageID: pkgID,
				Type: "correction", Amount: diff, Notes: &reason, ReleasedAt: releasedAt,
			})
		}
	}
	return s.createLedgers(ctx, tenantID, entries)
}

func sameUint64Ptr(a, b *uint64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func (s *prospectService) GetDetail(ctx context.Context, tenantID uint64, id uint64) (*ProspectDetailResponse, error) {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	var pkg *repository.Package
	if prospect.PackageID != nil && s.packageRepo != nil {
		p, err := s.packageRepo.GetByID(ctx, tenantID, *prospect.PackageID)
		if err == nil {
			pkg = p
		}
	}

	var ag *repository.Agent
	if prospect.AgentID != nil && s.agentRepo != nil {
		a, err := s.agentRepo.GetByID(ctx, tenantID, *prospect.AgentID)
		if err == nil {
			ag = a
		}
	}

	var statusHistory []repository.ProspectStatusHistory
	if s.statusHistoryRepo != nil {
		sh, err := s.statusHistoryRepo.ListByProspect(ctx, tenantID, id)
		if err == nil {
			statusHistory = sh
		}
	}
	if statusHistory == nil {
		statusHistory = []repository.ProspectStatusHistory{}
	}

	var notes []repository.ProspectNote
	if s.noteRepo != nil {
		n, err := s.noteRepo.ListByProspect(ctx, tenantID, id)
		if err == nil {
			notes = n
		}
	}
	if notes == nil {
		notes = []repository.ProspectNote{}
	}

	var commissionInfo *ProspectCommissionInfo
	// "Disembunyikan sepenuhnya kalau prospek tidak punya agen (organik/paid)" per screen.md
	if prospect.AgentID != nil {
		jamaah := 1
		if prospect.JumlahJamaah != nil && *prospect.JumlahJamaah > 0 {
			jamaah = *prospect.JumlahJamaah
		}

		if (prospect.Status == "closing" || prospect.Status == "tidak_lanjut") && s.commissionLedgerRepo != nil {
			ledgers, err := s.commissionLedgerRepo.ListByProspect(ctx, tenantID, id)
			if err == nil && len(ledgers) > 0 {
				var directTotal, overrideTotal, heldTotal, releasedTotal, agentHeld, agentReleased float64
				for _, l := range ledgers {
					if l.ReleasedAt == nil {
						heldTotal += l.Amount
					} else {
						releasedTotal += l.Amount
					}
					if l.AgentID == *prospect.AgentID {
						if l.ReleasedAt == nil {
							agentHeld += l.Amount
						} else {
							agentReleased += l.Amount
						}
					}
					if l.Type == "direct" {
						directTotal += l.Amount
					} else if l.Type == "override" {
						overrideTotal += l.Amount
					} else if l.Type == "correction" {
						if l.AgentID == *prospect.AgentID {
							directTotal += l.Amount
						} else {
							overrideTotal += l.Amount
						}
					}
				}
				var rate float64
				if jamaah > 0 {
					rate = directTotal / float64(jamaah)
				}
				infoType := "final"
				if prospect.Status == "tidak_lanjut" {
					// Closing cancelled after DP: the commission was reversed (net amounts, usually 0).
					infoType = "dibatalkan"
				}
				commissionInfo = &ProspectCommissionInfo{
					Type:                infoType,
					DirectAmount:        directTotal,
					OverrideAmount:      overrideTotal,
					TotalAmount:         directTotal + overrideTotal,
					RatePerJamaah:       rate,
					HeldAmount:          heldTotal,
					ReleasedAmount:      releasedTotal,
					AgentHeldAmount:     agentHeld,
					AgentReleasedAmount: agentReleased,
				}
			}
		}

		// Potential commission only for prospects still in progress (never for 'tidak_lanjut').
		if commissionInfo == nil && prospect.Status != "closing" && prospect.Status != "tidak_lanjut" {
			rate := 0.0
			if pkg != nil && pkg.CommissionAmount != nil {
				rate = *pkg.CommissionAmount
			}
			directPotential := rate * float64(jamaah)
			overridePotential := 0.0

			// Same rule as the booking at closing (overrideFor): no override for an inactive upline.
			if ag != nil && directPotential > 0 {
				if parentID, pct := s.overrideFor(ctx, tenantID, ag.ID); parentID != nil {
					overridePotential = (pct / 100.0) * directPotential
				}
			}

			commissionInfo = &ProspectCommissionInfo{
				Type:           "potensi",
				DirectAmount:   directPotential,
				OverrideAmount: overridePotential,
				TotalAmount:    directPotential + overridePotential,
				RatePerJamaah:  rate,
			}
		}
	}

	return &ProspectDetailResponse{
		Prospect:      prospect,
		Package:       pkg,
		Agent:         ag,
		InfoKomisi:    commissionInfo,
		StatusHistory: statusHistory,
		Notes:         notes,
	}, nil
}

func (s *prospectService) AddNote(ctx context.Context, tenantID uint64, prospectID uint64, adminUserID uint64, noteText string) (*repository.ProspectNote, error) {
	trimmed, err := validateNoteText(noteText)
	if err != nil {
		return nil, err
	}

	// Verify prospect belongs to tenant
	existing, err := s.prospectRepo.GetByID(ctx, tenantID, prospectID)
	if err != nil {
		return nil, err
	}
	if existing.AnonymizedAt != nil {
		return nil, ErrProspectAnonymized
	}

	note := &repository.ProspectNote{
		TenantID:   tenantID,
		ProspectID: prospectID,
		AuthorType: "admin",
		AuthorID:   adminUserID,
		NoteText:   trimmed,
	}
	if err := s.noteRepo.Create(ctx, tenantID, note); err != nil {
		return nil, err
	}
	return note, nil
}

// Delete removes a prospect (e.g. spam or test entries). Closed prospects and prospects with commission
// records are never deletable: that would erase the agent's earnings history.
func (s *prospectService) Delete(ctx context.Context, tenantID uint64, id uint64) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if prospect.Status == "closing" {
		return ErrProspectCannotDelete
	}
	if s.commissionLedgerRepo != nil {
		ledgers, err := s.commissionLedgerRepo.ListByProspect(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if len(ledgers) > 0 {
			return ErrProspectCannotDelete
		}
	}
	return s.prospectRepo.Delete(ctx, tenantID, id)
}

// Anonymize removes the jamaah's personal data on their request (UU PDP right to erasure). The
// prospect row, its status history and commission ledger stay, so the agent's earnings trail is kept.
func (s *prospectService) Anonymize(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if prospect.AnonymizedAt != nil {
		return ErrProspectAnonymized
	}
	anonymizer, ok := s.prospectRepo.(prospectAnonymizer)
	if !ok {
		return errors.New("anonimisasi tidak didukung oleh penyimpanan data ini")
	}
	if err := anonymizer.Anonymize(ctx, tenantID, id); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return ErrProspectAnonymized
		}
		return err
	}
	s.addSystemNote(ctx, tenantID, id, fmt.Sprintf(
		"Data pribadi jamaah dihapus atas permintaan jamaah (UU PDP) oleh admin #%d. Riwayat status dan komisi tetap disimpan.", adminUserID))
	return nil
}

// sanitizeCSVField mitigates CSV Injection (formula injection) by prefixing an apostrophe
// if the field starts with dangerous formula triggers (=, +, -, @, \t, \r).
func sanitizeCSVField(val string) string {
	if len(val) == 0 {
		return val
	}
	switch val[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + val
	default:
		return val
	}
}

var jakartaLocation = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*60*60)
	}
	return loc
}()

func formatWIB(t time.Time) string {
	return t.In(jakartaLocation).Format("2006-01-02 15:04")
}

func humanSourceChannel(source string) string {
	switch source {
	case "agen":
		return "Agen"
	case "paid":
		return "Iklan"
	default:
		return "Organik"
	}
}

func humanEntryMethod(method string) string {
	if method == "agent_manual" {
		return "Input manual agen"
	}
	return "Form web"
}

func strOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func (s *prospectService) ExportCSV(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]byte, error) {
	if err := normalizeStatusFilter(&filter); err != nil {
		return nil, err
	}
	filter.Limit = 0
	filter.Offset = 0
	prospects, err := s.prospectRepo.ListWithFilter(ctx, tenantID, filter)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	// UTF-8 BOM so Excel shows names with non-ASCII characters correctly.
	buf.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(&buf)

	header := []string{
		"ID", "Tanggal Masuk (WIB)", "Nama", "No. WhatsApp", "Email", "Paket", "Jumlah Jamaah",
		"Rencana Berangkat", "Domisili",
		"Sumber", "Agen", "Cara Masuk", "Status", "Kategori Alasan", "Alasan Tidak Lanjut", "Tanggal Closing (WIB)",
		"Tanggal Lunas (WIB)", "UTM Source", "UTM Medium", "UTM Campaign", "Persetujuan Kontak (WIB)",
	}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, p := range prospects {
		jumlah := "1"
		if p.JumlahJamaah != nil && *p.JumlahJamaah > 0 {
			jumlah = strconv.Itoa(*p.JumlahJamaah)
		}
		// Closing/lunas dates only for prospects that are still closing (a cancelled closing has none).
		closedAt, paidOffAt := "", ""
		if p.Status == "closing" && p.ClosedAt != nil {
			closedAt = formatWIB(*p.ClosedAt)
		}
		if p.Status == "closing" && p.PaidOffAt != nil {
			paidOffAt = formatWIB(*p.PaidOffAt)
		}
		consentAt := ""
		if p.ConsentAt != nil {
			consentAt = formatWIB(*p.ConsentAt)
		}
		row := []string{
			strconv.FormatUint(p.ID, 10),
			formatWIB(p.CreatedAt),
			sanitizeCSVField(p.Name),
			sanitizeCSVField(p.Phone),
			sanitizeCSVField(strOrEmpty(p.Email)),
			sanitizeCSVField(p.PackageName),
			jumlah,
			strOrEmpty(p.DeparturePlan),
			sanitizeCSVField(strOrEmpty(p.Domicile)),
			humanSourceChannel(p.SourceChannel),
			sanitizeCSVField(p.AgentName),
			humanEntryMethod(p.EntryMethod),
			humanProspectStatus(p.Status),
			humanLostReasonCategory(p.LostReasonCategory),
			sanitizeCSVField(strOrEmpty(p.LostReason)),
			closedAt,
			paidOffAt,
			sanitizeCSVField(strOrEmpty(p.UTMSource)),
			sanitizeCSVField(strOrEmpty(p.UTMMedium)),
			sanitizeCSVField(strOrEmpty(p.UTMCampaign)),
			consentAt,
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (s *prospectService) verifyActiveAgent(ctx context.Context, tenantID, agentID uint64) error {
	if s.agentRepo == nil {
		return nil
	}
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrAgentNotActive
		}
		return err
	}
	if agent.Status != "active" {
		return ErrAgentNotActive
	}
	return nil
}

// AgentProspectPage is one page of an agent's jamaah list.
type AgentProspectPage struct {
	Items    []repository.AgentProspectItem `json:"items"`
	Total    int                            `json:"total"`
	Page     int                            `json:"page"`
	PageSize int                            `json:"page_size"`
	// StatusCounts counts all of the agent's jamaah per status ("total" = all), for the status tabs.
	StatusCounts map[string]int `json:"status_counts"`
}

func (s *prospectService) ListByAgentPage(ctx context.Context, tenantID uint64, agentID uint64, statusFilter, search *string, page, pageSize int) (*AgentProspectPage, error) {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}
	var status *string
	if statusFilter != nil && *statusFilter != "" {
		v := strings.ToLower(strings.TrimSpace(*statusFilter))
		if !validProspectStatuses[v] {
			return nil, ErrInvalidProspectStatus
		}
		status = &v
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > MaxProspectPageSize {
		pageSize = MaxProspectPageSize
	}
	if page <= 0 {
		page = 1
	}
	items, total, err := s.prospectRepo.ListByAgentPage(ctx, tenantID, agentID, status, search, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, err
	}
	result := &AgentProspectPage{Items: items, Total: total, Page: page, PageSize: pageSize, StatusCounts: map[string]int{}}
	if counter, ok := s.prospectRepo.(agentStatusCounter); ok {
		counts, err := counter.AgentStatusCounts(ctx, tenantID, agentID)
		if err != nil {
			return nil, err
		}
		result.StatusCounts = counts
	}
	return result, nil
}

func (s *prospectService) ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]repository.AgentProspectItem, error) {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}

	if statusFilter != nil && *statusFilter != "" {
		status := strings.ToLower(strings.TrimSpace(*statusFilter))
		if !validProspectStatuses[status] {
			return nil, ErrInvalidProspectStatus
		}
		return s.prospectRepo.ListByAgent(ctx, tenantID, agentID, &status)
	}
	return s.prospectRepo.ListByAgent(ctx, tenantID, agentID, nil)
}

func (s *prospectService) GetDetailForAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64) (*ProspectDetailResponse, error) {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	// VALIDASI KRITIS: prospect.agent_id HARUS SAMA PERSIS dengan agent yang login
	// Jika tidak cocok, kembalikan ErrNotFound (404, bukan 403, agar tidak membocorkan keberadaan data).
	if prospect.AgentID == nil || *prospect.AgentID != agentID {
		return nil, repository.ErrNotFound
	}

	detail, err := s.GetDetail(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	// System notes are for the travel's admins: they can name other agents and other jamaah
	// (e.g. "nomor ini sudah Closing di prospek #X milik agen Y"), which an agent must not see.
	agentNotes := make([]repository.ProspectNote, 0, len(detail.Notes))
	for _, n := range detail.Notes {
		if n.AuthorType != "system" {
			agentNotes = append(agentNotes, n)
		}
	}
	detail.Notes = agentNotes
	// The agent only sees their own commission: the upline's override is not theirs.
	if info := detail.InfoKomisi; info != nil {
		info.OverrideAmount = 0
		info.TotalAmount = info.DirectAmount
		if info.Type != "potensi" {
			info.HeldAmount = info.AgentHeldAmount
			info.ReleasedAmount = info.AgentReleasedAmount
		}
	}
	return detail, nil
}

func (s *prospectService) UpdateStatusByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, newStatus string, lostReason, lostReasonCategory *string) error {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return err
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}

	// VALIDASI KRITIS: prospect.agent_id HARUS SAMA PERSIS dengan agent yang login
	if prospect.AgentID == nil || *prospect.AgentID != agentID {
		return repository.ErrNotFound
	}

	if prospect.AnonymizedAt != nil {
		return ErrProspectAnonymized
	}

	// GUARD PALING AWAL: kalau status LAMA prospek sudah 'closing', tolak 400 untuk perubahan status apa pun
	// (dicek SEBELUM guard "agen tidak boleh set ke closing")
	if prospect.Status == "closing" {
		return ErrProspectAlreadyClosed
	}

	status := strings.ToLower(strings.TrimSpace(newStatus))
	if status == "closing" {
		return ErrAgentCannotClose
	}
	if !validProspectStatuses[status] {
		return ErrInvalidProspectStatus
	}
	reason, category, err := cleanLostReasonWithCategory(status, lostReason, lostReasonCategory, false)
	if err != nil {
		return err
	}

	oldStatus := prospect.Status
	if oldStatus == status && sameStringPtr(reason, prospect.LostReason) && sameStringPtr(category, prospect.LostReasonCategory) {
		return nil
	}

	if err := s.prospectRepo.TransitionStatus(ctx, tenantID, id, oldStatus, status, reason, category); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return ErrProspectStatusConflict
		}
		return err
	}

	if oldStatus != status {
		s.recordHistory(ctx, tenantID, id, "agent", agentID, oldStatus, status)
	}
	return nil
}

func (s *prospectService) AddNoteByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, noteText string) (*repository.ProspectNote, error) {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}

	trimmed, err := validateNoteText(noteText)
	if err != nil {
		return nil, err
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	// VALIDASI KRITIS: prospect.agent_id HARUS SAMA PERSIS dengan agent yang login
	if prospect.AgentID == nil || *prospect.AgentID != agentID {
		return nil, repository.ErrNotFound
	}
	if prospect.AnonymizedAt != nil {
		return nil, ErrProspectAnonymized
	}

	note := &repository.ProspectNote{
		TenantID:   tenantID,
		ProspectID: id,
		AuthorType: "agent",
		AuthorID:   agentID,
		NoteText:   trimmed,
	}
	if err := s.noteRepo.Create(ctx, tenantID, note); err != nil {
		return nil, err
	}
	return note, nil
}

func (s *prospectService) CreateManualByAgent(ctx context.Context, tenantID uint64, agentID uint64, input AgentCreateProspectInput) (*repository.Prospect, error) {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}

	name, err := validateProspectName(input.Name)
	if err != nil {
		return nil, err
	}
	phone, phoneNormalized, err := validateProspectPhone(input.Phone)
	if err != nil {
		return nil, err
	}
	if err := validateJumlahJamaah(input.JumlahJamaah); err != nil {
		return nil, err
	}
	departurePlan, err := validateDeparturePlan(input.DeparturePlan)
	if err != nil {
		return nil, err
	}
	domicile, err := validateDomicile(input.Domicile)
	if err != nil {
		return nil, err
	}
	// UU PDP: the agent confirms the jamaah agreed to be contacted before their data is stored.
	if !input.Consent {
		return nil, ErrAgentConsentRequired
	}
	consentAt := time.Now()
	var catatan string
	if input.CatatanAwal != nil && strings.TrimSpace(*input.CatatanAwal) != "" {
		catatan, err = validateNoteText(*input.CatatanAwal)
		if err != nil {
			return nil, err
		}
	}

	jj := 1
	if input.JumlahJamaah != nil && *input.JumlahJamaah > 0 {
		jj = *input.JumlahJamaah
	}

	if input.PackageID != nil {
		pkg, err := s.packageRepo.GetByID(ctx, tenantID, *input.PackageID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrPackageNotFound
			}
			return nil, err
		}
		// Same rule as the public interest form: only a package on sale (published, not departed yet).
		if pkg.Status != "published" || PackageDeparted(pkg, time.Now()) {
			return nil, ErrPackageNotFound
		}
	}

	prospect := &repository.Prospect{
		TenantID:        tenantID,
		PackageID:       input.PackageID,
		AgentID:         &agentID,
		Name:            name,
		Phone:           phone,
		PhoneNormalized: &phoneNormalized,
		JumlahJamaah:    &jj,
		DeparturePlan:   departurePlan,
		Domicile:        domicile,
		ConsentAt:       &consentAt,
		SourceChannel:   "agen",
		EntryMethod:     "agent_manual",
		Status:          "baru",
	}

	// First owner wins: an agent cannot register a jamaah the travel is already working on.
	err = s.withPhoneLock(ctx, tenantID, phoneNormalized, func() error {
		existing, err := s.prospectRepo.FindOpenByPhone(ctx, tenantID, phoneNormalized)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return err
		}
		if existing != nil {
			if existing.AgentID != nil && *existing.AgentID == agentID {
				return ErrProspectAlreadyInYourList
			}
			return ErrProspectOwnedByOther
		}
		return s.prospectRepo.Create(ctx, tenantID, prospect)
	})
	if err != nil {
		return nil, err
	}

	s.recordHistory(ctx, tenantID, prospect.ID, "agent", agentID, "", "baru")
	s.flagEarlierClosing(ctx, tenantID, prospect)

	if catatan != "" && s.noteRepo != nil {
		note := &repository.ProspectNote{
			TenantID:   tenantID,
			ProspectID: prospect.ID,
			AuthorType: "agent",
			AuthorID:   agentID,
			NoteText:   catatan,
		}
		if err := s.noteRepo.Create(ctx, tenantID, note); err != nil {
			log.Printf("[Prospect] Failed to save initial note for prospect %d: %v", prospect.ID, err)
		}
	}

	return prospect, nil
}

func (s *prospectService) RecordReferralClick(ctx context.Context, tenantID uint64, referralCode string, ipAddress string) error {
	code := strings.TrimSpace(referralCode)
	if code == "" {
		return errors.New("referral code is required")
	}

	if s.agentRepo == nil {
		return errors.New("agent repo not available")
	}

	agent, err := s.agentRepo.GetByReferralCode(ctx, code)
	if err != nil {
		return repository.ErrNotFound
	}
	if agent == nil || agent.TenantID != tenantID {
		return repository.ErrNotFound
	}

	return s.prospectRepo.RecordReferralClick(ctx, tenantID, agent.ID, ipAddress)
}
