package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
)

func TestValidate(t *testing.T) {
	good := "kata-sandi-kuat-123"
	cases := []struct {
		name, email, display, role, password string
		wantEmpty                            bool
	}{
		{"ok", "owner@klikumroh.id", "Nama Pendiri", "owner", good, true},
		{"admin role ok", "a@b.co", "Ab", "admin", good, true},
		{"no email", "", "Nama", "owner", good, false},
		{"bad email", "bukan-email", "Nama", "owner", good, false},
		{"email with display name", "Nama <a@b.co>", "Nama", "owner", good, false},
		{"short name", "a@b.co", "A", "owner", good, false},
		{"bad role", "a@b.co", "Nama", "root", good, false},
		{"no password", "a@b.co", "Nama", "owner", "", false},
		{"short password", "a@b.co", "Nama", "owner", "pendek", false},
		{"11 chars", "a@b.co", "Nama", "owner", "sebelasaaaa", false},
		{"12 chars", "a@b.co", "Nama", "owner", "duabelasaaaa", true},
		{"padded password", "a@b.co", "Nama", "owner", " " + good, false},
		{"too long for bcrypt", "a@b.co", "Nama", "owner", strings.Repeat("x", 73), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			msg := validate(c.email, c.display, c.role, c.password)
			if (msg == "") != c.wantEmpty {
				t.Fatalf("validate(%q) message = %q, wantEmpty %v", c.name, msg, c.wantEmpty)
			}
		})
	}
}

// create writes a hashed password, refuses an existing email and never overwrites it. The row it makes is
// removed again when the test ends.
func TestCreate_StoresHashAndRefusesDuplicate(t *testing.T) {
	_ = godotenv.Load(filepath.Join("..", "..", ".env"))
	if os.Getenv("DB_HOST") == "" || os.Getenv("DB_USER") == "" || os.Getenv("DB_NAME") == "" {
		t.Skip("database configuration not found in .env")
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "3306"
	}
	db, err := sql.Open("mysql", repository.MySQLDSN(os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_HOST"), port, os.Getenv("DB_NAME")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Ping(); err != nil {
		t.Skipf("database not reachable: %v", err)
	}

	ctx := context.Background()
	repo := repository.NewStaffRepository(db)
	email := fmt.Sprintf("create-staff-test-%d@test.local", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM staff_users WHERE email = ?`, email) })

	const password = "kata-sandi-kuat-123"
	staff, err := create(ctx, repo, email, "Staf Uji", repository.StaffRoleOwner, password)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	stored, err := repo.FindByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	if stored.ID != staff.ID || stored.Role != repository.StaffRoleOwner || stored.Status != "active" {
		t.Fatalf("stored account: %+v", stored)
	}
	if stored.PasswordHash == password || bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte(password)) != nil {
		t.Fatal("the password must be stored as a bcrypt hash that matches")
	}

	hashBefore := stored.PasswordHash
	if _, err := create(ctx, repo, email, "Staf Uji 2", repository.StaffRoleAdmin, "kata-sandi-lain-456"); err == nil {
		t.Fatal("a second create with the same email must be refused")
	}
	again, _ := repo.FindByEmail(ctx, email)
	if again.PasswordHash != hashBefore || again.Name != "Staf Uji" {
		t.Fatal("the existing account must be left unchanged")
	}
}
