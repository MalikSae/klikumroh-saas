package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"klikumroh/internal/repository"
)

func TestAdminUserRole_DefaultUpdateAndIsolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	repo := repository.NewAdminUserRepository(db)

	a := createDummyTenant(t, ctx, tenantRepo, "roleA")
	b := createDummyTenant(t, ctx, tenantRepo, "roleB")
	stamp := time.Now().UnixNano()

	plain := &repository.AdminUser{Email: fmt.Sprintf("role-plain-%d@test.local", stamp), Name: "Plain", PasswordHash: "x"}
	if err := repo.Create(ctx, a.ID, plain); err != nil {
		t.Fatal(err)
	}
	if plain.Role != repository.RoleAdmin {
		t.Fatalf("empty role must default to admin, got %q", plain.Role)
	}
	pic := &repository.AdminUser{Email: fmt.Sprintf("role-pic-%d@test.local", stamp), Name: "Pic", PasswordHash: "x", Role: repository.RolePIC}
	if err := repo.Create(ctx, a.ID, pic); err != nil {
		t.Fatal(err)
	}

	t.Run("role is read back by GetByID, ListByTenant and FindByEmail", func(t *testing.T) {
		got, err := repo.GetByID(ctx, a.ID, pic.ID)
		if err != nil || got.Role != repository.RolePIC {
			t.Fatalf("GetByID: %+v %v", got, err)
		}
		list, err := repo.ListByTenant(ctx, a.ID)
		if err != nil || len(list) != 2 {
			t.Fatalf("ListByTenant: %d %v", len(list), err)
		}
		byEmail, err := repo.FindByEmail(ctx, pic.Email)
		if err != nil || byEmail.Role != repository.RolePIC {
			t.Fatalf("FindByEmail: %+v %v", byEmail, err)
		}
	})

	t.Run("Update without a role keeps the stored role", func(t *testing.T) {
		u, _ := repo.GetByID(ctx, a.ID, pic.ID)
		u.Role = ""
		u.Name = "Pic Renamed"
		if err := repo.Update(ctx, a.ID, u); err != nil {
			t.Fatal(err)
		}
		got, _ := repo.GetByID(ctx, a.ID, pic.ID)
		if got.Role != repository.RolePIC || got.Name != "Pic Renamed" {
			t.Fatalf("role or name wrong: %+v", got)
		}
	})

	t.Run("another tenant cannot read or change the member", func(t *testing.T) {
		if _, err := repo.GetByID(ctx, b.ID, pic.ID); err == nil {
			t.Fatal("tenant B read tenant A's member")
		}
		u, _ := repo.GetByID(ctx, a.ID, plain.ID)
		u.Role = repository.RolePIC
		if err := repo.Update(ctx, b.ID, u); err == nil {
			t.Fatal("tenant B updated tenant A's member")
		}
		got, _ := repo.GetByID(ctx, a.ID, plain.ID)
		if got.Role != repository.RoleAdmin {
			t.Fatalf("role leaked across tenants: %q", got.Role)
		}
	})
}
