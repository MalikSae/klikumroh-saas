package repository_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt round 4 (LOW), run against real MySQL. Every test tenant is purged when the test ends
// (createDummyTenant); other rows are removed by their own cleanup.

// L2: under the "dp" policy a reduction on a prospect whose commission is still held (closed under
// "lunas", not marked lunas) stays held with the rows it reduces; the withdrawable balance never drops.
func TestBH4_ReductionAfterLunasToDPStaysHeld(t *testing.T) {
	e := setupOverrideCorrection(t, "bh4-l2")
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := e.ctx
	e.svc.SetCommissionPolicyRepo(repository.NewCommissionPolicyRepository(db))

	if err := e.svc.SetCommissionReleaseOn(ctx, e.tenant.ID, repository.CommissionReleaseOnLunas); err != nil {
		t.Fatal(err)
	}
	e.setJamaah(t, e.prospect, 2)
	if err := e.svc.UpdateStatus(ctx, e.tenant.ID, e.prospect.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.SetCommissionReleaseOn(ctx, e.tenant.ID, repository.CommissionReleaseOnDP); err != nil {
		t.Fatal(err)
	}
	e.setJamaah(t, e.prospect, 1)

	sum := func(agentID uint64, released bool) float64 {
		t.Helper()
		var v float64
		var err error
		if released {
			v, err = e.ledgerRepo.SumReleasedByAgent(ctx, e.tenant.ID, agentID)
		} else {
			v, err = e.ledgerRepo.SumHeldByAgent(ctx, e.tenant.ID, agentID)
		}
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	if got := sum(e.downline.ID, true); !approxEq(got, 0) {
		t.Fatalf("downline withdrawable = %.2f, want 0 (the reduction must not come out of withdrawable money)", got)
	}
	if got := sum(e.downline.ID, false); !approxEq(got, 1000000) {
		t.Fatalf("downline held = %.2f, want 1000000", got)
	}
	if got := sum(e.upline.ID, true); !approxEq(got, 0) {
		t.Fatalf("upline withdrawable = %.2f, want 0", got)
	}
	if got := sum(e.upline.ID, false); !approxEq(got, 100000) {
		t.Fatalf("upline held = %.2f, want 100000", got)
	}

	// An increase under "dp" is still released at once; marking lunas then releases everything.
	e.setJamaah(t, e.prospect, 3)
	if got := sum(e.downline.ID, true); !approxEq(got, 2000000) {
		t.Fatalf("downline withdrawable after increase = %.2f, want 2000000", got)
	}
	if err := e.svc.MarkPaidOff(ctx, e.tenant.ID, e.prospect.ID, e.adminID); err != nil {
		t.Fatalf("lunas: %v", err)
	}
	if got := sum(e.downline.ID, true); !approxEq(got, 3000000) {
		t.Fatalf("downline withdrawable after lunas = %.2f, want 3000000", got)
	}
	if got := sum(e.downline.ID, false); !approxEq(got, 0) {
		t.Fatalf("downline held after lunas = %.2f, want 0", got)
	}
}

// L4: cancelling the closing of an anonymized prospect reverses the commission but stores no free text.
func TestBH4_CancelClosingAnonymizedStoresNoText(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399994400", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	// Tenant B cannot cancel tenant A's closing.
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantB.ID, p.ID, 1, "Ibu Siti batal"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B cancel must be not found, got %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, p.ID, 1, "Ibu Siti batal karena sakit"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.Status != "tidak_lanjut" || got.LostReason != nil || got.LostReasonCategory == nil || *got.LostReasonCategory != "batal_setelah_dp" {
		t.Fatalf("status/lost reason = %s %v %v", got.Status, got.LostReason, got.LostReasonCategory)
	}
	if _, total := ledgerSum(t, e, p.ID); !approxEq(total, 0) {
		t.Fatalf("commission must be reversed, net %.2f", total)
	}
	var n int
	for _, q := range []string{
		`SELECT COUNT(*) FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ? AND notes LIKE '%Siti%'`,
		`SELECT COUNT(*) FROM prospect_notes WHERE tenant_id = ? AND prospect_id = ? AND note_text LIKE '%Siti%'`,
	} {
		if err := e.db.QueryRow(q, e.tenantA.ID, p.ID).Scan(&n); err != nil || n != 0 {
			t.Fatalf("free text stored again (%s): n=%d err=%v", q, n, err)
		}
	}
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND (title LIKE '%Siti%' OR body LIKE '%Siti%')`, e.tenantA.ID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("free text in notifications: n=%d err=%v", n, err)
	}
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ? AND notes = ?`,
		e.tenantA.ID, p.ID, repository.AnonymizedCancelNote).Scan(&n); err != nil || n == 0 {
		t.Fatalf("reversal rows must carry the fixed cancel note: n=%d err=%v", n, err)
	}
}

// L5: anonymizing "Siti" rewrites only this jamaah's mention in the commission notifications of its
// agent; "Siti Aminah" and texts like "Alhamdulillah" are left alone, as are other agents' notifications.
func TestBH4_AnonymizeScrubsOnlyThisJamaah(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399995500", 1)
	if _, err := e.db.Exec(`UPDATE prospects SET name = 'Siti' WHERE id = ? AND tenant_id = ?`, p.ID, e.tenantA.ID); err != nil {
		t.Fatalf("rename: %v", err)
	}
	insert := func(tenantID, recipient uint64, title, body string) int64 {
		t.Helper()
		res, err := e.db.Exec(`INSERT INTO notifications (tenant_id, recipient_type, recipient_id, type, title, body, link_url)
			VALUES (?, 'agent', ?, 'commission_earned', ?, ?, '/agen/riwayat-komisi')`, tenantID, recipient, title, body)
		if err != nil {
			t.Fatalf("insert: %v", err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	own := insert(e.tenantA.ID, e.agentA.ID, "Komisi baru tercatat", "Komisi Rp 1.000.000 dari closing jamaah Siti sudah bisa dicairkan.")
	released := insert(e.tenantA.ID, e.agentA.ID, "Komisi siap dicairkan", "Jamaah Siti sudah lunas. Komisi Anda sekarang bisa dicairkan.")
	otherJamaah := insert(e.tenantA.ID, e.agentA.ID, "Alhamdulillah! Siti", "Komisi Rp 1.000.000 dari closing jamaah Siti Aminah sudah bisa dicairkan.")
	otherAgent := insert(e.tenantA.ID, e.agentA.ID+1000000, "Komisi baru tercatat", "Komisi Rp 1.000.000 dari closing jamaah Siti sudah bisa dicairkan.")
	otherTenant := insert(e.tenantB.ID, e.agentA.ID, "Komisi baru tercatat", "Komisi Rp 1.000.000 dari closing jamaah Siti sudah bisa dicairkan.")

	if err := e.svc.Anonymize(e.ctx, e.tenantB.ID, p.ID, 1); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B anonymize must be not found, got %v", err)
	}
	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	read := func(id int64) (string, string) {
		var title, body string
		if err := e.db.QueryRow(`SELECT title, body FROM notifications WHERE id = ?`, id).Scan(&title, &body); err != nil {
			t.Fatalf("read %d: %v", id, err)
		}
		return title, body
	}
	if _, b := read(own); b != "Komisi Rp 1.000.000 dari closing jamaah (data dihapus) sudah bisa dicairkan." {
		t.Fatalf("own notification = %q", b)
	}
	if _, b := read(released); b != "Jamaah (data dihapus) sudah lunas. Komisi Anda sekarang bisa dicairkan." {
		t.Fatalf("released notification = %q", b)
	}
	if ti, b := read(otherJamaah); ti != "Alhamdulillah! Siti" || !strings.Contains(b, "jamaah Siti Aminah sudah") {
		t.Fatalf("another jamaah's notification must not change: %q / %q", ti, b)
	}
	if _, b := read(otherAgent); !strings.Contains(b, "jamaah Siti sudah") {
		t.Fatalf("another agent's notification must not change: %q", b)
	}
	if _, b := read(otherTenant); !strings.Contains(b, "jamaah Siti sudah") {
		t.Fatalf("CRITICAL: tenant B notification must not change: %q", b)
	}
}

// L6: an open prospect leaves the pipeline when it is anonymized ('tidak_lanjut', system category
// data_dihapus, history row); one anonymized before this rule can still be moved to 'tidak_lanjut'.
func TestBH4_AnonymizedOpenProspectLeavesPipeline(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399996600", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "dihubungi", nil, nil); err != nil {
		t.Fatalf("dihubungi: %v", err)
	}
	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 7); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.Status != "tidak_lanjut" || got.LostReasonCategory == nil || *got.LostReasonCategory != repository.LostCategoryDataDeleted || got.LostReason != nil {
		t.Fatalf("anonymized open prospect = %s %v %v", got.Status, got.LostReasonCategory, got.LostReason)
	}
	var n int
	if err := e.db.QueryRow(`SELECT COUNT(*) FROM prospect_status_history WHERE tenant_id = ? AND prospect_id = ?
		AND changed_by_type = 'admin' AND changed_by_id = 7 AND old_status = 'dihubungi' AND new_status = 'tidak_lanjut'`,
		e.tenantA.ID, p.ID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("history row: n=%d err=%v", n, err)
	}

	// Closing prospects keep their status (commission trail), as before.
	c := e.newAgentProspect(t, "081399996601", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, c.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, c.ID, 1); err != nil {
		t.Fatalf("anonymize closing: %v", err)
	}
	if got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, c.ID); got.Status != "closing" {
		t.Fatalf("closing must stay closing, got %s", got.Status)
	}

	// Legacy: anonymized while open (before this rule). Simulated by setting anonymized_at directly.
	legacy := e.newAgentProspect(t, "081399996602", 1)
	if _, err := e.db.Exec(`UPDATE prospects SET anonymized_at = NOW(), name = ? WHERE id = ? AND tenant_id = ?`,
		repository.AnonymizedName, legacy.ID, e.tenantA.ID); err != nil {
		t.Fatalf("legacy setup: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, legacy.ID, 1, "dihubungi", nil, nil); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("moving within the pipeline must stay refused, got %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantB.ID, legacy.ID, 1, "tidak_lanjut", nil, nil); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B must not move tenant A's prospect, got %v", err)
	}
	harga := "harga"
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, legacy.ID, 1, "tidak_lanjut", nil, &harga); err != nil {
		t.Fatalf("legacy to tidak_lanjut: %v", err)
	}
	got, _ = e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, legacy.ID)
	if got.Status != "tidak_lanjut" || got.LostReasonCategory == nil || *got.LostReasonCategory != repository.LostCategoryDataDeleted {
		t.Fatalf("legacy = %s %v (the system category is forced)", got.Status, got.LostReasonCategory)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, legacy.ID, 1, "baru", nil, nil); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("reopen must be refused, got %v", err)
	}
	// Nobody can pick the system category for a normal prospect.
	normal := e.newAgentProspect(t, "081399996603", 1)
	dd := repository.LostCategoryDataDeleted
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, normal.ID, 1, "tidak_lanjut", nil, &dd); !errors.Is(err, service.ErrLostReasonCategoryInvalid) {
		t.Fatalf("data_dihapus must not be selectable, got %v", err)
	}
}

// L7 + L8 (agents): registration validation, duplicate race as 409, payout bank field lengths.
func TestBH4_AgentRegisterAndPayoutValidation(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	tenant := createDummyTenant(t, ctx, tenantRepo, "bh4-reg")
	other := createDummyTenant(t, ctx, tenantRepo, "bh4-reg-b")
	for _, id := range []uint64{tenant.ID, other.ID} {
		if _, err := db.Exec(`UPDATE tenants SET status = 'active', subscription_expires_at = NULL WHERE id = ?`, id); err != nil {
			t.Fatalf("activate tenant: %v", err)
		}
	}
	svc := service.NewAgentService(agentRepo, repository.NewAgentSessionRepository(db), tenantRepo,
		repository.NewCommissionLedgerRepository(db), repository.NewProspectRepository(db),
		repository.NewCommissionPayoutRequestRepository(db), nil, nil, nil)

	ts := time.Now().UnixNano()
	phone := func(i int) string { return fmt.Sprintf("0812%08d", (ts+int64(i))%100000000) }
	base := func(i int) *service.RegisterAgentRequest {
		return &service.RegisterAgentRequest{Name: "Agen BH4", Phone: phone(i), Email: fmt.Sprintf("bh4-reg-%d-%d@klikumroh.test", ts, i),
			Domisili: "Bandung", Password: "rahasia-test-123", TermsAccepted: true}
	}

	cases := []struct {
		name string
		mod  func(r *service.RegisterAgentRequest)
		want error
	}{
		{"name too long", func(r *service.RegisterAgentRequest) { r.Name = strings.Repeat("a", 256) }, service.ErrAgentNameTooLong},
		{"domicile too long", func(r *service.RegisterAgentRequest) { r.Domisili = strings.Repeat("b", 151) }, service.ErrAgentDomisiliTooLong},
		{"bad email", func(r *service.RegisterAgentRequest) { r.Email = "bukan email" }, service.ErrInvalidAgentEmail},
		{"two addresses", func(r *service.RegisterAgentRequest) { r.Email = "a@x.test, b@x.test" }, service.ErrInvalidAgentEmail},
		{"padded short password", func(r *service.RegisterAgentRequest) { r.Password = "   abc    " }, service.ErrAgentPasswordTooShort},
		{"password over 72 bytes", func(r *service.RegisterAgentRequest) { r.Password = strings.Repeat("p", 73) }, service.ErrPasswordTooLong},
	}
	for i, c := range cases {
		req := base(100 + i)
		c.mod(req)
		if _, err := svc.Register(ctx, tenant.ID, req); !errors.Is(err, c.want) {
			t.Fatalf("%s: want %v, got %v", c.name, c.want, err)
		}
	}

	// Double submit: concurrent inserts with the same email give exactly one agent; the others get the
	// duplicate error (409), never a raw 1062 (500).
	const n = 6
	var wg sync.WaitGroup
	errs := make([]error, n)
	email := fmt.Sprintf("bh4-race-%d@klikumroh.test", ts)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			hash := "[REDACTED-test-hash]"
			ph := phone(200 + i)
			em := email
			errs[i] = agentRepo.Create(ctx, tenant.ID, &repository.Agent{Name: "Race", Email: &em, Phone: &ph, PasswordHash: &hash,
				Status: "pending", ReferralCode: fmt.Sprintf("BH4R%d%d", ts%1000000, i)})
		}(i)
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, repository.ErrDuplicateAgentEmail):
		default:
			t.Fatalf("race: unexpected error %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("race: %d agents created, want 1", ok)
	}
	// The same email in another tenant is a different agent (per-tenant uniqueness).
	em, ph, hash := email, phone(300), "[REDACTED-test-hash]"
	if err := agentRepo.Create(ctx, other.ID, &repository.Agent{Name: "Other", Email: &em, Phone: &ph, PasswordHash: &hash,
		Status: "pending", ReferralCode: fmt.Sprintf("BH4O%d", ts%1000000)}); err != nil {
		t.Fatalf("other tenant same email: %v", err)
	}

	// Payout bank fields over their column length: 400 (ErrPayoutInvalid) with a readable message.
	ph2 := phone(400)
	active := &repository.Agent{Name: "Payout", Phone: &ph2, Status: "active", ReferralCode: fmt.Sprintf("BH4P%d", ts%1000000)}
	if err := agentRepo.Create(ctx, tenant.ID, active); err != nil {
		t.Fatalf("create agent: %v", err)
	}
	for _, in := range []service.AgentCreatePayoutRequestInput{
		{AmountRequested: 100000, BankName: strings.Repeat("B", 101), BankAccountNumber: "123", BankAccountHolder: "Ali"},
		{AmountRequested: 100000, BankName: "BCA", BankAccountNumber: strings.Repeat("1", 51), BankAccountHolder: "Ali"},
		{AmountRequested: 100000, BankName: "BCA", BankAccountNumber: "123", BankAccountHolder: strings.Repeat("A", 151)},
	} {
		_, err := svc.CreatePayoutRequest(ctx, tenant.ID, active.ID, in)
		if !errors.Is(err, service.ErrPayoutInvalid) || !strings.Contains(err.Error(), "maksimal") {
			t.Fatalf("long bank field: want ErrPayoutInvalid, got %v", err)
		}
	}
	// Tenant B cannot create a payout for tenant A's agent.
	if _, err := svc.CreatePayoutRequest(ctx, other.ID, active.ID, service.AgentCreatePayoutRequestInput{
		AmountRequested: 100000, BankName: "BCA", BankAccountNumber: "123", BankAccountHolder: "Ali"}); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: cross-tenant payout must be not found, got %v", err)
	}
}

// Payouts: the list join is tenant-scoped, rejected payouts do not count against the balance in the
// history, and the overview "Perlu tindakan" counts pending + approved.
func TestBH4_PayoutHistoryAndOverview(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	agentRepo := repository.NewAgentRepository(db)
	payoutRepo := repository.NewCommissionPayoutRequestRepository(db)
	tenant := createDummyTenant(t, ctx, tenantRepo, "bh4-pay")
	other := createDummyTenant(t, ctx, tenantRepo, "bh4-pay-b")
	ts := time.Now().UnixNano()
	ph := fmt.Sprintf("0813%08d", ts%100000000)
	agent := &repository.Agent{Name: "Agen Pay", Phone: &ph, Status: "active", ReferralCode: fmt.Sprintf("BH4Q%d", ts%1000000)}
	if err := agentRepo.Create(ctx, tenant.ID, agent); err != nil {
		t.Fatalf("create agent: %v", err)
	}
	for _, st := range []string{"pending", "approved", "rejected", "paid"} {
		if _, err := db.Exec(`INSERT INTO commission_payout_requests (tenant_id, agent_id, amount_requested, status,
			bank_name_snapshot, bank_account_number_snapshot, bank_account_holder_snapshot) VALUES (?, ?, 100000, ?, 'BCA', '123', 'Ali')`,
			tenant.ID, agent.ID, st); err != nil {
			t.Fatalf("insert payout: %v", err)
		}
	}

	list, err := payoutRepo.List(ctx, tenant.ID, nil)
	if err != nil || len(list) != 4 {
		t.Fatalf("list tenant A: %d %v", len(list), err)
	}
	if list, err := payoutRepo.List(ctx, other.ID, nil); err != nil || len(list) != 0 {
		t.Fatalf("CRITICAL: tenant B must see no payouts of tenant A, got %d %v", len(list), err)
	}

	svc := service.NewAgentService(agentRepo, repository.NewAgentSessionRepository(db), tenantRepo,
		repository.NewCommissionLedgerRepository(db), repository.NewProspectRepository(db), payoutRepo, nil, nil, nil)
	hist, err := svc.GetCommissionHistory(ctx, tenant.ID, agent.ID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	seen := 0
	for _, it := range hist {
		if it.Source != "payout" {
			continue
		}
		seen++
		if it.Status == "rejected" {
			if it.CountsAgainstBalance == nil || *it.CountsAgainstBalance {
				t.Fatalf("rejected payout must carry counts_against_balance=false")
			}
		} else if it.CountsAgainstBalance != nil {
			t.Fatalf("%s payout must omit counts_against_balance", it.Status)
		}
	}
	if seen != 4 {
		t.Fatalf("history payouts = %d, want 4", seen)
	}

	overview := repository.NewDashboardOverviewRepository(db)
	data, err := overview.GetOverview(ctx, tenant.ID)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if data.Alerts.PendingPayoutsCount != 2 || data.Alerts.ApprovedPayoutsCount != 1 || !approxEq(data.Alerts.PendingPayoutsTotal, 200000) {
		t.Fatalf("overview alerts = %+v, want 2 needing action (1 approved), total 200000", data.Alerts)
	}
	if data, err := overview.GetOverview(ctx, other.ID); err != nil || data.Alerts.PendingPayoutsCount != 0 {
		t.Fatalf("CRITICAL: tenant B overview must not count tenant A payouts: %+v %v", data, err)
	}
}

// Billing/security L5 + L10: staff logout revokes the impersonation sessions it opened; concurrent
// deactivations always leave one active admin.
func TestBH4_StaffLogoutAndTeamDeactivation(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	sessionRepo := repository.NewSessionRepository(db)
	staffRepo := repository.NewStaffRepository(db)
	tenant := createDummyTenant(t, ctx, tenantRepo, "bh4-staff")
	other := createDummyTenant(t, ctx, tenantRepo, "bh4-staff-b")

	hash, err := bcrypt.GenerateFromPassword([]byte("rahasia-test-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	newAdmin := func(tenantID uint64, label string) *repository.AdminUser {
		t.Helper()
		u := &repository.AdminUser{Name: "Admin " + label, Status: "active", PasswordHash: string(hash),
			Email: fmt.Sprintf("bh4-%s-%d@klikumroh.test", label, time.Now().UnixNano())}
		if err := adminRepo.Create(ctx, tenantID, u); err != nil {
			t.Fatalf("create admin: %v", err)
		}
		return u
	}
	a1, a2 := newAdmin(tenant.ID, "a1"), newAdmin(tenant.ID, "a2")
	b1 := newAdmin(other.ID, "b1")

	staff := &repository.StaffUser{Name: "Staff BH4", Email: fmt.Sprintf("bh4-staff-%d@klikumroh.test", time.Now().UnixNano()),
		PasswordHash: "[REDACTED-bcrypt-not-needed]", Status: "active"}
	if err := staffRepo.Create(ctx, staff); err != nil {
		t.Fatalf("create staff: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM access_logs WHERE staff_id = ?", staff.ID)
		_, _ = db.Exec("DELETE FROM sessions WHERE impersonated_by_staff_id = ?", staff.ID)
		_, _ = db.Exec("DELETE FROM staff_sessions WHERE staff_user_id = ?", staff.ID)
		_, _ = db.Exec("DELETE FROM staff_users WHERE id = ?", staff.ID)
	})
	staffTok := fmt.Sprintf("bh4-staff-%d", time.Now().UnixNano())
	if err := staffRepo.CreateSession(ctx, &repository.StaffSession{StaffUserID: staff.ID, Token: staffTok, ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
		t.Fatalf("staff session: %v", err)
	}
	newSession := func(tenantID, adminID uint64, staffID *uint64) string {
		t.Helper()
		tok := fmt.Sprintf("bh4-sess-%d", time.Now().UnixNano())
		s := &repository.Session{Token: tok, AdminUserID: adminID, ExpiresAt: time.Now().Add(time.Hour)}
		if staffID != nil {
			reason := "Membantu cek data"
			s.ImpersonatedByStaffID, s.ImpersonationReason = staffID, &reason
		}
		if err := sessionRepo.Create(ctx, tenantID, s); err != nil {
			t.Fatalf("session: %v", err)
		}
		return tok
	}
	sid := staff.ID
	impA := newSession(tenant.ID, a1.ID, &sid)
	impB := newSession(other.ID, b1.ID, &sid)
	own := newSession(tenant.ID, a1.ID, nil)

	if err := staffRepo.DeleteSession(ctx, staffTok); err != nil {
		t.Fatalf("logout: %v", err)
	}
	if _, _, err := staffRepo.FindSessionByToken(ctx, staffTok); err == nil {
		t.Fatalf("staff session must be gone")
	}
	for _, tok := range []string{impA, impB} {
		if _, err := sessionRepo.FindByToken(ctx, tok); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("impersonation session must be revoked on staff logout, got %v", err)
		}
	}
	if _, err := sessionRepo.FindByToken(ctx, own); err != nil {
		t.Fatalf("the admin's own session must stay, got %v", err)
	}
	if err := staffRepo.DeleteSession(ctx, "unknown-token"); err != nil {
		t.Fatalf("unknown token logout: %v", err)
	}

	// Two admins deactivating each other at the same time: at least one stays active.
	teamSvc := service.NewTeamService(adminRepo, sessionRepo)
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, pair := range [][2]uint64{{a1.ID, a2.ID}, {a2.ID, a1.ID}} {
		wg.Add(1)
		go func(i int, actor, target uint64) {
			defer wg.Done()
			_, errs[i] = teamSvc.ToggleStatus(ctx, tenant.ID, actor, target, "deactivate")
		}(i, pair[0], pair[1])
	}
	wg.Wait()
	active, err := adminRepo.CountActiveByTenant(ctx, tenant.ID)
	if err != nil || active != 1 {
		t.Fatalf("active admins after concurrent deactivation = %d (%v), want 1; errors %v", active, err, errs)
	}
	failed := 0
	for _, e := range errs {
		if errors.Is(e, service.ErrCannotDeactivateLastActiveAdmin) {
			failed++
		} else if e != nil {
			t.Fatalf("unexpected error %v", e)
		}
	}
	if failed != 1 {
		t.Fatalf("exactly one deactivation must be refused, errors %v", errs)
	}
	// Tenant B cannot deactivate tenant A's admin.
	if _, err := teamSvc.ToggleStatus(ctx, other.ID, b1.ID, a1.ID, "deactivate"); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: cross-tenant deactivation must be not found, got %v", err)
	}
}

// Affiliator portal: a travel past its grace period is not reported as active.
func TestBH4_AffiliatorTravelStatusDerived(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	affRepo := repository.NewAffiliatorRepository(db)
	svc := service.NewAffiliatorService(affRepo, repository.NewCouponRepository(db), repository.NewPaymentVerificationRepository(db),
		repository.NewPlatformSettingsRepository(db))
	planRepo := repository.NewPricingPlanRepository(db)
	plan := &repository.PricingPlan{Name: fmt.Sprintf("Plan bh4 %d", time.Now().UnixNano()), PeriodMonths: 3, Price: 1500000}
	if err := planRepo.Create(ctx, plan); err != nil {
		t.Fatalf("plan: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec("DELETE FROM pricing_plans WHERE id = ?", plan.ID) })
	res, err := svc.Register(ctx, service.AffiliatorRegisterRequest{Name: "Affiliator BH4",
		Email: fmt.Sprintf("bh4-aff-%d@klikumroh.test", time.Now().UnixNano()), Password: "rahasia-test-123"})
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	affID := res.Affiliator.ID
	t.Cleanup(func() {
		_, _ = db.Exec("DELETE FROM affiliator_sessions WHERE affiliator_id = ?", affID)
		_, _ = db.Exec("DELETE FROM coupons WHERE affiliator_id = ?", affID)
		_, _ = db.Exec("DELETE FROM affiliators WHERE id = ?", affID)
	})
	tenantRepo := repository.NewTenantRepository(db)
	lapsed := createDummyTenant(t, ctx, tenantRepo, "bh4-aff-lapsed")
	live := createDummyTenant(t, ctx, tenantRepo, "bh4-aff-live")
	set := func(id uint64, expires time.Time) {
		if _, err := db.Exec(`UPDATE tenants SET status = 'active', current_plan_id = ?, subscription_expires_at = ?, affiliator_id = ?, affiliated_at = NOW() WHERE id = ?`,
			plan.ID, expires, affID, id); err != nil {
			t.Fatalf("set tenant: %v", err)
		}
	}
	set(lapsed.ID, time.Now().AddDate(0, -3, 0))
	set(live.ID, time.Now().AddDate(0, 2, 0))

	list, err := affRepo.ListTenants(ctx, affID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	got := map[uint64]string{}
	for _, tt := range list {
		got[tt.TenantID] = tt.Status
	}
	if got[lapsed.ID] != "suspended" || got[live.ID] != "active" || len(list) != 2 {
		t.Fatalf("statuses = %v, want lapsed suspended and live active", got)
	}
	ov, err := svc.Overview(ctx, affID)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if ov.ActiveTenants != 1 || ov.TenantCount != 2 {
		t.Fatalf("overview active=%d count=%d, want 1/2", ov.ActiveTenants, ov.TenantCount)
	}
}

// Targets: closing before the period ends needs force.
func TestBH4_CloseTargetBeforeEndNeedsForce(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	targetRepo := repository.NewAgentTargetRepository(db)
	tenant := createDummyTenant(t, ctx, tenantRepo, "bh4-target")
	other := createDummyTenant(t, ctx, tenantRepo, "bh4-target-b")
	svc := service.NewAgentTargetService(targetRepo, repository.NewAgentRepository(db))

	newTarget := func(start, end string) *repository.AgentTarget {
		t.Helper()
		tg := &repository.AgentTarget{Title: strPtr("Target BH4"), MetricType: "mitra_baru_count", MetricValue: 1,
			RewardDescription: strPtr("Bonus"), PeriodStart: start, PeriodEnd: end, Status: "active"}
		if err := targetRepo.Create(ctx, tenant.ID, tg); err != nil {
			t.Fatalf("create target: %v", err)
		}
		return tg
	}
	today := service.TodayWIB()
	running := newTarget("2026-01-01", today) // the last day is today: not ended yet
	if _, err := svc.CloseTargetPeriod(ctx, tenant.ID, running.ID, 1, false); !errors.Is(err, service.ErrTargetPeriodNotEnded) {
		t.Fatalf("closing a running target without force: want ErrTargetPeriodNotEnded, got %v", err)
	}
	if _, err := svc.CloseTargetPeriod(ctx, other.ID, running.ID, 1, true); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B close must be not found, got %v", err)
	}
	if _, err := svc.CloseTargetPeriod(ctx, tenant.ID, running.ID, 1, true); err != nil {
		t.Fatalf("forced early close: %v", err)
	}
	ended := newTarget("2026-01-01", "2026-01-31")
	if _, err := svc.CloseTargetPeriod(ctx, tenant.ID, ended.ID, 1, false); err != nil {
		t.Fatalf("closing an ended target needs no force: %v", err)
	}
}
