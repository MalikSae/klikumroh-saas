package repository_test

import (
	"errors"
	"testing"
	"time"

	"klikumroh/internal/repository"
	"klikumroh/internal/service"
)

// Security audit 7 Oct 2026: the package rule of Tertarik (on sale) and Closing (published, departed
// allowed) applies to the package the prospect actually has, not only to one sent with the status
// change, and to a package changed later with "Edit data".
func TestPipelinePackageRule_EffectivePackage(t *testing.T) {
	e := setupBH5(t, "pipe-rule", 0)
	past := time.Now().AddDate(0, 0, -10)
	departed := &repository.Package{Name: "Paket Sudah Berangkat", Status: "published", DepartureDate: &past}
	if err := e.packageRepo.Create(e.ctx, e.tenant.ID, departed); err != nil {
		t.Fatal(err)
	}
	archived := &repository.Package{Name: "Paket Arsip", Status: "archived"}
	if err := e.packageRepo.Create(e.ctx, e.tenant.ID, archived); err != nil {
		t.Fatal(err)
	}
	onSale := e.pkg(t, "Paket Tayang", 500000)

	t.Run("Tertarik refuses a departed package the prospect already has", func(t *testing.T) {
		p := e.prospect(t, "Jamaah Lama", "081300002001", &departed.ID, nil)
		if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "tertarik", nil, nil); !errors.Is(err, service.ErrPackageNotOnSale) {
			t.Fatalf("expected ErrPackageNotOnSale, got %v", err)
		}
	})

	t.Run("Closing refuses an archived package, allows a departed published one", func(t *testing.T) {
		p := e.prospect(t, "Jamaah Arsip", "081300002002", &archived.ID, nil)
		if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "closing", nil, nil); !errors.Is(err, service.ErrPackageNotPublished) {
			t.Fatalf("expected ErrPackageNotPublished, got %v", err)
		}
		q := e.prospect(t, "Jamaah Berangkat", "081300002003", &departed.ID, nil)
		if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, q.ID, e.adminID, "closing", nil, nil); err != nil {
			t.Fatalf("closing after departure must stay allowed, got %v", err)
		}
	})

	t.Run("Edit data on a Tertarik prospect cannot switch to a departed package", func(t *testing.T) {
		p := e.prospect(t, "Jamaah Tertarik", "081300002004", &onSale.ID, nil)
		if err := e.svc.UpdateStatus(e.ctx, e.tenant.ID, p.ID, e.adminID, "tertarik", nil, nil); err != nil {
			t.Fatal(err)
		}
		one := 1
		in := service.UpdateProspectInput{Name: p.Name, Phone: p.Phone, PackageID: &departed.ID, JumlahJamaah: &one}
		if err := e.svc.UpdateDetail(e.ctx, e.tenant.ID, p.ID, e.adminID, in); !errors.Is(err, service.ErrPackageNotOnSale) {
			t.Fatalf("expected ErrPackageNotOnSale, got %v", err)
		}
		in.PackageID = &onSale.ID
		in.Name = "Jamaah Tertarik Ubah"
		if err := e.svc.UpdateDetail(e.ctx, e.tenant.ID, p.ID, e.adminID, in); err != nil {
			t.Fatalf("keeping the same package must stay allowed, got %v", err)
		}
	})
}
