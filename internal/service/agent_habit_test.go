package service

import (
	"testing"
	"time"

	"klikumroh/internal/repository"
)

func habitDays(date string, keys ...string) []repository.AgentHabitDay {
	out := make([]repository.AgentHabitDay, 0, len(keys))
	for _, k := range keys {
		out = append(out, repository.AgentHabitDay{Date: date, Key: k})
	}
	return out
}

// Streak rules: a day is active with 3 of 5 habits; an unfinished today never breaks the streak; a gap does.
func TestBuildHabitSummary_Streaks(t *testing.T) {
	today := time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC)
	var days []repository.AgentHabitDay
	// 4 active days before a gap: Sep 24-27; gap Sep 28; active Sep 29 - Oct 1 (3 days).
	for _, d := range []string{"2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-29", "2026-09-30", "2026-10-01"} {
		days = append(days, habitDays(d, "share", "contact", "caption")...)
	}
	days = append(days, habitDays("2026-09-28", "share", "note")...)    // only 2: not active
	days = append(days, habitDays("2026-10-02", "share", "unknown")...) // today: 1 known habit so far

	s := BuildHabitSummary(days, today)
	if s.Streak != 3 {
		t.Fatalf("streak: expected 3 (today in progress does not break it), got %d", s.Streak)
	}
	if s.BestStreak != 4 {
		t.Fatalf("best streak: expected 4, got %d", s.BestStreak)
	}
	if s.TodayActive || len(s.DoneToday) != 1 || s.DoneToday[0] != "share" {
		t.Fatalf("today: expected only share done and not active, got %+v active=%v", s.DoneToday, s.TodayActive)
	}
	if len(s.Calendar) != 30 || s.Calendar[29].Date != "2026-10-02" || !s.Calendar[28].Active || s.Calendar[25].Active {
		t.Fatalf("calendar: unexpected %+v", s.Calendar[25:])
	}

	// Today becomes active: the streak includes it.
	days = append(days, habitDays("2026-10-02", "note", "sumber")...)
	s = BuildHabitSummary(days, today)
	if !s.TodayActive || s.Streak != 4 {
		t.Fatalf("active today: expected streak 4, got %d (active=%v)", s.Streak, s.TodayActive)
	}
}
