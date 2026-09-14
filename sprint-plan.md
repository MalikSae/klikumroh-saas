# Sprint Plan — KlikUmroh.id

**Tujuan dokumen:** checklist kerja per-sprint yang diupdate langsung oleh Antigravity selama development.

**Aturan update checklist (wajib dipatuhi):**
- Ubah `- [ ]` menjadi `- [x]` **hanya** setelah task selesai DAN lolos verifikasi sesuai `AGENTS.md` Bagian 6 — bukan saat kode baru ditulis tapi belum diuji.
- Jangan mulai task di sprint berikutnya sebelum seluruh task di sprint sebelumnya tercentang (aturan foundation-first, `AGENTS.md` Bagian 5) — kecuali pendiri secara eksplisit menyetujui pengerjaan paralel.
- Kalau suatu task ternyata perlu dipecah lebih detail saat dikerjakan, tambahkan sebagai sub-checklist baru di bawahnya — jangan hapus atau ganti task aslinya.
- Kalau menemukan blocker yang butuh keputusan pendiri (bukan keputusan teknis biasa), tulis sebagai catatan di bawah sprint terkait dengan format `**BLOCKER:** ...` alih-alih menebak dan lanjut.

**Dokumen rujukan:** `AGENTS.md` (aturan kritis & cara kerja), `Arsitektur-Teknis-KlikUmroh.md` (detail teknis), `PRD-KlikUmroh.md` (spesifikasi produk).

---

## Sprint 0 — Setup Project & Fondasi

- [x] Init Go module (`go mod init`) sesuai struktur folder di `AGENTS.md` Bagian 4
- [x] Setup koneksi MySQL + tool migrasi database
- [x] Jalankan seluruh migrasi tabel sesuai skema di `Arsitektur-Teknis-KlikUmroh.md` Bagian 6 (`tenants`, `domains`, `packages`, `agents`, `prospects`, `referral_clicks`, `agent_events`, `event_rsvps`, `promo_tips`, `access_logs`)
- [x] Scaffold project Next.js untuk web publik whitelabel (`/web`)
- [x] Scaffold project React SPA untuk dashboard admin (`/dashboard`)
- [x] Buat `design-tokens.json` awal (placeholder token warna default, sebelum branding per-tenant dinamis dipasang di sprint berikutnya)

**Verifikasi sprint:** `go build ./...` sukses tanpa error, seluruh migrasi jalan bersih, kedua project frontend bisa dijalankan mode dev tanpa error.

---

## Sprint 1 — Repository Layer & Isolasi Tenant (WAJIB sebelum sprint lain apa pun)

- [x] Buat package `/internal/repository` sebagai satu-satunya jalur akses database
- [x] Setiap fungsi repository mensyaratkan `tenant_id` sebagai parameter wajib (`AGENTS.md` Bagian 3.1)
- [x] Implementasi repository untuk entitas inti: Tenant, Domain, Package, Agent, Prospect
- [x] Automated cross-tenant test: tenant A tidak bisa mengambil/mengubah data tenant B, untuk setiap entitas di atas
- [x] CI check: build gagal jika ada kode di luar `/internal/repository` yang memanggil driver database secara langsung
- [x] Review manual (pendiri atau AI agent kedua sebagai reviewer independen) atas seluruh repository layer

**Verifikasi sprint:** `go test ./...` pass termasuk seluruh cross-tenant test; review manual selesai dan disetujui sebelum Sprint 2 dimulai.

---

## Sprint 1.5 — Component Library & Layout Dasar

**Dashboard (React SPA) — pakai token `dashboard` dari design-tokens.json:**
- [x] Layout shell: Sidebar navigasi + topbar/header
- [x] Button (varian primary/secondary)
- [x] Card generik (dasar untuk StatCard, list card, dll)
- [x] StatCard (card metrik angka + badge indikator, pola dari referensi Vizora)
- [x] Badge/Pill (positif/negatif, pakai token positiveIndicator/negativeIndicator)
- [x] Table generik (header, row, pagination dasar)
- [x] Form input dasar (text, select, textarea)
- [x] Modal/Dialog dasar

**Web Publik (Next.js) — pakai CSS custom property tenantWhitelabel, BUKAN token dashboard:**
- [x] Container wrapper mobile-locked (max-width + center, sesuai keputusan layout mobile-only MVP)
- [x] Button (konsumsi CSS var brand tenant, bukan token dashboard)
- [x] Card paket umroh
- [x] Form input dasar untuk form minat

**Verifikasi sprint:** buat satu halaman khusus di masing-masing project (misal route `/dev/components`) yang menampilkan semua komponen di atas dalam satu tempat untuk review visual cepat, sebelum dipakai di Sprint 2 dan seterusnya.

**Aturan mengikat untuk semua sprint berikutnya:** Sprint 2 dan seterusnya WAJIB reuse komponen dari sprint ini. Kalau butuh variasi baru, extend komponen yang ada — jangan bikin markup/style baru dari nol per halaman.

---

## Sprint 1.75 — Autentikasi Admin & Resolusi Tenant

- [x] Migrasi tabel baru: `admin_users`, `sessions` (lanjutan nomor migrasi setelah 000010, lihat Arsitektur-Teknis-KlikUmroh.md Bagian 6)
- [x] Repository `AdminUserRepository` dan `SessionRepository` — ikuti pola Sprint 1 (tenant_id wajib, kecuali lookup token yang secara alami lintas-tenant di titik itu)
- [x] Endpoint `POST /api/auth/login` — cek email+password (bcrypt), buat session baru, return token
- [x] Endpoint `POST /api/auth/logout` — hapus session
- [x] `AuthMiddleware` (dashboard): baca token dari header/cookie, lookup `sessions`, tempel `tenant_id` + `admin_user_id` ke request context, tolak 401 kalau invalid/expired
- [x] `TenantResolutionMiddleware` (web publik): baca `Host` header, panggil `DomainRepository.FindByHostname` yang SUDAH ADA dari Sprint 1 (reuse, jangan bikin fungsi baru), tempel `tenant_id` ke request context, tolak 404 kalau hostname tidak terdaftar
- [x] Cross-tenant test: `AdminUserRepository` dan `SessionRepository` ikut pola isolasi Sprint 1
- [x] Test: token session tenant A tidak bisa dipakai mengakses data tenant B lewat `AuthMiddleware`

**Verifikasi sprint:** login sukses mengembalikan token; token dipakai berhasil akses endpoint terproteksi; token dari tenant lain ditolak; `TenantResolutionMiddleware` dengan `Host` header berbeda mengembalikan `tenant_id` berbeda.

---

## Sprint 2 — Core Loop

- [x] CRUD katalog paket umroh (`packages`) — admin travel bisa membuat, publish, draft, archive
- [x] Form minat publik → membuat entri baru di `prospects`
- [x] Dashboard admin: ubah status prospek melalui tahap Baru → Dihubungi → Tertarik → Closing / Tidak Lanjut, dengan input `lost_reason` opsional
- [x] Fitur export data prospek ke CSV
- [x] Cross-tenant test untuk seluruh endpoint baru di sprint ini

**Verifikasi sprint:** alur end-to-end dari pengisian form publik sampai muncul di list admin dan bisa diexport, teruji terisolasi sempurna antar tenant.

---

## Sprint 3 — Branding Dinamis & Uji Lokal Menyeluruh

- [x] Endpoint `PUT /api/dashboard/tenant/branding` (protected AuthMiddleware): terima `brand_primary_color` (validasi format hex `#RRGGBB`), update lewat `TenantRepository` — `tenant_id` dari context, bukan body
- [x] Endpoint `GET /api/public/tenant-info` (TenantResolutionMiddleware): return `name`, `brand_primary_color`, `brand_logo_url` milik tenant yang ter-resolve dari `Host` — hanya field publik, jangan expose field lain
- [x] Halaman dashboard baru `/settings` (reuse Card, FormInput, Button dari Sprint 1.5): form update warna brand, terhubung ke endpoint di atas
- [x] Web publik (`page.tsx`): fetch `tenant-info` bareng `packages`, inject `--tw-brand-primary` sebagai override inline di elemen pembungkus tertinggi yang jadi leluhur semua komponen yang memakainya — menimpa nilai fallback statis dari `globals.css` untuk request itu
- [x] Cross-tenant test: tenant A tidak bisa update branding tenant B lewat endpoint dashboard
- [x] Uji manual lokal: set warna travela jadi biru, travelb jadi ungu (lewat dashboard atau curl), reload `travela.klikumroh.local:3000` dan `travelb.klikumroh.local:3000`, konfirmasi warna tombol/aksen berbeda sesuai tenant, sementara dashboard admin (`--db-*`) sama sekali tidak terpengaruh

**Verifikasi sprint:** dua tenant lokal menampilkan warna brand berbeda tanpa restart server atau rebuild — murni dari data di database.

---

## Sprint 4 — Growth Loop: Sistem Agen

- [ ] CRUD agen (`agents`) + generate `referral_code` unik per agen
- [ ] Endpoint referral link: catat `referral_clicks`, teruskan ke form minat dengan `agent_id` terpasang
- [ ] Dashboard funnel per agen — **wajib terintegrasi langsung** dengan status pipeline `prospects` yang sama (bukan pencatatan status terpisah, lihat PRD Bagian 7.2)
- [ ] Leaderboard performa agen
- [ ] Jadwal event (`agent_events`) + RSVP (`event_rsvps`)
- [ ] Tips promosi hybrid: konten master (`tenant_id` NULL) tampil default, travel bisa edit/tambah versi sendiri
- [ ] Cross-tenant test untuk seluruh endpoint baru di sprint ini
- [x] CRUD agen (`agents`) + generate `referral_code` unik per agen
- [x] Endpoint referral link: catat `referral_clicks`, teruskan ke form minat dengan `agent_id` terpasang
- [x] Dashboard funnel per agen — **wajib terintegrasi langsung** dengan status pipeline `prospects` yang sama (bukan pencatatan status terpisah, lihat PRD Bagian 7.2)
- [x] Leaderboard performa agen
- [x] Jadwal event (`agent_events`) + RSVP (`event_rsvps`)
- [x] Tips promosi hybrid: konten master (`tenant_id` NULL) tampil default, travel bisa edit/tambah versi sendiri
- [x] Modul Target & Reward Agen: skema `agent_targets` & `agent_target_achievements`, API CRUD/progress/tutup periode/update status reward/export CSV, UI Admin `/agents/targets`, dan integrasi target habit tracker di web agen (`/agen/dashboard` & `/agen/daftar`)
- [x] Cross-tenant test untuk seluruh endpoint baru di sprint ini

**Verifikasi sprint:** klik referral tercatat tepat satu kali per kunjungan (tidak double-count), funnel per agen akurat, leaderboard terurut benar.
**Verifikasi sprint:** klik referral tercatat tepat satu kali per kunjungan (tidak double-count), funnel per agen akurat, leaderboard terurut benar, isolasi cross-tenant modul target & reward teruji 100% pada repository dan handler layer.

---

## Sprint 5 — Custom Domain

- [ ] Setup Caddy dengan on-demand TLS (HTTP-01 challenge) — *didokumentasikan di DEPLOY.md untuk langkah manual pendiri di VPS*
- [x] Ask-endpoint: validasi hostname terhadap tabel `domains` sebelum Caddy meminta sertifikat baru (`GET /internal/domain-ask?domain=...`)
- [ ] Buat `stream` block Nginx untuk SNI routing di `/www/server/panel/vhost/nginx/tcp/klikumroh-sni.conf` — *didokumentasikan di DEPLOY.md untuk langkah manual pendiri di VPS*
- [x] Redirect subdomain default → custom domain (301, wajib pertahankan path & query string penuh via `web/middleware.ts`)
- [x] UI status domain di dashboard travel: Menunggu verifikasi DNS / Aktif / Gagal (dengan manual verify & copy CNAME target)
- [x] Fallback otomatis ke subdomain jika custom domain bermasalah / pending (subdomain tetap melayani tanpa redirect)

**Verifikasi sprint:** CNAME verification teruji (match -> active, mismatch -> failed), ask-endpoint teruji (200 hanya untuk custom active, 404 untuk pending/failed/subdomain/unregistered), delete subdomain ditolak, cross-tenant isolation lolos, redirect 301 mempertahankan full path + query string.

---

## Sprint 6 — Access Log & Trust

- [ ] Middleware pencatatan otomatis ke `access_logs` setiap kali staf KlikUmroh mengakses data suatu tenant (misal lewat panel internal/support)
- [ ] UI di dashboard travel untuk melihat riwayat akses data mereka sendiri (siapa, kapan, alasan)

**Verifikasi sprint:** akses staf (disimulasikan lewat panel internal) tercatat otomatis dan langsung terlihat di dashboard travel yang bersangkutan.

---

## Sprint 7 — Persiapan & Deploy Akhir (dikerjakan SETELAH Sprint 0-6 semua tuntas)

**Keputusan:** deploy dilakukan sekali di akhir, setelah seluruh fitur (Sprint 0-6) selesai dan diverifikasi lokal — bukan dicicil di tengah jalan. Sprint ini HANYA persiapan build & dokumentasi, Antigravity TIDAK menyentuh VPS. Deploy sungguhan tetap manual oleh pemilik produk (alur: dev lokal → `git push` ke GitHub → `git pull` manual di VPS).

**Konteks aaPanel (sudah dikonfirmasi):** "Go Project" dan "Node.js Project" di aaPanel hanya menjalankan/mengawasi executable yang sudah ada di disk server (field: Executable File, Project Name, Project Port, Execution Command, Run User, Domain name) — bukan alat deploy dari Git.

- [ ] Pastikan repo Git sudah diinisialisasi di root project (monorepo — satu repo untuk `/cmd`, `/internal`, `/dashboard`, `/web`). Pastikan `.gitignore` mencakup semua artifact build: `dist/`, `.next/`, `node_modules/`, binary hasil cross-compile (tanpa ekstensi di Linux), `.env`
- [ ] Buat script cross-compile Go untuk Linux (`GOOS=linux GOARCH=amd64 CGO_ENABLED=0`), hasil ke `dist/klikumroh-api` dan `dist/klikumroh-migrate`
- [ ] Ubah konfigurasi Next.js di `/web` (`next.config.ts`) menjadi `output: 'standalone'` — cocok dengan model aaPanel Node.js Project (satu entry file + port)
- [ ] Uji build standalone secara lokal: `npm run build`, lalu jalankan `node .next/standalone/server.js` di lokal, konfirmasi jalan benar sebelum dipakai di server
- [ ] Tulis `DEPLOY.md` di root: langkah manual lengkap — urutan `git pull`, cara build/cross-compile di server (atau upload binary hasil build lokal), field-field persis di form aaPanel "Go Project" dan "Node.js Project", dan urutan menjalankan migrasi database di server SEBELUM start service utama
- [ ] Tulis catatan risiko di DEPLOY.md: dua area yang belum pernah divalidasi di lingkungan nyata (Next.js standalone output, Nginx stream SNI routing) — sarankan uji ini duluan di awal sesi deploy sebelum lanjut ke langkah lain, supaya kalau ada masalah ketahuan cepat.

**Verifikasi sprint:** cross-compile Go menghasilkan binary Linux yang valid; `node .next/standalone/server.js` jalan lokal tanpa error; `DEPLOY.md` cukup lengkap untuk diikuti tanpa perlu tanya balik ke Antigravity.

---

## Backlog — Di Luar Sprint MVP (jangan dikerjakan tanpa diminta eksplisit)

- Layout desktop terpisah untuk web publik (saat ini mobile-locked, lihat PRD & Arsitektur Bagian 3.1)
- Model marketplace terpusat lintas-travel
- Integrasi API langsung ke ERP eksternal (Erahajj, MuslimPergi, dll)
- Perhitungan cost-per-closing otomatis per channel

## Penyempurnaan Beranda Publik — CRO (8 September 2026)

- [x] Redesign pembuka, keterbacaan paket, pengurutan harga, dan jalur konsultasi. Verifikasi: go build ./...; go test ./...; tsc --noEmit --incremental false; ESLint tiga TSX yang diubah; check-no-emoji.js web/components; pemeriksaan literal warna/ukuran dan kelengkapan token pada file perubahan lulus.
- [ ] Pendiri memeriksa beranda langsung di browser: pembuka, keterbacaan kartu, urutan harga, dan tombol konsultasi. Dampak CRO belum diukur.

- [x] Perbaiki resolusi import design-tokens.json di luar /web dengan turbopack.root pada next.config.ts. Verifikasi: go build ./... dan go test ./... lulus; HTTP beranda travela 200 dengan heading serta --cro-display:32px dalam HTML; test redirect 2/2 lulus (path + query utuh).

- [ ] Revisi arah UI beranda ke katalog OTA: hapus pembuka panjang, thumbnail ringkas, pencarian dan filter bulan, urutan jadwal/harga; verifikasi sebelum selesai.
