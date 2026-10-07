package repository_test

import (
	"context"
	"fmt"
	"reflect"
	"testing"

	"klikumroh/internal/repository"
)

// Checked guide items belong to one travel: Tenant B never reads, adds or removes Tenant A's checks
// (AGENTS.md 3.1). Rows of the dummy tenants go away with them (ON DELETE CASCADE) and are removed here too.
func TestPlaybookChecks_CrossTenantAndLimits(t *testing.T) {
	db := setupTestDB(t)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	tenantRepo := repository.NewTenantRepository(db)
	repo := repository.NewPlaybookCheckRepository(db)

	tenantA := createDummyTenant(t, ctx, tenantRepo, "pbc-A")
	tenantB := createDummyTenant(t, ctx, tenantRepo, "pbc-B")
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM playbook_checks WHERE tenant_id IN (?, ?)`, tenantA.ID, tenantB.ID)
	})

	if err := repo.Set(ctx, tenantA.ID, "mulai", "3:abc12", true, nil); err != nil {
		t.Fatal(err)
	}
	// A repeat is a no-op, not an error and not a second row.
	if err := repo.Set(ctx, tenantA.ID, "mulai", "3:abc12", true, nil); err != nil {
		t.Fatal(err)
	}
	if err := repo.Set(ctx, tenantA.ID, "mulai", "5:zz", true, nil); err != nil {
		t.Fatal(err)
	}
	// Same page and item id for Tenant B is its own row.
	if err := repo.Set(ctx, tenantB.ID, "mulai", "3:abc12", true, nil); err != nil {
		t.Fatal(err)
	}

	t.Run("CRITICAL: each tenant lists only its own checks", func(t *testing.T) {
		a, err := repo.List(ctx, tenantA.ID, "mulai")
		if err != nil {
			t.Fatal(err)
		}
		if len(a) != 2 {
			t.Fatalf("tenant A items = %v, want 2", a)
		}
		b, err := repo.List(ctx, tenantB.ID, "mulai")
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(b, []string{"3:abc12"}) {
			t.Fatalf("tenant B items = %v, want [3:abc12]", b)
		}
	})

	t.Run("CRITICAL: Tenant B unchecking never removes Tenant A's check", func(t *testing.T) {
		if err := repo.Set(ctx, tenantB.ID, "mulai", "5:zz", false, nil); err != nil {
			t.Fatal(err)
		}
		a, _ := repo.List(ctx, tenantA.ID, "mulai")
		if len(a) != 2 {
			t.Fatalf("tenant A lost a check: %v", a)
		}
		if err := repo.Set(ctx, tenantB.ID, "mulai", "3:abc12", false, nil); err != nil {
			t.Fatal(err)
		}
		a, _ = repo.List(ctx, tenantA.ID, "mulai")
		if len(a) != 2 {
			t.Fatalf("tenant A lost a check after tenant B unchecked the same id: %v", a)
		}
	})

	t.Run("pages are separate and uncheck works", func(t *testing.T) {
		other, _ := repo.List(ctx, tenantA.ID, "persiapan")
		if len(other) != 0 {
			t.Fatalf("another page must be empty, got %v", other)
		}
		if err := repo.Set(ctx, tenantA.ID, "mulai", "5:zz", false, nil); err != nil {
			t.Fatal(err)
		}
		a, _ := repo.List(ctx, tenantA.ID, "mulai")
		if !reflect.DeepEqual(a, []string{"3:abc12"}) {
			t.Fatalf("after uncheck = %v, want [3:abc12]", a)
		}
	})

	t.Run("a page stores at most MaxPlaybookChecksPerPage items", func(t *testing.T) {
		for i := 0; i < repository.MaxPlaybookChecksPerPage; i++ {
			id := fmt.Sprintf("%d:full%d", i%100, i)
			if err := repo.Set(ctx, tenantB.ID, "pilar-1-alumni", id, true, nil); err != nil {
				t.Fatalf("item %d: %v", i, err)
			}
		}
		if err := repo.Set(ctx, tenantB.ID, "pilar-1-alumni", "9:over", true, nil); err != repository.ErrPlaybookChecksFull {
			t.Fatalf("err = %v, want ErrPlaybookChecksFull", err)
		}
		// An item that is already stored can still be repeated, and unchecking still frees room.
		if err := repo.Set(ctx, tenantB.ID, "pilar-1-alumni", "0:full0", true, nil); err != nil {
			t.Fatalf("repeat on a full page: %v", err)
		}
		if err := repo.Set(ctx, tenantB.ID, "pilar-1-alumni", "0:full0", false, nil); err != nil {
			t.Fatal(err)
		}
		if err := repo.Set(ctx, tenantB.ID, "pilar-1-alumni", "9:over", true, nil); err != nil {
			t.Fatalf("after freeing room: %v", err)
		}
	})
}
