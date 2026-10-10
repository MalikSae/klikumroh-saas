// create-staff creates one KlikUmroh staff (super admin) account. It is the production way to get the first
// login to /internal/login: cmd/seed also creates test travels and plans and must not be used there.
//
//	CREATE_STAFF_PASSWORD='<min 12 characters>' ./bin/klikumroh-create-staff -email owner@klikumroh.id -name "Nama Pendiri" -role owner
//
// The password is read from the environment, never from an argument (arguments show up in the process list)
// and is never printed. An existing email is refused: the command never overwrites or resets an account.
// Run it from the repository root (it reads .env for DB_*).
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/mail"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/joho/godotenv"

	"klikumroh/internal/repository"
	"klikumroh/internal/util"
)

const (
	minPasswordLength = 12
	// bcrypt only reads the first 72 bytes: a longer password would silently be cut.
	maxPasswordBytes = 72
)

// validate returns a message the operator can act on, or "" when the input can be used.
func validate(email, name, role, password string) string {
	if email == "" || name == "" {
		return "isi -email dan -name"
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email || !strings.Contains(email, ".") {
		return "email tidak valid"
	}
	if n := utf8.RuneCountInString(name); n < 2 || n > 100 {
		return "nama harus 2 sampai 100 karakter"
	}
	if role != repository.StaffRoleOwner && role != repository.StaffRoleAdmin {
		return "-role harus owner atau admin"
	}
	if password == "" {
		return "isi kata sandi lewat env CREATE_STAFF_PASSWORD"
	}
	if utf8.RuneCountInString(password) < minPasswordLength {
		return fmt.Sprintf("kata sandi minimal %d karakter", minPasswordLength)
	}
	if len(password) > maxPasswordBytes {
		return fmt.Sprintf("kata sandi maksimal %d byte", maxPasswordBytes)
	}
	if strings.TrimSpace(password) != password {
		return "kata sandi tidak boleh diawali atau diakhiri spasi"
	}
	return ""
}

// create stores the staff account. It refuses an email that already exists.
func create(ctx context.Context, repo repository.StaffRepository, email, name, role, password string) (*repository.StaffUser, error) {
	if msg := validate(email, name, role, password); msg != "" {
		return nil, errors.New(msg)
	}
	if existing, err := repo.FindByEmail(ctx, email); err == nil && existing != nil {
		return nil, fmt.Errorf("akun staf %s sudah ada (ID %d); perintah ini tidak mengubah akun yang sudah ada", email, existing.ID)
	} else if err != nil && !errors.Is(err, repository.ErrNotFound) {
		return nil, fmt.Errorf("gagal memeriksa email: %w", err)
	}
	hash, err := util.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("gagal meng-hash kata sandi: %w", err)
	}
	staff := &repository.StaffUser{Name: name, Email: email, PasswordHash: hash, Status: "active", Role: role}
	if err := repo.Create(ctx, staff); err != nil {
		return nil, fmt.Errorf("gagal menyimpan akun staf: %w", err)
	}
	return staff, nil
}

func main() {
	email := flag.String("email", "", "email login staf")
	name := flag.String("name", "", "nama staf")
	role := flag.String("role", repository.StaffRoleOwner, "owner atau admin (hanya label tampilan)")
	flag.Parse()

	if err := godotenv.Load(); err != nil {
		log.Println("Catatan: .env tidak ditemukan, memakai variabel environment sistem")
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "3306"
	}
	if os.Getenv("DB_HOST") == "" || os.Getenv("DB_USER") == "" || os.Getenv("DB_NAME") == "" {
		log.Fatal("DB_HOST, DB_USER, dan DB_NAME harus diisi (jalankan dari root repo agar .env terbaca)")
	}

	// Validate before touching the database so a typo does not need a connection.
	password := os.Getenv("CREATE_STAFF_PASSWORD")
	if msg := validate(strings.TrimSpace(strings.ToLower(*email)), strings.TrimSpace(*name), *role, password); msg != "" {
		log.Fatal(msg)
	}

	db, err := sql.Open("mysql", repository.MySQLDSN(os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_HOST"), port, os.Getenv("DB_NAME")))
	if err != nil {
		log.Fatalf("gagal membuka koneksi database: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("database tidak dapat dihubungi: %v", err)
	}

	staff, err := create(context.Background(), repository.NewStaffRepository(db), strings.TrimSpace(strings.ToLower(*email)), strings.TrimSpace(*name), *role, password)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Akun staf dibuat: %s (ID %d, peran %s). Login di /internal/login.\n", staff.Email, staff.ID, staff.Role)
	fmt.Println("Hapus CREATE_STAFF_PASSWORD dari riwayat shell bila diketik langsung di terminal.")
}
