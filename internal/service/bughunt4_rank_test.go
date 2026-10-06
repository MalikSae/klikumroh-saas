package service

import (
	"testing"

	"klikumroh/internal/repository"
)

// Bug hunt round 4 L1: leaderboard ranks follow the home tile (closingRank): ties share a rank and an
// agent without closings has no rank (0).
func TestBH4_LeaderboardRanksMatchClosingRank(t *testing.T) {
	stats := []repository.AgentClosingStat{
		{AgentID: 7, TotalJamaah: 5},
		{AgentID: 3, TotalJamaah: 3},
		{AgentID: 4, TotalJamaah: 3},
		{AgentID: 9, TotalJamaah: 1},
		{AgentID: 1, TotalJamaah: 0},
		{AgentID: 2, TotalJamaah: 0},
	}
	want := []int{1, 2, 2, 4, 0, 0}
	got := leaderboardRanks(stats)
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ranks = %v, want %v", got, want)
		}
		if tile := closingRank(stats, stats[i].AgentID); tile != got[i] {
			t.Fatalf("agent %d: leaderboard rank %d != home tile rank %d", stats[i].AgentID, got[i], tile)
		}
	}
	if r := leaderboardRanks(nil); len(r) != 0 {
		t.Fatalf("empty stats: %v", r)
	}
	allZero := leaderboardRanks([]repository.AgentClosingStat{{AgentID: 1}, {AgentID: 2}})
	if allZero[0] != 0 || allZero[1] != 0 {
		t.Fatalf("nobody closed: ranks = %v, want all 0", allZero)
	}
}
