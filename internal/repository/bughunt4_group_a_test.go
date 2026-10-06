package repository_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
	"klikumroh/internal/util"

	"golang.org/x/crypto/bcrypt"
)

// Bug hunt round 4, group A (prospect / agent backend), run against real MySQL. Every tenant made here is
// purged by createDummyTenant's cleanup (AGENTS.md 5.1 rule 3).

// M4: the public form has no agent_id: a client-chosen agent id is ignored, so a lead cannot be
// attributed to an arbitrary agent and the agent's WhatsApp number never reaches the response.
func TestBH4_PublicProspectIgnoresClientAgentID(t *testing.T) {
	e := setupProspectAudit(t)
	agentWA := util.NormalizePhoneToWhatsApp(*e.agentA.Phone)

	submit := func(t *testing.T, tenantID uint64, body string) *service.PublicProspectResponse {
		t.Helper()
		var input service.PublicProspectInput
		if err := json.Unmarshal([]byte(body), &input); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		res, err := e.svc.CreatePublic(e.ctx, tenantID, input)
		if err != nil {
			t.Fatalf("CreatePublic: %v", err)
		}
		return res
	}
	stored := func(t *testing.T, tenantID uint64, phone string) (agentID *uint64, source string) {
		t.Helper()
		var a *uint64
		var id uint64
		var hasAgent bool
		row := e.db.QueryRow(`SELECT COALESCE(agent_id, 0), agent_id IS NOT NULL, source_channel FROM prospects
			WHERE tenant_id = ? AND phone_normalized = ?`, tenantID, util.NormalizePhoneToWhatsApp(phone))
		if err := row.Scan(&id, &hasAgent, &source); err != nil {
			t.Fatalf("read stored prospect: %v", err)
		}
		if hasAgent {
			a = &id
		}
		return a, source
	}

	t.Run("agent_id of a real active agent is not attributed", func(t *testing.T) {
		phone := "081344440401"
		res := submit(t, e.tenantA.ID, fmt.Sprintf(`{"name":"Calon Jamaah","phone":%q,"consent":true,"agent_id":%d}`, phone, e.agentA.ID))
		agentID, source := stored(t, e.tenantA.ID, phone)
		if agentID != nil {
			t.Fatalf("prospect attributed to agent %d from a client agent_id", *agentID)
		}
		if source == "agen" {
			t.Fatalf("source_channel = agen without a referral code")
		}
		if res.WhatsAppRedirectURL != nil && strings.Contains(*res.WhatsAppRedirectURL, agentWA) {
			t.Fatalf("response leaks the agent's WhatsApp number: %s", *res.WhatsAppRedirectURL)
		}
		raw, _ := json.Marshal(res)
		if strings.Contains(string(raw), agentWA) {
			t.Fatalf("response JSON contains the agent's WhatsApp number: %s", raw)
		}
	})

	t.Run("cross-tenant: tenant A agent id on tenant B is not attributed", func(t *testing.T) {
		phone := "081344440402"
		res := submit(t, e.tenantB.ID, fmt.Sprintf(`{"name":"Calon Jamaah B","phone":%q,"consent":true,"agent_id":%d}`, phone, e.agentA.ID))
		if agentID, _ := stored(t, e.tenantB.ID, phone); agentID != nil {
			t.Fatalf("tenant B prospect attributed to agent %d", *agentID)
		}
		if res.WhatsAppRedirectURL != nil && strings.Contains(*res.WhatsAppRedirectURL, agentWA) {
			t.Fatalf("tenant B response leaks tenant A agent's WhatsApp: %s", *res.WhatsAppRedirectURL)
		}
	})

	t.Run("control: a valid referral code still attributes", func(t *testing.T) {
		phone := "081344440403"
		submit(t, e.tenantA.ID, fmt.Sprintf(`{"name":"Lewat Referral","phone":%q,"consent":true,"referral_code":%q}`, phone, e.agentA.ReferralCode))
		agentID, source := stored(t, e.tenantA.ID, phone)
		if agentID == nil || *agentID != e.agentA.ID || source != "agen" {
			t.Fatalf("referral code not attributed: agent=%v source=%s", agentID, source)
		}
	})
}

// M5: "Agen baru direkrut" counts downlines REGISTERED in the period (WIB dates, inclusive) that are
// approved (active). Closings do not matter.
func TestBH4_RecruitTargetCountsRegistrationsInPeriod(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)
	prospectRepo := repository.NewProspectRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "bh4-rec-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "bh4-rec-b")

	ts := time.Now().UnixNano()
	n := 0
	newAgent := func(t *testing.T, tenantID uint64, parent *uint64, status, createdAt string) *repository.Agent {
		t.Helper()
		n++
		phone := fmt.Sprintf("0812%08d", (ts+int64(n))%100000000)
		a := &repository.Agent{Name: fmt.Sprintf("Agen %d", n), Phone: &phone, Status: status,
			ReferralCode: fmt.Sprintf("BH4R-%d-%d", ts, n), ParentAgentID: parent}
		if err := agentRepo.Create(ctx, tenantID, a); err != nil {
			t.Fatalf("create agent: %v", err)
		}
		if createdAt != "" {
			if _, err := db.Exec(`UPDATE agents SET created_at = ? WHERE tenant_id = ? AND id = ?`, createdAt, tenantID, a.ID); err != nil {
				t.Fatalf("set created_at: %v", err)
			}
		}
		return a
	}

	const start, end = "2026-09-01", "2026-09-30"
	upline := newAgent(t, tenantA.ID, nil, "active", "2025-01-01 08:00:00")

	// Old downline (2025) that closes a jamaah inside the period: not a recruit of this period.
	old := newAgent(t, tenantA.ID, &upline.ID, "active", "2025-03-10 09:00:00")
	one := 1
	p := &repository.Prospect{AgentID: &old.ID, Name: "Jamaah Lama", Phone: "081344445001", Status: "closing",
		JumlahJamaah: &one, SourceChannel: "agen"}
	if err := prospectRepo.Create(ctx, tenantA.ID, p); err != nil {
		t.Fatalf("create prospect: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at)
		VALUES (?, ?, 'admin', 1, 'baru', 'closing', '2026-09-15 10:00:00')`, tenantA.ID, p.ID); err != nil {
		t.Fatalf("insert history: %v", err)
	}
	// New recruits without any closing, on both inclusive boundaries (WIB).
	newAgent(t, tenantA.ID, &upline.ID, "active", "2026-09-01 00:00:00")
	newAgent(t, tenantA.ID, &upline.ID, "active", "2026-09-30 23:59:59")
	// Registered in the period but not approved: not counted.
	newAgent(t, tenantA.ID, &upline.ID, "pending", "2026-09-10 10:00:00")
	newAgent(t, tenantA.ID, &upline.ID, "rejected", "2026-09-11 10:00:00")
	// Just outside the period.
	newAgent(t, tenantA.ID, &upline.ID, "active", "2026-08-31 23:59:59")
	newAgent(t, tenantA.ID, &upline.ID, "active", "2026-10-01 00:00:00")

	// Tenant B: an upline with one recruit in the same period.
	uplineB := newAgent(t, tenantB.ID, nil, "active", "2025-01-01 08:00:00")
	newAgent(t, tenantB.ID, &uplineB.ID, "active", "2026-09-05 10:00:00")

	t.Run("GetAgentProgress counts only approved registrations in the period", func(t *testing.T) {
		got, err := targetRepo.GetAgentProgress(ctx, tenantA.ID, upline.ID, "mitra_baru_count", start, end)
		if err != nil {
			t.Fatalf("GetAgentProgress: %v", err)
		}
		if got != 2 {
			t.Fatalf("recruits = %d, want 2 (two new active downlines; old closer, pending, rejected and out-of-period excluded)", got)
		}
	})

	target := &repository.AgentTarget{Title: strPtr("Rekrut September"), MetricType: "mitra_baru_count", MetricValue: 2,
		RewardDescription: strPtr("Bonus rekrut"), PeriodStart: start, PeriodEnd: end, Status: "active"}
	if err := targetRepo.Create(ctx, tenantA.ID, target); err != nil {
		t.Fatalf("create target: %v", err)
	}

	t.Run("ListAgentProgress uses the same rule", func(t *testing.T) {
		rows, err := targetRepo.ListAgentProgress(ctx, tenantA.ID, target.ID)
		if err != nil {
			t.Fatalf("ListAgentProgress: %v", err)
		}
		vals := map[uint64]int{}
		for _, r := range rows {
			vals[r.AgentID] = r.AchievedValue
		}
		if vals[upline.ID] != 2 {
			t.Fatalf("upline achieved = %d, want 2", vals[upline.ID])
		}
		if vals[old.ID] != 0 {
			t.Fatalf("old downline achieved = %d, want 0", vals[old.ID])
		}
		if _, ok := vals[uplineB.ID]; ok {
			t.Fatalf("tenant B agent listed in tenant A progress")
		}
	})

	t.Run("cross-tenant isolation", func(t *testing.T) {
		if got, err := targetRepo.GetAgentProgress(ctx, tenantB.ID, upline.ID, "mitra_baru_count", start, end); err != nil || got != 0 {
			t.Fatalf("tenant B reading tenant A upline: got %d, err %v; want 0", got, err)
		}
		if got, err := targetRepo.GetAgentProgress(ctx, tenantA.ID, uplineB.ID, "mitra_baru_count", start, end); err != nil || got != 0 {
			t.Fatalf("tenant A reading tenant B upline: got %d, err %v; want 0", got, err)
		}
		if got, err := targetRepo.GetAgentProgress(ctx, tenantB.ID, uplineB.ID, "mitra_baru_count", start, end); err != nil || got != 1 {
			t.Fatalf("tenant B own upline: got %d, err %v; want 1", got, err)
		}
		if _, err := targetRepo.ListAgentProgress(ctx, tenantB.ID, target.ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("tenant B listing tenant A target: want ErrNotFound, got %v", err)
		}
	})

	t.Run("CloseTargetPeriod and MarkRewardGiven follow the same rule", func(t *testing.T) {
		hash, err := bcrypt.GenerateFromPassword([]byte(fmt.Sprintf("bh4-%d", ts)), bcrypt.MinCost)
		if err != nil {
			t.Fatalf("hash: %v", err)
		}
		admin := &repository.AdminUser{TenantID: tenantA.ID, Name: "Admin BH4", Status: "active",
			Email: fmt.Sprintf("bh4-rec-%d@klikumroh.test", ts), PasswordHash: string(hash)}
		if err := repository.NewAdminUserRepository(db).Create(ctx, tenantA.ID, admin); err != nil {
			t.Fatalf("create admin: %v", err)
		}
		svc := service.NewAgentTargetService(targetRepo, agentRepo)
		achieved, err := svc.CloseTargetPeriod(ctx, tenantA.ID, target.ID, admin.ID, true)
		if err != nil {
			t.Fatalf("CloseTargetPeriod: %v", err)
		}
		if achieved != 1 {
			t.Fatalf("achievers = %d, want 1 (only the upline)", achieved)
		}
		achs, err := targetRepo.ListAchievementsByTarget(ctx, tenantA.ID, target.ID)
		if err != nil || len(achs) != 1 || achs[0].AgentID != upline.ID || achs[0].AchievedValue != 2 {
			t.Fatalf("achievements = %+v, err %v; want one for the upline with value 2", achs, err)
		}
		if err := svc.MarkRewardGiven(ctx, tenantA.ID, achs[0].ID, admin.ID, nil); err != nil {
			t.Fatalf("MarkRewardGiven: %v", err)
		}
	})
}

// M6: conversion_cohort = prospects that came in during the last 30 days and how many of THEM are
// Closing now, on both the dashboard overview and the prospects summary. Never above 100%.
func TestBH4_ConversionCohort(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	prospectRepo := repository.NewProspectRepository(db)
	overview := service.NewDashboardOverviewService(repository.NewDashboardOverviewRepository(db))

	tenantA := createDummyTenant(t, ctx, tenantRepo, "bh4-coh-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "bh4-coh-b")

	loc, err := time.LoadLocation(repository.BusinessTimeZone)
	if err != nil {
		t.Fatalf("load WIB: %v", err)
	}
	now := time.Now().In(loc)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	windowStart := todayStart.AddDate(0, 0, -(repository.ConversionCohortWindowDays - 1))

	seq := 0
	add := func(t *testing.T, tenantID uint64, status string, createdAt time.Time) {
		t.Helper()
		seq++
		p := &repository.Prospect{Name: fmt.Sprintf("Kohort %d", seq), Phone: fmt.Sprintf("0813777%05d", seq),
			Status: status, SourceChannel: "organik"}
		if err := prospectRepo.Create(ctx, tenantID, p); err != nil {
			t.Fatalf("create prospect: %v", err)
		}
		if _, err := db.Exec(`UPDATE prospects SET created_at = ? WHERE tenant_id = ? AND id = ?`,
			createdAt.Format("2006-01-02 15:04:05"), tenantID, p.ID); err != nil {
			t.Fatalf("set created_at: %v", err)
		}
		if status == "closing" {
			// Closed now (inside the window), whatever the creation date.
			if _, err := db.Exec(`INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at)
				VALUES (?, ?, 'admin', 1, 'tertarik', 'closing', NOW())`, tenantID, p.ID); err != nil {
				t.Fatalf("insert history: %v", err)
			}
		}
	}

	// 15 old prospects (created 40 days ago) closed in the window.
	for i := 0; i < 15; i++ {
		add(t, tenantA.ID, "closing", todayStart.AddDate(0, 0, -40))
	}
	// One just before the window starts (WIB), closed now: not in the cohort.
	add(t, tenantA.ID, "closing", windowStart.Add(-time.Second))
	// 10 new prospects in the window: 3 closing (one on the first second of the window), 7 open.
	add(t, tenantA.ID, "closing", windowStart)
	add(t, tenantA.ID, "closing", todayStart.AddDate(0, 0, -5))
	add(t, tenantA.ID, "closing", now.Add(-time.Minute))
	for i := 0; i < 7; i++ {
		add(t, tenantA.ID, "baru", now.Add(-time.Duration(i+1)*time.Hour))
	}
	// Tenant B: 4 new prospects, all closing. Must not leak into tenant A, and vice versa.
	for i := 0; i < 4; i++ {
		add(t, tenantB.ID, "closing", now.Add(-time.Duration(i+1)*time.Hour))
	}

	want := repository.ConversionCohort{Prospects: 10, Closings: 3, WindowDays: 30}
	wantB := repository.ConversionCohort{Prospects: 4, Closings: 4, WindowDays: 30}

	t.Run("dashboard overview", func(t *testing.T) {
		res, err := overview.GetOverview(ctx, tenantA.ID)
		if err != nil {
			t.Fatalf("GetOverview: %v", err)
		}
		if res.ConversionCohort != want {
			t.Fatalf("overview cohort = %+v, want %+v", res.ConversionCohort, want)
		}
		raw, _ := json.Marshal(res)
		if !strings.Contains(string(raw), `"conversion_cohort":{"prospects":10,"closings":3,"window_days":30}`) {
			t.Fatalf("overview JSON contract mismatch: %s", raw)
		}
		// The old ratio (closings by close date / new prospects) is what exceeded 100%.
		closingsByDate := 0
		for _, d := range res.KPIDaily[len(res.KPIDaily)-30:] {
			closingsByDate += d.Closings
		}
		if closingsByDate < 15 {
			t.Fatalf("scenario check: closings by date in window = %d, want >= 15", closingsByDate)
		}
	})

	t.Run("prospects status summary", func(t *testing.T) {
		s, err := prospectRepo.StatusSummary(ctx, tenantA.ID)
		if err != nil {
			t.Fatalf("StatusSummary: %v", err)
		}
		if s.ConversionCohort != want {
			t.Fatalf("summary cohort = %+v, want %+v", s.ConversionCohort, want)
		}
		raw, _ := json.Marshal(s)
		if !strings.Contains(string(raw), `"conversion_cohort":{"prospects":10,"closings":3,"window_days":30}`) {
			t.Fatalf("summary JSON contract mismatch: %s", raw)
		}
	})

	t.Run("tenant isolation", func(t *testing.T) {
		res, err := overview.GetOverview(ctx, tenantB.ID)
		if err != nil {
			t.Fatalf("GetOverview B: %v", err)
		}
		if res.ConversionCohort != wantB {
			t.Fatalf("tenant B overview cohort = %+v, want %+v", res.ConversionCohort, wantB)
		}
		s, err := prospectRepo.StatusSummary(ctx, tenantB.ID)
		if err != nil {
			t.Fatalf("StatusSummary B: %v", err)
		}
		if s.ConversionCohort != wantB {
			t.Fatalf("tenant B summary cohort = %+v, want %+v", s.ConversionCohort, wantB)
		}
	})
}

// M10: info_komisi.has_ledger is true whenever commission_ledger rows exist for the prospect, also
// after the closing was cancelled and the prospect reopened; agent_held_amount / agent_released_amount
// are in the dashboard detail JSON.
func TestBH4_ProspectDetailHasLedger(t *testing.T) {
	e := setupProspectAudit(t)
	ctx := e.ctx

	fresh := e.newAgentProspect(t, "081344446001", 1)
	reopened := e.newAgentProspect(t, "081344446002", 2)
	if err := e.svc.UpdateStatus(ctx, e.tenantA.ID, reopened.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}

	t.Run("closing: has_ledger and agent_* fields in the JSON", func(t *testing.T) {
		d, err := e.svc.GetDetail(ctx, e.tenantA.ID, reopened.ID)
		if err != nil {
			t.Fatalf("GetDetail: %v", err)
		}
		if d.InfoKomisi == nil || d.InfoKomisi.Type != "final" || !d.InfoKomisi.HasLedger {
			t.Fatalf("info_komisi = %+v, want final with has_ledger", d.InfoKomisi)
		}
		if d.InfoKomisi.AgentHeldAmount+d.InfoKomisi.AgentReleasedAmount != 2000000 {
			t.Fatalf("agent held+released = %v, want 2000000", d.InfoKomisi.AgentHeldAmount+d.InfoKomisi.AgentReleasedAmount)
		}
		raw, _ := json.Marshal(d)
		for _, key := range []string{`"has_ledger":true`, `"agent_held_amount":`, `"agent_released_amount":`} {
			if !strings.Contains(string(raw), key) {
				t.Fatalf("detail JSON lacks %s: %s", key, raw)
			}
		}
	})

	if _, err := e.svc.CancelClosing(ctx, e.tenantA.ID, reopened.ID, 1, "Batal setelah DP"); err != nil {
		t.Fatalf("CancelClosing: %v", err)
	}
	if err := e.svc.UpdateStatus(ctx, e.tenantA.ID, reopened.ID, 1, "dihubungi", nil, nil); err != nil {
		t.Fatalf("reopen: %v", err)
	}

	t.Run("reopened after batal setelah DP: potensi with has_ledger", func(t *testing.T) {
		d, err := e.svc.GetDetail(ctx, e.tenantA.ID, reopened.ID)
		if err != nil {
			t.Fatalf("GetDetail: %v", err)
		}
		if d.InfoKomisi == nil || d.InfoKomisi.Type != "potensi" || !d.InfoKomisi.HasLedger {
			t.Fatalf("info_komisi = %+v, want potensi with has_ledger=true", d.InfoKomisi)
		}
		// Delete is still refused for it, which is why the dashboard needs the flag.
		if err := e.svc.Delete(ctx, e.tenantA.ID, reopened.ID); err == nil {
			t.Fatalf("Delete of a prospect with ledger rows succeeded")
		}
	})

	t.Run("no ledger rows: has_ledger false", func(t *testing.T) {
		d, err := e.svc.GetDetail(ctx, e.tenantA.ID, fresh.ID)
		if err != nil {
			t.Fatalf("GetDetail: %v", err)
		}
		if d.InfoKomisi == nil || d.InfoKomisi.HasLedger {
			t.Fatalf("info_komisi = %+v, want has_ledger=false", d.InfoKomisi)
		}
		raw, _ := json.Marshal(d)
		if !strings.Contains(string(raw), `"has_ledger":false`) {
			t.Fatalf("detail JSON lacks has_ledger:false: %s", raw)
		}
	})

	t.Run("cross-tenant: tenant B cannot read the detail", func(t *testing.T) {
		if _, err := e.svc.GetDetail(ctx, e.tenantB.ID, reopened.ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("tenant B GetDetail: want ErrNotFound, got %v", err)
		}
	})
}

// L3: ResetToPendingWithProof reopens only a REJECTED registration. An agent approved meanwhile is not
// pushed back to pending (ErrStatusConflict); another tenant gets ErrNotFound.
func TestBH4_AgentResetToPendingRequiresRejected(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	tenantA := createDummyTenant(t, ctx, tenantRepo, "bh4-rst-a")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "bh4-rst-b")

	ts := time.Now().UnixNano()
	mk := func(t *testing.T, status string, i int) *repository.Agent {
		t.Helper()
		phone := fmt.Sprintf("0815%08d", (ts+int64(i))%100000000)
		a := &repository.Agent{Name: "Agen Reset", Phone: &phone, Status: status, ReferralCode: fmt.Sprintf("BH4X-%d-%d", ts, i)}
		if err := agentRepo.Create(ctx, tenantA.ID, a); err != nil {
			t.Fatalf("create agent: %v", err)
		}
		return a
	}
	statusOf := func(t *testing.T, id uint64) string {
		t.Helper()
		a, err := agentRepo.GetByID(ctx, tenantA.ID, id)
		if err != nil {
			t.Fatalf("GetByID: %v", err)
		}
		return a.Status
	}

	rejected := mk(t, "rejected", 1)
	approved := mk(t, "active", 2)

	if err := agentRepo.ResetToPendingWithProof(ctx, tenantB.ID, rejected.ID, "proof-b.jpg"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("tenant B reset: want ErrNotFound, got %v", err)
	}
	if s := statusOf(t, rejected.ID); s != "rejected" {
		t.Fatalf("tenant B call changed status to %s", s)
	}
	if err := agentRepo.ResetToPendingWithProof(ctx, tenantA.ID, approved.ID, "proof.jpg"); !errors.Is(err, repository.ErrStatusConflict) {
		t.Fatalf("reset of an approved agent: want ErrStatusConflict, got %v", err)
	}
	if s := statusOf(t, approved.ID); s != "active" {
		t.Fatalf("approved agent pushed back to %s", s)
	}
	if err := agentRepo.ResetToPendingWithProof(ctx, tenantA.ID, rejected.ID, "proof.jpg"); err != nil {
		t.Fatalf("reset of a rejected agent: %v", err)
	}
	if s := statusOf(t, rejected.ID); s != "pending" {
		t.Fatalf("rejected agent status after reset = %s, want pending", s)
	}
	if err := agentRepo.ResetToPendingWithProof(ctx, tenantA.ID, 0, "proof.jpg"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("unknown id: want ErrNotFound, got %v", err)
	}
}
