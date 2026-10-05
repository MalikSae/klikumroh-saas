// Command seed-demo builds the demo travel shown at demo.klikumroh.id (3 Oct 2026).
//
// It creates one tenant marked is_demo = 1 from demo/fixtures.json and demo/assets (profile, packages,
// banners, testimonials, FAQ and their images, exported from the local "Mabrur Tours" setup), plus a
// generated agent network with prospects, commissions, payouts and daily syiar activity. Every date is
// relative to the moment it runs, so a nightly `--reset` keeps the demo looking current and wipes what
// visitors changed.
//
//	go run ./cmd/seed-demo           create the demo travel (refuses if it already exists)
//	go run ./cmd/seed-demo --reset   delete the demo travel and build it again (cron, nightly)
//
// Environment (read from .env when present):
//
//	DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME  database
//	DEMO_SLUG          tenant slug, default "demo" (site: <slug>.<DEMO_ROOT_DOMAIN>)
//	DEMO_ROOT_DOMAIN   default "klikumroh.id"
//	DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD   shared dashboard login (required)
//	DEMO_AGENT_EMAIL, DEMO_AGENT_PASSWORD   shared agent portal login (required)
//	UPLOADS_DIR        default "./uploads" (the API's working directory)
//
// Safety: it only ever deletes a tenant whose is_demo flag is set; an existing non-demo tenant with the
// same slug stops it. The credentials are never printed.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"klikumroh/internal/repository"
)

type fixtures struct {
	Tenant       map[string]interface{} `json:"tenant"`
	Packages     []fixturePackage       `json:"packages"`
	Banners      []fixtureBanner        `json:"banners"`
	Testimonials []fixtureTestimonial   `json:"testimonials"`
	FAQs         []fixtureFAQ           `json:"faqs"`
	AgentPhoto   *string                `json:"agent_photo"`
}

type fixturePackage struct {
	Name               string   `json:"name"`
	Description        *string  `json:"description"`
	Price              *float64 `json:"price"`
	DepartureOffset    *int     `json:"departure_offset_days"`
	Quota              *int     `json:"quota"`
	Itinerary          *string  `json:"itinerary"`
	FacilitiesIncluded *string  `json:"facilities_included"`
	FacilitiesExcluded *string  `json:"facilities_excluded"`
	HotelInfo          *string  `json:"hotel_info"`
	FlightInfo         *string  `json:"flight_info"`
	TermsConditions    *string  `json:"terms_conditions"`
	CommissionAmount   *float64 `json:"commission_amount"`
	Photos             []string `json:"photos"`
}

type fixtureBanner struct {
	Title        string  `json:"title"`
	Subtitle     *string `json:"subtitle"`
	Image        *string `json:"image"`
	CTAPackage   *int    `json:"cta_package"`
	CTAURL       *string `json:"cta_url"`
	DisplayOrder int     `json:"display_order"`
	IsActive     int     `json:"is_active"`
}

type fixtureTestimonial struct {
	Name         string  `json:"name"`
	PackageName  *string `json:"package_name"`
	Rating       int     `json:"rating"`
	Quote        string  `json:"quote"`
	Avatar       *string `json:"avatar"`
	DisplayOrder int     `json:"display_order"`
	IsActive     int     `json:"is_active"`
}

type fixtureFAQ struct {
	Question     string `json:"question"`
	Answer       string `json:"answer"`
	DisplayOrder int    `json:"display_order"`
	IsActive     int    `json:"is_active"`
}

type config struct {
	slug, rootDomain, uploads, fixtures, assets string
	adminEmail, adminPassword                   string
	agentEmail, agentPassword                   string
}

func main() {
	reset := flag.Bool("reset", false, "delete the existing demo travel and build it again")
	fixturesPath := flag.String("fixtures", "demo/fixtures.json", "fixtures file")
	assetsDir := flag.String("assets", "demo/assets", "fixture images")
	flag.Parse()

	_ = godotenv.Load()
	cfg := config{
		slug:          envOr("DEMO_SLUG", "demo"),
		rootDomain:    envOr("DEMO_ROOT_DOMAIN", "klikumroh.id"),
		uploads:       envOr("UPLOADS_DIR", "./uploads"),
		fixtures:      *fixturesPath,
		assets:        *assetsDir,
		adminEmail:    strings.TrimSpace(os.Getenv("DEMO_ADMIN_EMAIL")),
		adminPassword: os.Getenv("DEMO_ADMIN_PASSWORD"),
		agentEmail:    strings.TrimSpace(os.Getenv("DEMO_AGENT_EMAIL")),
		agentPassword: os.Getenv("DEMO_AGENT_PASSWORD"),
	}
	if cfg.adminEmail == "" || cfg.adminPassword == "" || cfg.agentEmail == "" || cfg.agentPassword == "" {
		log.Fatal("DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_AGENT_EMAIL and DEMO_AGENT_PASSWORD must be set")
	}
	if len(cfg.adminPassword) < 8 || len(cfg.agentPassword) < 8 {
		log.Fatal("demo passwords must be at least 8 characters")
	}

	raw, err := os.ReadFile(cfg.fixtures)
	if err != nil {
		log.Fatalf("read fixtures: %v", err)
	}
	var fx fixtures
	if err := json.Unmarshal(raw, &fx); err != nil {
		log.Fatalf("parse fixtures: %v", err)
	}

	port := envOr("DB_PORT", "3306")
	db, err := sql.Open("mysql", repository.MySQLDSN(os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_HOST"), port, os.Getenv("DB_NAME")))
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()
	ctx := context.Background()

	// Existing tenant with this slug: only a demo tenant may be replaced, and only with --reset.
	var existingID uint64
	var existingDemo bool
	err = db.QueryRowContext(ctx, "SELECT id, is_demo FROM tenants WHERE slug = ?", cfg.slug).Scan(&existingID, &existingDemo)
	switch {
	case err == sql.ErrNoRows:
	case err != nil:
		log.Fatalf("look up slug: %v", err)
	case !existingDemo:
		log.Fatalf("slug %q belongs to a real travel (is_demo = 0): stopped, nothing changed", cfg.slug)
	case !*reset:
		log.Fatalf("demo travel %q already exists (id %d); run with --reset to rebuild it", cfg.slug, existingID)
	default:
		if err := deleteDemoTenant(ctx, db, existingID, cfg.uploads); err != nil {
			log.Fatalf("delete old demo travel: %v", err)
		}
		log.Printf("old demo travel %d removed", existingID)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Fatalf("begin: %v", err)
	}
	s := &seeder{ctx: ctx, tx: tx, cfg: cfg, fx: fx}
	if err := s.run(); err != nil {
		_ = tx.Rollback()
		log.Fatalf("seed: %v", err)
	}
	if err := tx.Commit(); err != nil {
		log.Fatalf("commit: %v", err)
	}
	if err := s.copyAssets(); err != nil {
		log.Fatalf("copy images: %v", err)
	}
	log.Printf("demo travel ready: tenant %d at %s.%s (%d agents, %d prospects)", s.tenantID, cfg.slug, cfg.rootDomain, s.agentCount, s.prospectCount)
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// deleteDemoTenant removes a demo tenant and everything under it. Tables without ON DELETE CASCADE are
// cleared first, children before parents. Only called for a tenant whose is_demo flag was checked.
func deleteDemoTenant(ctx context.Context, db *sql.DB, tenantID uint64, uploads string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	stmts := []string{
		"DELETE FROM referral_clicks WHERE tenant_id = ?",
		"DELETE FROM commission_ledger WHERE tenant_id = ?",
		"DELETE r FROM event_rsvps r JOIN agent_events e ON e.id = r.event_id WHERE e.tenant_id = ?",
		"DELETE FROM agent_events WHERE tenant_id = ?",
		"DELETE FROM prospects WHERE tenant_id = ?",
		"UPDATE agents SET parent_agent_id = NULL WHERE tenant_id = ?",
		"DELETE FROM agents WHERE tenant_id = ?",
		"DELETE FROM packages WHERE tenant_id = ?",
		"DELETE FROM sessions WHERE tenant_id = ?",
		"DELETE FROM access_logs WHERE tenant_id = ?",
		"DELETE FROM admin_users WHERE tenant_id = ?",
		"DELETE FROM domains WHERE tenant_id = ?",
		"DELETE FROM tenants WHERE id = ? AND is_demo = 1",
	}
	for _, q := range stmts {
		if _, err := tx.ExecContext(ctx, q, tenantID); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("%s: %w", q, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return os.RemoveAll(filepath.Join(uploads, fmt.Sprintf("%d", tenantID)))
}

type seeder struct {
	ctx      context.Context
	tx       *sql.Tx
	cfg      config
	fx       fixtures
	tenantID uint64
	// images to copy after commit: fixture path -> path under uploads/<tenant>/
	images        map[string]string
	packages      []seededPackage
	agentCount    int
	prospectCount int
}

type seededPackage struct {
	id         uint64
	price      float64
	commission float64
}

func (s *seeder) exec(q string, args ...interface{}) (uint64, error) {
	res, err := s.tx.ExecContext(s.ctx, q, args...)
	if err != nil {
		return 0, fmt.Errorf("%.80s: %w", q, err)
	}
	id, _ := res.LastInsertId()
	return uint64(id), nil
}

// image registers a fixture image and returns its public URL under the new tenant.
func (s *seeder) image(rel *string) interface{} {
	if rel == nil || *rel == "" {
		return nil
	}
	if s.images == nil {
		s.images = map[string]string{}
	}
	s.images[*rel] = *rel
	return fmt.Sprintf("/uploads/%d/%s", s.tenantID, *rel)
}

func str(m map[string]interface{}, k string) interface{} {
	if v, ok := m[k]; ok && v != nil {
		return v
	}
	return nil
}

func (s *seeder) run() error {
	t := s.fx.Tenant
	id, err := s.exec(`INSERT INTO tenants (name, slug, status, commission_scheme, subscription_expires_at, brand_primary_color,
			tagline, about_summary, ppiu_number, address, city, province, phone, email,
			trust_rating, trust_alumni_count, trust_guarantee, social_instagram, social_facebook, social_youtube,
			meta_title, meta_description, meta_keywords, commission_override_enabled, commission_override_percentage,
			agent_registration_fee, agent_registration_benefits, agent_terms_conditions, minimum_payout_amount,
			commission_release_on, whatsapp_number, is_demo)
		VALUES (?, ?, 'active', 'flat', DATE_ADD(NOW(), INTERVAL 10 YEAR), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
			COALESCE(?, 0), ?, ?, ?, ?, ?, COALESCE(?, 'lunas'), ?, 1)`,
		t["name"], s.cfg.slug, str(t, "brand_primary_color"),
		str(t, "tagline"), str(t, "about_summary"), str(t, "ppiu_number"), str(t, "address"), str(t, "city"), str(t, "province"), str(t, "phone"), str(t, "email"),
		str(t, "trust_rating"), str(t, "trust_alumni_count"), str(t, "trust_guarantee"), str(t, "social_instagram"), str(t, "social_facebook"), str(t, "social_youtube"),
		str(t, "meta_title"), str(t, "meta_description"), str(t, "meta_keywords"), str(t, "commission_override_enabled"), str(t, "commission_override_percentage"),
		str(t, "agent_registration_fee"), str(t, "agent_registration_benefits"), str(t, "agent_terms_conditions"), str(t, "minimum_payout_amount"),
		str(t, "commission_release_on"), demoPhoneNormalized(0))
	if err != nil {
		return err
	}
	s.tenantID = id

	logo, _ := t["brand_logo"].(string)
	icon, _ := t["brand_icon"].(string)
	if _, err := s.exec("UPDATE tenants SET brand_logo_url = ?, brand_icon_url = ? WHERE id = ?", s.image(&logo), s.image(&icon), id); err != nil {
		return err
	}
	if _, err := s.exec("INSERT INTO domains (tenant_id, hostname, type, status, verified_at) VALUES (?, ?, 'subdomain', 'active', NOW())",
		id, s.cfg.slug+"."+s.cfg.rootDomain); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(s.cfg.adminPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if _, err := s.exec("INSERT INTO admin_users (tenant_id, email, password_hash, name, status) VALUES (?, ?, ?, 'Admin Demo', 'active')",
		id, s.cfg.adminEmail, string(hash)); err != nil {
		return fmt.Errorf("demo admin (is DEMO_ADMIN_EMAIL already used by another travel?): %w", err)
	}

	if err := s.content(); err != nil {
		return err
	}
	return s.people()
}

// wib is the business time zone; dates the demo shows are WIB calendar dates.
var wib = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*60*60)
	}
	return loc
}()

func (s *seeder) content() error {
	for _, p := range s.fx.Packages {
		var dep interface{}
		if p.DepartureOffset != nil {
			// Counted from today's WIB date: the server has no TZ set, and a reset before 07:00 WIB
			// would otherwise start from yesterday's (UTC) date.
			dep = time.Now().In(wib).AddDate(0, 0, *p.DepartureOffset).Format("2006-01-02")
		}
		pid, err := s.exec(`INSERT INTO packages (tenant_id, name, description, price, departure_date, quota, status, itinerary,
				facilities_included, facilities_excluded, hotel_info, flight_info, terms_conditions, commission_amount)
			VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?)`,
			s.tenantID, p.Name, p.Description, p.Price, dep, p.Quota, p.Itinerary,
			p.FacilitiesIncluded, p.FacilitiesExcluded, p.HotelInfo, p.FlightInfo, p.TermsConditions, p.CommissionAmount)
		if err != nil {
			return err
		}
		sp := seededPackage{id: pid}
		if p.Price != nil {
			sp.price = *p.Price
		}
		if p.CommissionAmount != nil {
			sp.commission = *p.CommissionAmount
		}
		s.packages = append(s.packages, sp)
		for i, ph := range p.Photos {
			// Package photos live under packages/<package id>/ like uploads from the dashboard.
			rel := fmt.Sprintf("packages/%d/%s", pid, filepath.Base(ph))
			if s.images == nil {
				s.images = map[string]string{}
			}
			s.images[ph] = rel
			if _, err := s.exec("INSERT INTO package_photos (tenant_id, package_id, file_path, sort_order) VALUES (?, ?, ?, ?)",
				s.tenantID, pid, fmt.Sprintf("/uploads/%d/%s", s.tenantID, rel), i+1); err != nil {
				return err
			}
		}
	}
	for _, b := range s.fx.Banners {
		cta := b.CTAURL
		if b.CTAPackage != nil && *b.CTAPackage < len(s.packages) {
			u := fmt.Sprintf("/paket/%d", s.packages[*b.CTAPackage].id)
			cta = &u
		}
		if _, err := s.exec("INSERT INTO tenant_banners (tenant_id, title, image_url, subtitle, cta_url, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
			s.tenantID, b.Title, s.image(b.Image), b.Subtitle, cta, b.DisplayOrder, b.IsActive); err != nil {
			return err
		}
	}
	for _, t := range s.fx.Testimonials {
		if _, err := s.exec("INSERT INTO tenant_testimonials (tenant_id, name, package_name, rating, quote, avatar_url, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			s.tenantID, t.Name, t.PackageName, t.Rating, t.Quote, s.image(t.Avatar), t.DisplayOrder, t.IsActive); err != nil {
			return err
		}
	}
	for _, f := range s.fx.FAQs {
		if _, err := s.exec("INSERT INTO tenant_faqs (tenant_id, question, answer, display_order, is_active) VALUES (?, ?, ?, ?, ?)",
			s.tenantID, f.Question, f.Answer, f.DisplayOrder, f.IsActive); err != nil {
			return err
		}
	}
	return nil
}

// copyAssets copies the registered fixture images into uploads/<tenant>/ after the data is committed.
func (s *seeder) copyAssets() error {
	for src, rel := range s.images {
		from := filepath.Join(s.cfg.assets, filepath.FromSlash(src))
		to := filepath.Join(s.cfg.uploads, fmt.Sprintf("%d", s.tenantID), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(to), 0o755); err != nil {
			return err
		}
		in, err := os.Open(from)
		if err != nil {
			return err
		}
		out, err := os.Create(to)
		if err != nil {
			in.Close()
			return err
		}
		_, err = io.Copy(out, in)
		in.Close()
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
	}
	return nil
}
