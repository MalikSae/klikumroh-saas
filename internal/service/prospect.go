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

// AgentCreateProspectInput is used when an agent manually adds a prospect.
type AgentCreateProspectInput struct {
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	JumlahJamaah *int    `json:"jumlah_jamaah"`
	PackageID    *uint64 `json:"package_id"`
	CatatanAwal  *string `json:"catatan_awal"`
}

// PublicProspectInput is the payload submitted by leads on the public web portal.
type PublicProspectInput struct {
	Name          string  `json:"name"`
	Phone         string  `json:"phone"`
	Email         *string `json:"email"`
	PackageID     *uint64 `json:"package_id"`
	AgentID       *uint64 `json:"agent_id"`
	ReferralCode  *string `json:"referral_code"`
	JumlahJamaah  *int    `json:"jumlah_jamaah"`
	SourceChannel string  `json:"source_channel"`
}

// PublicProspectResponse is returned after successful prospect creation.
type PublicProspectResponse struct {
	*repository.Prospect
	WhatsAppRedirectURL *string `json:"whatsapp_redirect_url"`
}

// UpdateProspectInput is used when admin updates prospect details.
type UpdateProspectInput struct {
	Name             string  `json:"name"`
	Phone            string  `json:"phone"`
	PackageID        *uint64 `json:"package_id"`
	JumlahJamaah     *int    `json:"jumlah_jamaah"`
	CorrectionReason *string `json:"correction_reason"`
}

// ProspectCommissionInfo holds calculated commission info for display.
type ProspectCommissionInfo struct {
	Type           string  `json:"type"` // "potensi" or "final"
	DirectAmount   float64 `json:"direct_amount"`
	OverrideAmount float64 `json:"override_amount"`
	TotalAmount    float64 `json:"total_amount"`
	RatePerJamaah  float64 `json:"rate_per_jamaah"`
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

// ProspectService defines business logic for managing Prospects.
type ProspectService interface {
	CreatePublic(ctx context.Context, tenantID uint64, input PublicProspectInput) (*PublicProspectResponse, error)
	GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Prospect, error)
	List(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]repository.Prospect, error)
	UpdateStatus(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, newStatus string, lostReason *string) error
	ExportCSV(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]byte, error)
	CalculateAndRecordCommission(ctx context.Context, tenantID uint64, prospectID uint64) error
	GetDetail(ctx context.Context, tenantID uint64, id uint64) (*ProspectDetailResponse, error)
	UpdateDetail(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, input UpdateProspectInput) error
	AddNote(ctx context.Context, tenantID uint64, prospectID uint64, adminUserID uint64, noteText string) (*repository.ProspectNote, error)

	// Agent-specific methods
	ListByAgent(ctx context.Context, tenantID uint64, agentID uint64, statusFilter *string) ([]repository.AgentProspectItem, error)
	GetDetailForAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64) (*ProspectDetailResponse, error)
	UpdateStatusByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, newStatus string, lostReason *string) error
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

func (s *prospectService) CreatePublic(ctx context.Context, tenantID uint64, input PublicProspectInput) (*PublicProspectResponse, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrProspectNameRequired
	}

	phone := strings.TrimSpace(input.Phone)
	if phone == "" {
		return nil, ErrProspectPhoneRequired
	}

	if input.JumlahJamaah != nil && *input.JumlahJamaah <= 0 {
		return nil, ErrInvalidJumlahJamaah
	}

	// Check if tenant service is suspended (after 7 days grace period)
	tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
	if err == nil && tenant != nil {
		if tenant.Status == "inactive" || (tenant.SubscriptionExpiresAt != nil && time.Now().After(tenant.SubscriptionExpiresAt.AddDate(0, 0, 7))) {
			return nil, errors.New("layanan pendaftaran sementara tidak aktif karena masa layanan biro travel sedang ditangguhkan")
		}
	}

	// MANDATORY CROSS-TENANT VALIDATION:
	// If package_id is supplied, verify that it belongs strictly to this tenant_id.
	var packageName string
	if input.PackageID != nil {
		pkg, err := s.packageRepo.GetByID(ctx, tenantID, *input.PackageID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrPackageNotFound
			}
			return nil, err
		}
		packageName = pkg.Name
	} else {
		packageName = "Umroh"
	}

	sourceChannel := strings.TrimSpace(input.SourceChannel)
	if sourceChannel == "" {
		sourceChannel = "organik"
	}

	var emailPtr *string
	if input.Email != nil {
		trimmedEmail := strings.TrimSpace(*input.Email)
		if trimmedEmail != "" {
			emailPtr = &trimmedEmail
		}
	}

	// Agent & referral validation
	var agentID *uint64
	var targetAgent *repository.Agent

	if input.ReferralCode != nil && strings.TrimSpace(*input.ReferralCode) != "" {
		refCode := strings.TrimSpace(*input.ReferralCode)
		if s.agentRepo != nil {
			agent, err := s.agentRepo.GetByReferralCode(ctx, refCode)
			if err == nil && agent != nil && agent.TenantID == tenantID && agent.Status == "active" {
				agentID = &agent.ID
				sourceChannel = "agen"
				targetAgent = agent
			}
		}
	} else if input.AgentID != nil {
		if s.agentRepo != nil {
			agent, err := s.agentRepo.GetByID(ctx, tenantID, *input.AgentID)
			if err == nil && agent != nil && agent.Status == "active" {
				agentID = &agent.ID
				sourceChannel = "agen"
				targetAgent = agent
			}
		}
	}

	prospect := &repository.Prospect{
		TenantID:      tenantID,
		PackageID:     input.PackageID,
		AgentID:       agentID,
		Name:          name,
		Phone:         phone,
		JumlahJamaah:  input.JumlahJamaah,
		Email:         emailPtr,
		SourceChannel: sourceChannel,
		Status:        "baru", // Force initial status to 'baru' server-side
		LostReason:    nil,
	}

	if err := s.prospectRepo.Create(ctx, tenantID, prospect); err != nil {
		return nil, err
	}

	// Trigger 1: In-app notification to all active admin users of this tenant
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
					"prospect_new",
					"Prospek baru",
					fmt.Sprintf("%s tertarik paket %s", name, packageName),
					fmt.Sprintf("/prospects/%d", prospect.ID),
				)
				if notifErr != nil {
					log.Printf("[Notification] Failed to create prospect notification for admin %d: %v", admin.ID, notifErr)
				}
			}
		}
	}

	// Trigger 2: In-app notification to the referral agent if prospect came via agent referral
	if s.notifService != nil && targetAgent != nil {
		tID := tenantID
		_, notifErr := s.notifService.CreateNotification(
			ctx,
			&tID,
			"agent",
			targetAgent.ID,
			"prospect_new",
			"Prospek Baru Masuk",
			fmt.Sprintf("%s mendaftar melalui link referral Anda (Paket %s)", name, packageName),
			fmt.Sprintf("/agen/jamaah/%d", prospect.ID),
		)
		if notifErr != nil {
			log.Printf("[Notification] Failed to create prospect notification for agent %d: %v", targetAgent.ID, notifErr)
		}
	}

	// Determine WhatsApp destination:
	// 1. Referral agent's phone (normalized)
	// 2. Fallback: Tenant's whatsapp_number
	// 3. Fallback: nil
	var targetPhone string
	if targetAgent != nil && targetAgent.Phone != nil && strings.TrimSpace(*targetAgent.Phone) != "" {
		targetPhone = NormalizePhoneToWhatsApp(*targetAgent.Phone)
	}

	if targetPhone == "" && s.tenantRepo != nil {
		tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
		if err == nil && tenant != nil && tenant.WhatsAppNumber != nil && strings.TrimSpace(*tenant.WhatsAppNumber) != "" {
			targetPhone = strings.TrimSpace(*tenant.WhatsAppNumber)
		}
	}

	var whatsappRedirectURL *string
	if targetPhone != "" {
		var msg string
		if input.JumlahJamaah != nil && *input.JumlahJamaah > 0 {
			msg = fmt.Sprintf("Halo, saya %s tertarik dengan paket %s untuk %d orang. Mohon informasinya.", name, packageName, *input.JumlahJamaah)
		} else {
			msg = fmt.Sprintf("Halo, saya %s tertarik dengan paket %s. Mohon informasinya.", name, packageName)
		}
		urlStr := fmt.Sprintf("https://wa.me/%s?text=%s", targetPhone, url.QueryEscape(msg))
		whatsappRedirectURL = &urlStr
	}

	return &PublicProspectResponse{
		Prospect:            prospect,
		WhatsAppRedirectURL: whatsappRedirectURL,
	}, nil
}

func (s *prospectService) GetByID(ctx context.Context, tenantID uint64, id uint64) (*repository.Prospect, error) {
	return s.prospectRepo.GetByID(ctx, tenantID, id)
}

func (s *prospectService) List(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]repository.Prospect, error) {
	if filter.Status != nil && *filter.Status != "" && *filter.Status != "all" {
		status := strings.ToLower(strings.TrimSpace(*filter.Status))
		if !validProspectStatuses[status] {
			return nil, ErrInvalidProspectStatus
		}
		filter.Status = &status
	}
	return s.prospectRepo.ListWithFilter(ctx, tenantID, filter)
}

func (s *prospectService) UpdateStatus(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, newStatus string, lostReason *string) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}

	// GUARD PALING AWAL: kalau status LAMA prospek sudah 'closing', tolak
	if prospect.Status == "closing" {
		return ErrProspectAlreadyClosed
	}

	status := strings.ToLower(strings.TrimSpace(newStatus))
	if !validProspectStatuses[status] {
		return ErrInvalidProspectStatus
	}

	oldStatus := prospect.Status

	var cleanLostReason *string
	if status == "tidak_lanjut" && lostReason != nil {
		trimmed := strings.TrimSpace(*lostReason)
		if trimmed != "" {
			cleanLostReason = &trimmed
		}
	}

	if err := s.prospectRepo.UpdateStatus(ctx, tenantID, id, status, cleanLostReason); err != nil {
		return err
	}

	// Record status history if status actually changed
	if oldStatus != status && s.statusHistoryRepo != nil {
		history := &repository.ProspectStatusHistory{
			TenantID:      tenantID,
			ProspectID:    id,
			ChangedByType: "admin",
			ChangedByID:   adminUserID,
			OldStatus:     oldStatus,
			NewStatus:     status,
		}
		_ = s.statusHistoryRepo.Create(ctx, tenantID, history)
	}

	// Trigger commission calculation only when changing into 'closing' from non-closing
	if oldStatus != "closing" && status == "closing" {
		if err := s.CalculateAndRecordCommission(ctx, tenantID, id); err != nil {
			return err
		}
	}

	// Trigger in-app notification to agent if prospect belongs to an agent
	if oldStatus != status && prospect.AgentID != nil && s.notifService != nil {
		tID := tenantID
		title := fmt.Sprintf("Status Prospek: %s", strings.ToUpper(status))
		body := fmt.Sprintf("Status calon jamaah %s diperbarui menjadi %s", prospect.Name, status)
		if status == "closing" {
			title = "Alhamdulillah! Prospek Closing"
			body = fmt.Sprintf("Calon jamaah %s telah berhasil closing!", prospect.Name)
		}
		_, _ = s.notifService.CreateNotification(
			ctx,
			&tID,
			"agent",
			*prospect.AgentID,
			"prospect_status_updated",
			title,
			body,
			fmt.Sprintf("/agen/jamaah/%d", prospect.ID),
		)
	}

	return nil
}

func (s *prospectService) CalculateAndRecordCommission(ctx context.Context, tenantID uint64, prospectID uint64) error {
	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, prospectID)
	if err != nil {
		return err
	}

	// Only prospects with an assigned agent receive commissions.
	if prospect.AgentID == nil {
		return nil
	}

	// Must have a package to calculate commission.
	if prospect.PackageID == nil {
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
	// 1. Direct commission ledger entry
	directLedger := &repository.CommissionLedger{
		TenantID:   tenantID,
		AgentID:    *prospect.AgentID,
		ProspectID: prospect.ID,
		PackageID:  &pkgID,
		Type:       "direct",
		Amount:     directAmount,
		Notes:      nil,
	}
	if s.commissionLedgerRepo != nil {
		if err := s.commissionLedgerRepo.Create(ctx, tenantID, directLedger); err != nil {
			return err
		}
	}

	// Trigger 4: In-app notification for direct agent
	if s.notifService != nil && directAmount > 0 && prospect.AgentID != nil {
		tID := tenantID
		_, notifErr := s.notifService.CreateNotification(
			ctx,
			&tID,
			"agent",
			*prospect.AgentID,
			"commission_earned",
			"Komisi baru masuk",
			fmt.Sprintf("Komisi Rp %s dari closing jamaah %s", util.FormatRupiah(directAmount), prospect.Name),
			"/agen/riwayat-komisi",
		)
		if notifErr != nil {
			log.Printf("[Notification] Failed to notify agent %d of commission: %v", *prospect.AgentID, notifErr)
		}
	}

	// 2. Check override commission for parent agent
	if s.tenantRepo != nil && s.agentRepo != nil && s.commissionLedgerRepo != nil {
		tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
		if err == nil && tenant != nil && tenant.CommissionOverrideEnabled && tenant.CommissionOverridePercentage != nil && *tenant.CommissionOverridePercentage > 0 {
			agent, err := s.agentRepo.GetByID(ctx, tenantID, *prospect.AgentID)
			if err == nil && agent != nil && agent.ParentAgentID != nil {
				overrideAmount := (*tenant.CommissionOverridePercentage / 100.0) * directAmount
				overrideLedger := &repository.CommissionLedger{
					TenantID:   tenantID,
					AgentID:    *agent.ParentAgentID,
					ProspectID: prospect.ID,
					PackageID:  &pkgID,
					Type:       "override",
					Amount:     overrideAmount,
					Notes:      nil,
				}
				if err := s.commissionLedgerRepo.Create(ctx, tenantID, overrideLedger); err != nil {
					return err
				}

				if s.notifService != nil && overrideAmount > 0 {
					tID := tenantID
					_, notifErr := s.notifService.CreateNotification(
						ctx,
						&tID,
						"agent",
						*agent.ParentAgentID,
						"commission_override_earned",
						"Komisi override baru masuk",
						fmt.Sprintf("Komisi override Rp %s dari jaringan Anda", util.FormatRupiah(overrideAmount)),
						"/agen/riwayat-komisi",
					)
					if notifErr != nil {
						log.Printf("[Notification] Failed to notify parent agent %d of override commission: %v", *agent.ParentAgentID, notifErr)
					}
				}
			}
		}
	}

	return nil
}

func (s *prospectService) UpdateDetail(ctx context.Context, tenantID uint64, id uint64, adminUserID uint64, input UpdateProspectInput) error {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return ErrProspectNameRequired
	}

	phone := strings.TrimSpace(input.Phone)
	if phone == "" {
		return ErrProspectPhoneRequired
	}

	if input.JumlahJamaah != nil && *input.JumlahJamaah <= 0 {
		return ErrInvalidJumlahJamaah
	}

	// Verify package if provided
	if input.PackageID != nil {
		_, err := s.packageRepo.GetByID(ctx, tenantID, *input.PackageID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return ErrPackageNotFound
			}
			return err
		}
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return err
	}

	// If prospect is already closing, check if jumlah_jamaah changed
	if prospect.Status == "closing" && s.commissionLedgerRepo != nil {
		oldJamaah := 1
		if prospect.JumlahJamaah != nil && *prospect.JumlahJamaah > 0 {
			oldJamaah = *prospect.JumlahJamaah
		}

		newJamaah := 1
		if input.JumlahJamaah != nil && *input.JumlahJamaah > 0 {
			newJamaah = *input.JumlahJamaah
		}

		if oldJamaah != newJamaah {
			var reason string
			if input.CorrectionReason != nil {
				reason = strings.TrimSpace(*input.CorrectionReason)
			}
			if reason == "" {
				return errors.New("alasan koreksi wajib diisi saat mengubah jumlah jamaah pada prospek yang sudah closing")
			}

			// Find existing direct and override ledgers
			ledgers, err := s.commissionLedgerRepo.ListByProspect(ctx, tenantID, id)
			if err == nil && len(ledgers) > 0 {
				var directLedger *repository.CommissionLedger
				var overrideLedger *repository.CommissionLedger

				for i := range ledgers {
					if ledgers[i].Type == "direct" && directLedger == nil {
						directLedger = &ledgers[i]
					} else if ledgers[i].Type == "override" && overrideLedger == nil {
						overrideLedger = &ledgers[i]
					}
				}

				if directLedger != nil && oldJamaah > 0 {
					ratePerJamaah := directLedger.Amount / float64(oldJamaah)
					selisihJamaah := newJamaah - oldJamaah
					selisihDirect := ratePerJamaah * float64(selisihJamaah)

					correctionDirect := &repository.CommissionLedger{
						TenantID:   tenantID,
						AgentID:    directLedger.AgentID,
						ProspectID: id,
						PackageID:  directLedger.PackageID,
						Type:       "correction",
						Amount:     selisihDirect,
						Notes:      &reason,
					}
					_ = s.commissionLedgerRepo.Create(ctx, tenantID, correctionDirect)

					if overrideLedger != nil && directLedger.Amount > 0 {
						overrideRatio := overrideLedger.Amount / directLedger.Amount
						selisihOverride := selisihDirect * overrideRatio

						correctionOverride := &repository.CommissionLedger{
							TenantID:   tenantID,
							AgentID:    overrideLedger.AgentID,
							ProspectID: id,
							PackageID:  overrideLedger.PackageID,
							Type:       "correction",
							Amount:     selisihOverride,
							Notes:      &reason,
						}
						_ = s.commissionLedgerRepo.Create(ctx, tenantID, correctionOverride)
					}
				}
			}
		}
	}

	prospect.Name = name
	prospect.Phone = phone
	prospect.PackageID = input.PackageID
	prospect.JumlahJamaah = input.JumlahJamaah

	return s.prospectRepo.Update(ctx, tenantID, prospect)
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

		if prospect.Status == "closing" && s.commissionLedgerRepo != nil {
			ledgers, err := s.commissionLedgerRepo.ListByProspect(ctx, tenantID, id)
			if err == nil && len(ledgers) > 0 {
				var directTotal, overrideTotal float64
				for _, l := range ledgers {
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
				commissionInfo = &ProspectCommissionInfo{
					Type:           "final",
					DirectAmount:   directTotal,
					OverrideAmount: overrideTotal,
					TotalAmount:    directTotal + overrideTotal,
					RatePerJamaah:  rate,
				}
			}
		}

		// If not closing or no ledger found, calculate potential only for non-closing prospects
		if commissionInfo == nil && prospect.Status != "closing" {
			rate := 0.0
			if pkg != nil && pkg.CommissionAmount != nil {
				rate = *pkg.CommissionAmount
			}
			directPotential := rate * float64(jamaah)
			overridePotential := 0.0

			if s.tenantRepo != nil && directPotential > 0 {
				tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
				if err == nil && tenant != nil && tenant.CommissionOverrideEnabled && tenant.CommissionOverridePercentage != nil && *tenant.CommissionOverridePercentage > 0 {
					if ag != nil && ag.ParentAgentID != nil {
						overridePotential = (*tenant.CommissionOverridePercentage / 100.0) * directPotential
					}
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
	trimmed := strings.TrimSpace(noteText)
	if trimmed == "" {
		return nil, errors.New("catatan tidak boleh kosong")
	}

	// Verify prospect belongs to tenant
	_, err := s.prospectRepo.GetByID(ctx, tenantID, prospectID)
	if err != nil {
		return nil, err
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

func (s *prospectService) ExportCSV(ctx context.Context, tenantID uint64, filter repository.ProspectFilter) ([]byte, error) {
	if filter.Status != nil && *filter.Status != "" && *filter.Status != "all" {
		status := strings.ToLower(strings.TrimSpace(*filter.Status))
		if !validProspectStatuses[status] {
			return nil, ErrInvalidProspectStatus
		}
		filter.Status = &status
	}
	prospects, err := s.prospectRepo.ListWithFilter(ctx, tenantID, filter)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	// Write CSV header
	header := []string{"id", "name", "phone", "jumlah_jamaah", "email", "source_channel", "status", "lost_reason", "created_at"}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, p := range prospects {
		jumlahJamaahStr := ""
		if p.JumlahJamaah != nil {
			jumlahJamaahStr = strconv.Itoa(*p.JumlahJamaah)
		}
		emailStr := ""
		if p.Email != nil {
			emailStr = *p.Email
		}
		lostReasonStr := ""
		if p.LostReason != nil {
			lostReasonStr = *p.LostReason
		}

		row := []string{
			strconv.FormatUint(p.ID, 10),
			sanitizeCSVField(p.Name),
			sanitizeCSVField(p.Phone),
			sanitizeCSVField(jumlahJamaahStr),
			sanitizeCSVField(emailStr),
			sanitizeCSVField(p.SourceChannel),
			p.Status,
			sanitizeCSVField(lostReasonStr),
			p.CreatedAt.Format(time.RFC3339),
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

	return s.GetDetail(ctx, tenantID, id)
}

func (s *prospectService) UpdateStatusByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, newStatus string, lostReason *string) error {
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

	oldStatus := prospect.Status

	var cleanLostReason *string
	if status == "tidak_lanjut" && lostReason != nil {
		trimmed := strings.TrimSpace(*lostReason)
		if trimmed != "" {
			cleanLostReason = &trimmed
		}
	}

	if err := s.prospectRepo.UpdateStatus(ctx, tenantID, id, status, cleanLostReason); err != nil {
		return err
	}

	if oldStatus != status && s.statusHistoryRepo != nil {
		history := &repository.ProspectStatusHistory{
			TenantID:      tenantID,
			ProspectID:    id,
			ChangedByType: "agent",
			ChangedByID:   agentID,
			OldStatus:     oldStatus,
			NewStatus:     status,
		}
		_ = s.statusHistoryRepo.Create(ctx, tenantID, history)
	}

	return nil
}

func (s *prospectService) AddNoteByAgent(ctx context.Context, tenantID uint64, agentID uint64, id uint64, noteText string) (*repository.ProspectNote, error) {
	if err := s.verifyActiveAgent(ctx, tenantID, agentID); err != nil {
		return nil, err
	}

	trimmed := strings.TrimSpace(noteText)
	if trimmed == "" {
		return nil, errors.New("catatan tidak boleh kosong")
	}

	prospect, err := s.prospectRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	// VALIDASI KRITIS: prospect.agent_id HARUS SAMA PERSIS dengan agent yang login
	if prospect.AgentID == nil || *prospect.AgentID != agentID {
		return nil, repository.ErrNotFound
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

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrProspectNameRequired
	}

	phone := strings.TrimSpace(input.Phone)
	if phone == "" {
		return nil, ErrProspectPhoneRequired
	}
	cleanDigits := strings.TrimPrefix(phone, "+")
	cleanDigits = strings.ReplaceAll(cleanDigits, "-", "")
	cleanDigits = strings.ReplaceAll(cleanDigits, " ", "")
	for _, ch := range cleanDigits {
		if ch < '0' || ch > '9' {
			return nil, errors.New("format nomor WhatsApp tidak valid, hanya boleh berisi angka")
		}
	}
	if len(cleanDigits) < 8 || len(cleanDigits) > 16 {
		return nil, errors.New("panjang nomor WhatsApp tidak valid")
	}

	if input.JumlahJamaah != nil && *input.JumlahJamaah <= 0 {
		return nil, ErrInvalidJumlahJamaah
	}

	jj := 1
	if input.JumlahJamaah != nil && *input.JumlahJamaah > 0 {
		jj = *input.JumlahJamaah
	}

	if input.PackageID != nil {
		_, err := s.packageRepo.GetByID(ctx, tenantID, *input.PackageID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return nil, ErrPackageNotFound
			}
			return nil, err
		}
	}

	prospect := &repository.Prospect{
		TenantID:      tenantID,
		PackageID:     input.PackageID,
		AgentID:       &agentID,
		Name:          name,
		Phone:         phone,
		JumlahJamaah:  &jj,
		SourceChannel: "agen",
		EntryMethod:   "agent_manual",
		Status:        "baru",
	}

	if err := s.prospectRepo.Create(ctx, tenantID, prospect); err != nil {
		return nil, err
	}

	if s.statusHistoryRepo != nil {
		history := &repository.ProspectStatusHistory{
			TenantID:      tenantID,
			ProspectID:    prospect.ID,
			ChangedByType: "agent",
			ChangedByID:   agentID,
			OldStatus:     "",
			NewStatus:     "baru",
		}
		_ = s.statusHistoryRepo.Create(ctx, tenantID, history)
	}

	if input.CatatanAwal != nil && strings.TrimSpace(*input.CatatanAwal) != "" {
		if s.noteRepo != nil {
			note := &repository.ProspectNote{
				TenantID:   tenantID,
				ProspectID: prospect.ID,
				AuthorType: "agent",
				AuthorID:   agentID,
				NoteText:   strings.TrimSpace(*input.CatatanAwal),
			}
			_ = s.noteRepo.Create(ctx, tenantID, note)
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
