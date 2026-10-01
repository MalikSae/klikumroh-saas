package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

// fakeBannerContent returns fixed banners per tenant; an unknown tenant returns an error.
type fakeBannerContent struct {
	ContentService
	banners map[uint64][]*repository.Banner
	failFor uint64
}

func (f *fakeBannerContent) ListBanners(_ context.Context, tenantID uint64, _ bool) ([]*repository.Banner, error) {
	if tenantID == f.failFor {
		return nil, errors.New("db down")
	}
	return f.banners[tenantID], nil
}

// Website redesign (1 Oct 2026): unused banner images are removed after the grace period, used ones and
// fresh uploads stay, a banner row cannot keep another tenant's file alive, and a tenant whose banners
// cannot be read is left untouched.
func TestSweepOrphanBannerFiles(t *testing.T) {
	root := t.TempDir()
	now := time.Now()
	old := now.Add(-48 * time.Hour)
	write := func(tenant, name string, mod time.Time) string {
		t.Helper()
		dir := filepath.Join(root, tenant, "banners")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(p, mod, mod); err != nil {
			t.Fatal(err)
		}
		return p
	}
	usedA := write("101", "used.webp", old)
	orphanA := write("101", "orphan.webp", old)
	freshA := write("101", "fresh.webp", now.Add(-time.Hour))
	orphanB := write("102", "b-orphan.webp", old)
	failC := write("103", "c.webp", old)

	content := &fakeBannerContent{
		banners: map[uint64][]*repository.Banner{
			101: {{ImageURL: "/uploads/101/banners/used.webp"}},
			// Tenant 102's banner names tenant 101's orphan: it must not keep that file alive, and its own
			// unused file is still an orphan.
			102: {{ImageURL: "/uploads/101/banners/orphan.webp"}},
		},
		failFor: 103,
	}

	n, err := SweepOrphanBannerFiles(context.Background(), content, root, BannerOrphanMinAge, now)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }
	if !exists(usedA) {
		t.Error("a banner's own image must stay")
	}
	if exists(orphanA) {
		t.Error("an old unused image must be removed")
	}
	if !exists(freshA) {
		t.Error("an image younger than the grace period must stay (its banner may not be saved yet)")
	}
	if exists(orphanB) {
		t.Error("tenant 102's unused image must be removed")
	}
	if !exists(failC) {
		t.Error("a tenant whose banners cannot be read must be left untouched")
	}
	if n != 2 {
		t.Errorf("expected 2 files removed, got %d", n)
	}
}
