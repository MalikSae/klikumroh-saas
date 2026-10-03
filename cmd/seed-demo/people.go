package main

import (
	"fmt"
	"math/rand"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Generated people and activity for the demo travel. Names are made-up Indonesian combinations, phone
// numbers use the non-mobile 0800 range (no WhatsApp account can exist there). The first agent is the
// shared demo login for the agent portal and one of the most active agents.

var (
	firstMale   = []string{"Ahmad", "Muhammad", "Abdul", "Agus", "Andi", "Arif", "Bambang", "Dedi", "Eko", "Fajar", "Hadi", "Hendra", "Irwan", "Lukman", "Rahmat", "Rizki", "Slamet", "Taufik", "Wahyu", "Yusuf", "Zaenal", "Ilham", "Iqbal", "Hasan", "Umar", "Faisal", "Gunawan", "Haris", "Nanang", "Ujang", "Asep", "Dadang", "Cecep", "Mulyadi"}
	firstFemale = []string{"Siti", "Nur", "Dewi", "Sri", "Fitri", "Rina", "Ratna", "Yuni", "Lina", "Ani", "Wati", "Aisyah", "Fatimah", "Khadijah", "Nurul", "Hj. Aminah", "Euis", "Neneng", "Iis", "Tuti", "Ernawati", "Halimah", "Rohmah", "Maryam", "Zulaikha", "Dian", "Indah", "Sari", "Wulan", "Laila"}
	lastNames   = []string{"Santoso", "Hidayat", "Saputra", "Rahman", "Kurniawan", "Setiawan", "Nugroho", "Wibowo", "Pratama", "Hakim", "Fauzi", "Hasanah", "Lestari", "Rahmawati", "Wulandari", "Kartika", "Suryani", "Maulana", "Firmansyah", "Ramadhan", "Sulaiman", "Syahputra", "Hermawan", "Mulyani", "Permana", "Sudrajat", "Supriatna", "Gunadi", "Iskandar", "Anwar", "Basri", "Zakaria", "Nasution", "Siregar", "Hutagalung"}
	cities      = []string{"Kota Bandung", "Kabupaten Bandung", "Kota Cimahi", "Kabupaten Garut", "Kota Tasikmalaya", "Kabupaten Cirebon", "Kota Cirebon", "Kabupaten Sumedang", "Kota Bekasi", "Kota Bogor", "Kabupaten Karawang", "Kabupaten Subang", "Kabupaten Purwakarta", "Kota Sukabumi", "Kabupaten Indramayu", "Kota Depok", "Kabupaten Majalengka", "Kabupaten Kuningan"}
	banks       = []string{"BSI", "BRI", "BCA", "Mandiri", "BNI", "Bank Muamalat", "BJB"}
	lostReasons = [][2]string{
		{"harga", "Mencari paket di bawah 28 juta"}, {"harga", "Merasa harga plus Turki terlalu mahal"},
		{"jadwal", "Ingin berangkat saat libur sekolah"}, {"jadwal", "Menunggu jadwal cuti kantor"},
		{"dana", "Menabung dulu, rencana tahun depan"}, {"dana", "Menunggu hasil panen"},
		{"travel_lain", "Sudah daftar lewat travel kantor"}, {"travel_lain", "Ikut rombongan majelis taklim"},
		{"tidak_respons", "Tidak membalas WhatsApp setelah 3 kali dihubungi"}, {"lainnya", "Orang tua sedang sakit"},
	}
	notes = []string{
		"Sudah dikirim brosur dan rincian harga via WhatsApp.", "Minta jadwal manasik, akan dikabari minggu depan.",
		"Tanya soal cicilan, dijelaskan skema DP 5 juta.", "Berangkat bersama istri dan ibu mertua.",
		"Minta kamar quad, sudah dicek ketersediaannya.", "Paspor masih dalam proses pembuatan.",
		"Rencana transfer DP akhir bulan setelah gajian.", "Sudah ikut kajian umroh di masjid, tertarik paket Ramadhan.",
		"Tanya hotel dekat Masjidil Haram, sudah dikirim foto hotel.", "Minta dihubungi lagi setelah Jumat.",
	}
	campaigns = []string{"umroh-akhir-tahun", "umroh-ramadhan-2027", "umroh-plus-turki"}
)

// demoPhoneNormalized is a number in the non-mobile 0800 range, in wa.me form (62...).
func demoPhoneNormalized(n int) string { return fmt.Sprintf("628001%06d", n) }
func demoPhone(n int) string           { return fmt.Sprintf("08001%06d", n) }

type demoAgent struct {
	id     uint64
	name   string
	level  string // high, mid, low, none
	status string
}

func (s *seeder) people() error {
	rng := rand.New(rand.NewSource(20261003))
	pick := func(list []string) string { return list[rng.Intn(len(list))] }
	between := func(lo, hi int) int { return lo + rng.Intn(hi-lo+1) }
	chance := func(p float64) bool { return rng.Float64() < p }
	used := map[string]bool{"Joko Bowo": true}
	name := func() string {
		for {
			first := firstMale
			if chance(0.5) {
				first = firstFemale
			}
			n := pick(first) + " " + pick(lastNames)
			if !used[n] {
				used[n] = true
				return n
			}
		}
	}
	phoneSeq := 100
	nextPhone := func() (string, string) {
		phoneSeq++
		return demoPhone(phoneSeq), demoPhoneNormalized(phoneSeq)
	}
	slug := func(n string) string {
		return strings.Trim(strings.Map(func(r rune) rune {
			if r >= 'a' && r <= 'z' {
				return r
			}
			return '.'
		}, strings.ToLower(n)), ".")
	}

	// ---- Agents: the demo login first, then 7 more high, 12 mid, 12 low, 4 inactive, 4 pending ----
	levels := []string{"high"}
	for i := 0; i < 7; i++ {
		levels = append(levels, "high")
	}
	for i := 0; i < 12; i++ {
		levels = append(levels, "mid")
	}
	for i := 0; i < 12; i++ {
		levels = append(levels, "low")
	}
	for i := 0; i < 4; i++ {
		levels = append(levels, "inactive")
	}
	for i := 0; i < 4; i++ {
		levels = append(levels, "pending")
	}

	agentHash, err := bcrypt.GenerateFromPassword([]byte(s.cfg.agentPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	var agents []*demoAgent
	for i, lvl := range levels {
		a := &demoAgent{level: lvl, status: "active"}
		switch lvl {
		case "inactive":
			a.status, a.level = "inactive", "none"
		case "pending":
			a.status, a.level = "pending", "none"
		}
		ph, phn := nextPhone()
		joined := between(35, 240)
		if a.status == "pending" {
			joined = between(1, 6)
		}
		var email, hash, photo interface{}
		if i == 0 {
			a.name = "Joko Bowo"
			email, hash = s.cfg.agentEmail, string(agentHash)
			photo = s.image(s.fx.AgentPhoto)
		} else {
			a.name = name()
			email = slug(a.name) + "@demo.klikumroh.id"
		}
		var parent interface{}
		if i >= 12 && i < 20 {
			parent = agents[between(0, 7)].id
		}
		code := fmt.Sprintf("DM%04d%c", 1000+i, 'A'+rune(i%26))
		bank := pick(banks)
		id, err := s.exec(`INSERT INTO agents (tenant_id, name, phone, email, password_hash, domisili, photo_url, payment_status, terms_accepted_at,
				bank_name, bank_account_number, bank_account_holder, referral_code, status, parent_agent_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'not_applicable', DATE_SUB(NOW(), INTERVAL ? DAY), ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY))`,
			s.tenantID, a.name, ph, email, hash, pick(cities), photo, joined, bank, fmt.Sprintf("%010d", rng.Int63n(9000000000)+1000000000), a.name, code, a.status, parent, joined, joined)
		if err != nil {
			return err
		}
		_ = phn
		a.id = id
		agents = append(agents, a)
	}
	s.agentCount = len(agents)
	// The demo agent's photo lives under agents/<id>/photo.webp like a real upload.
	if s.fx.AgentPhoto != nil {
		rel := fmt.Sprintf("agents/%d/photo.webp", agents[0].id)
		s.images[*s.fx.AgentPhoto] = rel
		if _, err := s.exec("UPDATE agents SET photo_url = ? WHERE id = ?", fmt.Sprintf("/uploads/%d/%s", s.tenantID, rel), agents[0].id); err != nil {
			return err
		}
	}

	var weighted []*demoAgent
	for _, a := range agents {
		w := map[string]int{"high": 9, "mid": 3, "low": 1}[a.level]
		for k := 0; k < w; k++ {
			weighted = append(weighted, a)
		}
	}

	// ---- Prospects with history, notes, commissions and the click that brought them ----
	flow := []string{"baru", "dihubungi", "tertarik", "closing"}
	released := map[*demoAgent]float64{}
	addProspect := func(daysAgo int) error {
		s.prospectCount++
		r := rng.Float64()
		channel := "agen"
		if r >= 0.55 && r < 0.8 {
			channel = "organik"
		} else if r >= 0.8 {
			channel = "paid"
		}
		var agent *demoAgent
		if channel == "agen" {
			agent = weighted[rng.Intn(len(weighted))]
		}
		var pkg *seededPackage
		if chance(0.9) && len(s.packages) > 0 {
			pkg = &s.packages[rng.Intn(len(s.packages))]
		}
		jamaah := []int{1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5}[rng.Intn(11)]
		created := daysAgo*1440 + between(0, 1300)
		age := float64(daysAgo) / 60
		x := rng.Float64()
		status := "tidak_lanjut"
		switch {
		case daysAgo <= 1 && x < 0.8:
			status = "baru"
		case daysAgo <= 1:
			status = "dihubungi"
		case x < 0.14-age*0.08:
			status = "baru"
		case x < 0.36-age*0.1:
			status = "dihubungi"
		case x < 0.56-age*0.1:
			status = "tertarik"
		case x < 0.8:
			status = "closing"
		}
		if status == "closing" && pkg == nil {
			status = "tertarik"
		}
		var lostCat, lostText, plan, utmSource, utmMedium, utmCampaign, pkgID, agentID interface{}
		if status == "tidak_lanjut" {
			l := lostReasons[rng.Intn(len(lostReasons))]
			lostCat, lostText = l[0], l[1]
		}
		if pkg == nil {
			plan = []string{"2026-12", "2027-01", "2027-02", "2027-03", "2027-06"}[rng.Intn(5)]
		} else {
			pkgID = pkg.id
		}
		if channel == "paid" {
			utmSource, utmMedium, utmCampaign = "facebook", "paid_social", pick(campaigns)
		}
		entry := "web_form"
		if agent != nil {
			agentID = agent.id
			if chance(0.25) {
				entry = "agent_manual"
			}
		}
		pname := name()
		ph, phn := nextPhone()
		pid, err := s.exec(`INSERT INTO prospects (tenant_id, package_id, agent_id, name, phone, phone_normalized, jumlah_jamaah, departure_plan, domicile, email,
				source_channel, entry_method, utm_source, utm_medium, utm_campaign, consent_at, status, lost_reason, lost_reason_category, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
			s.tenantID, pkgID, agentID, pname, ph, phn, jamaah, plan, pick(cities), fmt.Sprintf("%s.%d@demo.klikumroh.id", slug(pname), s.prospectCount),
			channel, entry, utmSource, utmMedium, utmCampaign, created, status, lostText, lostCat, created, max(5, created-600))
		if err != nil {
			return err
		}

		byType, byID := "admin", uint64(0)
		if agent != nil && chance(0.7) {
			byType, byID = "agent", agent.id
		}
		target := status
		if status == "tidak_lanjut" {
			target = flow[between(1, 2)]
		}
		steps := 0
		for i, st := range flow {
			if st == target {
				steps = i
			}
		}
		t, prev := created, "baru"
		for _, st := range flow[1 : steps+1] {
			t = max(3, t-between(60, max(120, created/(steps+1))))
			if _, err := s.exec("INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at) VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))",
				s.tenantID, pid, byType, byID, prev, st, t); err != nil {
				return err
			}
			prev = st
		}
		if status == "tidak_lanjut" {
			t = max(2, t-between(60, 2000))
			if _, err := s.exec("INSERT INTO prospect_status_history (tenant_id, prospect_id, changed_by_type, changed_by_id, old_status, new_status, changed_at) VALUES (?, ?, ?, ?, ?, 'tidak_lanjut', DATE_SUB(NOW(), INTERVAL ? MINUTE))",
				s.tenantID, pid, byType, byID, prev, t); err != nil {
				return err
			}
		}
		if status != "baru" && chance(0.45) {
			nType, nID := "admin", uint64(0)
			if agent != nil && chance(0.6) {
				nType, nID = "agent", agent.id
			}
			if _, err := s.exec("INSERT INTO prospect_notes (tenant_id, prospect_id, author_type, author_id, note_text, created_at) VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))",
				s.tenantID, pid, nType, nID, notes[rng.Intn(len(notes))], max(2, t+between(10, 300))); err != nil {
				return err
			}
		}
		if status == "closing" {
			paid := daysAgo > 10 && chance(0.7)
			if paid {
				if _, err := s.exec("UPDATE prospects SET paid_off_at = DATE_SUB(NOW(), INTERVAL ? MINUTE) WHERE id = ?", max(1, t-between(600, 9000)), pid); err != nil {
					return err
				}
			}
			if agent != nil && pkg != nil && pkg.commission > 0 {
				amount := pkg.commission * float64(jamaah)
				var rel interface{}
				if paid {
					rel = "1"
				}
				if _, err := s.exec(`INSERT INTO commission_ledger (tenant_id, agent_id, prospect_id, package_id, type, amount, notes, released_at, created_at)
					VALUES (?, ?, ?, ?, 'direct', ?, ?, IF(? IS NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)), DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
					s.tenantID, agent.id, pid, pkg.id, amount, fmt.Sprintf("Komisi closing %d jamaah", jamaah), rel, t); err != nil {
					return err
				}
				if paid {
					released[agent] += amount
				}
			}
		}
		if agent != nil {
			if _, err := s.exec("INSERT INTO referral_clicks (tenant_id, agent_id, prospect_id, clicked_at, ip_address) VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), ?)",
				s.tenantID, agent.id, pid, created+between(1, 30), fmt.Sprintf("36.7%d.%d.%d", rng.Intn(10), between(1, 254), between(1, 254))); err != nil {
				return err
			}
		}
		return nil
	}
	for d := 0; d < 60; d++ {
		n := between(2, 5)
		if d < 30 {
			n = between(4, 8)
		}
		for k := 0; k < n; k++ {
			if err := addProspect(d); err != nil {
				return err
			}
		}
	}
	for k := 0; k < 40; k++ {
		if err := addProspect(between(61, 150)); err != nil {
			return err
		}
	}

	// ---- Link clicks without a prospect, daily syiar, badges ----
	habitKeys := []string{"share", "contact", "caption", "sumber"}
	for _, a := range agents {
		if a.status != "active" {
			continue
		}
		clicks := map[string][2]int{"high": {40, 90}, "mid": {12, 35}, "low": {0, 8}}[a.level]
		for k := between(clicks[0], clicks[1]); k > 0; k-- {
			if _, err := s.exec("INSERT INTO referral_clicks (tenant_id, agent_id, clicked_at, ip_address) VALUES (?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), ?)",
				s.tenantID, a.id, between(10, 30*1440), fmt.Sprintf("114.1%d.%d.%d", rng.Intn(10), between(1, 254), between(1, 254))); err != nil {
				return err
			}
		}
		pDay := map[string]float64{"high": 0.85, "mid": 0.45, "low": 0.12}[a.level]
		streak, best := 0, 0
		for d := 40; d >= 0; d-- {
			activeDay := false
			if chance(pDay) {
				done := 0
				for _, k := range habitKeys {
					p := 0.6
					if a.level == "high" {
						p = 0.85
					}
					if chance(p) {
						done++
						if _, err := s.exec("INSERT IGNORE INTO agent_habit_logs (tenant_id, agent_id, habit_key, log_date) VALUES (?, ?, ?, DATE_SUB(CURDATE(), INTERVAL ? DAY))",
							s.tenantID, a.id, k, d); err != nil {
							return err
						}
					}
				}
				activeDay = done >= 3
			}
			if activeDay {
				streak++
			} else {
				streak = 0
			}
			best = max(best, streak)
		}
		for _, m := range []int{7, 30} {
			if best >= m {
				if _, err := s.exec("INSERT IGNORE INTO agent_habit_badges (tenant_id, agent_id, days, achieved_at) VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))",
					s.tenantID, a.id, m, between(1, 20)); err != nil {
					return err
				}
			}
		}
	}

	// ---- Payout requests from agents with released commission ----
	for _, a := range agents {
		amount := released[a]
		if amount < 1000000 {
			continue
		}
		half := float64(int(amount/2/100000) * 100000)
		if _, err := s.exec(`INSERT INTO commission_payout_requests (tenant_id, agent_id, amount_requested, status, bank_name_snapshot, bank_account_number_snapshot,
				bank_account_holder_snapshot, reviewed_at, created_at, updated_at)
			SELECT tenant_id, id, ?, 'paid', bank_name, bank_account_number, bank_account_holder, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY)
			FROM agents WHERE tenant_id = ? AND id = ?`, half, between(3, 20), between(21, 40), between(1, 20), s.tenantID, a.id); err != nil {
			return err
		}
		if chance(0.5) {
			st := []string{"pending", "pending", "approved", "rejected"}[rng.Intn(4)]
			rest := float64(max(500000, int((amount-half)/2/100000)*100000))
			var reason interface{}
			if st == "rejected" {
				reason = "Nama pemilik rekening berbeda dengan nama agen"
			}
			if _, err := s.exec(`INSERT INTO commission_payout_requests (tenant_id, agent_id, amount_requested, status, bank_name_snapshot, bank_account_number_snapshot,
					bank_account_holder_snapshot, rejection_reason, created_at, updated_at)
				SELECT tenant_id, id, ?, ?, bank_name, bank_account_number, bank_account_holder, ?, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY)
				FROM agents WHERE tenant_id = ? AND id = ?`, rest, st, reason, between(1, 5), between(0, 1), s.tenantID, a.id); err != nil {
				return err
			}
		}
	}
	return nil
}
