package repository_test

import (
	"errors"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Regression tests for the package audit (K0–K4), run against real MySQL.

func fptr(v float64) *float64 { return &v }
func iptr(v int) *int         { return &v }

// K0: a package referenced by commission history can never be deleted (the history must survive),
// even after the closed prospect moved to another package.
func TestPackageAudit_DeleteKeepsCommissionHistory(t *testing.T) {
	e := setupProspectAudit(t)
	pkgB := &repository.Package{Name: "Paket B", Status: "published", Price: fptr(30000000), CommissionAmount: fptr(1500000)}
	if err := e.pkgRepo.Create(e.ctx, e.tenantA.ID, pkgB); err != nil {
		t.Fatalf("pkg B: %v", err)
	}
	p := e.newAgentProspect(t, "081366660001", 1)
	if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
		t.Fatalf("closing: %v", err)
	}
	reason := "Pindah paket"
	if err := e.svc.UpdateDetail(e.ctx, e.tenantA.ID, p.ID, 1, service.UpdateProspectInput{Name: "Jamaah Audit", Phone: "081366660001", PackageID: &pkgB.ID, CorrectionReason: &reason}); err != nil {
		t.Fatalf("move to B: %v", err)
	}
	entriesBefore, totalBefore := ledgerSum(t, e, p.ID)

	pkgSvc := service.NewPackageService(e.pkgRepo, repository.NewPackagePhotoRepository(e.db))
	if err := pkgSvc.Delete(e.ctx, e.tenantA.ID, e.pkgA.ID); !errors.Is(err, service.ErrPackageInUse) {
		t.Fatalf("package with commission history must not be deletable, got %v", err)
	}
	if entries, total := ledgerSum(t, e, p.ID); entries != entriesBefore || total != totalBefore {
		t.Fatalf("CRITICAL: commission history changed: %d/%.0f -> %d/%.0f", entriesBefore, totalBefore, entries, total)
	}
}

// K1: seats taken = jamaah of Closing prospects only; K2: public list hides departed packages and
// sorts by departure; K3: validation; K4: photo limit.
func TestPackageAudit_SeatsDepartureValidationPhotos(t *testing.T) {
	e := setupProspectAudit(t)
	pkgSvc := service.NewPackageService(e.pkgRepo, repository.NewPackagePhotoRepository(e.db))
	photoSvc := service.NewPackagePhotoService(repository.NewPackagePhotoRepository(e.db), e.pkgRepo)

	// K1
	e.pkgA.Quota = iptr(45)
	if err := e.pkgRepo.Update(e.ctx, e.tenantA.ID, e.pkgA); err != nil {
		t.Fatalf("quota: %v", err)
	}
	a := e.newAgentProspect(t, "081366660010", 3)
	b := e.newAgentProspect(t, "081366660011", 2)
	e.newAgentProspect(t, "081366660012", 4) // still open: not a taken seat
	for _, p := range []*repository.Prospect{a, b} {
		if err := e.svc.UpdateStatus(e.ctx, e.tenantA.ID, p.ID, 1, "closing", nil, nil); err != nil {
			t.Fatalf("closing: %v", err)
		}
	}
	if _, err := e.svc.CancelClosing(e.ctx, e.tenantA.ID, b.ID, 1, "batal"); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	got, _ := e.pkgRepo.GetByID(e.ctx, e.tenantA.ID, e.pkgA.ID)
	if got.SeatsTaken != 3 {
		t.Fatalf("seats taken must count only current closings (3), got %d", got.SeatsTaken)
	}
	if other, err := e.pkgRepo.GetByID(e.ctx, e.tenantB.ID, e.pkgA.ID); err == nil || other != nil {
		t.Fatalf("CRITICAL: tenant B must not read tenant A package")
	}

	// K2
	past := time.Now().AddDate(0, 0, -2)
	soon := time.Now().AddDate(0, 1, 0)
	later := time.Now().AddDate(0, 3, 0)
	mk := func(name string, dep *time.Time) *repository.Package {
		p := &repository.Package{Name: name, Status: "published", Price: fptr(25000000), DepartureDate: dep}
		if err := pkgSvc.Create(e.ctx, e.tenantA.ID, p); err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		return p
	}
	departed := mk("Sudah Berangkat", &past)
	mk("Tiga Bulan Lagi", &later)
	mk("Bulan Depan", &soon)
	list, err := pkgSvc.ListPublished(e.ctx, e.tenantA.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	names := []string{}
	for _, p := range list {
		names = append(names, p.Name)
		if p.ID == departed.ID {
			t.Fatalf("a departed package must not be listed publicly")
		}
	}
	if len(names) < 2 || names[0] != "Bulan Depan" || names[1] != "Tiga Bulan Lagi" {
		t.Fatalf("public list must be sorted by nearest departure, got %v", names)
	}
	// Interest form: a departed package is not linked, the lead is kept.
	if _, err := e.svc.CreatePublic(e.ctx, e.tenantA.ID, service.PublicProspectInput{Consent: true, Name: "Telat", Phone: "081366660020", PackageID: &departed.ID}); err != nil {
		t.Fatalf("lead must be kept: %v", err)
	}
	q := "081366660020"
	leads, _ := e.prospectRepo.ListWithFilter(e.ctx, e.tenantA.ID, repository.ProspectFilter{Search: &q})
	if len(leads) != 1 || leads[0].PackageID != nil {
		t.Fatalf("lead for a departed package must not be linked to it: %+v", leads)
	}

	// K3
	for name, pkg := range map[string]*repository.Package{
		"negative price":        {Name: "X", Status: "draft", Price: fptr(-1)},
		"negative quota":        {Name: "X", Status: "draft", Quota: iptr(-5)},
		"commission over price": {Name: "X", Status: "draft", Price: fptr(1000000), CommissionAmount: fptr(2000000)},
		"publish without price": {Name: "X", Status: "published"},
	} {
		if err := pkgSvc.Create(e.ctx, e.tenantA.ID, pkg); !service.IsPackageInputError(err) {
			t.Fatalf("%s must be refused as input error, got %v", name, err)
		}
	}

	// K4
	for i := 0; i < service.MaxPackagePhotos; i++ {
		if err := photoSvc.Create(e.ctx, e.tenantA.ID, &repository.PackagePhoto{PackageID: e.pkgA.ID, FilePath: "/uploads/test/p.webp"}); err != nil {
			t.Fatalf("photo %d: %v", i, err)
		}
	}
	if err := photoSvc.Create(e.ctx, e.tenantA.ID, &repository.PackagePhoto{PackageID: e.pkgA.ID, FilePath: "/uploads/test/p.webp"}); !errors.Is(err, service.ErrTooManyPackagePhotos) {
		t.Fatalf("11th photo must be refused, got %v", err)
	}
}
