package repository_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Bug hunt round 5 (real database): notification tenant scoping and team-member deletion, Batalkan
// Closing notifications per agent, zero-value corrections, UU PDP scrub of the duplicate-closing note,
// the delete-vs-close guard and unfilled Meta placeholders in utm_* values.

type bh5Env struct {
	ctx          context.Context
	tenant       *repository.Tenant
	adminID      uint64
	agentRepo    repository.AgentRepository
	prospectRepo repository.ProspectRepository
	packageRepo  repository.PackageRepository
	ledgerRepo   repository.CommissionLedgerRepository
	noteRepo     repository.ProspectNoteRepository
	notifRepo    repository.NotificationRepository
	svc          service.ProspectService
	upline       *repository.Agent
	downline     *repository.Agent
}

func setupBH5(t *testing.T, slug string, overridePct float64) *bh5Env {
	t.Helper()
	db := setupTestDB(t)
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	e := &bh5Env{
		ctx:          ctx,
		agentRepo:    repository.NewAgentRepository(db),
		prospectRepo: repository.NewProspectRepository(db),
		packageRepo:  repository.NewPackageRepository(db),
		ledgerRepo:   repository.NewCommissionLedgerRepository(db),
		noteRepo:     repository.NewProspectNoteRepository(db),
		notifRepo:    repository.NewNotificationRepository(db),
	}
	adminRepo := repository.NewAdminUserRepository(db)
	e.tenant = createDummyTenant(t, ctx, tenantRepo, slug)
	admin := &repository.AdminUser{TenantID: e.tenant.ID, Email: fmt.Sprintf("bh5-%d@example.com", e.tenant.ID), PasswordHash: "hashed", Name: "Admin", Status: "active"}
	if err := adminRepo.Create(ctx, e.tenant.ID, admin); err != nil {
		t.Fatal(err)
	}
	e.adminID = admin.ID
	nano := time.Now().UnixNano()
	e.upline = &repository.Agent{Name: "Upline Bh5", Phone: strPtr(fmt.Sprintf("0815%08d", nano%100000000)), ReferralCode: fmt.Sprintf("BU%d", nano), Status: "active"}
	if err := e.agentRepo.Create(ctx, e.tenant.ID, e.upline); err != nil {
		t.Fatal(err)
	}
	e.downline = &repository.Agent{Name: "Downline Bh5", Phone: strPtr(fmt.Sprintf("0816%08d", nano%100000000)), ReferralCode: fmt.Sprintf("BD%d", nano), ParentAgentID: &e.upline.ID, Status: "active"}
	if err := e.agentRepo.Create(ctx, e.tenant.ID, e.downline); err != nil {
		t.Fatal(err)
	}
	if overridePct > 0 {
		if err := tenantRepo.UpdateCommissionSettings(ctx, e.tenant.ID, true, &overridePct); err != nil {
			t.Fatal(err)
		}
	}
	e.svc = service.NewProspectService(e.prospectRepo, e.packageRepo, e.agentRepo, tenantRepo, e.ledgerRepo,
		repository.NewProspectStatusHistoryRepository(db), e.noteRepo, adminRepo, service.NewNotificationService(e.notifRepo))
	return e
}

func (e *bh5Env) pkg(t *testing.T, name string, commission float64) *repository.Package {
	t.Helper()
	p := &repository.Package{Name: name, CommissionAmount: &commission, Status: "published"}
	if err := e.packageRepo.Create(e.ctx, e.tenant.ID, p); err != nil {
		t.Fatal(err)
	}
	return p
}

func (e *bh5Env) prospect(t *testing.T, name, phone string, pkgID *uint64, agentID *uint64) *repository.Prospect {
	t.Helper()
	one := 1
	p := &repository.Prospect{TenantID: e.tenant.ID, Name: name, Phone: phone, PackageID: pkgID, AgentID: agentID, JumlahJamaah: &one, SourceChannel: "agen", Status: "baru"}
	if err := e.prospectRepo.Create(e.ctx, e.tenant.ID, p); err != nil {
		t.Fatal(err)
	}
	return p
}

func (e *bh5Env) agentNotifs(t *testing.T, agentID uint64) []repository.Notification {
	t.Helper()
	list, err := e.notifRepo.ListByRecipient(e.ctx, &e.tenant.ID, "agent", agentID, 100)
	if err != nil {
		t.Fatal(err)
	}
	return list
}

func TestBH5_NotificationsTenantScopedAndTeamDeletion(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	notifRepo := repository.NewNotificationRepository(db)
	adminRepo := repository.NewAdminUserRepository(db)
	tA := createDummyTenant(t, ctx, tenantRepo, "bh5_notif_a")
	tB := createDummyTenant(t, ctx, tenantRepo, "bh5_notif_b")

	// The same recipient id in two travels (e.g. a reused id): each travel only sees its own.
	const rid = uint64(990001)
	for _, tn := range []*repository.Tenant{tA, tB} {
		id := tn.ID
		if err := notifRepo.Create(ctx, &repository.Notification{TenantID: &id, RecipientType: "admin", RecipientID: rid, Type: "x", Title: fmt.Sprintf("T%d", id), Body: "b"}); err != nil {
			t.Fatal(err)
		}
	}
	t.Run("list and count are scoped to the tenant", func(t *testing.T) {
		list, err := notifRepo.ListByRecipient(ctx, &tA.ID, "admin", rid, 50)
		if err != nil {
			t.Fatal(err)
		}
		if len(list) != 1 || *list[0].TenantID != tA.ID {
			t.Fatalf("tenant A must see only its own notification, got %+v", list)
		}
		n, _ := notifRepo.CountUnread(ctx, &tA.ID, "admin", rid)
		if n != 1 {
			t.Fatalf("unread for tenant A: want 1, got %d", n)
		}
	})
	t.Run("mark read in tenant A leaves tenant B untouched", func(t *testing.T) {
		listB, _ := notifRepo.ListByRecipient(ctx, &tB.ID, "admin", rid, 50)
		if err := notifRepo.MarkAsRead(ctx, &tA.ID, "admin", rid, listB[0].ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("marking tenant B's notification through tenant A must be ErrNotFound, got %v", err)
		}
		if err := notifRepo.MarkAllAsRead(ctx, &tA.ID, "admin", rid); err != nil {
			t.Fatal(err)
		}
		if n, _ := notifRepo.CountUnread(ctx, &tB.ID, "admin", rid); n != 1 {
			t.Fatalf("tenant B must still have 1 unread, got %d", n)
		}
	})
	t.Run("admin/agent query without tenant is refused", func(t *testing.T) {
		if _, err := notifRepo.ListByRecipient(ctx, nil, "admin", rid, 50); !errors.Is(err, repository.ErrNotificationTenantRequired) {
			t.Fatalf("expected ErrNotificationTenantRequired, got %v", err)
		}
		if _, err := notifRepo.CountUnread(ctx, nil, "agent", rid); !errors.Is(err, repository.ErrNotificationTenantRequired) {
			t.Fatalf("expected ErrNotificationTenantRequired, got %v", err)
		}
	})
	t.Run("deleting a team member removes their notifications only", func(t *testing.T) {
		member := &repository.AdminUser{TenantID: tA.ID, Email: fmt.Sprintf("bh5-member-%d@example.com", tA.ID), PasswordHash: "h", Name: "Member", Status: "active"}
		if err := adminRepo.Create(ctx, tA.ID, member); err != nil {
			t.Fatal(err)
		}
		other := &repository.AdminUser{TenantID: tA.ID, Email: fmt.Sprintf("bh5-other-%d@example.com", tA.ID), PasswordHash: "h", Name: "Other", Status: "active"}
		if err := adminRepo.Create(ctx, tA.ID, other); err != nil {
			t.Fatal(err)
		}
		for _, id := range []uint64{member.ID, other.ID} {
			if err := notifRepo.Create(ctx, &repository.Notification{TenantID: &tA.ID, RecipientType: "admin", RecipientID: id, Type: "x", Title: "Jamaah Fulan", Body: "b"}); err != nil {
				t.Fatal(err)
			}
		}
		// Tenant B cannot delete tenant A's member (and nothing is removed).
		if err := adminRepo.Delete(ctx, tB.ID, member.ID); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("cross-tenant delete must be ErrNotFound, got %v", err)
		}
		if n, _ := notifRepo.CountUnread(ctx, &tA.ID, "admin", member.ID); n != 1 {
			t.Fatalf("cross-tenant delete must not remove notifications, got %d", n)
		}
		if err := adminRepo.Delete(ctx, tA.ID, member.ID); err != nil {
			t.Fatal(err)
		}
		var left int
		if err := db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE tenant_id = ? AND recipient_type = 'admin' AND recipient_id = ?`, tA.ID, member.ID).Scan(&left); err != nil {
			t.Fatal(err)
		}
		if left != 0 {
			t.Fatalf("deleted member's notifications must be removed, %d left", left)
		}
		if n, _ := notifRepo.CountUnread(ctx, &tA.ID, "admin", other.ID); n != 1 {
			t.Fatalf("other members keep their notifications, got %d", n)
		}
	})
}

func TestBH5_CancelClosingNotifiesEachAgentOwnAmount(t *testing.T) {
	e := setupBH5(t, "bh5_cancel", 2.5)
	pkg := e.pkg(t, "Paket Batal", 1500000)
	p := e.prospect(t, "Jamaah Rahasia", "081377770001", &pkg.ID, &e.downline.ID)
	// No policy repo: commission is released at closing (DP), like a travel releasing at DP.
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenant.ID, p.ID, e.adminID, "jamaah sakit"); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	var down *repository.Notification
	for _, n := range e.agentNotifs(t, e.downline.ID) {
		if n.Type == "prospect_closing_cancelled" {
			n := n
			down = &n
		}
	}
	if down == nil {
		t.Fatal("downline must be notified")
	}
	if !strings.Contains(down.Body, "Komisi Rp 1.500.000 ") || strings.Contains(down.Body, "1.537.500") || strings.Contains(down.Body, "37.500") {
		t.Fatalf("downline must see only its own Rp 1.500.000, got %q", down.Body)
	}

	var up *repository.Notification
	for _, n := range e.agentNotifs(t, e.upline.ID) {
		if n.Type == "commission_override_reversed" {
			n := n
			up = &n
		}
	}
	if up == nil {
		t.Fatal("upline must be told its override was reversed")
	}
	if !strings.Contains(up.Body, "Rp 37.500") || strings.Contains(up.Body, "Jamaah Rahasia") || strings.Contains(up.Body, "jamaah sakit") ||
		(up.LinkURL != nil && strings.Contains(*up.LinkURL, fmt.Sprint(p.ID))) {
		t.Fatalf("upline notice must be generic with its own amount, got %+v", up)
	}
}

func TestBH5_NoZeroValueCorrectionRows(t *testing.T) {
	e := setupBH5(t, "bh5_zero", 7)
	pkg1 := e.pkg(t, "Paket A", 3000000)
	pkg2 := e.pkg(t, "Paket B", 3000000)
	p := e.prospect(t, "Jamaah Pindah", "081377770002", &pkg1.ID, &e.downline.ID)
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	reason := "Pindah paket"
	one := 1
	if err := e.svc.UpdateDetail(e.ctx, e.tenant.ID, p.ID, e.adminID, service.UpdateProspectInput{
		Name: p.Name, Phone: p.Phone, PackageID: &pkg2.ID, JumlahJamaah: &one, CorrectionReason: &reason,
	}); err != nil {
		t.Fatalf("move package: %v", err)
	}
	ledgers, err := e.ledgerRepo.ListByProspect(e.ctx, e.tenant.ID, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range ledgers {
		if l.Type == "correction" {
			t.Fatalf("same commission: no correction row expected, got %+v", l)
		}
	}
	if len(ledgers) != 2 {
		t.Fatalf("expected the direct and override rows only, got %d", len(ledgers))
	}
}

func TestBH5_AnonymizeScrubsDuplicateClosingNote(t *testing.T) {
	e := setupBH5(t, "bh5_pdp", 0)
	phone := "081377770003"
	ref := e.downline.ReferralCode
	if _, err := e.svc.CreatePublic(e.ctx, e.tenant.ID, service.PublicProspectInput{Consent: true, Name: "Siti Rahasia", Phone: phone, ReferralCode: &ref}); err != nil {
		t.Fatal(err)
	}
	aID := e.idByName(t, "Siti Rahasia")
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, aID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	// The same number registers again: B gets the system warning naming A's jamaah and agent.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenant.ID, service.PublicProspectInput{Consent: true, Name: "Keluarga Siti", Phone: phone}); err != nil {
		t.Fatal(err)
	}
	bID := e.idByName(t, "Keluarga Siti")
	notes, _ := e.noteRepo.ListByProspect(e.ctx, e.tenant.ID, bID)
	if len(notes) == 0 || !strings.Contains(notes[0].NoteText, "Siti Rahasia") {
		t.Fatalf("precondition: B's warning should name A's jamaah, got %+v", notes)
	}
	// A note citing another prospect whose id starts with A's id must not be touched.
	other := fmt.Sprintf("Perhatian: nomor ini sudah Closing (DP) di prospek #%d9 (Budi Lain, agen X). Pastikan ini bukan jamaah yang sama.", aID)
	if err := e.noteRepo.Create(e.ctx, e.tenant.ID, &repository.ProspectNote{TenantID: e.tenant.ID, ProspectID: bID, AuthorType: "system", NoteText: other}); err != nil {
		t.Fatal(err)
	}

	if err := e.svc.Anonymize(e.ctx, e.tenant.ID, aID, e.adminID); err != nil {
		t.Fatalf("anonymize: %v", err)
	}
	notes, _ = e.noteRepo.ListByProspect(e.ctx, e.tenant.ID, bID)
	foundScrubbed, foundOther := false, false
	for _, n := range notes {
		if n.NoteText == other {
			foundOther = true
			continue
		}
		if strings.Contains(n.NoteText, fmt.Sprintf("prospek #%d ", aID)) {
			if strings.Contains(n.NoteText, "Siti Rahasia") || strings.Contains(n.NoteText, e.downline.Name) {
				t.Fatalf("names must be scrubbed: %q", n.NoteText)
			}
			if !strings.Contains(n.NoteText, repository.AnonymizedClosingReference+". Pastikan") {
				t.Fatalf("unexpected scrubbed text %q", n.NoteText)
			}
			foundScrubbed = true
		}
	}
	if !foundScrubbed || !foundOther {
		t.Fatalf("scrubbed=%v other-untouched=%v notes=%+v", foundScrubbed, foundOther, notes)
	}
}

func TestBH5_DeleteGuardInsideTransaction(t *testing.T) {
	e := setupBH5(t, "bh5_delete", 0)
	pkg := e.pkg(t, "Paket Hapus", 1000000)
	closing := e.prospect(t, "Jamaah Closing", "081377770004", &pkg.ID, &e.downline.ID)
	if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, closing.ID, e.adminID, "closing", nil, nil); err != nil {
		t.Fatal(err)
	}
	guarded, ok := e.prospectRepo.(interface {
		DeleteIfDeletable(ctx context.Context, tenantID uint64, id uint64) error
	})
	if !ok {
		t.Fatal("mysql prospect repository must implement DeleteIfDeletable")
	}
	// The service's pre-check is bypassed (as if the closing happened right after it): the transaction refuses.
	if err := guarded.DeleteIfDeletable(e.ctx, e.tenant.ID, closing.ID); !errors.Is(err, repository.ErrProspectNotDeletable) {
		t.Fatalf("closing prospect: expected ErrProspectNotDeletable, got %v", err)
	}
	// Ledger rows but no longer closing (cancelled closing): refused too.
	if _, err := e.svc.CancelClosing(e.ctx, e.tenant.ID, closing.ID, e.adminID, "batal"); err != nil {
		t.Fatal(err)
	}
	if err := guarded.DeleteIfDeletable(e.ctx, e.tenant.ID, closing.ID); !errors.Is(err, repository.ErrProspectNotDeletable) {
		t.Fatalf("prospect with ledger: expected ErrProspectNotDeletable, got %v", err)
	}
	if _, err := e.prospectRepo.GetByID(e.ctx, e.tenant.ID, closing.ID); err != nil {
		t.Fatalf("refused delete must keep the prospect: %v", err)
	}
	// A plain open prospect is deleted; another tenant gets ErrNotFound.
	spam := e.prospect(t, "Spam", "081377770005", nil, nil)
	if err := guarded.DeleteIfDeletable(e.ctx, e.tenant.ID+999999, spam.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("other tenant: expected ErrNotFound, got %v", err)
	}
	if err := e.svc.Delete(e.ctx, e.tenant.ID, spam.ID); err != nil {
		t.Fatalf("delete spam: %v", err)
	}
}

func TestBH5_UnfilledMetaPlaceholdersInUTMIgnored(t *testing.T) {
	e := setupBH5(t, "bh5_utm", 0)
	attr := service.ProspectAttribution{UTMSource: "{{site_source_name}}", UTMMedium: "paid", UTMCampaign: "{{campaign.name}}", AdID: "{{ad.id}}"}
	if _, err := e.svc.CreatePublic(e.ctx, e.tenant.ID, service.PublicProspectInput{Consent: true, Name: "Utm Kosong", Phone: "081377770006", Attribution: &attr}); err != nil {
		t.Fatal(err)
	}
	p, err := e.prospectRepo.GetByID(e.ctx, e.tenant.ID, e.idByName(t, "Utm Kosong"))
	if err != nil {
		t.Fatal(err)
	}
	if p.UTMSource != nil || p.UTMCampaign != nil {
		t.Fatalf("unfilled placeholders must not be stored, got source=%v campaign=%v", p.UTMSource, p.UTMCampaign)
	}
	if p.UTMMedium == nil || *p.UTMMedium != "paid" {
		t.Fatalf("a real value is kept, got %v", p.UTMMedium)
	}
	if p.SourceChannel != "organik" {
		t.Fatalf("unfilled ad id stays organic, got %s", p.SourceChannel)
	}
}

func (e *bh5Env) idByName(t *testing.T, name string) uint64 {
	t.Helper()
	list, err := e.prospectRepo.ListWithFilter(e.ctx, e.tenant.ID, repository.ProspectFilter{})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range list {
		if p.Name == name {
			return p.ID
		}
	}
	t.Fatalf("prospect %q not found", name)
	return 0
}
