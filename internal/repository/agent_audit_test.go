package repository_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regression tests for the agent audit (30 Sep 2026, A1-A9), run against real MySQL.

func newAgentAuditService(e *prospectAuditEnv) service.AgentService {
	return service.NewAgentService(
		repository.NewAgentRepository(e.db),
		repository.NewAgentSessionRepository(e.db),
		repository.NewTenantRepository(e.db),
		e.ledgerRepo,
		e.prospectRepo,
		repository.NewCommissionPayoutRequestRepository(e.db),
		nil, nil, nil,
	)
}

// A1: simultaneous payout requests used to both pass the checks and reserve the balance twice.
func TestAgentAudit_ConcurrentPayoutReservesBalanceOnce(t *testing.T) {
	e := setupProspectAudit(t)
	agentSvc := newAgentAuditService(e)

	p := e.newAgentProspect(t, "081322220001", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("paid off: %v", err)
	}
	info, err := agentSvc.GetPayoutInfo(e.ctx, e.tenantA.ID, e.agentA.ID)
	if err != nil {
		t.Fatalf("payout info: %v", err)
	}
	if info.SaldoTersedia != 2000000 {
		t.Fatalf("expected released balance 2000000, got %.0f", info.SaldoTersedia)
	}

	const n = 10
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = agentSvc.CreatePayoutRequest(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreatePayoutRequestInput{
				AmountRequested: info.SaldoTersedia, BankName: "BCA", BankAccountNumber: "1234567890", BankAccountHolder: "Agen Audit",
			})
		}(i)
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		if err == nil {
			ok++
		}
	}
	var rows int
	var reserved float64
	if err := e.db.QueryRow("SELECT COUNT(*), COALESCE(SUM(amount_requested), 0) FROM commission_payout_requests WHERE tenant_id = ? AND agent_id = ?", e.tenantA.ID, e.agentA.ID).Scan(&rows, &reserved); err != nil {
		t.Fatalf("count payouts: %v", err)
	}
	if ok != 1 || rows != 1 || reserved != 2000000 {
		t.Fatalf("expected exactly 1 request reserving 2000000, got %d ok, %d rows, %.0f reserved", ok, rows, reserved)
	}
	t.Logf("%d concurrent requests: 1 accepted, %d rejected, reserved %.0f", n, n-ok, reserved)
}

// A2, A4, A6, A8: sessions after password changes, approve/reject guards, leaderboard access, password rule.
func TestAgentAudit_SessionsStatusGuardsLeaderboard(t *testing.T) {
	e := setupProspectAudit(t)
	agentSvc := newAgentAuditService(e)
	agentRepo := repository.NewAgentRepository(e.db)
	sessionRepo := repository.NewAgentSessionRepository(e.db)

	email := "agen-audit-a2@example.test"
	if _, err := agentRepo.UpdateProfile(e.ctx, e.tenantA.ID, e.agentA.ID, repository.UpdateAgentProfileParams{Email: &email}); err != nil {
		t.Fatalf("set email: %v", err)
	}
	if err := agentSvc.ResetAgentPassword(e.ctx, e.tenantA.ID, e.agentA.ID, "rahasia-awal-1"); err != nil {
		t.Fatalf("set password: %v", err)
	}
	t.Cleanup(func() { _ = sessionRepo.DeleteByAgentID(e.ctx, e.agentA.ID) })

	login := func() string {
		res, err := agentSvc.Login(e.ctx, e.tenantA.ID, email, "rahasia-awal-1")
		if err != nil {
			t.Fatalf("login: %v", err)
		}
		return res.Token
	}
	alive := func(token string) bool {
		_, err := sessionRepo.FindByToken(e.ctx, token)
		return err == nil
	}

	t.Run("A2 own password change keeps the current session and signs out the others", func(t *testing.T) {
		current, other := login(), login()
		err := agentSvc.UpdatePassword(e.ctx, e.tenantA.ID, e.agentA.ID, &service.UpdatePasswordRequest{
			CurrentPassword: "rahasia-awal-1", NewPassword: "rahasia-awal-1", KeepToken: current,
		})
		if err != nil {
			t.Fatalf("update password: %v", err)
		}
		if !alive(current) || alive(other) {
			t.Fatalf("expected current session kept and other removed, got current=%v other=%v", alive(current), alive(other))
		}
	})

	t.Run("A2 admin reset signs the agent out everywhere", func(t *testing.T) {
		tok := login()
		if err := agentSvc.ResetAgentPassword(e.ctx, e.tenantA.ID, e.agentA.ID, "rahasia-awal-1"); err != nil {
			t.Fatalf("reset: %v", err)
		}
		if alive(tok) {
			t.Fatal("session still valid after admin reset")
		}
	})

	t.Run("A4 an active agent cannot be rejected or re-approved", func(t *testing.T) {
		if err := agentSvc.RejectAgent(e.ctx, e.tenantA.ID, e.agentA.ID, "uji"); !errors.Is(err, service.ErrAgentRejectState) {
			t.Fatalf("reject active: expected ErrAgentRejectState, got %v", err)
		}
		if err := agentSvc.ApproveAgent(e.ctx, e.tenantA.ID, e.agentA.ID); !errors.Is(err, service.ErrAgentApproveState) {
			t.Fatalf("approve active: expected ErrAgentApproveState, got %v", err)
		}
		a, _ := agentRepo.GetByID(e.ctx, e.tenantA.ID, e.agentA.ID)
		if a.Status != "active" {
			t.Fatalf("status changed to %s", a.Status)
		}
	})

	t.Run("A4 a pending registration can be rejected, then approved", func(t *testing.T) {
		if err := agentRepo.UpdateStatus(e.ctx, e.tenantA.ID, e.agentA.ID, "pending"); err != nil {
			t.Fatalf("set pending: %v", err)
		}
		if err := agentSvc.RejectAgent(e.ctx, e.tenantA.ID, e.agentA.ID, "uji"); err != nil {
			t.Fatalf("reject pending: %v", err)
		}
		if err := agentSvc.ApproveAgent(e.ctx, e.tenantA.ID, e.agentA.ID); err != nil {
			t.Fatalf("approve rejected: %v", err)
		}
	})

	t.Run("A6 leaderboard is for active agents only", func(t *testing.T) {
		if _, err := agentSvc.GetLeaderboard(e.ctx, e.tenantA.ID, e.agentA.ID); err != nil {
			t.Fatalf("active agent leaderboard: %v", err)
		}
		if err := agentRepo.UpdateStatus(e.ctx, e.tenantA.ID, e.agentA.ID, "pending"); err != nil {
			t.Fatalf("set pending: %v", err)
		}
		if _, err := agentSvc.GetLeaderboard(e.ctx, e.tenantA.ID, e.agentA.ID); !errors.Is(err, service.ErrAgentNotActive) {
			t.Fatalf("pending agent leaderboard: expected ErrAgentNotActive, got %v", err)
		}
		// Tenant isolation: an agent id from tenant A is unknown in tenant B.
		if _, err := agentSvc.GetLeaderboard(e.ctx, e.tenantB.ID, e.agentA.ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("cross-tenant leaderboard: expected ErrNotFound, got %v", err)
		}
		_ = agentRepo.UpdateStatus(e.ctx, e.tenantA.ID, e.agentA.ID, "active")
	})

	t.Run("A8 sign-up requires 8 characters, like change and reset", func(t *testing.T) {
		_, err := agentSvc.Register(e.ctx, e.tenantB.ID, &service.RegisterAgentRequest{
			Name: "Agen Pendek", Phone: "081322229999", Email: "agen-pendek@example.test", Domisili: "Bandung", Password: "123456",
		})
		if !errors.Is(err, service.ErrAgentPasswordTooShort) {
			t.Fatalf("expected ErrAgentPasswordTooShort, got %v", err)
		}
	})

	t.Run("A7 sign-up is closed while the travel is pending", func(t *testing.T) {
		if _, err := e.db.Exec("UPDATE tenants SET status = 'pending' WHERE id = ?", e.tenantB.ID); err != nil {
			t.Fatalf("set tenant pending: %v", err)
		}
		_, err := agentSvc.Register(e.ctx, e.tenantB.ID, &service.RegisterAgentRequest{
			Name: "Agen Tutup", Phone: "081322229998", Email: "agen-tutup@example.test", Domisili: "Bandung", Password: "rahasia-panjang",
		})
		if !errors.Is(err, service.ErrAgentRegistrationClosed) {
			t.Fatalf("expected ErrAgentRegistrationClosed, got %v", err)
		}
	})
}

// A9: an agent's manual jamaah may only be linked to a package on sale, like the public form.
func TestAgentAudit_ManualJamaahPackageMustBeOnSale(t *testing.T) {
	e := setupProspectAudit(t)
	past := time.Now().AddDate(0, 0, -5)
	price := 25000000.0
	draft := &repository.Package{Name: "Paket Draf", Status: "draft", Price: &price}
	departed := &repository.Package{Name: "Paket Lewat", Status: "published", Price: &price, DepartureDate: &past}
	for _, p := range []*repository.Package{draft, departed} {
		if err := e.pkgRepo.Create(e.ctx, e.tenantA.ID, p); err != nil {
			t.Fatalf("create package: %v", err)
		}
	}
	cases := []struct {
		name  string
		pkgID uint64
		want  error
	}{
		{"draft package", draft.ID, service.ErrPackageNotFound},
		{"departed package", departed.ID, service.ErrPackageNotFound},
		{"published package", e.pkgA.ID, nil},
	}
	for i, tc := range cases {
		id := tc.pkgID
		_, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{
			Consent: true, Name: "Jamaah Paket", Phone: []string{"081322230001", "081322230002", "081322230003"}[i], PackageID: &id,
		})
		if !errors.Is(err, tc.want) {
			t.Fatalf("%s: expected %v, got %v", tc.name, tc.want, err)
		}
	}
}

// Founder decision (30 Sep 2026): an upline earns override only while active. Closings made while the
// upline is inactive book no override; override booked before the deactivation stays.
func TestAgentAudit_NoOverrideForInactiveUpline(t *testing.T) {
	e := setupProspectAudit(t)
	agentRepo := repository.NewAgentRepository(e.db)

	uplinePhone := "081322240000"
	upline := &repository.Agent{Name: "Upline Audit", Phone: &uplinePhone, Status: "active", ReferralCode: "UPL-" + time.Now().Format("150405.000000")}
	if err := agentRepo.Create(e.ctx, e.tenantA.ID, upline); err != nil {
		t.Fatalf("create upline: %v", err)
	}
	if _, err := e.db.Exec("UPDATE agents SET parent_agent_id = ? WHERE id = ? AND tenant_id = ?", upline.ID, e.agentA.ID, e.tenantA.ID); err != nil {
		t.Fatalf("link upline: %v", err)
	}
	if _, err := e.db.Exec("UPDATE tenants SET commission_override_enabled = 1, commission_override_percentage = 10 WHERE id = ?", e.tenantA.ID); err != nil {
		t.Fatalf("enable override: %v", err)
	}

	overrideSum := func(prospectID uint64) float64 {
		var sum float64
		if err := e.db.QueryRow("SELECT COALESCE(SUM(amount), 0) FROM commission_ledger WHERE tenant_id = ? AND prospect_id = ? AND agent_id = ?", e.tenantA.ID, prospectID, upline.ID).Scan(&sum); err != nil {
			t.Fatalf("sum override: %v", err)
		}
		return sum
	}
	closeProspect := func(phone string) *repository.Prospect {
		p := e.newAgentProspect(t, phone, 2)
		if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
			t.Fatalf("closing: %v", err)
		}
		return p
	}

	// Active upline: 10% of 2 x 1,000,000.
	before := closeProspect("081322240001")
	if got := overrideSum(before.ID); got != 200000 {
		t.Fatalf("active upline: expected override 200000, got %.0f", got)
	}

	if err := agentRepo.UpdateStatus(e.ctx, e.tenantA.ID, upline.ID, "inactive"); err != nil {
		t.Fatalf("deactivate upline: %v", err)
	}
	// Potential shown on an open prospect follows the same rule.
	open := e.newAgentProspect(t, "081322240002", 2)
	detail, err := e.svc.GetDetail(e.ctx, e.tenantA.ID, open.ID)
	if err != nil {
		t.Fatalf("detail: %v", err)
	}
	if detail.InfoKomisi == nil || detail.InfoKomisi.OverrideAmount != 0 {
		t.Fatalf("inactive upline: expected no override potential, got %+v", detail.InfoKomisi)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, open.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if got := overrideSum(open.ID); got != 0 {
		t.Fatalf("inactive upline: expected no override, got %.0f", got)
	}
	if got := overrideSum(before.ID); got != 200000 {
		t.Fatalf("override booked before deactivation must stay, got %.0f", got)
	}
	// Downline's own commission is unaffected.
	if n, total := ledgerSum(t, e, open.ID); n == 0 || total != 2000000 {
		t.Fatalf("direct commission: expected 2000000, got %.0f in %d entries", total, n)
	}
}
