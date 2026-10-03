package service

import (
	"context"
	"testing"

	"klikumroh/internal/repository"
)

// fakeBadgeRepo keeps awarded milestones in memory (only the badge methods are used by awardBadges).
type fakeBadgeRepo struct {
	repository.AgentHabitRepository
	awarded map[int]bool
}

func (f *fakeBadgeRepo) AwardBadge(ctx context.Context, tenantID, agentID uint64, days int) (bool, error) {
	if f.awarded[days] {
		return false, nil
	}
	f.awarded[days] = true
	return true, nil
}

// fakeNotifier records the notifications sent.
type fakeNotifier struct {
	NotificationService
	titles []string
}

func (f *fakeNotifier) CreateNotification(ctx context.Context, tenantID *uint64, recipientType string, recipientID uint64, notifType, title, body, linkURL string) (*repository.Notification, error) {
	f.titles = append(f.titles, title)
	return nil, nil
}

// Milestones: each one reached by the best streak is earned once and announced once.
func TestAwardBadges_MilestonesEarnedAndAnnouncedOnce(t *testing.T) {
	repo := &fakeBadgeRepo{awarded: map[int]bool{}}
	notif := &fakeNotifier{}
	s := &agentHabitService{habitRepo: repo, notifService: notif}

	t.Run("below first milestone: nothing", func(t *testing.T) {
		s.awardBadges(context.Background(), 1, 2, 6)
		if len(repo.awarded) != 0 || len(notif.titles) != 0 {
			t.Fatalf("awarded %v, notified %v", repo.awarded, notif.titles)
		}
	})

	t.Run("best streak 31 earns 7 and 30", func(t *testing.T) {
		s.awardBadges(context.Background(), 1, 2, 31)
		if !repo.awarded[7] || !repo.awarded[30] || repo.awarded[100] {
			t.Fatalf("awarded %v", repo.awarded)
		}
		if len(notif.titles) != 2 || notif.titles[0] != "Masya Allah, 7 hari istiqamah" || notif.titles[1] != "Masya Allah, 30 hari istiqamah" {
			t.Fatalf("notifications %v", notif.titles)
		}
	})

	t.Run("checking again announces nothing new", func(t *testing.T) {
		s.awardBadges(context.Background(), 1, 2, 31)
		if len(notif.titles) != 2 {
			t.Fatalf("repeat notifications %v", notif.titles)
		}
	})
}

func TestNextHabitBadge(t *testing.T) {
	cases := []struct {
		have []int
		want int
	}{{nil, 7}, {[]int{7}, 30}, {[]int{7, 30}, 100}, {[]int{7, 30, 100}, 0}}
	for _, c := range cases {
		var badges []repository.AgentHabitBadge
		for _, d := range c.have {
			badges = append(badges, repository.AgentHabitBadge{Days: d})
		}
		if got := NextHabitBadge(badges); got != c.want {
			t.Fatalf("have %v: next = %d, want %d", c.have, got, c.want)
		}
	}
}
