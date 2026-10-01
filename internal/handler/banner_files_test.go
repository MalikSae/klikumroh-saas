package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// Replacing or deleting a banner image removes the old file only inside the tenant's own banners folder.
func TestRemoveBannerFile_OnlyOwnBannersFolder(t *testing.T) {
	const tenantA, tenantB = uint64(990011), uint64(990012)
	write := func(tenant uint64, name string) string {
		t.Helper()
		dir := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenant), "banners")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantA)))
		_ = os.RemoveAll(filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantB)))
	})
	own := write(tenantA, "a.webp")
	other := write(tenantB, "b.webp")
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }

	removeBannerFile(tenantA, fmt.Sprintf("/uploads/%d/banners/a.webp", tenantA))
	if exists(own) {
		t.Fatal("own banner file should be deleted")
	}
	removeBannerFile(tenantA, fmt.Sprintf("/uploads/%d/banners/b.webp", tenantB))
	removeBannerFile(tenantA, fmt.Sprintf("/uploads/%d/banners/../../%d/banners/b.webp", tenantA, tenantB))
	removeBannerFile(tenantA, "https://cdn.example.com/b.webp")
	if !exists(other) {
		t.Fatal("tenant B's banner file must not be deleted by tenant A")
	}
}
