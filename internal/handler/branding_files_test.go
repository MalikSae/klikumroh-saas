package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// Website redesign (30 Sep 2026): removing or replacing a logo, icon, or share image deletes the old
// file, but only inside the tenant's own branding folder. Another tenant's file, a path escaping the
// folder, and an external URL are never touched.
func TestRemoveBrandingFile_OnlyOwnBrandingFolder(t *testing.T) {
	const tenantA, tenantB = uint64(990001), uint64(990002)
	write := func(tenant uint64, name string) string {
		t.Helper()
		dir := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenant), "branding")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
		return p
	}
	t.Cleanup(func() {
		_ = os.RemoveAll(filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantA)))
		_ = os.RemoveAll(filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantB)))
		// Remove ./uploads only if the test created it (empty now).
		_ = os.Remove(filepath.Join(".", "uploads"))
	})

	own := write(tenantA, "logo-a.png")
	other := write(tenantB, "logo-b.png")
	outside := filepath.Join(".", "uploads", fmt.Sprintf("%d", tenantA), "keep.png")
	if err := os.WriteFile(outside, []byte("x"), 0o644); err != nil {
		t.Fatalf("write outside: %v", err)
	}

	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }

	// Tenant A's own file is removed.
	removeBrandingFile(tenantA, fmt.Sprintf("/uploads/%d/branding/logo-a.png", tenantA))
	if exists(own) {
		t.Fatal("own branding file should be deleted")
	}

	// Tenant A cannot remove tenant B's file, even when the URL names it.
	removeBrandingFile(tenantA, fmt.Sprintf("/uploads/%d/branding/logo-b.png", tenantB))
	if !exists(other) {
		t.Fatal("tenant B's branding file must not be deleted by tenant A")
	}

	// Paths escaping the branding folder and external URLs are ignored.
	for _, u := range []string{
		fmt.Sprintf("/uploads/%d/branding/../keep.png", tenantA),
		fmt.Sprintf("/uploads/%d/branding/", tenantA),
		"https://cdn.example.com/logo.png",
		"",
	} {
		removeBrandingFile(tenantA, u)
	}
	if !exists(outside) {
		t.Fatal("file outside the branding folder must not be deleted")
	}
}
