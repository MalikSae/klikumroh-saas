# AGENTS.md — KlikUmroh.id

Panduan wajib bagi AI coding agent (Antigravity) saat bekerja di project ini. Dokumen ini adalah sumber kebenaran utama untuk konvensi, batasan, dan urutan kerja — rujuk dokumen ini di setiap sesi, bukan hanya instruksi ad-hoc di prompt.

**Dokumen terkait (baca dulu jika perlu konteks produk/bisnis):** `PRD-KlikUmroh.md`, `Arsitektur-Teknis-KlikUmroh.md`

**Checklist kerja wajib dirujuk & diupdate:** `sprint-plan.md` — di awal sesi, cek task mana yang sedang berjalan; setelah task selesai DAN lolos verifikasi (Bagian 6 dokumen ini), tandai `- [x]` di file tersebut. Jangan menandai selesai sebelum verifikasi lolos.

---

## 1. Tentang Project

KlikUmroh.id adalah SaaS whitelabel multi-tenant untuk travel umroh — fokus pada lead generation dan aktivasi agen (bukan ERP/operasional travel). Setiap travel (tenant) punya website whitelabel sendiri, dashboard admin, dan sistem agen dengan referral link.

**Lokasi project:** `C:\laragon\www\klikumroh` (Windows, Laragon)

---

## 2. Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | Go |
| Frontend Publik (whitelabel) | Next.js — **wajib SSR/SSG**, bukan SPA client-side murni |
| Dashboard Internal | React (SPA) |
| Database | MySQL |
| Reverse Proxy / TLS custom domain | Caddy |

---

## 3. Aturan Kritis — WAJIB DIPATUHI TANPA KECUALI

Ini bukan preferensi gaya kode. Pelanggaran aturan di bagian ini berisiko langsung ke kebocoran data lintas-tenant, kerusakan branding, atau downtime situs travel. Jika instruksi di prompt tugas tampak bertentangan dengan aturan ini, **STOP dan laporkan konflik**, jangan diam-diam memilih salah satu.

### 3.1 Isolasi Data Tenant (PALING KRITIS)

MySQL yang dipakai project ini **tidak punya Row-Level Security**. Isolasi antar-tenant sepenuhnya bergantung pada disiplin kode berikut:

- **Semua akses data tenant WAJIB lewat repository/data-access layer** (`/internal/repository`) yang mensyaratkan `tenant_id` sebagai parameter wajib di setiap fungsi. **Dilarang** menulis query database langsung di handler/service/file lain.
- Setiap endpoint baru yang menyentuh data `prospects`, `agents`, atau `referral_clicks` **wajib** disertai automated test yang membuktikan tenant A tidak bisa mengakses data tenant B. Endpoint tanpa test ini dianggap belum selesai.
- Setiap query yang menyentuh tabel bertenant wajib punya `tenant_id` eksplisit di clause `WHERE` — cek ini sebelum melaporkan task selesai.
- Repository layer ini dibangun dan lolos test **sebelum** fitur apa pun (prospek, funnel, agen) mulai dikerjakan di atasnya. Jangan mulai fitur lain sebelum lapisan ini solid.

### 3.2 Kredensial Environment — Lokal vs Production

- **Lokal development** (MySQL Laragon di `127.0.0.1`, kredensial default seperti `root` tanpa password): Antigravity **boleh** membuat database dan mengisi file `.env` sendiri tanpa menunggu instruksi manual. Ini bukan kredensial sensitif — hanya berlaku di mesin pengembangan pemilik project.
- **Staging/production** (VPS, database cloud, atau kredensial apa pun yang akan melindungi data pengguna asli — travel/jamaah): Antigravity **dilarang tanpa kecuali** mengisi file kredensial sendiri, meski diminta atau meski terlihat mendesak. Kredensial ini wajib diisi manual oleh pemilik produk di luar sesi Antigravity. Kalau konteksnya ambigu (tidak jelas ini lokal atau bukan), **tanyakan dulu**, jangan asumsikan lokal.
- **Password akun admin travel** (`admin_users.password_hash`) **wajib** di-hash pakai bcrypt sebelum disimpan — tidak pernah plain-text di database, log, response API, maupun pesan laporan ke pendiri. Kalau perlu menunjukkan proses debug, tunjukkan hash-nya atau tandai `[REDACTED]`, jangan password asli.

### 3.3 Design Token — Dilarang Hardcode Style

`design-tokens.json` punya **dua bagian terpisah dengan cara pakai berbeda** — jangan disamakan:

- **`dashboard`** — token TETAP untuk dashboard admin (React SPA). Nilai warna di sini (sidebar, tombol, indikator, dll) dipakai apa adanya untuk SEMUA travel, tidak berubah per-tenant. Sumbernya referensi desain yang diberikan pemilik produk — jangan diubah tanpa instruksi eksplisit.
- **`tenantWhitelabel`** — token DINAMIS untuk web publik whitelabel (Next.js). Nilai di file ini cuma **fallback/contoh**, bukan nilai final. Nilai asli **wajib** diambil runtime dari kolom `tenants.brand_primary_color` dan `tenants.brand_logo_url` di database, di-inject sebagai CSS custom property saat render per-tenant — bukan dibaca statis dari JSON ini.

Aturan umum:
- **Dilarang** menulis warna (hex/rgb), ukuran, atau nilai style lain langsung di komponen (baik dashboard maupun web publik).
- Kalau butuh token dashboard baru yang belum ada, tambahkan ke bagian `dashboard` di `design-tokens.json` dulu — jangan hardcode "sementara".
- Kalau butuh field branding tenant baru (misal warna sekunder), tambahkan kolom baru di tabel `tenants` (lihat Arsitektur-Teknis-KlikUmroh.md Bagian 6) — bukan menambah nilai tetap di `tenantWhitelabel`.

### 3.4 Ikon & Tipografi — Dilarang Emoji/Simbol Sebagai Pengganti Ikon

- **Dilarang keras** memakai emoji atau simbol Unicode (▲ ▼ ✓ ✗ 🕋 📅 👥 dll) di mana pun sebagai pengganti ikon fungsional atau dekoratif — baik di dashboard maupun web publik. Ini termasuk pemakaian sebagai placeholder "sementara".
- **Wajib** pakai `lucide-react` untuk semua kebutuhan ikon (panah indikator, kalender, jumlah orang, plus/tambah, placeholder gambar, dll). Warna ikon ikut `currentColor` atau CSS var yang relevan (`--db-positive`, `--db-negative`, dst) — bukan warna hardcoded terpisah dari ikon.
- **Font wajib**: `Nunito` untuk heading/display text, `Roboto` untuk body text — di kedua project (dashboard dan web publik). Dimuat via `next/font/google` di `/web` dan `@fontsource` di `/dashboard` (bukan link CDN eksternal saat runtime).
- Enforcement otomatis: script cek emoji/simbol (mirip `check-hardcoded-colors.js`) wajib ada dan dijalankan di CI/lint, supaya pelanggaran ketahuan sebelum merge, bukan lewat review visual manual.



### 3.5 Custom Domain & TLS

- **Jangan** menulis ACME client / logic penerbitan sertifikat dari nol. Semua provisioning TLS ditangani Caddy dengan konfigurasi on-demand TLS yang sudah ada.
- Endpoint validasi hostname (**ask endpoint**) yang dipanggil Caddy sebelum menerbitkan sertifikat **tidak boleh dilewati atau dilonggarkan** — ini satu-satunya pencegah penyalahgunaan penerbitan sertifikat untuk domain sembarangan.
- Redirect dari subdomain default ke custom domain **wajib** mempertahankan full path + query string (referral link bergantung pada ini). Jangan pernah redirect ke halaman depan/homepage saja.
- Dashboard admin **selalu** diakses via `klikumroh.id`, tidak pernah via custom domain travel — jangan ubah asumsi ini di kode routing/auth.
- **Backend Go (port API) WAJIB bind ke `127.0.0.1` saja, tidak pernah ke semua interface (`0.0.0.0`/`:PORT` polos)** — baik di lokal maupun production. `TenantResolutionMiddleware` mempercayai header `X-Forwarded-Host` yang dikirim Next.js (perlu, karena `fetch()` internal Next.js→Go tidak bisa mengirim header `Host` asli akibat pembatasan Fetch API). Kepercayaan ini HANYA aman selama backend tidak bisa dihubungi langsung dari luar mesin — kalau isolasi ini bocor, siapa pun bisa memalsukan `X-Forwarded-Host` dan menyuntik data ke tenant sembarangan lewat endpoint publik manapun.

### 3.6 Status Pipeline Prospek

Gunakan hanya status berikut, jangan buat status baru tanpa didiskusikan dulu:
```
Baru → Dihubungi → Tertarik → Closing / Tidak Lanjut
```
Funnel analitik per agen **wajib** menarik dari status pipeline yang sama ini (satu sumber data), bukan pencatatan status terpisah.

### 3.7 Non-Goals — Jangan Dikerjakan Tanpa Diminta Eksplisit

Fitur berikut secara sadar **di luar scope** produk ini. Jangan diimplementasikan meski tampak "berguna" atau "gampang ditambahkan":
- Manajemen dokumen/visa/akomodasi/keberangkatan/akuntansi travel.
- Integrasi API langsung ke ERP eksternal (Erahajj, MuslimPergi, dll) — cukup export CSV.
- Sistem CRM penuh (reminder follow-up otomatis, penugasan tugas, pipeline automation).
- Model marketplace terpusat lintas-travel.
- Layout desktop terpisah untuk web publik — **mobile-locked** untuk seluruh MVP (lihat 3.1 di Arsitektur-Teknis-KlikUmroh.md). Jangan usulkan atau implementasikan tampilan desktop khusus (grid multi-kolom, dst) untuk `/web` tanpa instruksi eksplisit.

### 3.8 Dilarang Mengubah Elemen yang Sudah Ditentukan Eksplisit Tanpa Persetujuan

Kalau suatu prompt sudah menentukan sesuatu secara eksplisit (warna tertentu, ikon tertentu, teks placeholder tertentu, aspect ratio, ukuran, dll), **dilarang mengubahnya sendiri** meski dengan alasan yang masuk akal (estetika, praktik terbaik, menghindari kesan tertentu). Kalau ada keberatan terhadap elemen yang sudah ditentukan — **laporkan keberatannya dan tunggu keputusan**, jangan ubah dulu baru dilaporkan belakangan sebagai "sudah diperbaiki". Ini berlaku juga untuk perubahan yang dilakukan "sambil lewat" saat mengerjakan task lain — task lain tidak memberi izin mengubah hal yang tidak diminta.

Contoh nyata yang pernah terjadi: mengganti ikon placeholder yang sudah ditentukan (`Star` → `Heart`) karena alasan "menghindari kesan rating palsu" — alasannya valid, tapi caranya salah. Yang benar: laporkan keberatan itu ke pendiri, biarkan dia yang putuskan penanganannya (bisa jadi solusinya di teks, bukan ikon).

### 3.9 Dependency Eksternal — Curigai Cara Pakai Sendiri Dulu, Verifikasi Jangan Asumsikan

Kalau sebuah library yang sudah dipilih secara sadar (misal harus pure-Go untuk kompatibilitas `CGO_ENABLED=0`) kelihatan "tidak berfungsi" atau menghasilkan output aneh, **curigai dulu cara pakainya sendiri** sebelum menyimpulkan library itu rusak dan menggantinya.

Kejadian nyata yang pernah terjadi: `skrashevich/go-webp` (pure-Go, pilihan yang benar) sempat dikira "rusak" karena hasil konversi membesar 3x dari ukuran asli. Akar masalah sebenarnya adalah format kanvas gambar yang salah dikirim ke encoder (`NRGBA` alih-alih `RGBA` murni) — bukan library-nya. Library itu diganti diam-diam ke `go-webpbin`, yang ternyata shell-out ke binary eksternal `cwebp` (bukan pure-Go) — di Windows dev ini "kelihatan berhasil" karena wrapper-nya otomatis mengunduh `cwebp.exe`, padahal ini bakal gagal total di VPS Linux produksi. Baru ketahuan berminggu-minggu kemudian lewat investigasi terpisah, setelah polanya keburu disalin ke modul lain.

Aturan konkret:
1. Library yang menghasilkan output mencurigakan (ukuran file membengkak, format rusak, dll) — investigasi cara pakai/parameter yang dikirim dulu, baru simpulkan library-nya bermasalah kalau memang terbukti dari kode sumbernya.
2. Kalau tetap harus mengganti library, ini termasuk kategori 3.8 — WAJIB dilaporkan eksplisit sebagai perubahan keputusan, jangan diam-diam diganti lalu dilanjutkan seolah tidak terjadi apa-apa.
3. Untuk dependency yang harus pure-Go: verifikasi dengan membaca kode sumber package (cek ada tidaknya `os/exec`, `exec.Command`, atau wrapper ke binary eksternal) — jangan percaya nama package atau kesan "kelihatannya pure-Go".
4. Hasil yang tidak masuk akal (misal ukuran "hasil kompresi" malah lebih besar dari aslinya) adalah alasan untuk investigasi lebih dalam, bukan alasan untuk lompat ganti tool.

### 3.10 Checklist Anti-Generik ("AI Slop") — Wajib Dicek Sebelum Lapor UI Selesai

Disarikan dari riset publik soal ciri-ciri desain yang gampang ketauan "asal dibikin AI" (bukan didesain sengaja) — berlaku untuk SEMUA kerjaan UI di project ini (Dashboard Admin, Web Publik, Dashboard Agen), bukan cuma sekali pakai.

**Layout & Kartu:**
- Jangan bungkus SEMUA elemen jadi kartu putih seragam dengan border-radius/shadow yang sama persis — itu bikin semuanya kelihatan sama pentingnya padahal nggak. Beri perlakuan visual beda buat elemen yang beda tingkat kepentingannya.
- Jangan spasi semua elemen identik rata — pakai spacing buat bikin hierarki, bukan keseragaman.

**Tombol & Komponen:**
- Border-radius tombol: **4-8px**, bukan bentuk pil penuh (`rounded-full`) kecuali memang ada alasan spesifik.
- Satu warna aksen kuat per halaman buat SATU aksi/elemen utama — jangan sebar warna aksen ke banyak elemen sekaligus (tombol, badge, ikon, teks) yang bikin semuanya "teriak" bareng dan nggak ada yang menonjol.
- Hindari ikon dibungkus lingkaran/kotak warna di mana-mana ("badge chrome") — itu template yang gampang ketauan generik, biarkan ikon berdiri sendiri kecuali memang perlu ditonjolkan.

**Tipografi:**
- Body text minimal 16px, line-height 1.5-1.8.
- Teks panjang (deskripsi, FAQ) rata kiri, bukan center-align.

**Warna:**
- Hindari pastel di semua elemen — tint warna cuma buat elemen sekunder, bukan default di mana-mana.

## 4. Struktur Folder (Acuan)

```
/cmd                      → entrypoint aplikasi Go
/internal
  /repository             → SATU-SATUNYA jalur akses database, wajib tenant_id
  /handler                → HTTP handler, tidak boleh query DB langsung
  /service                → business logic
  /middleware             → auth, tenant resolution, access log
/web                       → Next.js (situs publik whitelabel)
/dashboard                 → React SPA (admin travel)
/migrations                → migrasi skema database
design-tokens.json         → sumber kebenaran token warna/style per tenant
AGENTS.md                  → dokumen ini
PRD-KlikUmroh.md
Arsitektur-Teknis-KlikUmroh.md
```

Kalau struktur aktual di project berbeda dari ini, ikuti struktur yang sudah ada di project — jangan restrukturisasi folder tanpa diminta eksplisit.

---

## 5. Urutan Development yang Wajib Diikuti

1. **Setup & dependencies** (Go modules, Next.js, React dashboard scaffold).
2. **Repository layer + automated cross-tenant test** — foundation, harus lolos test sebelum lanjut ke langkah berikutnya.
3. **Component library & layout dasar** — Button, Card, Table, Badge, Form input, dll di dashboard (pakai token `dashboard`) dan web publik (pakai CSS var tenant). Dibangun sebelum fitur nyata supaya semua layar konsisten, bukan dirancang ulang per halaman.
4. **Core loop**: katalog paket, form minat, status pipeline, export CSV — wajib reuse komponen dari langkah 3.
5. **Infrastruktur multi-tenant**: subdomain routing, isolasi data teruji.
6. **Growth loop**: referral link, funnel per agen (terintegrasi status pipeline), leaderboard, event+RSVP, tips promosi.
7. **Custom domain**: Caddy + ask endpoint + redirect logic.
8. **Access log** (audit akses staf ke data tenant).
9. **Persiapan & deploy akhir** (lihat Sprint 7 di `sprint-plan.md`) — dikerjakan SETELAH poin 1-8 semua tuntas, bukan dicicil di tengah jalan. Scope Antigravity di langkah ini terbatas pada build artifact lokal dan dokumentasi (`DEPLOY.md`) — TIDAK menyentuh VPS. Deploy sungguhan tetap manual oleh pemilik produk.

Jangan lompat ke langkah lebih belakang sebelum langkah sebelumnya terverifikasi jalan.

### 5.1 Prosedur Migrasi Database & Pencegahan "Dirty Migration"
MySQL tidak mendukung transactional DDL (perintah `ALTER TABLE` / `CREATE TABLE` langsung melakukan *implicit COMMIT*). Jika sebuah file migrasi gagal di tengah jalan atau konflik, `golang-migrate` akan menandai state database sebagai `dirty = 1` dan menolak migrasi berikutnya. Patuhi 4 aturan wajib berikut:

1. **WAJIB Matikan Server Backend API (`cmd/api`) Sebelum Migrasi** — Proses server yang aktif memegang koneksi/transaksi terbuka dapat menahan *Exclusive Metadata Lock* (MDL) pada tabel MySQL, menyebabkan `ALTER TABLE` timeout atau gagal di tengah eksekusi.
2. **DILARANG Mengeksekusi DDL (`ALTER TABLE`, `CREATE TABLE`, `DROP INDEX`) Manual ke Database** — Jangan pernah mengubah skema secara manual via CLI/query ad-hoc sebelum membuat file migrasi. Semua modifikasi skema WAJIB didefinisikan di file `migrations/` dan dieksekusi HANYA melalui `go run ./cmd/migrate`.
3. **Pembersihan Data Test (Data Cleanup)** — Automated test yang memasukkan data uji langsung ke database nyata WAJIB membersihkan datanya kembali (`t.Cleanup()` atau `defer`), agar tidak meninggalkan baris yang melanggar constraint baru di migrasi berikutnya (misal: duplicate entry saat migrasi menambah unique index).
4. **Pemulihan Bila Terjadi Dirty State** — Gunakan perintah `go run ./cmd/migrate force <target_version>` yang sudah tersedia di runner untuk me-reset flag dirty setelah penyebab error DDL/data dibersihkan. Jangan mengedit tabel `schema_migrations` manual jika tidak terpaksa.

---

## 6. Verifikasi — Wajib Setiap Selesai Task

Jangan laporkan task selesai tanpa menjalankan dan melaporkan hasil berikut:

1. `go build ./...` — STOP dan laporkan jika ada error, jangan lanjut memperbaiki hal lain.
2. `go test ./...` — semua test harus pass, termasuk cross-tenant test (Bagian 3.1).
3. Untuk perubahan UI: pastikan tidak ada warna/style hardcoded baru (cek terhadap `design-tokens.json`).
4. Untuk perubahan routing/domain: konfirmasi redirect masih mempertahankan path & query string.
5. **Dilarang menggunakan screenshot sebagai bukti verifikasi apa pun.** Bukti wajib berupa data yang bisa diverifikasi ulang secara independen: hasil query database mentah, output test dengan breakdown sub-test, response JSON dari curl/Postman, atau isi file. Kalau suatu hal genuinely butuh dicek visual (tampilan UI, layout), jangan ambil screenshot sendiri — laporkan bagian mana yang perlu dicek dan minta pendiri yang verifikasi manual langsung di browser.

Format laporan: test satu per satu, tandai ✅/❌, STOP di test pertama yang gagal — jangan lanjut ke test berikutnya sebelum yang gagal dilaporkan.

---

## 7. Cara Memberi Instruksi ke Antigravity (Acuan Prompt)

- **Batasi scope eksplisit** setiap prompt: sebutkan file/folder yang boleh disentuh. Contoh: "Fokus HANYA pada `/internal/repository/prospect.go`. Jangan ubah file lain."
- **Debug**: minta investigasi dulu (tambah log, jalankan, laporkan output) sebelum minta fix langsung.
- **Redesign/replace**: sertakan langkah eksplisit hapus file lama sebelum membuat ulang, jangan biarkan file lama menggantung.
- **Kalau fix sebelumnya gagal**: rollback dulu (`git checkout HEAD -- {file}`) sebelum mencoba pendekatan lain — jangan menumpuk fix di atas fix yang belum jelas akar masalahnya.

### Restart Server (Windows/Laragon)
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort {PORT}).OwningProcess -Force
go run .
```

---

## 8. Anti-Pattern yang Harus Dihindari

| ❌ Jangan | ✅ Lakukan |
|---|---|
| Query database langsung di handler | Selalu lewat repository layer dengan `tenant_id` |
| Warna/style hardcoded "sementara" | Tambahkan ke `design-tokens.json` dulu |
| Endpoint baru tanpa cross-tenant test | Test isolasi tenant wajib sebelum endpoint dianggap selesai |
| Redirect custom domain ke homepage | Redirect wajib mempertahankan path + query string |
| Menambah fitur di luar scope (lihat 3.7) tanpa konfirmasi | Tanyakan dulu jika fitur terasa di luar cakupan produk |
| Pakai emoji/simbol Unicode (▲▼✓🕋 dll) sebagai pengganti ikon | Pakai lucide-react, ikuti aturan 3.4 |
| Fix bug langsung tanpa investigasi | Log dan laporkan temuan dulu, baru lakukan fix |
| Menumpuk fix baru di atas fix yang gagal | Rollback dulu via git, baru coba pendekatan lain |
| Implementasi ACME/TLS custom sendiri | Gunakan konfigurasi Caddy yang sudah ada |
| Membuat markup/style UI baru dari nol padahal sudah ada komponen dasar yang cocok | Reuse/extend komponen dari fase Component Library (lihat AGENTS.md Bagian 5 poin 3) |
| Mengubah ikon/warna/teks/ukuran yang sudah ditentukan eksplisit di prompt, meski alasannya masuk akal | Laporkan keberatan, tunggu keputusan (lihat 3.8) |
| Mengganti library karena "kelihatan tidak berfungsi" tanpa cek cara pakai sendiri dulu | Curigai pemakaian sendiri dulu, verifikasi kode sumber, laporkan sebelum ganti (lihat 3.9) |
| Menjalankan migrasi database saat server API cmd/api aktif | Matikan server API terlebih dahulu sebelum migrasi (lihat 5.1) |
| Mengeksekusi DDL ALTER TABLE manual di luar script migrasi | Selalu tulis skema di folder migrations/ dan jalankan lewat runner |
| Mengubah constraint email admin_users jadi per-tenant | Email admin_users WAJIB unik global karena login satu pintu terpusat di klikumroh.id |

---

## 9. Kalau Ragu

Kalau instruksi di suatu prompt tugas ambigu, bertentangan dengan aturan di dokumen ini, atau menyentuh area kritis (Bagian 3) tanpa penjelasan cukup — **berhenti dan tanyakan**, jangan menebak atau memilih interpretasi yang "kelihatannya masuk akal". Salah asumsi di area isolasi data atau custom domain berisiko tinggi dan sulit dideteksi sampai sudah jadi masalah nyata.
