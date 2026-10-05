package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// M10: the home card "Alasan tidak lanjut" groups by reason category (same basis and labels as the
// Prospek tab's summary.lost_reasons), not by the free-text lost_reason. Another tenant's prospects
// never count.
func TestDashboardOverview_LostReasonsByCategory(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	tenantA := createDummyTenant(t, ctx, tenantRepo, "lost_a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "lost_b")

	n := 0
	add := func(tenantID uint64, reason, category string) {
		n++
		p := &repository.Prospect{TenantID: tenantID, Name: fmt.Sprintf("Lost %d", n),
			Phone: fmt.Sprintf("0857%08d", (time.Now().UnixNano()+int64(n))%100000000), SourceChannel: "organik", Status: "tidak_lanjut"}
		if reason != "" {
			p.LostReason = &reason
		}
		if category != "" {
			p.LostReasonCategory = &category
		}
		if err := prospectRepo.Create(ctx, tenantID, p); err != nil {
			t.Fatalf("create prospect: %v", err)
		}
	}
	// 3 x harga with different notes, 2 cancelled after DP with different reasons, 1 legacy row
	// without category (counted as lainnya, like the Prospek tab).
	add(tenantA.ID, "Harga tidak cocok", "harga")
	add(tenantA.ID, "minta diskon", "harga")
	add(tenantA.ID, "kemahalan", "harga")
	add(tenantA.ID, "Batal setelah DP: sakit", "batal_setelah_dp")
	add(tenantA.ID, "Batal setelah DP: dana", "batal_setelah_dp")
	add(tenantA.ID, "alasan lama", "")
	for i := 0; i < 4; i++ {
		add(tenantB.ID, "Jadwal tidak cocok", "jadwal")
	}

	svc := service.NewDashboardOverviewService(repository.NewDashboardOverviewRepository(db))
	res, err := svc.GetOverview(ctx, tenantA.ID)
	if err != nil {
		t.Fatalf("GetOverview: %v", err)
	}
	got := map[string]int{}
	var pctSum float64
	for _, lr := range res.PipelineFunnel.TopLostReasons {
		got[lr.Reason] = lr.Count
		pctSum += lr.Percentage
	}
	want := map[string]int{"Harga tidak cocok": 3, "Batal setelah DP": 2, "Lainnya": 1}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	if res.PipelineFunnel.TopLostReasons[0].Reason != "Harga tidak cocok" || res.PipelineFunnel.TopLostReasons[0].Percentage != 50 {
		t.Fatalf("first row should be Harga tidak cocok at 50%%, got %+v", res.PipelineFunnel.TopLostReasons[0])
	}
	if pctSum < 99.9 || pctSum > 100.1 {
		t.Fatalf("percentages must add up to 100 of tidak_lanjut, got %.2f", pctSum)
	}

	// Same counts as the Prospek tab summary.
	summary, err := prospectRepo.StatusSummary(ctx, tenantA.ID)
	if err != nil {
		t.Fatal(err)
	}
	for key, cnt := range summary.LostReasons {
		if got[service.LostReasonCategories[key]] != cnt {
			t.Fatalf("category %s: card %d vs Prospek tab %d", key, got[service.LostReasonCategories[key]], cnt)
		}
	}
}
