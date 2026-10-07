package repository_test

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

func proofPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 40, 30))
	for x := 0; x < 40; x++ {
		for y := 0; y < 30; y++ {
			img.Set(x, y, color.RGBA{uint8(x * 6), uint8(y * 8), 120, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Jamaah payment proofs from agents (7 Oct 2026): the agent sends a DP or pelunasan proof, the admin
// approves (Closing with commission / paid off with release) or rejects; the admin can still act directly.
// Nothing crosses tenants or agents.
func TestPaymentRequests_FlowAndIsolation(t *testing.T) {
	e := setupBH5(t, "ppr", 0)
	other := setupBH5(t, "ppr-other", 0)
	db := setupTestDB(t)
	t.Cleanup(func() { _ = os.RemoveAll("storage") }) // proof files written under ./storage/private
	repo := repository.NewPaymentRequestRepository(db)
	e.svc.SetPaymentRequestRepo(repo)
	other.svc.SetPaymentRequestRepo(repo)

	pkg := e.pkg(t, "Paket PPR", 1000000)
	newProspect := func(t *testing.T, phone, status string) *repository.Prospect {
		t.Helper()
		p := &repository.Prospect{TenantID: e.tenant.ID, AgentID: &e.downline.ID, Name: "Jamaah " + phone, Phone: phone, Status: status, SourceChannel: "agen", EntryMethod: "agent_manual"}
		if err := e.prospectRepo.Create(e.ctx, e.tenant.ID, p); err != nil {
			t.Fatal(err)
		}
		return p
	}
	two := 2
	details := service.StatusDetails{PackageID: &pkg.ID, JumlahJamaah: &two}
	closing := func(proof []byte) service.PaymentRequestInput {
		return service.PaymentRequestInput{Kind: "closing", ProofBytes: proof, Details: details}
	}

	p := newProspect(t, "081300001001", "dihubungi")
	var req *repository.PaymentRequest

	t.Run("agent sends a DP proof; a second one waits for the first", func(t *testing.T) {
		var err error
		req, err = e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, p.ID, closing(proofPNG(t)))
		if err != nil {
			t.Fatalf("submit: %v", err)
		}
		if req.Status != "pending" || req.ProofURL == "" {
			t.Fatalf("unexpected request %+v", req)
		}
		if _, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, p.ID, closing(proofPNG(t))); !errors.Is(err, service.ErrPaymentRequestPending) {
			t.Fatalf("expected ErrPaymentRequestPending, got %v", err)
		}
		if _, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, p.ID, service.PaymentRequestInput{Kind: "closing", Details: details}); !errors.Is(err, service.ErrPaymentProofRequired) {
			t.Fatalf("expected ErrPaymentProofRequired, got %v", err)
		}
	})

	t.Run("CRITICAL: another agent or another travel cannot send, see or decide it", func(t *testing.T) {
		if _, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.upline.ID, p.ID, closing(proofPNG(t))); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("another agent of the travel must get not found, got %v", err)
		}
		if _, err := other.svc.SubmitPaymentRequestByAgent(other.ctx, other.tenant.ID, other.downline.ID, p.ID, closing(proofPNG(t))); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("another travel's agent must get not found, got %v", err)
		}
		list, err := other.svc.ListPendingPaymentRequests(other.ctx, other.tenant.ID)
		if err != nil || len(list) != 0 {
			t.Fatalf("another travel must see no requests, got %d (%v)", len(list), err)
		}
		if err := other.svc.ApprovePaymentRequest(other.ctx, other.tenant.ID, other.adminID, req.ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("another travel must not approve, got %v", err)
		}
		if err := other.svc.RejectPaymentRequest(other.ctx, other.tenant.ID, other.adminID, req.ID, "bukan milik kami"); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("another travel must not reject, got %v", err)
		}
		mine, err := e.svc.ListPendingPaymentRequests(e.ctx, e.tenant.ID)
		if err != nil || len(mine) != 1 || mine[0].ProspectName == "" || mine[0].AgentName == "" {
			t.Fatalf("own travel must see its one request with names, got %+v (%v)", mine, err)
		}
	})

	t.Run("approve closes the prospect with commission", func(t *testing.T) {
		if err := e.svc.ApprovePaymentRequest(e.ctx, e.tenant.ID, e.adminID, req.ID); err != nil {
			t.Fatalf("approve: %v", err)
		}
		got, _ := e.prospectRepo.GetByID(e.ctx, e.tenant.ID, p.ID)
		if got.Status != "closing" || got.PackageID == nil || *got.PackageID != pkg.ID || got.JumlahJamaah == nil || *got.JumlahJamaah != 2 {
			t.Fatalf("expected closing with the package and 2 jamaah, got %+v", got)
		}
		r, _ := repo.GetByID(e.ctx, e.tenant.ID, req.ID)
		if r.Status != "approved" {
			t.Fatalf("request must be approved, got %s", r.Status)
		}
		ledgers, _ := e.ledgerRepo.ListByProspect(e.ctx, e.tenant.ID, p.ID)
		if len(ledgers) == 0 {
			t.Fatal("approval must book the agent commission like a normal closing")
		}
		if err := e.svc.ApprovePaymentRequest(e.ctx, e.tenant.ID, e.adminID, req.ID); !errors.Is(err, service.ErrPaymentRequestDecided) {
			t.Fatalf("approving twice must be refused, got %v", err)
		}
	})

	t.Run("pelunasan proof: approve marks paid off", func(t *testing.T) {
		paid, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, p.ID, service.PaymentRequestInput{Kind: "paid_off", ProofBytes: proofPNG(t)})
		if err != nil {
			t.Fatalf("submit paid_off: %v", err)
		}
		if err := e.svc.ApprovePaymentRequest(e.ctx, e.tenant.ID, e.adminID, paid.ID); err != nil {
			t.Fatalf("approve paid_off: %v", err)
		}
		got, _ := e.prospectRepo.GetByID(e.ctx, e.tenant.ID, p.ID)
		if got.PaidOffAt == nil {
			t.Fatal("prospect must be marked paid off")
		}
		if _, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, p.ID, service.PaymentRequestInput{Kind: "paid_off", ProofBytes: proofPNG(t)}); !errors.Is(err, service.ErrPaymentRequestPaidOffNA) {
			t.Fatalf("a paid off jamaah takes no new pelunasan proof, got %v", err)
		}
	})

	t.Run("reject needs a reason; the agent can send again", func(t *testing.T) {
		q := newProspect(t, "081300001002", "tertarik")
		r1, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, q.ID, closing(proofPNG(t)))
		if err != nil {
			t.Fatal(err)
		}
		if err := e.svc.RejectPaymentRequest(e.ctx, e.tenant.ID, e.adminID, r1.ID, "  "); !errors.Is(err, service.ErrPaymentRejectReason) {
			t.Fatalf("empty reason must be refused, got %v", err)
		}
		if err := e.svc.RejectPaymentRequest(e.ctx, e.tenant.ID, e.adminID, r1.ID, "Nominal tidak terbaca"); err != nil {
			t.Fatal(err)
		}
		got, _ := e.prospectRepo.GetByID(e.ctx, e.tenant.ID, q.ID)
		if got.Status != "tertarik" {
			t.Fatalf("a rejected proof leaves the status, got %s", got.Status)
		}
		if _, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, q.ID, closing(proofPNG(t))); err != nil {
			t.Fatalf("resubmit after rejection: %v", err)
		}
	})

	t.Run("flow 2: the admin closes directly and the waiting proof is settled", func(t *testing.T) {
		s := newProspect(t, "081300001003", "tertarik")
		r, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, s.ID, closing(proofPNG(t)))
		if err != nil {
			t.Fatal(err)
		}
		if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, s.ID, e.adminID, "closing", nil, nil); err != nil {
			t.Fatalf("direct closing: %v", err)
		}
		got, _ := repo.GetByID(e.ctx, e.tenant.ID, r.ID)
		if got.Status != "approved" {
			t.Fatalf("direct closing must settle the waiting proof, got %s", got.Status)
		}
	})

	t.Run("no closing proof for a jamaah already Tidak Lanjut", func(t *testing.T) {
		lost := newProspect(t, "081300001004", "tidak_lanjut")
		if _, err := e.svc.SubmitPaymentRequestByAgent(e.ctx, e.tenant.ID, e.downline.ID, lost.ID, closing(proofPNG(t))); !errors.Is(err, service.ErrPaymentRequestClosingNA) {
			t.Fatalf("expected ErrPaymentRequestClosingNA, got %v", err)
		}
	})
}
