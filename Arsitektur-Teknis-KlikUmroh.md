# Dokumen Arsitektur Teknis: KlikUmroh.id

**Versi:** 0.1 (Hasil Diskusi Teknis)
**Status:** Draft — rujukan untuk tim/AI agent development
**Dokumen terkait:** PRD-KlikUmroh.md (spesifikasi produk & bisnis)

---

## 1. Prinsip Arsitektur

Dokumen ini menerjemahkan keputusan produk di PRD menjadi keputusan teknis konkret. Empat prinsip yang mendasari seluruh keputusan di bawah:

1. **SEO organik adalah kebutuhan fungsional, bukan preferensi** — karena tesis produk KlikUmroh adalah membuktikan efektivitas channel organik, arsitektur frontend publik tidak boleh menghambat crawling/indexing.
2. **Isolasi data antar-tenant harus berlapis** — mengingat travel-travel pelanggan saling bersaing, kesalahan isolasi data adalah risiko reputasi fatal, bukan sekadar bug biasa.
3. **Kompleksitas custom-code diminimalkan** — pilih infrastruktur/library yang sudah teruji (Caddy, Postgres RLS) untuk area berisiko tinggi (TLS, isolasi data), alih-alih membangun dari nol.
4. **Guardrail otomatis, bukan aturan lisan** — karena development didorong AI agent, aturan desain/keamanan harus ditegakkan lewat lint/CI, bukan hanya didokumentasikan sebagai instruksi.

---

## 2. Stack Teknologi

| Layer | Pilihan | Catatan |
|---|---|---|
| Backend | Go | Logic aplikasi, API, tenant resolution |
| Frontend Publik (Whitelabel) | Next.js (React, SSR/SSG) | **Wajib** render server-side/static, bukan SPA murni |
| Frontend Dashboard | React (SPA) | SEO tidak relevan, prioritas interaktivitas |
| Database | MySQL | Isolasi tenant sepenuhnya di level aplikasi — lihat Bagian 4.1 (tanpa RLS native) |
| Reverse Proxy / TLS | Caddy | On-demand TLS untuk custom domain |
| DNS/CDN (sisi travel) | Cloudflare (akun milik travel) | Skenario A — lihat Bagian 5 |

---

## 3. Arsitektur Frontend

### 3.1 Web Publik (Whitelabel)

- **Wajib SSR/SSG** (Next.js), bukan React SPA client-side rendering murni. Ini syarat fungsional: SPA murni bermasalah untuk crawling/indexing Google, yang secara langsung merusak channel organik — salah satu dari tiga channel akuisisi yang justru ingin diukur dan dioptimalkan oleh produk ini.
- **Layout mobile-locked untuk MVP**: tampilan dikunci ke layout mobile terlepas dari perangkat akses (90% trafik riil adalah mobile). Tidak ada layout desktop terpisah di versi awal — ini keputusan sadar untuk mempercepat development, dipertimbangkan ulang di fase berikutnya.
  - Mitigasi tampilan desktop: kunci `max-width` container sesuai lebar mobile, center-kan secara horizontal (`margin: 0 auto`), beri warna latar netral di sisi kiri-kanan. Ini murni satu aturan CSS di container terluar — tidak memerlukan desain ulang komponen apa pun.
- **Prinsip UX**: harus terasa seperti aplikasi native saat diakses dari HP, bukan sekadar "website yang responsive".

### 3.2 Dashboard Internal (Admin Travel)

- React SPA, **wajib responsive** (mobile & desktop, karena admin travel bisa mengakses dari kedua perangkat).
- **Fluid typography**: gunakan `clamp(min, preferred-vw, max)` untuk ukuran font, bukan lompatan ukuran di titik breakpoint tetap.
- **Container queries** untuk komponen modular (card funnel, leaderboard, dsb) — ukuran font/spacing menyesuaikan lebar *container*-nya sendiri, bukan lebar viewport penuh, agar komponen konsisten dipakai ulang di berbagai posisi layout.

### 3.3 Design Token & Styling

- **Tidak ada warna/style hardcoded** di komponen manapun — ini syarat fungsional karena setiap travel punya branding sendiri (whitelabel).
- Implementasi: **CSS custom properties** yang di-*inject* secara dinamis saat runtime berdasarkan konfigurasi tenant di database (warna brand, font, dsb) — **bukan** tema yang di-*compile* saat build, agar tidak perlu build terpisah per travel saat skala bertambah.
- Sumber kebenaran tunggal: file `design-tokens.json` — direferensikan setiap kali membangun komponen baru.

### 3.4 Guardrail untuk AI-Agent Development

- **Lint rule wajib di CI** (Stylelint/ESLint custom rule) yang menolak nilai warna hardcoded (hex/rgb) di file style — mencegah pelanggaran token lolos tanpa terdeteksi, mengingat development didorong AI agent dan tidak selalu diverifikasi manual per baris kode.

---

## 4. Arsitektur Backend

### 4.1 Multi-tenancy & Isolasi Data

- Pendekatan: **shared database dengan kolom `tenant_id`** di setiap tabel terkait tenant.
- **Keputusan: MySQL** (menyesuaikan infrastruktur VPS yang sudah berjalan), bukan PostgreSQL. Konsekuensinya, **tidak ada Row-Level Security native** sebagai lapisan pertahanan kedua di level database — seluruh isolasi tenant bergantung penuh pada disiplin kode aplikasi. Ini trade-off yang diterima secara sadar demi kesederhanaan infrastruktur, dengan kontrol kompensasi berikut yang **wajib** diimplementasikan (bukan opsional):
  - **Repository/data-access layer wajib** — setiap fungsi yang mengakses data tenant harus menerima `tenant_id` sebagai parameter wajib, dan ini menjadi satu-satunya jalur masuk ke database (tidak ada raw query tersebar di handler lain). Ini membuat kelalaian filter tenant lebih sulit terjadi secara struktural, bukan sekadar aturan yang bisa terlewat saat AI agent menulis kode baru.
  - **Urutan pengerjaan foundation-first** — repository layer ini beserta automated cross-tenant test-nya dibangun dan lolos test **sebelum** fitur apa pun (prospek, funnel, agen) mulai dikerjakan di atasnya. Test ditulis lebih dulu (test-first): endpoint baru yang belum di-scope tenant dengan benar harus langsung gagal CI, bukan lolos dan baru ketahuan setelah fitur berjalan.
  - **Structural enforcement di CI** — pemeriksaan otomatis yang menolak build jika ada kode di luar package repository yang memanggil driver database/ORM secara langsung. Ini mencegah query pintas dibuat diam-diam saat mengerjakan fitur baru di kemudian hari, tanpa mengandalkan AI agent (atau siapa pun) selalu ingat aturan ini.
  - **Automated cross-tenant test di CI** — untuk setiap endpoint yang mengakses data prospek/agen, wajib ada test otomatis yang secara aktif mencoba mengambil data tenant lain dan memverifikasi hasilnya kosong/ditolak. Dijalankan otomatis di setiap CI run, tidak mengandalkan review manual.
  - **Checklist code review eksplisit** untuk setiap perubahan yang menyentuh query database: pastikan `tenant_id` selalu ada di clause `WHERE`.
  - Mengingat ini satu-satunya jaring pengaman isolasi data di seluruh sistem, lapisan ini disarankan mendapat **review manual sebelum dianggap selesai** — baik oleh pendiri sendiri maupun AI agent kedua yang berperan sebagai reviewer independen dari agent yang membangunnya.
- **Access log**: setiap akses staf KlikUmroh ke data tenant (misal untuk keperluan support) dicatat dan dapat diaudit langsung oleh travel yang bersangkutan lewat dashboard mereka.

### 4.2 Status Pipeline Prospek

Status prospek menggunakan tahap sederhana (bukan CRM penuh, tidak ada reminder/task otomatis):

```
Baru → Dihubungi → Tertarik → Closing / Tidak Lanjut
```

- Status "Tidak Lanjut" memiliki field catatan alasan singkat (opsional, mis. belum sempat dihubungi, harga, kompetitor).
- **Funnel analitik per agen terintegrasi langsung dengan status pipeline ini** — bukan sistem pencatatan status terpisah, untuk menghindari duplikasi data dan inkonsistensi antara data admin dan data performa agen.
- Ekspor data: **CSV manual**, tidak ada integrasi API ke ERP eksternal (Erahajj, MuslimPergi, dll) di versi awal.

---

### 4.3 Autentikasi Dashboard & Resolusi Tenant

Dua mekanisme terpisah dibutuhkan agar `tenant_id` bisa ditentukan sebelum masuk ke repository layer — keduanya berbeda sumber:

- **Dashboard admin (session-based auth):** Login lewat email + password (`admin_users`, password di-hash bcrypt). Sukses login membuat baris di `sessions` dengan token acak, dikembalikan ke klien. Setiap request ke dashboard membawa token ini; `AuthMiddleware` mencari token di `sessions`, mengambil `tenant_id` dan `admin_user_id`, menempelkannya ke request context. Token kedaluwarsa tetap (misal 7 hari untuk MVP, tanpa refresh otomatis dulu) — re-login diperlukan setelah itu.
- **Web publik (resolusi dari subdomain):** Tidak ada login. `TenantResolutionMiddleware` membaca `Host` header, memanggil `DomainRepository.FindByHostname` (fungsi yang sama dengan pengecualian lintas-tenant yang sudah dibangun untuk ask-endpoint Caddy — **reuse, jangan duplikat**) untuk menentukan `tenant_id`, lalu menempelkannya ke request context. Hostname yang tidak terdaftar direspons 404.

Kedua middleware ini adalah **satu-satunya** titik masuk `tenant_id` ke request context — handler/service selanjutnya membaca dari context, bukan menerima `tenant_id` dari input klien (body/query) yang tidak tepercaya.

---

## 5. Infrastruktur Multi-Domain & Custom Domain

### 5.1 Alur Custom Domain — Skenario A

1. Travel membeli domain sendiri.
2. Travel mendaftarkan domain tersebut di **akun Cloudflare milik travel sendiri** (bukan akun Cloudflare KlikUmroh).
3. Travel input nama domain di dashboard KlikUmroh.
4. Travel menyesuaikan DNS di Cloudflare mereka (CNAME mengarah ke hostname KlikUmroh).

**Konsekuensi arsitektur dari Skenario A:** KlikUmroh bertanggung jawab penuh atas provisioning dan renewal TLS untuk domain eksternal — tidak didelegasikan ke fitur Cloudflare for SaaS (karena itu mensyaratkan domain didaftarkan di akun Cloudflare milik KlikUmroh, Skenario B yang tidak dipilih).

### 5.2 TLS & Sertifikat

**Konteks infrastruktur:** VPS yang dipakai sudah menjalankan ±119 website lain di bawah aaPanel dengan **Nginx 1.24.0** (dikonfirmasi langsung dari panel) — port 80/443 sudah dikuasai Nginx tersebut. Caddy tidak bisa langsung bind ke port tersebut, sehingga dibutuhkan lapisan tambahan di depan:

- **SNI-based Layer-4 routing via Nginx `stream` module** (bukan komponen terpisah seperti HAProxy, karena web server yang dipakai sudah dikonfirmasi Nginx) — mendengarkan di port 80/443 publik, meneruskan koneksi berdasarkan SNI hostname: domain milik tenant KlikUmroh diteruskan ke Caddy (port internal), domain lain diteruskan ke virtual host Nginx yang sudah ada (port internal). Ini beroperasi di level TCP sebelum TLS diterminasi, sehingga Caddy tetap bisa menjalankan on-demand TLS untuk domain KlikUmroh tanpa mengganggu situs-situs lain di VPS yang sama.
- **Folder include yang aman dari override aaPanel (sudah dikonfirmasi ada):** `nginx.conf` bawaan aaPanel sudah memiliki blok `stream {}` dengan baris `include /www/server/panel/vhost/nginx/tcp/*.conf;`. Konfigurasi SNI routing KlikUmroh cukup ditaruh sebagai file baru di folder `/www/server/panel/vhost/nginx/tcp/` (mis. `klikumroh-sni.conf`) — aaPanel hanya menambah file ke folder ini lewat GUI-nya sendiri, tidak pernah menimpa isi file yang sudah ada di situ, sehingga config kita aman tanpa perlu menyunting `nginx.conf` utama sama sekali.
- **Catatan deployment:** aaPanel di VPS ini sudah punya panel native "Go Project" dan "Node.js Project" yang bisa dipakai untuk manajemen proses Go backend dan Next.js.

Detail teknis TLS lainnya:
- **Challenge type: HTTP-01** (bukan DNS-01) — karena kita tidak memiliki akses API ke akun Cloudflare travel, verifikasi dilakukan lewat request HTTP ke domain yang di-CNAME-kan.
- **Reverse proxy: Caddy**, bukan membangun ACME client sendiri dari nol (mis. `autocert` di Go). Caddy sudah punya dukungan bawaan untuk on-demand TLS + ask endpoint + auto-renewal, mengurangi permukaan kode custom yang harus ditulis dan diverifikasi.
- **Ask endpoint (wajib)**: sebelum Caddy meminta sertifikat baru ke Let's Encrypt, harus ada validasi ke API internal KlikUmroh — cek apakah hostname yang diminta memang domain custom yang sudah terdaftar oleh travel di database. Ini mencegah penyalahgunaan (pihak luar mengarahkan DNS domain sembarangan ke IP server kita untuk memicu penerbitan sertifikat) dan mencegah pemborosan rate limit Let's Encrypt.
- **Kesadaran rate limit**: Let's Encrypt membatasi ±300 permintaan sertifikat baru per akun per 3 jam. Perlu antrian/retry yang graceful untuk skenario onboarding massal (banyak travel setup custom domain berdekatan waktu).
- **Auto-renewal & alerting**: sertifikat berlaku 90 hari, renewal otomatis via Caddy, dengan **alert wajib** jika renewal gagal (misal travel diam-diam mengubah DNS mereka) — jangan menunggu situs down baru terdeteksi.

### 5.3 Koeksistensi dengan Infrastruktur VPS Existing

VPS yang dipakai bukan instance khusus KlikUmroh — sudah melayani ±119 website dan 94 database produksi lain. Implikasi yang perlu disadari dan dipantau:

- **Risiko "blast radius" bersama**: lonjakan trafik atau bug resource-intensive di KlikUmroh (misal saat rollout serentak ke puluhan design partner) berpotensi mendegradasi situs-situs lain di VPS yang sama, dan sebaliknya. Diterima sebagai trade-off sadar untuk fase MVP; migrasi ke VPS terpisah dipertimbangkan begitu trafik KlikUmroh mulai signifikan.
- **Kontensi resource database**: KlikUmroh menjadi database tambahan di instance MySQL yang sama dengan 94 database lain. Perlu pengecekan konfigurasi (`max_connections`, alokasi memori per koneksi) agar trafik KlikUmroh tidak menghabiskan slot koneksi milik database lain, dan sebaliknya.
- **Monitoring tambahan disarankan**: pantau resource usage VPS secara terpisah per aplikasi (bukan cuma agregat) setelah KlikUmroh live, agar noisy-neighbor effect di kedua arah cepat terdeteksi.

### 5.4 Redirect Subdomain ke Custom Domain

- Begitu custom domain aktif, akses ke subdomain default (`[travel].klikumroh.id`) tetap berfungsi dan **di-redirect** ke custom domain.
- **Wajib mempertahankan full path dan query string** saat redirect — krusial karena subdomain juga menjadi basis referral link agen (`travelA.klikumroh.id/ref/AGEN123`). Redirect yang hanya mengarah ke homepage akan merusak seluruh link referral yang sudah tersebar dan merusak data atribusi.
- **Tipe redirect: 301 (permanent)** sebagai default — kecuali ada rencana konkret travel akan bolak-balik ganti/lepas custom domain, yang mana 302 lebih aman agar Google tidak menganggap subdomain mati permanen.
- **Pencatatan klik referral harus terjadi satu kali** di titik redirect (server-side), untuk mencegah double-counting jika ada tracking tambahan di halaman final setelah redirect.

### 5.5 Akses Dashboard & Status Domain

- **Dashboard admin travel selalu diakses via `klikumroh.id`**, tidak pernah lewat custom domain travel. Ini menyederhanakan cakupan TLS dinamis (hanya diperlukan untuk halaman publik, bukan seluruh aplikasi) dan menghindari kerumitan session/cookie lintas-domain untuk autentikasi.
- Status custom domain yang ditampilkan ke travel: **Menunggu verifikasi DNS / Aktif / Gagal — cek pengaturan DNS**.
- **Fallback otomatis ke subdomain** jika custom domain travel bermasalah (mis. DNS diubah tanpa sengaja) — situs travel tidak boleh down total, dan admin travel diberi notifikasi.

---

## 6. Skema Data

```sql
-- Data travel (tenant)
CREATE TABLE tenants (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) NOT NULL UNIQUE,        -- basis subdomain default: {slug}.klikumroh.id
    status              ENUM('trial','active','suspended','churned') NOT NULL DEFAULT 'trial',
    commission_scheme   ENUM('flat','override_one_tier') NOT NULL DEFAULT 'flat',
    coupon_expires_at   DATE NULL,                            -- akhir masa kupon 6 bulan design partner
    brand_primary_color VARCHAR(7) NULL,                      -- hex, sumber design token dinamis
    brand_logo_url      VARCHAR(500) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Subdomain default & custom domain per tenant
CREATE TABLE domains (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id      BIGINT UNSIGNED NOT NULL,
    hostname       VARCHAR(255) NOT NULL UNIQUE,              -- dicek oleh ask-endpoint Caddy
    type           ENUM('subdomain','custom') NOT NULL,
    status         ENUM('pending','active','failed') NOT NULL DEFAULT 'pending',
    verified_at    TIMESTAMP NULL,
    last_check_at  TIMESTAMP NULL,                            -- monitoring renewal TLS
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_domains_tenant (tenant_id),
    INDEX idx_domains_hostname_status (hostname, status)       -- lookup cepat untuk ask-endpoint
);

-- Katalog paket umroh
CREATE TABLE packages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT NULL,
    price           DECIMAL(15,2) NULL,
    departure_date  DATE NULL,
    quota           INT NULL,
    status          ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_packages_tenant (tenant_id)
);

-- Data agen per tenant
CREATE TABLE agents (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(20) NULL,
    email           VARCHAR(255) NULL,
    referral_code   VARCHAR(50) NOT NULL UNIQUE,               -- unik global, dipakai di path URL referral
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_agents_tenant (tenant_id)
);

-- Data minat jamaah (core loop)
CREATE TABLE prospects (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,                  -- WAJIB di setiap query lewat repository layer
    package_id      BIGINT UNSIGNED NULL,
    agent_id        BIGINT UNSIGNED NULL,                      -- null = bukan dari referral agen
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(20) NOT NULL,
    email           VARCHAR(255) NULL,
    source_channel  ENUM('organik','paid','agen') NOT NULL,
    status          ENUM('baru','dihubungi','tertarik','closing','tidak_lanjut') NOT NULL DEFAULT 'baru',
    lost_reason     VARCHAR(255) NULL,                         -- diisi saat status = tidak_lanjut
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (package_id) REFERENCES packages(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    INDEX idx_prospects_tenant (tenant_id),
    INDEX idx_prospects_tenant_status (tenant_id, status),     -- untuk dashboard funnel
    INDEX idx_prospects_agent (agent_id)
);

-- Log klik referral link agen (funnel: klik -> isi form)
CREATE TABLE referral_clicks (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    BIGINT UNSIGNED NOT NULL,
    agent_id     BIGINT UNSIGNED NOT NULL,
    prospect_id  BIGINT UNSIGNED NULL,                         -- diisi belakangan jika klik berlanjut isi form
    clicked_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address   VARCHAR(45) NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (prospect_id) REFERENCES prospects(id),
    INDEX idx_refclicks_tenant (tenant_id),
    INDEX idx_refclicks_agent (agent_id),
    INDEX idx_refclicks_clicked_at (clicked_at)
);

-- Jadwal event agen + RSVP
CREATE TABLE agent_events (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    BIGINT UNSIGNED NOT NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT NULL,
    event_date   DATETIME NOT NULL,
    location     VARCHAR(255) NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_events_tenant (tenant_id)
);

CREATE TABLE event_rsvps (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id    BIGINT UNSIGNED NOT NULL,
    agent_id    BIGINT UNSIGNED NOT NULL,
    status      ENUM('going','maybe','not_going') NOT NULL DEFAULT 'going',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES agent_events(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    UNIQUE KEY uniq_event_agent (event_id, agent_id)
);

-- Tips promosi: hybrid master (tenant_id NULL) + custom per tenant
CREATE TABLE promo_tips (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id   BIGINT UNSIGNED NULL,                          -- NULL = konten master milik KlikUmroh
    title       VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_promotips_tenant (tenant_id)
);

-- Audit trail akses staf KlikUmroh ke data tenant
CREATE TABLE access_logs (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    BIGINT UNSIGNED NOT NULL,                     -- data tenant mana yang diakses
    staff_id     BIGINT UNSIGNED NOT NULL,                     -- staf KlikUmroh yang mengakses
    reason       VARCHAR(255) NULL,
    accessed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_accesslogs_tenant (tenant_id),
    INDEX idx_accesslogs_staff (staff_id)
);

-- Akun login admin travel (dashboard)
CREATE TABLE admin_users (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id      BIGINT UNSIGNED NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,               -- unik global (satu akun = satu tenant)
    password_hash  VARCHAR(255) NOT NULL,                      -- WAJIB bcrypt, tidak pernah plain-text
    name           VARCHAR(255) NOT NULL,
    status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_adminusers_tenant (tenant_id)
);

-- Sesi login aktif (auth berbasis token, bukan JWT, untuk kesederhanaan MVP)
CREATE TABLE sessions (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token          VARCHAR(255) NOT NULL UNIQUE,               -- random token, dicari middleware auth
    admin_user_id  BIGINT UNSIGNED NOT NULL,
    tenant_id      BIGINT UNSIGNED NOT NULL,                   -- denormalisasi sengaja: hindari join di setiap request
    expires_at     TIMESTAMP NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_sessions_token (token),
    INDEX idx_sessions_admin_user (admin_user_id)
);
```

**Catatan implementasi terkait Bagian 4.1 (isolasi tenant):** Kolom `tenant_id` bertipe `NOT NULL` di semua tabel yang menyimpan data milik tenant (kecuali `promo_tips` yang sengaja `NULL`-able untuk konten master) — constraint ini sendiri sudah jadi lapisan validasi pertama di level skema, sebelum bahkan sampai ke repository layer. Index `(tenant_id, ...)` pada `prospects` dan lookup `(hostname, status)` pada `domains` dipilih spesifik untuk pola query yang sudah diketahui dari fitur MVP (dashboard funnel, ask-endpoint Caddy) — bukan index generik.

---

## 7. Keamanan & Trust — Ringkasan Kontrol Teknis

| Kontrol | Tujuan |
|---|---|
| Repository layer wajib `tenant_id` + automated cross-tenant test di CI | Kompensasi tidak adanya RLS native di MySQL — mencegah kebocoran data lintas-tenant tanpa lapisan database terpisah |
| Access log teraudit oleh travel | Transparansi akses data internal — menggantikan janji lisan dengan bukti teknis |
| Ask-endpoint sebelum penerbitan TLS | Mencegah penyalahgunaan on-demand TLS untuk domain sembarangan |
| Lint rule anti-hardcode di CI | Menjaga konsistensi whitelabel token meski development oleh AI agent |
| Dashboard hanya via `klikumroh.id` | Menyederhanakan cakupan keamanan sesi/autentikasi lintas-domain |

---

## 8. Pertanyaan Terbuka / Keputusan Tertunda (Teknis)

- Pengecekan/tuning konfigurasi `max_connections` MySQL agar KlikUmroh tidak berebut resource dengan 94 database lain di VPS yang sama.
- Keputusan ambang batas trafik/resource yang memicu migrasi KlikUmroh ke VPS terpisah dari infrastruktur existing.
- Pattern konkret implementasi repository/data-access layer di Go (nama fungsi, struktur interface) — belum didetailkan, meski urutan pembangunan (foundation-first) dan kebutuhan review manual sudah diputuskan (lihat Bagian 4.1).
- Cakupan automated cross-tenant test di CI (Bagian 4.1) — endpoint mana saja yang wajib dicover sejak MVP belum didaftar eksplisit.
- Mekanisme antrian/retry konkret untuk penerbitan TLS saat onboarding massal (Bagian 5.2) — pendekatan belum dipilih (queue sederhana vs rate-limiter dengan backoff).
- Kebijakan retensi `access_logs` (berapa lama disimpan, apakah bisa dihapus).
- Threshold/alerting spesifik untuk kegagalan renewal TLS (Bagian 5.2) — tools monitoring belum ditentukan.
- Apakah layout desktop untuk web publik (dijadwalkan sebagai pengembangan berikutnya, lihat Bagian 3.1) perlu direncanakan strukturnya dari awal agar migrasi nanti tidak memerlukan refactor besar.
- Mekanisme cleanup baris `sessions` yang sudah lewat `expires_at` — saat ini hanya dicek saat lookup, tidak pernah dihapus otomatis, sehingga tabel berpotensi menumpuk baris mati seiring waktu. Bisa berupa cron sederhana atau lazy-delete saat lookup menemukan baris expired.
- Celah timing minor di `POST /api/auth/login`: path "email tidak ditemukan" kemungkinan lebih cepat direspons dibanding path "password salah" (yang menjalankan bcrypt compare), karena bcrypt hanya dipanggil kalau user ditemukan. Response body/status sudah identik (mencegah enumerasi lewat isi respons), tapi durasi respons secara teori masih bisa jadi side-channel. Tidak blocking untuk MVP, dicatat sebagai hardening lanjutan (mis. selalu jalankan bcrypt compare terhadap hash dummy tetap saat email tidak ditemukan, supaya waktu respons konsisten).
