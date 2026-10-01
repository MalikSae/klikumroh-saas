package repository_test

import (
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

// Kanal redesign (30 Sep 2026): the channel report counts only the tenant's own prospects, splits them
// into website / ads / agent the same way as the overview, puts a 40-day-old prospect in the previous
// 30-day period, and groups ad prospects by UTM campaign. Tenant B sees nothing of tenant A.
func TestChannelReport_TenantScoped(t *testing.T) {
	e := setupProspectAudit(t)
	repo := repository.NewChannelReportRepository(e.db)

	newProspect := func(phone, source string, utmSource, utmCampaign *string) *repository.Prospect {
		t.Helper()
		n := util.NormalizePhoneToWhatsApp(phone)
		one := 1
		p := &repository.Prospect{Name: "Jamaah Kanal", Phone: phone, PhoneNormalized: &n, JumlahJamaah: &one, SourceChannel: source, Status: "baru", UTMSource: utmSource, UTMCampaign: utmCampaign}
		if err := e.prospectRepo.Create(e.ctx, e.tenantA.ID, p); err != nil {
			t.Fatalf("create prospect: %v", err)
		}
		return p
	}
	meta, promo := "facebook", "promo-desember"
	agentP := e.newAgentProspect(t, "081377770001", 3)
	newProspect("081377770002", "paid", &meta, &promo)
	newProspect("081377770003", "paid", &meta, &promo)
	newProspect("081377770004", "organik", nil, nil)
	old := newProspect("081377770005", "organik", nil, nil)
	if _, err := e.db.Exec("UPDATE prospects SET created_at = DATE_SUB(NOW(), INTERVAL 40 DAY) WHERE id = ? AND tenant_id = ?", old.ID, e.tenantA.ID); err != nil {
		t.Fatalf("age prospect: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, agentP.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}

	repA, err := repo.Report(e.ctx, e.tenantA.ID, 30)
	if err != nil {
		t.Fatalf("report A: %v", err)
	}
	got := map[string]repository.ChannelStat{}
	for _, c := range repA.Channels {
		got[c.Channel] = c
	}
	if got["web"].Prospects != 1 || got["ads"].Prospects != 2 || got["agen"].Prospects != 1 {
		t.Fatalf("tenant A current channels wrong: %+v", repA.Channels)
	}
	if got["agen"].Closing != 1 || got["agen"].ClosingJamaah != 3 || got["agen"].Processed != 1 {
		t.Fatalf("tenant A agent closing wrong: %+v", got["agen"])
	}
	if repA.Previous[0].Channel != "web" || repA.Previous[0].Prospects != 1 {
		t.Fatalf("40-day-old prospect must be in the previous period: %+v", repA.Previous)
	}
	if len(repA.Campaigns) != 1 || repA.Campaigns[0].Source != "facebook" || repA.Campaigns[0].Campaign != "promo-desember" || repA.Campaigns[0].Prospects != 2 {
		t.Fatalf("tenant A campaigns wrong: %+v", repA.Campaigns)
	}
	if len(repA.Daily) != 30 {
		t.Fatalf("expected 30 zero-filled days, got %d", len(repA.Daily))
	}
	today := repA.Daily[len(repA.Daily)-1]
	if today.Date != repA.To || today.Web != 1 || today.Ads != 2 || today.Agen != 1 {
		t.Fatalf("today's series wrong: %+v", today)
	}

	repB, err := repo.Report(e.ctx, e.tenantB.ID, 30)
	if err != nil {
		t.Fatalf("report B: %v", err)
	}
	for _, list := range [][]repository.ChannelStat{repB.Channels, repB.Previous} {
		for _, c := range list {
			if c.Prospects != 0 {
				t.Fatalf("tenant B must not see tenant A's prospects: %+v", c)
			}
		}
	}
	if len(repB.Campaigns) != 0 {
		t.Fatalf("tenant B must not see tenant A's campaigns: %+v", repB.Campaigns)
	}
	for _, d := range repB.Daily {
		if d.Web+d.Ads+d.Agen != 0 {
			t.Fatalf("tenant B daily must be empty: %+v", d)
		}
	}
}
