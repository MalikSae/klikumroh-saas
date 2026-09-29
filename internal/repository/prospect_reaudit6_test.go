package repository_test

import (
	"errors"
	"strings"
	"testing"

	"klikumroh/internal/service"
)

// Regression tests for the sixth prospect re-audit (V2, V3), run against real MySQL.

// V2: an anonymized prospect never re-enters the pipeline, for admin or agent.
func TestReaudit6_AnonymizedStatusFrozen(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399990700", 1)
	harga := "harga"
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "tidak_lanjut", nil, &harga); err != nil {
		t.Fatalf("tidak_lanjut: %v", err)
	}
	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "baru", nil, nil); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("admin reopen must be refused, got %v", err)
	}
	if err := e.svc.UpdateStatusByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, p.ID, "dihubungi", nil, nil); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("agent status change must be refused, got %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.Status != "tidak_lanjut" {
		t.Fatalf("status must stay tidak_lanjut, got %s", got.Status)
	}
}

// V3: the jamaah's name is scrubbed from this tenant's jamaah notifications only.
func TestReaudit6_AnonymizeScrubsNotifications(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399990800", 1)
	insert := func(tenantID uint64, kind, body string) int64 {
		res, err := e.db.Exec(`INSERT INTO notifications (tenant_id, recipient_type, recipient_id, type, title, body, link_url)
			VALUES (?, 'agent', ?, ?, 'Komisi', ?, '/agen/riwayat-komisi')`, tenantID, e.agentA.ID, kind, body)
		if err != nil {
			t.Fatalf("insert notification: %v", err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	body := "Komisi Rp 1.000.000 dari closing jamaah Jamaah Audit sudah bisa dicairkan."
	own := insert(e.tenantA.ID, "commission_earned", body)
	otherTenant := insert(e.tenantB.ID, "commission_earned", body)
	unrelated := insert(e.tenantA.ID, "payout_approved", "Pencairan untuk Jamaah Audit disetujui")

	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	read := func(id int64) string {
		var b string
		if err := e.db.QueryRow(`SELECT body FROM notifications WHERE id = ?`, id).Scan(&b); err != nil {
			t.Fatalf("read notification %d: %v", id, err)
		}
		return b
	}
	if b := read(own); strings.Contains(b, "Jamaah Audit") || !strings.Contains(b, "jamaah (data dihapus)") {
		t.Fatalf("name must be scrubbed from the tenant's commission notification, got %q", b)
	}
	if b := read(otherTenant); !strings.Contains(b, "Jamaah Audit") {
		t.Fatalf("CRITICAL: tenant B notification must not be touched, got %q", b)
	}
	if b := read(unrelated); !strings.Contains(b, "Jamaah Audit") {
		t.Fatalf("unrelated notification types must not be touched, got %q", b)
	}
}
