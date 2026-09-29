package repository_test

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regression tests for the fifth prospect re-audit (U2–U6, U8) and UU PDP anonymization (T7),
// run against real MySQL.

// U2: an agent never sees system notes (they can name other agents and other jamaah).
func TestReaudit5_AgentDoesNotSeeSystemNotes(t *testing.T) {
	e := setupProspectAudit(t)
	p, err := e.svc.CreateManualByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, service.AgentCreateProspectInput{Consent: true, Name: "Jamaah Catatan", Phone: "081399990001"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// A repeat submission adds a system note to the agent's prospect.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Jamaah Catatan", Phone: "081399990001"}); err != nil {
		t.Fatalf("repeat: %v", err)
	}
	if _, err := e.svc.AddNoteByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, p.ID, "Sudah saya telepon"); err != nil {
		t.Fatalf("agent note: %v", err)
	}
	admin, _ := e.svc.GetDetail(e.ctx, e.tenantA.ID, p.ID)
	agent, err := e.svc.GetDetailForAgent(e.ctx, e.tenantA.ID, e.agentA.ID, p.ID)
	if err != nil {
		t.Fatalf("agent detail: %v", err)
	}
	var adminSystem int
	for _, n := range admin.Notes {
		if n.AuthorType == "system" {
			adminSystem++
		}
	}
	if adminSystem == 0 {
		t.Fatalf("admin must still see the system note")
	}
	for _, n := range agent.Notes {
		if n.AuthorType == "system" {
			t.Fatalf("agent must not see system notes, got %q", n.NoteText)
		}
	}
	if len(agent.Notes) != 1 {
		t.Fatalf("agent must see their own note, got %d notes", len(agent.Notes))
	}
}

// U3/U4: agent search runs over all the agent's jamaah; status counts ignore the page and filter.
func TestReaudit5_AgentSearchAndStatusCounts(t *testing.T) {
	e := setupProspectAudit(t)
	for i := 0; i < 5; i++ {
		e.newAgentProspect(t, fmt.Sprintf("08139999%04d", 100+i), 1)
	}
	target := e.newAgentProspect(t, "+62 813-9999-0200", 1)
	target.Name = "Siti Aminah"
	if err := e.prospectRepo.Update(e.ctx, e.tenantA.ID, target); err != nil {
		t.Fatalf("rename: %v", err)
	}
	if err := e.svc.UpdateStatusByAgent(e.ctx, e.tenantA.ID, e.agentA.ID, target.ID, "dihubungi", nil, nil); err != nil {
		t.Fatalf("status: %v", err)
	}

	q := "aminah"
	page, err := e.svc.ListByAgentPage(e.ctx, e.tenantA.ID, e.agentA.ID, nil, &q, 1, 2)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != target.ID {
		t.Fatalf("search by name must find the jamaah beyond the first page, got total %d", page.Total)
	}
	phone := "0813 9999 0200"
	if page, _ := e.svc.ListByAgentPage(e.ctx, e.tenantA.ID, e.agentA.ID, nil, &phone, 1, 20); page.Total != 1 {
		t.Fatalf("search 0813.. must find a number stored as +62 813.., got %d", page.Total)
	}
	baru := "baru"
	page, _ = e.svc.ListByAgentPage(e.ctx, e.tenantA.ID, e.agentA.ID, &baru, nil, 1, 2)
	c := page.StatusCounts
	if c["total"] != 6 || c["baru"] != 5 || c["dihubungi"] != 1 {
		t.Fatalf("status counts must cover all jamaah regardless of filter/page, got %v", c)
	}
	if other, _ := e.svc.ListByAgentPage(e.ctx, e.tenantB.ID, e.agentA.ID, nil, &q, 1, 20); other != nil && (other.Total != 0 || other.StatusCounts["total"] != 0) {
		t.Fatalf("CRITICAL: tenant B must not see tenant A jamaah, got %+v", other)
	}
}

// U5: a repeat submission fills the empty fields of the open prospect, never overwrites.
func TestReaudit5_RepeatSubmissionFillsEmptyFields(t *testing.T) {
	e := setupProspectAudit(t)
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Ulang", Phone: "081399990300"}); err != nil {
		t.Fatalf("first: %v", err)
	}
	plan := time.Now().AddDate(0, 4, 0).Format("2006-01")
	city, three := "Medan", 3
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{
		Consent: true, Name: "Ulang Kedua", Phone: "0813-9999-0300", PackageID: &e.pkgA.ID,
		DeparturePlan: &plan, Domicile: &city, JumlahJamaah: &three,
	}); err != nil {
		t.Fatalf("repeat: %v", err)
	}
	q := "081399990300"
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	if len(list) != 1 {
		t.Fatalf("expected one prospect, got %d", len(list))
	}
	p := list[0]
	if p.Name != "Ulang" || p.DeparturePlan == nil || *p.DeparturePlan != plan || p.Domicile == nil || *p.Domicile != city ||
		p.JumlahJamaah == nil || *p.JumlahJamaah != 3 || p.PackageID == nil || *p.PackageID != e.pkgA.ID {
		t.Fatalf("empty fields must be filled and the name kept, got %+v", p)
	}

	// A third submission must not overwrite what is already there.
	other, one := "Jakarta", 1
	_, _ = e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Ulang", Phone: "081399990300", Domicile: &other, JumlahJamaah: &one})
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if *got.Domicile != city || *got.JumlahJamaah != 3 {
		t.Fatalf("existing values must not be overwritten, got domicile %s jumlah %d", *got.Domicile, *got.JumlahJamaah)
	}
	detail, _ := e.svc.GetDetail(e.ctx, e.tenantA.ID, p.ID)
	var noted bool
	for _, n := range detail.Notes {
		if n.AuthorType == "system" && strings.Contains(n.NoteText, "domisili: Medan") && strings.Contains(n.NoteText, "rencana berangkat:") {
			noted = true
		}
	}
	if !noted {
		t.Fatalf("the repeat note must mention plan and domicile")
	}
}

// U6: dashboard search on a phone matches whatever format it was stored in.
func TestReaudit5_PhoneSearchNormalized(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "+6281399990400", 1)
	for _, q := range []string{"081399990400", "0813 9999 0400", "+62 813-9999-0400", "99990400"} {
		q := q
		list, err := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
		if err != nil {
			t.Fatalf("search %q: %v", q, err)
		}
		if len(list) != 1 || list[0].ID != p.ID {
			t.Fatalf("search %q must find the prospect, got %d", q, len(list))
		}
		if list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantB.ID, repository.ProspectFilter{Search: &q}); len(list) != 0 {
			t.Fatalf("CRITICAL: tenant B search must not find tenant A prospect")
		}
	}
}

// U8: a draft package from the public form is not linked, but the lead is kept.
func TestReaudit5_PublicDraftPackageNotLinked(t *testing.T) {
	e := setupProspectAudit(t)
	draft := &repository.Package{Name: "Paket Draft", Status: "draft"}
	if err := e.pkgRepo.Create(e.ctx, e.tenantA.ID, draft); err != nil {
		t.Fatalf("draft package: %v", err)
	}
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Draft", Phone: "081399990500", PackageID: &draft.ID}); err != nil {
		t.Fatalf("lead must be kept, got %v", err)
	}
	q := "081399990500"
	list, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	if len(list) != 1 || list[0].PackageID != nil {
		t.Fatalf("expected one lead without package, got %+v", list)
	}
}

// T7: anonymization removes personal data, keeps commission, and is tenant-scoped.
func TestReaudit5_AnonymizeKeepsCommission(t *testing.T) {
	e := setupProspectAudit(t)
	p := e.newAgentProspect(t, "081399990600", 2)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.svc.AddNote(e.ctx, e.tenantA.ID, p.ID, 1, "Alamat: Jl. Mawar 5, NIK 3201xxxx"); err != nil {
		t.Fatalf("note: %v", err)
	}
	_, before := ledgerSum(t, e, p.ID)

	// Tenant B cannot anonymize tenant A's prospect.
	if err := e.svc.Anonymize(e.ctx, e.tenantB.ID, p.ID, 1); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("CRITICAL: tenant B anonymize must be not found, got %v", err)
	}
	if got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID); got.AnonymizedAt != nil || got.Name != "Jamaah Audit" {
		t.Fatalf("CRITICAL: tenant B call must not touch tenant A data")
	}

	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	got, _ := e.prospectRepo.GetByID(e.ctx, e.tenantA.ID, p.ID)
	if got.AnonymizedAt == nil || got.Name != repository.AnonymizedName || got.Phone != "" || got.PhoneNormalized != nil || got.Email != nil || got.Domicile != nil {
		t.Fatalf("personal data must be removed, got %+v", got)
	}
	if got.Status != "closing" {
		t.Fatalf("status must be kept, got %s", got.Status)
	}
	if _, after := ledgerSum(t, e, p.ID); after != before || before == 0 {
		t.Fatalf("commission must be kept: before %.0f after %.0f", before, after)
	}
	detail, _ := e.svc.GetDetail(e.ctx, e.tenantA.ID, p.ID)
	for _, n := range detail.Notes {
		if strings.Contains(n.NoteText, "Mawar") {
			t.Fatalf("free-text notes must be removed, found %q", n.NoteText)
		}
	}
	if err := e.svc.Anonymize(e.ctx, e.tenantA.ID, p.ID, 1); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("second anonymize must be refused, got %v", err)
	}
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, p.ID, 1, service.UpdateProspectInput{Name: "Balik", Phone: "081399990600"}); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("edit after anonymize must be refused, got %v", err)
	}
	if _, err := e.svc.AddNote(e.ctx, e.tenantA.ID, p.ID, 1, "catatan baru"); !errors.Is(err, service.ErrProspectAnonymized) {
		t.Fatalf("note after anonymize must be refused, got %v", err)
	}
	// Paying off still works: the commission flow is unaffected.
	if err := e.svc.MarkPaidOff(e.ctx, e.tenantA.ID, p.ID, 1); err != nil {
		t.Fatalf("paid off after anonymize: %v", err)
	}
}
