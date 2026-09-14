package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

type tenantInfo struct {
	ID   uint64
	Name string
	Slug string
}

type agentSeed struct {
	ID            uint64
	Name          string
	Phone         string
	Email         string
	ReferralCode  string
	BankName      string
	AccountNo     string
	AccountHolder string
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	if dbPort == "" {
		dbPort = "3306"
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		dbUser, dbPassword, dbHost, dbPort, dbName,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Error opening db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// 1. Get real travel tenants (ignore temporary automated test tenants "Tenant %")
	rows, err := db.QueryContext(ctx, "SELECT id, name, slug FROM tenants WHERE (name LIKE '%Idris%' OR name LIKE '%Barakah%' OR name NOT LIKE 'Tenant %') ORDER BY CASE WHEN name LIKE '%Idris%' THEN 0 ELSE 1 END LIMIT 10")
	if err != nil {
		log.Fatalf("Failed to query tenants: %v", err)
	}
	defer rows.Close()

	var tenants []tenantInfo
	for rows.Next() {
		var t tenantInfo
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug); err != nil {
			log.Fatalf("Failed to scan tenant: %v", err)
		}
		tenants = append(tenants, t)
	}
	_ = rows.Close()

	if len(tenants) == 0 {
		log.Println("No active tenants found. Running default seed first...")
		return
	}

	fmt.Printf("Seeding rich dashboard dummy data for %d tenant(s)...\n\n", len(tenants))

	for _, t := range tenants {
		fmt.Printf("=== Processing Tenant: %s (ID: %d, Slug: %s) ===\n", t.Name, t.ID, t.Slug)
		seedTenantDashboardData(ctx, db, t)
	}

	fmt.Println("\n✅ All dashboard dummy data seeded successfully!")
}

func seedTenantDashboardData(ctx context.Context, db *sql.DB, t tenantInfo) {
	// A. Ensure Packages exist and obtain their IDs
	pkgQuery := `SELECT id, name, price FROM packages WHERE tenant_id = ? AND status = 'published'`
	pkgRows, err := db.QueryContext(ctx, pkgQuery, t.ID)
	if err != nil {
		log.Printf("Failed to query packages for tenant %d: %v", t.ID, err)
		return
	}
	defer pkgRows.Close()

	type pkgInfo struct {
		ID    uint64
		Name  string
		Price float64
	}
	var packages []pkgInfo
	for pkgRows.Next() {
		var p pkgInfo
		if err := pkgRows.Scan(&p.ID, &p.Name, &p.Price); err == nil {
			packages = append(packages, p)
		}
	}
	_ = pkgRows.Close()

	// If no published packages, create 3 realistic packages
	if len(packages) == 0 {
		depDate1 := time.Now().AddDate(0, 1, 15)
		depDate2 := time.Now().AddDate(0, 2, 20)
		depDate3 := time.Now().AddDate(0, 3, 10)

		res1, _ := db.ExecContext(ctx,
			`INSERT INTO packages (tenant_id, name, description, price, commission_amount, departure_date, quota, status) 
			 VALUES (?, 'Umroh Reguler Syawal 1448H (9 Hari)', 'Fasilitas bintang 4 dekat Masjidil Haram dan Nabawi.', 29500000, 500000, ?, 45, 'published')`,
			t.ID, depDate1)
		id1, _ := res1.LastInsertId()
		packages = append(packages, pkgInfo{ID: uint64(id1), Name: "Umroh Reguler Syawal 1448H (9 Hari)", Price: 29500000})

		res2, _ := db.ExecContext(ctx,
			`INSERT INTO packages (tenant_id, name, description, price, commission_amount, departure_date, quota, status) 
			 VALUES (?, 'Umroh VIP Bintang 5 Plus Kereta Cepat (12 Hari)', 'Hotel pelataran masjid plus kereta cepat Haramain.', 44900000, 1000000, ?, 30, 'published')`,
			t.ID, depDate2)
		id2, _ := res2.LastInsertId()
		packages = append(packages, pkgInfo{ID: uint64(id2), Name: "Umroh VIP Bintang 5 Plus Kereta Cepat (12 Hari)", Price: 44900000})

		res3, _ := db.ExecContext(ctx,
			`INSERT INTO packages (tenant_id, name, description, price, commission_amount, departure_date, quota, status) 
			 VALUES (?, 'Umroh Awal Musim Hemat (10 Hari)', 'Paket favorit keluarga dengan bimbingan manasik intensif.', 27500000, 500000, ?, 50, 'published')`,
			t.ID, depDate3)
		id3, _ := res3.LastInsertId()
		packages = append(packages, pkgInfo{ID: uint64(id3), Name: "Umroh Awal Musim Hemat (10 Hari)", Price: 27500000})

		fmt.Printf("  + Created 3 published packages for tenant %d\n", t.ID)
	}

	// B. Ensure Active Agents exist
	agentsData := []agentSeed{
		{Name: "Ustadz H. Salman Al-Farisi", Phone: "081288112233", Email: fmt.Sprintf("salman-%d@agent.id", t.ID), ReferralCode: fmt.Sprintf("SALMAN%d", t.ID), BankName: "BCA", AccountNo: "8820192831", AccountHolder: "H. Salman Al-Farisi"},
		{Name: "Hj. Maryam Zulaikha", Phone: "081399223344", Email: fmt.Sprintf("maryam-%d@agent.id", t.ID), ReferralCode: fmt.Sprintf("MARYAM%d", t.ID), BankName: "Bank Mandiri", AccountNo: "1370019283112", AccountHolder: "Hj. Maryam Zulaikha"},
		{Name: "dr. H. Rahmat Hidayat", Phone: "082155334455", Email: fmt.Sprintf("rahmat-%d@agent.id", t.ID), ReferralCode: fmt.Sprintf("RAHMAT%d", t.ID), BankName: "BRI", AccountNo: "01928371928301", AccountHolder: "dr. H. Rahmat Hidayat"},
		{Name: "Ahmad Fikri S.Kom", Phone: "085711445566", Email: fmt.Sprintf("fikri-%d@agent.id", t.ID), ReferralCode: fmt.Sprintf("FIKRI%d", t.ID), BankName: "BSI", AccountNo: "7182938192", AccountHolder: "Ahmad Fikri"},
	}

	var seededAgents []agentSeed
	for _, a := range agentsData {
		var existingID uint64
		err := db.QueryRowContext(ctx, "SELECT id FROM agents WHERE tenant_id = ? AND referral_code = ?", t.ID, a.ReferralCode).Scan(&existingID)
		if err == sql.ErrNoRows {
			res, err := db.ExecContext(ctx,
				`INSERT INTO agents (tenant_id, name, phone, email, referral_code, status, bank_name, bank_account_number, bank_account_holder)
				 VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
				t.ID, a.Name, a.Phone, a.Email, a.ReferralCode, a.BankName, a.AccountNo, a.AccountHolder,
			)
			if err == nil {
				newID, _ := res.LastInsertId()
				a.ID = uint64(newID)
				seededAgents = append(seededAgents, a)
			}
		} else if err == nil {
			a.ID = existingID
			seededAgents = append(seededAgents, a)
		}
	}
	fmt.Printf("  + Loaded %d active agent(s)\n", len(seededAgents))

	// C. Seed Referral Clicks for agents so leaderboard has click stats
	if len(seededAgents) > 0 {
		for idx, ag := range seededAgents {
			clickCount := (4 - idx) * 15 // 60, 45, 30, 15
			var existingClicks int
			_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM referral_clicks WHERE tenant_id = ? AND agent_id = ?", t.ID, ag.ID).Scan(&existingClicks)
			if existingClicks < clickCount {
				needed := clickCount - existingClicks
				for i := 0; i < needed; i++ {
					clickTime := time.Now().Add(-time.Duration(rand.Intn(14*24)) * time.Hour)
					_, _ = db.ExecContext(ctx,
						"INSERT INTO referral_clicks (tenant_id, agent_id, clicked_at, ip_address) VALUES (?, ?, ?, '127.0.0.1')",
						t.ID, ag.ID, clickTime,
					)
				}
			}
		}
		fmt.Println("  + Seeded referral clicks for agent leaderboard")
	}

	// D. Seed Payout Requests (1 Pending, 1 Paid)
	if len(seededAgents) > 0 {
		var pendingCount int
		_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM commission_payout_requests WHERE tenant_id = ? AND status = 'pending'", t.ID).Scan(&pendingCount)
		if pendingCount == 0 {
			firstAgent := seededAgents[0]
			_, _ = db.ExecContext(ctx,
				`INSERT INTO commission_payout_requests 
				 (tenant_id, agent_id, amount_requested, status, bank_name_snapshot, bank_account_number_snapshot, bank_account_holder_snapshot, created_at)
				 VALUES (?, ?, 1500000, 'pending', ?, ?, ?, ?)`,
				t.ID, firstAgent.ID, firstAgent.BankName, firstAgent.AccountNo, firstAgent.AccountHolder, time.Now().Add(-5*time.Hour),
			)
			fmt.Println("  + Seeded 1 pending payout request (Rp 1.500.000) for Priority Alert")
		}
	}

	// E. Seed Prospects (Wipe existing dummy test prospects for clean realistic representation if needed, or add)
	var prospectCount int
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM prospects WHERE tenant_id = ?", t.ID).Scan(&prospectCount)

	if prospectCount < 20 {
		fmt.Println("  + Seeding rich prospect scenarios (Urgent wait-time, Pipeline stages, Daily trends)...")

		// Helper to pick package
		getPkgID := func(i int) uint64 {
			if len(packages) == 0 {
				return 0
			}
			return packages[i%len(packages)].ID
		}

		type prospectScenario struct {
			Name         string
			Phone        string
			Status       string
			Channel      string // "organik", "paid", "agen"
			Jamaah       int
			AgentIdx     int
			TimeAgoHours int
			LostReason   string
		}

		scenarios := []prospectScenario{
			// 1. Baru & Urgent (> 2 jam) - Activates Priority Alert!
			{Name: "H. Bambang Sudarmono", Phone: "081288991234", Status: "baru", Channel: "paid", Jamaah: 2, AgentIdx: -1, TimeAgoHours: 4},
			{Name: "Hj. Ratna Wulandari", Phone: "081377889900", Status: "baru", Channel: "organik", Jamaah: 1, AgentIdx: -1, TimeAgoHours: 3},
			{Name: "dr. Irfan Hakim", Phone: "082155667788", Status: "baru", Channel: "agen", Jamaah: 3, AgentIdx: 0, TimeAgoHours: 5},

			// 2. Baru (Baru masuk < 1 jam)
			{Name: "Siti Rahmah", Phone: "081122334411", Status: "baru", Channel: "organik", Jamaah: 2, AgentIdx: -1, TimeAgoHours: 1},

			// 3. Dihubungi (Follow up in progress)
			{Name: "H. Syamsul Arifin", Phone: "085211223344", Status: "dihubungi", Channel: "paid", Jamaah: 2, AgentIdx: -1, TimeAgoHours: 20},
			{Name: "Endang Susilowati", Phone: "081933445566", Status: "dihubungi", Channel: "organik", Jamaah: 1, AgentIdx: -1, TimeAgoHours: 28},
			{Name: "Muhammad Yusuf", Phone: "081244556677", Status: "dihubungi", Channel: "agen", Jamaah: 4, AgentIdx: 1, TimeAgoHours: 36},

			// 4. Tertarik (Hot prospects)
			{Name: "dr. Hendra Kusuma", Phone: "081744556677", Status: "tertarik", Channel: "agen", Jamaah: 4, AgentIdx: 0, TimeAgoHours: 48},
			{Name: "Aisyah Nurdin", Phone: "081299887766", Status: "tertarik", Channel: "paid", Jamaah: 2, AgentIdx: -1, TimeAgoHours: 52},
			{Name: "Budi Santoso S.E.", Phone: "081322119988", Status: "tertarik", Channel: "organik", Jamaah: 1, AgentIdx: -1, TimeAgoHours: 60},

			// 5. Closing (Berhasil closing jamaah)
			{Name: "Ir. H. Dedi Supardi", Phone: "081122334455", Status: "closing", Channel: "agen", Jamaah: 2, AgentIdx: 0, TimeAgoHours: 72},
			{Name: "Hj. Sulastri Wardani", Phone: "081344556677", Status: "closing", Channel: "organik", Jamaah: 2, AgentIdx: -1, TimeAgoHours: 96},
			{Name: "Drs. Agus Gunawan", Phone: "081566778899", Status: "closing", Channel: "paid", Jamaah: 3, AgentIdx: -1, TimeAgoHours: 120},
			{Name: "Keluarga H. Mulyadi", Phone: "081233990011", Status: "closing", Channel: "agen", Jamaah: 4, AgentIdx: 1, TimeAgoHours: 144},
			{Name: "H. Ridwan Kamiludin", Phone: "081899001122", Status: "closing", Channel: "agen", Jamaah: 2, AgentIdx: 2, TimeAgoHours: 168},

			// 6. Tidak Lanjut (Lost Reasons)
			{Name: "Taufik Hidayat", Phone: "081877889900", Status: "tidak_lanjut", Channel: "organik", Jamaah: 2, AgentIdx: -1, TimeAgoHours: 180, LostReason: "Harga belum cocok dengan budget"},
			{Name: "Dewi Anggraini", Phone: "081233445566", Status: "tidak_lanjut", Channel: "paid", Jamaah: 1, AgentIdx: -1, TimeAgoHours: 200, LostReason: "Jadwal bentrok dengan pekerjaan"},
			{Name: "Farhan Maulana", Phone: "082211335577", Status: "tidak_lanjut", Channel: "agen", Jamaah: 2, AgentIdx: 3, TimeAgoHours: 220, LostReason: "Memilih travel lain"},
		}

		// Insert realistic scenarios
		for i, sc := range scenarios {
			createdAt := time.Now().Add(-time.Duration(sc.TimeAgoHours) * time.Hour)
			pkgID := getPkgID(i)

			var agentID sql.NullInt64
			if sc.AgentIdx >= 0 && sc.AgentIdx < len(seededAgents) {
				agentID = sql.NullInt64{Int64: int64(seededAgents[sc.AgentIdx].ID), Valid: true}
			}

			var lostReason sql.NullString
			if sc.LostReason != "" {
				lostReason = sql.NullString{String: sc.LostReason, Valid: true}
			}

			_, err := db.ExecContext(ctx,
				`INSERT INTO prospects (tenant_id, package_id, agent_id, name, phone, jumlah_jamaah, source_channel, status, lost_reason, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				t.ID, pkgID, agentID, sc.Name, sc.Phone, sc.Jamaah, sc.Channel, sc.Status, lostReason, createdAt, createdAt,
			)
			if err != nil {
				log.Printf("Failed to insert prospect %s: %v", sc.Name, err)
			}
		}

		// 7. Insert additional multi-day trend prospects across last 14 days
		channels := []string{"organik", "paid", "agen"}
		for d := 1; d <= 14; d++ {
			dayDate := time.Now().AddDate(0, 0, -d)
			// add 1-3 leads per day across channels
			for cIdx, ch := range channels {
				leadCount := ((d + cIdx) % 3) + 1
				for k := 0; k < leadCount; k++ {
					pTime := dayDate.Add(time.Duration(rand.Intn(18)+4) * time.Hour)
					name := fmt.Sprintf("Prospek %s Hari-%d #%d", ch, d, k+1)
					phone := fmt.Sprintf("0812%04d%04d", d, k*10+cIdx)

					var agID sql.NullInt64
					if ch == "agen" && len(seededAgents) > 0 {
						agID = sql.NullInt64{Int64: int64(seededAgents[k%len(seededAgents)].ID), Valid: true}
					}

					_, _ = db.ExecContext(ctx,
						`INSERT INTO prospects (tenant_id, package_id, agent_id, name, phone, jumlah_jamaah, source_channel, status, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, 1, ?, 'dihubungi', ?, ?)`,
						t.ID, getPkgID(d+k), agID, name, phone, ch, pTime, pTime,
					)
				}
			}
		}
		fmt.Println("  + Seeded 14-day trend multi-bar data successfully")
	} else {
		fmt.Printf("  Tenant %d already has %d prospects.\n", t.ID, prospectCount)
	}
}
