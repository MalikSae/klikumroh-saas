package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"klikumroh/internal/repository"
)

// Agent habit tracker (2 Oct 2026). Five fixed daily habits, the same for every travel:
//
//	share   - share the referral link or a package (portal reports it)
//	contact - contact a jamaah: WhatsApp from the portal (reported) or a status change (from history)
//	caption - copy or send a caption from the caption bank (reported)
//	note    - write a progress note on a jamaah (from prospect notes)
//	sumber  - mark a new "99 sumber jamaah" source as tried (logged when marked)
//
// A day is active with HabitActiveMin of the HabitKeys done; the streak counts active days in a row
// (today only adds once it is active, it never breaks the streak while still in progress).
var HabitKeys = []string{"share", "contact", "caption", "note", "sumber"}

const (
	HabitActiveMin   = 3
	habitCalendarLen = 30
	habitLookback    = 400 // days read for the streak
	sumberMaxID      = 99
)

// HabitBadgeMilestones are the streak lengths that earn a badge (3 Oct 2026). Recognition only, no prize:
// a badge is earned once, kept for good, shown to the agent and other agents, and announced by notification.
var HabitBadgeMilestones = []int{7, 30, 100}

// habitLoggable are the habits the portal may report directly (note comes from notes, sumber from progress).
var habitLoggable = map[string]bool{"share": true, "contact": true, "caption": true}

var (
	ErrUnknownHabit  = errors.New("kebiasaan tidak dikenal")
	ErrUnknownSumber = errors.New("sumber jamaah tidak dikenal")
)

// HabitDayView is one calendar day.
type HabitDayView struct {
	Date   string `json:"date"`
	Done   int    `json:"done"`
	Active bool   `json:"active"`
}

// HabitSummary is what the agent portal shows.
type HabitSummary struct {
	Today       string         `json:"today"`
	DoneToday   []string       `json:"done_today"`
	Total       int            `json:"total"`
	ActiveMin   int            `json:"active_min"`
	TodayActive bool           `json:"today_active"`
	Streak      int            `json:"streak"`
	BestStreak  int            `json:"best_streak"`
	Calendar    []HabitDayView `json:"calendar"` // oldest first, ends today
	// Badges are the milestones earned so far (smallest first); NextBadge is the next milestone to reach
	// (0 once every milestone is earned).
	Badges    []repository.AgentHabitBadge `json:"badges"`
	NextBadge int                          `json:"next_badge"`
}

// AgentHabitService serves the habit tracker and the "99 sumber jamaah" progress for active agents.
type AgentHabitService interface {
	GetSummary(ctx context.Context, tenantID, agentID uint64) (*HabitSummary, error)
	LogHabit(ctx context.Context, tenantID, agentID uint64, habitKey string) error
	ListSumberDone(ctx context.Context, tenantID, agentID uint64) ([]int, error)
	SetSumberDone(ctx context.Context, tenantID, agentID uint64, sumberID int, done bool) error
	// Travel dashboard.
	TenantOverview(ctx context.Context, tenantID uint64) ([]AgentHabitOverview, error)
	AgentReport(ctx context.Context, tenantID, agentID uint64) (*AgentHabitReport, error)
}

type agentHabitService struct {
	agentRepo    repository.AgentRepository
	habitRepo    repository.AgentHabitRepository
	notifService NotificationService
	now          func() time.Time
}

// NewAgentHabitService creates the habit tracker service. notifService may be nil (no badge notification).
func NewAgentHabitService(agentRepo repository.AgentRepository, habitRepo repository.AgentHabitRepository, notifService NotificationService) AgentHabitService {
	return &agentHabitService{agentRepo: agentRepo, habitRepo: habitRepo, notifService: notifService, now: time.Now}
}

// businessToday is today's date in the business time zone (WIB).
func businessToday(now time.Time) time.Time {
	loc, err := time.LoadLocation(repository.BusinessTimeZone)
	if err != nil {
		loc = time.FixedZone("WIB", 7*60*60)
	}
	n := now.In(loc)
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
}

func (s *agentHabitService) requireActive(ctx context.Context, tenantID, agentID uint64) error {
	agent, err := s.agentRepo.GetByID(ctx, tenantID, agentID)
	if err != nil {
		return err
	}
	if agent.Status != "active" {
		return ErrAgentNotActive
	}
	return nil
}

func (s *agentHabitService) GetSummary(ctx context.Context, tenantID, agentID uint64) (*HabitSummary, error) {
	if err := s.requireActive(ctx, tenantID, agentID); err != nil {
		return nil, err
	}
	today := businessToday(s.now())
	from := today.AddDate(0, 0, -habitLookback)
	days, err := s.habitRepo.ListHabitDays(ctx, tenantID, agentID, from.Format("2006-01-02"), today.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	summary := BuildHabitSummary(days, today)
	// Habits done elsewhere (notes, status changes) count too, so milestones are checked here as well.
	s.awardBadges(ctx, tenantID, agentID, summary.BestStreak)
	badges, err := s.habitRepo.ListBadges(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	summary.Badges = badges
	summary.NextBadge = NextHabitBadge(badges)
	return summary, nil
}

// NextHabitBadge is the smallest milestone not earned yet (0 when all are earned).
func NextHabitBadge(badges []repository.AgentHabitBadge) int {
	have := map[int]bool{}
	for _, b := range badges {
		have[b.Days] = true
	}
	for _, m := range HabitBadgeMilestones {
		if !have[m] {
			return m
		}
	}
	return 0
}

// awardBadges records every milestone the best streak has reached and notifies the agent of the newly
// earned ones. Failures are logged only: a badge must never break the habit tracker itself.
func (s *agentHabitService) awardBadges(ctx context.Context, tenantID, agentID uint64, bestStreak int) {
	for _, m := range HabitBadgeMilestones {
		if bestStreak < m {
			return
		}
		earned, err := s.habitRepo.AwardBadge(ctx, tenantID, agentID, m)
		if err != nil {
			log.Printf("[Habit] award badge %d to agent %d: %v", m, agentID, err)
			return
		}
		if earned && s.notifService != nil {
			tID := tenantID
			title := fmt.Sprintf("Masya Allah, %d hari istiqamah", m)
			body := fmt.Sprintf("Anda meraih lencana Istiqamah %d Hari syiar Baitullah. Lencana ini tampil di profil dan leaderboard Anda.", m)
			if _, err := s.notifService.CreateNotification(ctx, &tID, "agent", agentID, "habit_badge", title, body, "/agen/kebiasaan"); err != nil {
				log.Printf("[Habit] notify badge %d to agent %d: %v", m, agentID, err)
			}
		}
	}
}

// refreshBadges re-reads the streak after a habit was recorded, so a milestone reached right now is
// awarded (and announced) at once instead of on the next page load.
func (s *agentHabitService) refreshBadges(ctx context.Context, tenantID, agentID uint64) {
	today := businessToday(s.now())
	from := today.AddDate(0, 0, -habitLookback)
	days, err := s.habitRepo.ListHabitDays(ctx, tenantID, agentID, from.Format("2006-01-02"), today.Format("2006-01-02"))
	if err != nil {
		log.Printf("[Habit] read streak of agent %d: %v", agentID, err)
		return
	}
	s.awardBadges(ctx, tenantID, agentID, BuildHabitSummary(days, today).BestStreak)
}

// BuildHabitSummary turns the habit days into today's checklist, the streaks and a 30-day calendar.
func BuildHabitSummary(days []repository.AgentHabitDay, today time.Time) *HabitSummary {
	known := make(map[string]bool, len(HabitKeys))
	for _, k := range HabitKeys {
		known[k] = true
	}
	perDay := map[string]map[string]bool{}
	for _, d := range days {
		if !known[d.Key] {
			continue
		}
		if perDay[d.Date] == nil {
			perDay[d.Date] = map[string]bool{}
		}
		perDay[d.Date][d.Key] = true
	}
	active := func(t time.Time) bool { return len(perDay[t.Format("2006-01-02")]) >= HabitActiveMin }

	todayKey := today.Format("2006-01-02")
	doneToday := []string{}
	for _, k := range HabitKeys {
		if perDay[todayKey][k] {
			doneToday = append(doneToday, k)
		}
	}

	// Current streak: yesterday backwards, plus today once today is active.
	streak := 0
	for d := today.AddDate(0, 0, -1); active(d); d = d.AddDate(0, 0, -1) {
		streak++
	}
	if active(today) {
		streak++
	}

	// Best streak within the lookback window.
	best, run := 0, 0
	for d := today.AddDate(0, 0, -habitLookback); !d.After(today); d = d.AddDate(0, 0, 1) {
		if active(d) {
			run++
			if run > best {
				best = run
			}
		} else {
			run = 0
		}
	}

	calendar := make([]HabitDayView, 0, habitCalendarLen)
	for i := habitCalendarLen - 1; i >= 0; i-- {
		d := today.AddDate(0, 0, -i)
		calendar = append(calendar, HabitDayView{
			Date:   d.Format("2006-01-02"),
			Done:   len(perDay[d.Format("2006-01-02")]),
			Active: active(d),
		})
	}

	return &HabitSummary{
		Today:       todayKey,
		DoneToday:   doneToday,
		Total:       len(HabitKeys),
		ActiveMin:   HabitActiveMin,
		TodayActive: active(today),
		Streak:      streak,
		BestStreak:  best,
		Calendar:    calendar,
	}
}

func (s *agentHabitService) LogHabit(ctx context.Context, tenantID, agentID uint64, habitKey string) error {
	if !habitLoggable[habitKey] {
		return ErrUnknownHabit
	}
	if err := s.requireActive(ctx, tenantID, agentID); err != nil {
		return err
	}
	if err := s.habitRepo.LogHabit(ctx, tenantID, agentID, habitKey, businessToday(s.now()).Format("2006-01-02")); err != nil {
		return err
	}
	s.refreshBadges(ctx, tenantID, agentID)
	return nil
}

func (s *agentHabitService) ListSumberDone(ctx context.Context, tenantID, agentID uint64) ([]int, error) {
	if err := s.requireActive(ctx, tenantID, agentID); err != nil {
		return nil, err
	}
	return s.habitRepo.ListSumberDone(ctx, tenantID, agentID)
}

func (s *agentHabitService) SetSumberDone(ctx context.Context, tenantID, agentID uint64, sumberID int, done bool) error {
	if sumberID < 1 || sumberID > sumberMaxID {
		return ErrUnknownSumber
	}
	if err := s.requireActive(ctx, tenantID, agentID); err != nil {
		return err
	}
	added, err := s.habitRepo.SetSumberDone(ctx, tenantID, agentID, sumberID, done)
	if err != nil {
		return err
	}
	if added {
		// Trying a new source is today's "sumber" habit (unmarking later keeps the day as it was). Marking
		// a source that is already marked (e.g. the page replaying its old local list) earns nothing.
		if err := s.habitRepo.LogHabit(ctx, tenantID, agentID, "sumber", businessToday(s.now()).Format("2006-01-02")); err != nil {
			return err
		}
		s.refreshBadges(ctx, tenantID, agentID)
	}
	return nil
}

// ---- Travel dashboard (admin view of the agents' daily syiar) ----

// AgentHabitOverview is one agent's row in the dashboard agent list.
type AgentHabitOverview struct {
	AgentID     uint64 `json:"agent_id"`
	ActiveDays7 int    `json:"active_days_7"` // active days in the last 7 days, today included once active
	TopBadge    int    `json:"top_badge"`     // highest streak badge in days, 0 when none
}

// AgentHabitReport is the habit panel on the dashboard agent detail: the agent's own summary plus how
// often each habit was done in the last 30 days.
type AgentHabitReport struct {
	*HabitSummary
	ActiveDays30 int            `json:"active_days_30"`
	Counts30     map[string]int `json:"counts_30"` // days each habit was done in the last 30 days
}

const habitOverviewDays = 7

// TenantOverview returns the habit row of every agent of the travel that did anything in the last 7 days
// or holds a badge (agents absent from the result have nothing to show).
func (s *agentHabitService) TenantOverview(ctx context.Context, tenantID uint64) ([]AgentHabitOverview, error) {
	today := businessToday(s.now())
	from := today.AddDate(0, 0, -(habitOverviewDays - 1))
	rows, err := s.habitRepo.ListTenantHabitDays(ctx, tenantID, from.Format("2006-01-02"), today.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	perAgent := map[uint64][]repository.AgentHabitDay{}
	for _, r := range rows {
		perAgent[r.AgentID] = append(perAgent[r.AgentID], repository.AgentHabitDay{Date: r.Date, Key: r.Key})
	}
	badges, err := s.habitRepo.TopBadgeByAgent(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	ids := map[uint64]bool{}
	for id := range perAgent {
		ids[id] = true
	}
	for id := range badges {
		ids[id] = true
	}
	out := make([]AgentHabitOverview, 0, len(ids))
	for id := range ids {
		summary := BuildHabitSummary(perAgent[id], today)
		active := 0
		for _, d := range summary.Calendar[len(summary.Calendar)-habitOverviewDays:] {
			if d.Active {
				active++
			}
		}
		out = append(out, AgentHabitOverview{AgentID: id, ActiveDays7: active, TopBadge: badges[id]})
	}
	return out, nil
}

// AgentReport is the habit report of one agent of the travel (any status: an inactive agent's history
// stays visible). ErrNotFound when the agent is not of this travel.
func (s *agentHabitService) AgentReport(ctx context.Context, tenantID, agentID uint64) (*AgentHabitReport, error) {
	if _, err := s.agentRepo.GetByID(ctx, tenantID, agentID); err != nil {
		return nil, err
	}
	today := businessToday(s.now())
	from := today.AddDate(0, 0, -habitLookback)
	days, err := s.habitRepo.ListHabitDays(ctx, tenantID, agentID, from.Format("2006-01-02"), today.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	summary := BuildHabitSummary(days, today)
	badges, err := s.habitRepo.ListBadges(ctx, tenantID, agentID)
	if err != nil {
		return nil, err
	}
	summary.Badges = badges
	summary.NextBadge = NextHabitBadge(badges)

	start := today.AddDate(0, 0, -(habitCalendarLen - 1)).Format("2006-01-02")
	counts := map[string]int{}
	for _, k := range HabitKeys {
		counts[k] = 0
	}
	for _, d := range days {
		if _, ok := counts[d.Key]; ok && d.Date >= start {
			counts[d.Key]++
		}
	}
	active30 := 0
	for _, d := range summary.Calendar {
		if d.Active {
			active30++
		}
	}
	return &AgentHabitReport{HabitSummary: summary, ActiveDays30: active30, Counts30: counts}, nil
}
