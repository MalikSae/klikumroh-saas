# KlikUmroh.id 🕋

> **Platform SaaS Whitelabel Multi-Tenant untuk Travel Umroh & Haji di Indonesia**  
> Solusi percepatan lead generation, aktivasi pasukan agen/afiliasi, dan website travel umroh siap pakai dengan branding mandiri.

---

## 📌 Tentang Proyek

**KlikUmroh.id** adalah platform Software-as-a-Service (SaaS) multi-tenant yang dirancang khusus untuk biro travel umroh dan haji. Berbeda dengan sistem ERP operasional travel (manajemen visa, tiket, atau akuntansi), KlikUmroh berfokus murni pada **mesin pertumbuhan bisnis**: akuisisi jamaah baru, rekrutmen serta motivasi agen penjualan, dan otomatisasi komisi.

Setiap travel mitra (tenant) mendapatkan:
1. **Website Publik Whitelabel** dengan subdomain travel sendiri (misal: `amanah.klikumroh.id`) atau custom domain (`umroh.travelamanah.com`) dengan identitas visual mandiri.
2. **Dashboard Manajemen Travel** untuk mengelola paket, prospek jamaah, materi promosi, tim agen, dan pencairan komisi.
3. **Sistem Agen & Afiliasi Terintegrasi** lengkap dengan referral link unik, tracker habit & target, riwayat komisi, dan leaderboard performa.

---

## 🚀 Fitur Utama

- 🏢 **Arsitektur Multi-Tenant & Whitelabel**:
  - Subdomain routing dinamis (`[tenant].klikumroh.id`).
  - Dukungan Custom Domain travel dengan automated on-demand TLS via Caddy (HTTP-01 challenge).
  - Runtime dynamic branding: injeksi warna utama (`brand_primary_color`), logo, tagline, banner, FAQ, dan testimoni per-tenant tanpa rebuild/restart server.
- 👥 **Pasukan Agen & Komisi Bertingkat**:
  - Pendaftaran agen (opsi gratis atau berbayar dengan verifikasi bukti transfer).
  - Referral link otomatis yang menempelkan jejak agen ke calon jamaah secara persisten.
  - Skema komisi langsung (*direct*) dan komisi pembina (*parent override*).
  - Habit tracker & target bulanan (*closing pax* dan rekrutmen mitra baru).
  - Sistem pengajuan & persetujuan payout komisi.
- 🎯 **Manajemen Prospek & Pipeline Closing**:
  - Website publik ramah seluler (*mobile-locked*) yang dioptimalkan untuk rasio konversi (CRO).
  - Form konsultasi & minat jamaah langsung terhubung ke WhatsApp dan database prospek.
  - Pipeline status standar: `Baru` ➔ `Dihubungi` ➔ `Tertarik` ➔ `Closing` / `Tidak Lanjut`.
  - Ekspor prospek ke format CSV untuk integrasi operasional.
- 🛡️ **Isolasi Data Antar-Tenant Ketat (Zero Data Leakage)**:
  - Repository layer terisolasi di `/internal/repository` yang mewajibkan `tenant_id` pada setiap operasi database.
  - Rangkaian pengujian otomatis isolasi lintas-tenant (*automated cross-tenant tests*) untuk menjamin data travel A tidak dapat diakses atau diubah oleh travel B.

---

## 🛠️ Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| **Backend API** | Go (Golang 1.23+) | Router: Chi, Database Driver: `go-sql-driver/mysql`, Auth: JWT + Bcrypt |
| **Database** | MySQL 8.x | Skema migrasi menggunakan `golang-migrate` |
| **Web Publik (Whitelabel)** | Next.js 15+ (App Router) | SSR/SSG, CSS Custom Properties untuk dynamic theming, Mobile-first layout |
| **Dashboard Admin** | React 19 (Vite + TypeScript) | SPA untuk manajemen travel mitra |
| **Landing Page Marketing** | Next.js 15+ (App Router) | Showcase produk & registrasi travel baru |
| **Reverse Proxy / TLS** | Caddy & Nginx | On-Demand TLS otomatis untuk custom domain mitra |

---

## 📁 Struktur Repositori (Monorepo)

```text
.
├── cmd/
│   ├── api/                  # Entry point HTTP server backend Go
│   ├── migrate/              # Runner migrasi database (golang-migrate)
│   ├── seed/                 # Seeder data master dan paket default
│   └── seed_dashboard/       # Seeder demonstrasi data dashboard travel
├── internal/
│   ├── handler/              # HTTP handlers & routing endpoint
│   ├── middleware/           # Auth, Tenant Resolution, CORS middleware
│   ├── repository/           # Data access layer berisolasi tenant_id
│   ├── service/              # Business logic & validasi aturan domain
│   └── util/                 # Utilitas helper (image processing, phone parser)
├── migrations/               # File migrasi DDL MySQL (up & down)
├── dashboard/                # React SPA — Portal admin travel mitra
├── web/                      # Next.js — Website publik whitelabel per travel
├── marketing/                # Next.js — Landing page promosi KlikUmroh.id
├── scripts/                  # CI & linting scripts (anti-hardcoded-colors, no-emoji)
├── design-tokens.json        # Design token acuan untuk dashboard & web
├── AGENTS.md                 # Panduan konvensi & aturan baku development
├── Arsitektur-Teknis-KlikUmroh.md # Dokumen spesifikasi arsitektur teknis
├── PRD-KlikUmroh.md          # Dokumen Product Requirement Document
└── DEPLOY.md                 # Panduan deployment manual di server produksi
```

---

## ⚙️ Persyaratan Sistem

Pastikan perangkat lokal Anda telah terpasang:
- **Go**: 1.23 atau lebih baru
- **Node.js**: 20 LTS atau lebih baru (`npm` v10+)
- **MySQL**: 8.0+ atau 8.4+ (misal via Laragon atau instalasi mandiri)
- **Git**

---

## 💻 Panduan Instalasi Lokal

### 1. Kloning Repositori
```bash
git clone https://github.com/MalikSae/klikumroh-saas.git
cd klikumroh-saas
```

### 2. Konfigurasi Environment Backend
Salin `.env.example` menjadi `.env` di direktori root:
```bash
cp .env.example .env
```
Sesuaikan kredensial database lokal Anda:
```env
PORT=8080
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=klikumroh
```

### 3. Eksekusi Migrasi Skema Database
Pastikan database dengan nama `klikumroh` sudah dibuat di MySQL Anda, lalu jalankan:
```bash
go run ./cmd/migrate up
```
*(Opsional) Masukkan data awal:*
```bash
go run ./cmd/seed
```

### 4. Menjalankan Backend API (Go)
```bash
go run ./cmd/api
```
Server API backend akan berjalan di `http://127.0.0.1:8080`.

---

## 🌐 Menjalankan Aplikasi Frontend

### A. Dashboard Admin Travel (`/dashboard`)
```bash
cd dashboard
npm install
npm run dev
```
Buka browser di `http://localhost:5175`.

### B. Web Publik Whitelabel & Portal Utama (`/web`)
```bash
cd web
npm install
npm run dev
```
Buka browser:
- Marketing & Landing Page: `http://localhost:3000/marketing`
- Login Admin Travel: `http://localhost:3000/login`
- Web Whitelabel Tenant: `http://localhost:3000` (atau via subdomain travel)

---

## 🧪 Menjalankan Pengujian (Testing)

Semua fungsionalitas inti dan isolasi data diverifikasi melalui automated unit & integration tests:

```bash
# Jalankan seluruh unit test backend
go test ./...

# Jalankan pengujian isolasi lintas-tenant
go test ./internal/repository -v

# Jalankan validasi linting design token & aset
node scripts/check-hardcoded-colors.js
node scripts/check-no-emoji.js
```

---

## 📚 Dokumentasi Terkait

- 📖 [PRD-KlikUmroh.md](PRD-KlikUmroh.md): Product Requirement Document & spesifikasi alur produk.
- 🏛️ [Arsitektur-Teknis-KlikUmroh.md](Arsitektur-Teknis-KlikUmroh.md): Desain arsitektur teknis, isolasi tenant, dan relasi data.
- 🛡️ [AGENTS.md](AGENTS.md): Aturan integritas kode, konvensi multi-tenant, dan panduan coding agent.
- 🚀 [DEPLOY.md](DEPLOY.md): Panduan konfigurasi server produksi, Nginx SNI, dan Caddy On-Demand TLS.

---

## 📄 Lisensi

Hak Cipta © 2026 **KlikUmroh.id**. Seluruh hak cipta dilindungi undang-undang.
