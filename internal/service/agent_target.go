package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"time"

	"klikumroh/internal/repository"
)

var (
	ErrInvalidMetricType            = errors.New("jenis metrik tidak valid, gunakan 'closing_pax' atau 'mitra_baru_count'")
	ErrInvalidMetricValue           = errors.New("nilai target harus lebih dari 0")
	ErrInvalidPeriod                = errors.New("tanggal selesai harus sama atau setelah tanggal mulai")
	ErrInvalidDateFormat            = errors.New("format tanggal tidak valid, gunakan YYYY-MM-DD")
	ErrTargetAlreadyClosed          = errors.New("periode target sudah ditutup")
	// ErrTargetPeriodNotEnded: closing a target before its last day needs an explicit early-close confirmation
	// (force), because a closed target records its achievers and cannot be reopened or edited.
	ErrTargetPeriodNotEnded = errors.New("periode target belum berakhir. Konfirmasi tutup lebih awal untuk tetap menutupnya; target yang ditutup tidak dapat dibuka kembali")
	ErrCannotDeleteWithAchievements = errors.New("target tidak dapat dihapus karena sudah memiliki histori pencapaian")
	ErrTargetNotClosed              = errors.New("reward hanya dapat ditandai jika periode target sudah ditutup")
)

type CreateTargetInput struct {
	Title             *string `json:"title"`
	MetricType        string  `json:"metric_type"`
	MetricValue       int     `json:"metric_value"`
	RewardDescription *string `json:"reward_description"`
	PeriodStart       string  `json:"period_start"`
	PeriodEnd         string  `json:"period_end"`
}

type UpdateTargetInput struct {
	Title             *string `json:"title"`
	MetricValue       int     `json:"metric_value"`
	RewardDescription *string `json:"reward_description"`
	PeriodStart       string  `json:"period_start"`
	PeriodEnd         string  `json:"period_end"`
}

type TargetProgressResponse struct {
	Target repository.AgentTarget              `json:"target"`
	Rows   []repository.AgentTargetProgressRow `json:"rows"`
}

type AchievementDTO struct {
	ID                        uint64     `json:"id"`
	AgentID                   uint64     `json:"agent_id"`
	AgentName                 string     `json:"agent_name"`
	AchievedValue             int        `json:"achieved_value"`
	AchievedAt                time.Time  `json:"achieved_at"`
	RewardStatus              string     `json:"reward_status"`
	RewardGivenAt             *time.Time `json:"reward_given_at"`
	RewardDescriptionSnapshot *string    `json:"reward_description_snapshot"`
	Notes                     *string    `json:"notes"`
	// UnpaidJamaahCount: counted closings (DP) not yet lunas; the reward waits for them.
	UnpaidJamaahCount int `json:"unpaid_jamaah_count"`
}

type AgentTargetView struct {
	ID                uint64  `json:"id"`
	Title             *string `json:"title"`
	MetricType        string  `json:"metric_type"`
	MetricLabel       string  `json:"metric_label"`
	MetricValue       int     `json:"metric_value"`
	ProgressValue     int     `json:"progress_value"`
	Achieved          bool    `json:"achieved"`
	RewardDescription *string `json:"reward_description"`
	PeriodStart       string  `json:"period_start"`
	PeriodEnd         string  `json:"period_end"`
	PeriodLabel       string  `json:"period_label"`
}

type AgentTargetService interface {
	CreateTarget(ctx context.Context, tenantID uint64, adminUserID *uint64, input *CreateTargetInput) (*repository.AgentTarget, error)
	UpdateTarget(ctx context.Context, tenantID uint64, id uint64, input *UpdateTargetInput) (*repository.AgentTarget, error)
	DeleteTarget(ctx context.Context, tenantID uint64, id uint64) error
	ListTargets(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.AgentTarget, error)
	GetTargetProgress(ctx context.Context, tenantID uint64, targetID uint64) (*TargetProgressResponse, error)
	// CloseTargetPeriod refuses (ErrTargetPeriodNotEnded) while the period has not ended (today WIB <= period_end)
	// unless force is set (the admin confirmed an early close).
	CloseTargetPeriod(ctx context.Context, tenantID uint64, targetID uint64, adminUserID uint64, force bool) (int, error)
	ListAchievements(ctx context.Context, tenantID uint64, targetID uint64) ([]AchievementDTO, error)
	MarkRewardGiven(ctx context.Context, tenantID uint64, achievementID uint64, adminUserID uint64, notes *string) error
	ExportAchievementsCSV(ctx context.Context, tenantID uint64, targetID uint64) ([]byte, error)
	GetTargetsForAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]AgentTargetView, error)
}

type agentTargetService struct {
	targetRepo repository.AgentTargetRepository
	agentRepo  repository.AgentRepository
	// Optional: guard rewards on closings that are not lunas yet (see SetPayoffGuard).
	payoffRepo repository.TargetPayoffRepository
	policyRepo repository.CommissionPolicyRepository
}

// ErrRewardHasUnpaidJamaah blocks handing out a closing-based reward while jamaah counted for it
// have only paid DP. Wraps a message with the count.
var ErrRewardHasUnpaidJamaah = errors.New("reward belum bisa diberikan: masih ada jamaah yang dihitung untuk target ini tetapi belum lunas")

// ErrRewardAlreadyGiven: the reward was already marked given; marking it again would overwrite who gave it
// and when (audit trail).
var ErrRewardAlreadyGiven = errors.New("reward ini sudah ditandai diberikan sebelumnya")

// ErrRewardBelowTarget: the agent no longer reaches the target (closings cancelled after the period was
// closed), so the reward cannot be given. Wrapped with the current value and the target.
var ErrRewardBelowTarget = errors.New("reward belum bisa diberikan: capaian agen saat ini di bawah target karena ada closing yang dibatalkan")

// SetPayoffGuard enables the "reward only after lunas" rule (keputusan pendiri 29 Sep 2026): targets
// count closings (DP), but a closing_pax reward can be marked given only when those jamaah are lunas,
// unless the travel releases commission at DP.
func (s *agentTargetService) SetPayoffGuard(payoffRepo repository.TargetPayoffRepository, policyRepo repository.CommissionPolicyRepository) {
	s.payoffRepo = payoffRepo
	s.policyRepo = policyRepo
}

// unpaidClosings returns how many jamaah counted for this achievement are not lunas yet (0 when the
// guard does not apply).
func (s *agentTargetService) unpaidClosings(ctx context.Context, tenantID uint64, target *repository.AgentTarget, agentID uint64) int {
	if s.payoffRepo == nil || target.MetricType == "mitra_baru_count" {
		return 0
	}
	if s.policyRepo != nil {
		if v, err := s.policyRepo.GetReleaseOn(ctx, tenantID); err == nil && v == repository.CommissionReleaseOnDP {
			return 0
		}
	}
	n, err := s.payoffRepo.CountUnpaidClosings(ctx, tenantID, agentID, target.PeriodStart, target.PeriodEnd)
	if err != nil {
		return 0
	}
	return n
}

func NewAgentTargetService(
	targetRepo repository.AgentTargetRepository,
	agentRepo repository.AgentRepository,
) AgentTargetService {
	return &agentTargetService{
		targetRepo: targetRepo,
		agentRepo:  agentRepo,
	}
}

func (s *agentTargetService) validateTargetDates(startStr, endStr string) error {
	startDate, err1 := time.Parse("2006-01-02", startStr)
	endDate, err2 := time.Parse("2006-01-02", endStr)
	if err1 != nil || err2 != nil {
		return ErrInvalidDateFormat
	}
	if endDate.Before(startDate) {
		return ErrInvalidPeriod
	}
	return nil
}

func (s *agentTargetService) CreateTarget(ctx context.Context, tenantID uint64, adminUserID *uint64, input *CreateTargetInput) (*repository.AgentTarget, error) {
	if input.MetricType != "closing_pax" && input.MetricType != "mitra_baru_count" {
		return nil, ErrInvalidMetricType
	}
	if input.MetricValue <= 0 {
		return nil, ErrInvalidMetricValue
	}
	if err := s.validateTargetDates(input.PeriodStart, input.PeriodEnd); err != nil {
		return nil, err
	}

	target := &repository.AgentTarget{
		TenantID:          tenantID,
		Title:             input.Title,
		MetricType:        input.MetricType,
		MetricValue:       input.MetricValue,
		RewardDescription: input.RewardDescription,
		PeriodStart:       input.PeriodStart,
		PeriodEnd:         input.PeriodEnd,
		Status:            "active",
		CreatedBy:         adminUserID,
	}

	if err := s.targetRepo.Create(ctx, tenantID, target); err != nil {
		return nil, err
	}

	return s.targetRepo.GetByID(ctx, tenantID, target.ID)
}

func (s *agentTargetService) UpdateTarget(ctx context.Context, tenantID uint64, id uint64, input *UpdateTargetInput) (*repository.AgentTarget, error) {
	if input.MetricValue <= 0 {
		return nil, ErrInvalidMetricValue
	}
	if err := s.validateTargetDates(input.PeriodStart, input.PeriodEnd); err != nil {
		return nil, err
	}

	existing, err := s.targetRepo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	// Achievements of a closed target are already recorded against its value and period; editing
	// it afterwards would make the target disagree with who was rewarded.
	if existing.Status == "closed" {
		return nil, ErrTargetAlreadyClosed
	}

	existing.Title = input.Title
	existing.MetricValue = input.MetricValue
	existing.RewardDescription = input.RewardDescription
	existing.PeriodStart = input.PeriodStart
	existing.PeriodEnd = input.PeriodEnd

	if err := s.targetRepo.Update(ctx, tenantID, existing); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return nil, ErrTargetAlreadyClosed
		}
		return nil, err
	}

	return s.targetRepo.GetByID(ctx, tenantID, id)
}

func (s *agentTargetService) DeleteTarget(ctx context.Context, tenantID uint64, id uint64) error {
	hasAchievements, err := s.targetRepo.HasAchievements(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if hasAchievements {
		return ErrCannotDeleteWithAchievements
	}
	return s.targetRepo.Delete(ctx, tenantID, id)
}

func (s *agentTargetService) ListTargets(ctx context.Context, tenantID uint64, statusFilter *string) ([]repository.AgentTarget, error) {
	return s.targetRepo.ListByTenant(ctx, tenantID, statusFilter)
}

func (s *agentTargetService) GetTargetProgress(ctx context.Context, tenantID uint64, targetID uint64) (*TargetProgressResponse, error) {
	target, err := s.targetRepo.GetByID(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}
	rows, err := s.targetRepo.ListAgentProgress(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []repository.AgentTargetProgressRow{} // JSON [] for a travel without active agents
	}
	return &TargetProgressResponse{
		Target: *target,
		Rows:   rows,
	}, nil
}

func (s *agentTargetService) CloseTargetPeriod(ctx context.Context, tenantID uint64, targetID uint64, adminUserID uint64, force bool) (int, error) {
	target, err := s.targetRepo.GetByID(ctx, tenantID, targetID)
	if err != nil {
		return 0, err
	}
	if target.Status == "closed" {
		return 0, ErrTargetAlreadyClosed
	}
	// period_end is the last day of the period (inclusive), as a WIB date.
	if !force && TodayWIB() <= target.PeriodEnd {
		return 0, ErrTargetPeriodNotEnded
	}

	rows, err := s.targetRepo.ListAgentProgress(ctx, tenantID, targetID)
	if err != nil {
		return 0, err
	}

	achievedCount := 0
	now := time.Now()
	for _, row := range rows {
		if row.Achieved || row.AchievedValue >= target.MetricValue {
			ach := &repository.AgentTargetAchievement{
				TargetID:                  targetID,
				AgentID:                   row.AgentID,
				AchievedValue:             row.AchievedValue,
				AchievedAt:                now,
				RewardStatus:              "pending",
				RewardDescriptionSnapshot: target.RewardDescription,
			}
			if err := s.targetRepo.CreateAchievement(ctx, tenantID, ach); err != nil {
				return 0, err
			}
			achievedCount++
		}
	}

	if err := s.targetRepo.Close(ctx, tenantID, targetID); err != nil {
		return 0, err
	}

	return achievedCount, nil
}

func (s *agentTargetService) ListAchievements(ctx context.Context, tenantID uint64, targetID uint64) ([]AchievementDTO, error) {
	achievements, err := s.targetRepo.ListAchievementsByTarget(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}
	target, err := s.targetRepo.GetByID(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}

	agentNameMap := make(map[uint64]string)
	var dtos []AchievementDTO
	for _, a := range achievements {
		name, exists := agentNameMap[a.AgentID]
		if !exists {
			agent, err := s.agentRepo.GetByID(ctx, tenantID, a.AgentID)
			if err == nil && agent != nil {
				name = agent.Name
			} else {
				name = fmt.Sprintf("Agen #%d", a.AgentID)
			}
			agentNameMap[a.AgentID] = name
		}

		dtos = append(dtos, AchievementDTO{
			ID:                        a.ID,
			AgentID:                   a.AgentID,
			AgentName:                 name,
			AchievedValue:             a.AchievedValue,
			AchievedAt:                a.AchievedAt,
			RewardStatus:              a.RewardStatus,
			RewardGivenAt:             a.RewardGivenAt,
			RewardDescriptionSnapshot: a.RewardDescriptionSnapshot,
			Notes:                     a.Notes,
			UnpaidJamaahCount:         s.unpaidClosings(ctx, tenantID, target, a.AgentID),
		})
	}

	return dtos, nil
}

func (s *agentTargetService) MarkRewardGiven(ctx context.Context, tenantID uint64, achievementID uint64, adminUserID uint64, notes *string) error {
	ach, err := s.targetRepo.GetAchievementByID(ctx, tenantID, achievementID)
	if err != nil {
		return err
	}

	target, err := s.targetRepo.GetByID(ctx, tenantID, ach.TargetID)
	if err != nil {
		return err
	}
	if target.Status != "closed" {
		return ErrTargetNotClosed
	}
	if ach.RewardStatus == "given" {
		return ErrRewardAlreadyGiven
	}
	// The achievement froze the value at period close; closings cancelled since then no longer count.
	// Recompute from the live pipeline (only prospects still in Closing) before handing out the reward.
	current, err := s.targetRepo.GetAgentProgress(ctx, tenantID, ach.AgentID, target.MetricType, target.PeriodStart, target.PeriodEnd)
	if err != nil {
		return err
	}
	if current < target.MetricValue {
		return fmt.Errorf("%w (sekarang %d dari target %d)", ErrRewardBelowTarget, current, target.MetricValue)
	}
	if n := s.unpaidClosings(ctx, tenantID, target, ach.AgentID); n > 0 {
		return fmt.Errorf("%w (%d jamaah masih DP; tandai lunas atau batalkan closing-nya dulu)", ErrRewardHasUnpaidJamaah, n)
	}

	if err := s.targetRepo.UpdateRewardStatus(ctx, tenantID, achievementID, adminUserID, "given", notes); err != nil {
		if errors.Is(err, repository.ErrStatusConflict) {
			return ErrRewardAlreadyGiven // given meanwhile by a concurrent request
		}
		return err
	}
	return nil
}

func (s *agentTargetService) ExportAchievementsCSV(ctx context.Context, tenantID uint64, targetID uint64) ([]byte, error) {
	target, err := s.targetRepo.GetByID(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}

	achievements, err := s.ListAchievements(ctx, tenantID, targetID)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	// UTF-8 BOM for Excel compatibility
	buf.WriteString("\xEF\xBB\xBF")

	writer := csv.NewWriter(&buf)

	// CSV Header
	header := []string{
		"No",
		"Nama Agen",
		"Capaian",
		"Target",
		"Status Reward",
		"Tanggal Capai",
		"Tanggal Serah Hadiah",
		"Catatan",
		"Deskripsi Hadiah",
	}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	targetValStr := strconv.Itoa(target.MetricValue)
	for i, a := range achievements {
		rewardGivenAtStr := "-"
		if a.RewardGivenAt != nil {
			rewardGivenAtStr = a.RewardGivenAt.Format("2006-01-02 15:04:05")
		}

		rewardDesc := ""
		if a.RewardDescriptionSnapshot != nil {
			rewardDesc = *a.RewardDescriptionSnapshot
		}

		notesStr := ""
		if a.Notes != nil {
			notesStr = *a.Notes
		}

		statusLabel := "Belum Diserahkan"
		if a.RewardStatus == "given" {
			statusLabel = "Sudah Diserahkan"
		}

		record := []string{
			strconv.Itoa(i + 1),
			sanitizeCSVField(a.AgentName),
			strconv.Itoa(a.AchievedValue),
			targetValStr,
			statusLabel,
			a.AchievedAt.Format("2006-01-02 15:04:05"),
			rewardGivenAtStr,
			sanitizeCSVField(notesStr),
			sanitizeCSVField(rewardDesc),
		}
		if err := writer.Write(record); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

func (s *agentTargetService) GetTargetsForAgent(ctx context.Context, tenantID uint64, agentID uint64) ([]AgentTargetView, error) {
	status := "active"
	targets, err := s.targetRepo.ListByTenant(ctx, tenantID, &status)
	if err != nil {
		return nil, err
	}

	var views []AgentTargetView
	for _, t := range targets {
		prog, err := s.targetRepo.GetAgentProgress(ctx, tenantID, agentID, t.MetricType, t.PeriodStart, t.PeriodEnd)
		if err != nil {
			prog = 0
		}

		metricLabel := "Target Closing Jamaah"
		if t.MetricType == "mitra_baru_count" {
			metricLabel = "Target Rekrut Mitra"
		}

		views = append(views, AgentTargetView{
			ID:                t.ID,
			Title:             t.Title,
			MetricType:        t.MetricType,
			MetricLabel:       metricLabel,
			MetricValue:       t.MetricValue,
			ProgressValue:     prog,
			Achieved:          prog >= t.MetricValue,
			RewardDescription: t.RewardDescription,
			PeriodStart:       t.PeriodStart,
			PeriodEnd:         t.PeriodEnd,
			PeriodLabel:       formatPeriodLabel(t.PeriodStart, t.PeriodEnd),
		})
	}

	return views, nil
}
