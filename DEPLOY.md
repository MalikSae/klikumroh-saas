# Panduan Deployment & Konfigurasi Produksi — KlikUmroh.id

Dokumen ini memuat panduan langkah manual yang **HARUS dilakukan sendiri oleh pendiri/pemilik produk** saat melakukan deployment ke server produksi (VPS aaPanel).

> [!WARNING]
> **BATASAN AI AGENT (ANTIGRAVITY):**
> Antigravity dilarang mengeksekusi konfigurasi Caddy/Nginx secara langsung pada server produksi atau memegang kredensial VPS produksi. Seluruh langkah di bawah ini didokumentasikan untuk dijalankan secara manual oleh pemilik produk.

---

## 0. Build & Urutan Deploy

> [!IMPORTANT]
> **Server aaPanel bersama (tanpa VPS khusus).** Keputusan 12 Okt 2026: KlikUmroh berjalan di server aaPanel yang dipakai 100+ situs lain, tanpa Caddy dan tanpa mengubah Nginx `stream` di port 80/443. Ikuti **Bagian 7**. Bagian 2, 3, dan 4 (Caddy on-demand TLS, endpoint ask, stream SNI) hanya berlaku bila nanti KlikUmroh pindah ke server sendiri.

### 0.0 Port produksi (12 Okt 2026)

Server aaPanel yang dipakai bersama banyak situs lain sudah memakai port `8080` dan `3000` (aplikasi lain, status Listening). Karena itu **produksi memakai `18080` untuk backend dan `13000` untuk web**; seluruh dokumen ini sudah memakai angka itu. Pengembangan lokal tetap `8080` dan `3000`.

- Sebelum memakai port itu, pastikan masih kosong: `ss -lntp | grep -E ':(18080|13000)\b'` tidak boleh menampilkan apa pun. Kalau terpakai, pilih angka lain dan ganti di semua tempat yang disebut di bawah.
- Tempat yang harus konsisten: `PORT` di `.env` backend, `PORT` dan `BACKEND_INTERNAL_URL` di Node.js Project, **env saat `npm run build` web** (lihat 0.3), field port Go Project dan Node.js Project, `ask` dan `reverse_proxy` di Caddyfile, serta perintah uji.
- Jangan membuka kedua port di firewall aaPanel. Keduanya hanya didengar di `127.0.0.1`.

Tiga bagian yang dijalankan di VPS, semuanya hanya didengar di loopback dan di belakang Caddy:

| Bagian | Bentuk | Listen | Dijalankan sebagai |
|---|---|---|---|
| Backend Go (`cmd/api`) | binary `klikumroh-api` | `127.0.0.1:18080` | service (systemd / Supervisor aaPanel) |
| Web publik Next.js (`web/`) | output standalone `server.js` | `127.0.0.1:13000` | aaPanel Node.js Project |
| Dashboard React (`dashboard/`) | file statis `dist/` | — (disajikan Caddy) | Bagian 2a |

### 0.1 Tata letak di server

Gunakan satu checkout repo, misal `/www/wwwroot/klikumroh`. Backend **wajib** dijalankan dengan working directory = root repo, karena path berikut relatif terhadapnya:
- `.env` (dibaca `godotenv`)
- `migrations/` (dibaca `klikumroh-migrate`)
- `uploads/` (gambar publik) dan `storage/private/` (bukti transfer, tidak pernah disajikan publik)
- `demo/fixtures.json`, `demo/assets/` (dibaca `klikumroh-seed-demo`)

`uploads/` dan `storage/` berisi data pengguna: ikut di-backup, jangan pernah dihapus saat deploy, dan tidak ada di git.

### 0.2 Environment produksi

`.env` di root repo diisi **manual oleh pemilik produk** (AGENTS.md 3.2). Acuan nama variabel: `.env.example`.

Backend (`.env`):
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: user MySQL khusus aplikasi, bukan `root`.
- `HOST=127.0.0.1` (atau kosong; backend menolak start di alamat non-loopback), `PORT=18080`.
- `APP_ENCRYPTION_KEY`: Bagian 3a. Simpan cadangannya; kalau hilang, token Meta yang tersimpan tidak bisa dibaca.
- `PLATFORM_IPS`: Bagian 4a. `AUTH_COOKIE_DOMAIN` hanya bila domain platform bukan `klikumroh.id`.
- `DEMO_*`: Bagian 5. `META_GRAPH_VERSION` opsional.
- **Jangan** isi `SEED_*` di produksi.

Web Next.js (env di aaPanel Node.js Project, bukan di `.env` root):
- `NODE_ENV=production`
- `HOSTNAME=127.0.0.1`, `PORT=13000`: wajib loopback (Bagian 4.2a).
- `BACKEND_INTERNAL_URL=http://127.0.0.1:18080`: **wajib diisi**. Beberapa file memakai default `http://localhost:18080`, dan di Linux `localhost` bisa resolve ke `::1` sementara backend hanya mendengar IPv4.
- `PLATFORM_ORIGIN=https://klikumroh.id`.

Dashboard: jangan isi `VITE_API_BASE` (Bagian 2a).

### 0.3 Build

**Backend (Go).** Pure Go, `CGO_ENABLED=0`, tidak butuh library sistem atau binary eksternal. Pilih salah satu:
- di komputer lokal: `bash scripts/build-linux.sh` (Git Bash/Linux) atau `powershell -ExecutionPolicy Bypass -File scripts\build-linux.ps1` (Windows), lalu upload `dist/klikumroh-api`, `dist/klikumroh-migrate`, `dist/klikumroh-seed-demo`, `dist/klikumroh-create-staff` ke `bin/` di root repo server dan `chmod +x`;
- di server (bila Go terpasang): `bash scripts/build-linux.sh`, hasil di `dist/`.

**Web (Next.js), di server.** Build di VPS Linux, jangan upload hasil build Windows (dependensi native di `node_modules` berbeda per OS). `BACKEND_INTERNAL_URL` **wajib ada di env saat build**: rewrite `/api` dan `/uploads` di `next.config.ts` dikompilasi saat build, bukan saat server berjalan.
```bash
cd /www/wwwroot/klikumroh/web
npm ci
BACKEND_INTERNAL_URL=http://127.0.0.1:18080 npm run build
# server.js ada di .next/standalone/web/ (root tracing = root repo, karena web/ mengimpor ../design-tokens.json)
cp -r public .next/standalone/web/
mkdir -p .next/standalone/web/.next && cp -r .next/static .next/standalone/web/.next/
```
Di aaPanel Node.js Project: run directory `/www/wwwroot/klikumroh/web/.next/standalone/web`, entry file `server.js`, port `13000`, env sesuai 0.2. Langkah `cp` wajib diulang setiap build; tanpa itu CSS/JS dan file `public/` 404.

**Dashboard (React):** Bagian 2a (`npm ci && npm run build`, salin `dist/`).

### 0.3a Isian form aaPanel

aaPanel hanya menjalankan dan mengawasi file yang sudah ada di disk; ia bukan alat deploy dari Git.

**Go Project (backend):**

| Field | Isi |
|---|---|
| Executable File | `/www/wwwroot/klikumroh/bin/klikumroh-api` |
| Project Name | `klikumroh-api` |
| Project Port | `18080` |
| Execution Command | `/www/wwwroot/klikumroh/bin/klikumroh-api` (working directory **harus** `/www/wwwroot/klikumroh`; kalau form tidak punya field working directory, pakai `cd /www/wwwroot/klikumroh && ./bin/klikumroh-api`) |
| Run User | user non-root yang memiliki folder repo, misal `www` |
| Domain name | **kosongkan**. Domain ditangani Caddy; jangan biarkan aaPanel membuat vhost Nginx untuk port 18080 (backend tidak boleh terbuka ke internet). |

**Node.js Project (web publik):**

| Field | Isi |
|---|---|
| Project directory / run directory | `/www/wwwroot/klikumroh/web/.next/standalone/web` |
| Entry file / startup file | `server.js` |
| Project Name | `klikumroh-web` |
| Project Port | `13000` |
| Run User | user yang sama, misal `www` |
| Environment variables | `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `PORT=13000`, `BACKEND_INTERNAL_URL=http://127.0.0.1:18080`, `PLATFORM_ORIGIN=https://klikumroh.id` |
| Domain name | **kosongkan**, alasan sama: Caddy yang menerima domain. |

Setelah keduanya jalan, cek dari luar server bahwa `http://IP_VPS:18080` dan `http://IP_VPS:13000` **tidak** bisa dihubungi (Bagian 3, 4.2a). Kalau aaPanel membuka port itu di firewall panel, tutup kembali.

### 0.4 Urutan deploy (setiap rilis)

1. `cd /www/wwwroot/klikumroh && git pull`
2. **Backup database** dan file data:
   ```bash
   mysqldump --single-transaction -u <user_backup> -p <DB_NAME> > ~/backup/klikumroh-$(date +%F-%H%M).sql
   tar czf ~/backup/klikumroh-files-$(date +%F-%H%M).tgz uploads storage
   ```
3. **Matikan backend** sebelum migrasi (AGENTS.md 5.1: koneksi aktif bisa menahan metadata lock dan membuat migrasi gagal setengah jalan).
4. Migrasi dari root repo: `./bin/klikumroh-migrate up` (atau `./dist/klikumroh-migrate up`).
   - Kalau gagal dan versi tercatat `dirty`: perbaiki penyebabnya, lalu `./bin/klikumroh-migrate force <versi_terakhir_yang_berhasil>`, lalu `up` lagi.
   - > [!CAUTION]
     > **Jangan pernah menjalankan `klikumroh-migrate down` di produksi.** Perintah itu membatalkan **semua** migrasi sampai nol (`m.Down()`), bukan satu langkah. Hasilnya sama dengan menghapus seluruh tabel dan data. Rollback produksi = restore backup langkah 2.
5. Pasang binary baru dan nyalakan backend; cek `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/api/public/platform-settings` → `200`.
6. Build web (0.3), lalu restart Node.js Project di aaPanel.
7. Build dan salin dashboard (Bagian 2a).
8. Uji asap dari luar server:
   - `https://klikumroh.id` (landing) dan satu `https://<slug>.klikumroh.id` (website travel) tampil dengan CSS lengkap;
   - `https://app.klikumroh.id/api/public/pricing-plans` → `200`;
   - login dashboard travel dan super admin;
   - uji di Bagian 2a, 4.2a, dan 4.3 bila konfigurasi Caddy/Nginx berubah.

**Rollback:** checkout commit/tag sebelumnya, pasang binary lama, build ulang web/dashboard. Kalau rilis yang gagal sudah menjalankan migrasi, restore database dari backup langkah 2 (jangan `migrate down`).

### 0.5 Risiko yang belum tervalidasi di lingkungan nyata

Uji dua hal ini **paling awal** di sesi deploy pertama, sebelum langkah lain, supaya masalah ketahuan cepat:
1. **Next.js standalone di Linux/aaPanel.** Sudah diuji di lokal Windows (5 Okt 2026, `node .next/standalone/web/server.js` dengan `HOSTNAME=127.0.0.1`): halaman dua travel tampil sesuai tenant masing-masing, rewrite `/api` dan `/uploads` ke backend, file `public/`, dan chunk `/_next/static` semuanya `200`. Belum pernah dijalankan di Linux maupun lewat aaPanel Node.js Project.
2. **Nginx stream SNI + PROXY protocol (Bagian 4, 4.2a).** Belum pernah dijalankan di VPS. Kesalahan konfigurasi bisa membuat situs aaPanel lain tidak tampil, atau membuat semua pengunjung terbaca `127.0.0.1`.

---

## 1. Setup DNS Zone `klikumroh.id` (Cloudflare)

Zona `klikumroh.id` ada di Cloudflare (paket Free, DNS Setup: Full). Per 12 Okt 2026 isinya baru 3 record: `store` (CNAME ke `domains.scalev.id`, **bukan** bagian KlikUmroh, biarkan) dan dua TXT (`_acme-challenge`, `_cf-custom-hostname`). Belum ada record yang mengarah ke server KlikUmroh, jadi landing, subdomain travel, dan dashboard belum bisa dibuka.

Ganti `IP_VPS` dengan IPv4 publik server tujuan (Caddy mendengar di sana).

### 1.1 Record yang dibuat

| Name | Type | Content | Proxy | Fungsi |
|---|---|---|---|---|
| `cname` | A | `IP_VPS` | **DNS only (abu-abu)** | Target CNAME custom domain travel. Wajib abu-abu (HTTP-01 Caddy). Backend juga membaca IP ini sebagai `PLATFORM_IPS` (Bagian 4a). |
| `@` (`klikumroh.id`) | A | `IP_VPS` | DNS only | Landing, checkout, login. |
| `*` | A | `IP_VPS` | DNS only | `<slug>.klikumroh.id` website travel, `app.`, `demo.`. |
| `www` | CNAME | `klikumroh.id` | DNS only | Bagian 4a: www ke apex lewat redirect Caddy. |
| `store` | CNAME | `domains.scalev.id` | Proxied | Sudah ada, milik pihak lain. Jangan diubah. |

Catatan:
- `app.klikumroh.id` (dashboard travel dan super admin, Bagian 2a) tercakup record `*`. Boleh dibuat eksplisit supaya jelas.
- Record eksplisit selalu menang atas `*`, jadi `store` tetap ke Scalev. Slug `store` sudah masuk daftar kata cadangan subdomain (`internal/service/public_signup.go`), jadi travel tidak bisa memilihnya.
- Tambahkan `AAAA` untuk `cname`, `@`, dan `*` **hanya jika** Caddy benar-benar melayani IPv6 server.
- TTL `Auto` (Cloudflare) cukup. Turunkan ke 300 detik hanya saat pindah server.

### 1.2 Kenapa semuanya DNS only (abu-abu)

Rancangan ini mengandalkan IP pengunjung asli: penjaga self-referral affiliator, rate limit, dan log klik membaca alamat klien dari PROXY protocol (Bagian 4, 4.2a). Kalau record di-proxy (awan oranye), yang sampai ke server adalah IP Cloudflare dan repo ini belum menangani `CF-Connecting-IP`. Karena itu **saat peluncuran semua record KlikUmroh abu-abu**, dan sertifikat diterbitkan Caddy langsung.

Konsekuensinya: tidak ada perlindungan DDoS Cloudflare di depan situs. Kalau nanti ingin di-proxy, kerjakan dulu sebagai pekerjaan terpisah: percayai `CF-Connecting-IP` hanya dari rentang IP Cloudflare, lalu uji self-referral dan rate limit.

> [!NOTE]
> Di mode server bersama (Bagian 7) `@`, `*`, dan `www` **di-proxy (oranye)** dan IP pengunjung dibaca dari `CF-Connecting-IP` oleh Nginx. Hanya `cname` yang tetap abu-abu.

### 1.3 Setelan Cloudflare lain

- **SSL/TLS > Overview**: saat ini `Full`. Karena semua record abu-abu, mode ini tidak berpengaruh ke lalu lintas KlikUmroh. Kalau suatu saat di-proxy, pakai `Full (strict)` setelah Caddy punya sertifikat valid.
- **Edge Certificates**: Universal SSL aktif untuk `klikumroh.id` dan `*.klikumroh.id`. Hanya relevan bila record di-proxy.
- **Custom Hostnames (SSL for SaaS)**: tidak dipakai. Custom domain travel diterbitkan Caddy (Skenario A di `Arsitektur-Teknis-KlikUmroh.md`).
- **Email**: footer landing memuat `support@klikumroh.id` tetapi zona belum punya MX. Aktifkan Email Routing Cloudflare (gratis, meneruskan ke kotak masuk pendiri) atau tambahkan MX penyedia email, dan SPF/DKIM/DMARC bila mengirim email.

### 1.4 Cara travel memakainya

Setelah `cname.klikumroh.id` ada, travel yang memakai domain sendiri cukup menambahkan:

```
Type:  CNAME
Name:  umroh (atau subdomain yang diinginkan)
Target: cname.klikumroh.id
```

Domain utama tanpa subdomain (misal `travelamanah.com`) tidak boleh memakai CNAME, jadi memakai **A record** ke `IP_VPS`. Pasangan www / tanpa www ada di Bagian 4a.

### 1.5 Verifikasi

```bash
dig +short cname.klikumroh.id        # harus IP_VPS
dig +short klikumroh.id              # harus IP_VPS
dig +short demo.klikumroh.id         # harus IP_VPS (lewat wildcard)
dig +short store.klikumroh.id        # tetap milik Scalev
```

> [!NOTE]
> Record `cname.klikumroh.id` juga dipakai backend untuk mengetahui IP server (`PLATFORM_IPS`, Bagian 4a). Kalau server berpindah IP, ubah record ini dan nilai `PLATFORM_IPS` bersamaan.

---

## 2. Konfigurasi Caddy On-Demand TLS

Caddy bertindak sebagai reverse proxy yang menangani penerbitan sertifikat SSL/TLS otomatis secara on-demand via Let's Encrypt HTTP-01 challenge.

### Caddyfile Snippet

Tambahkan konfigurasi `on_demand_tls` di `Caddyfile` server:

```caddy
{
    # Global options
    on_demand_tls {
        # Endpoint validasi internal aplikasi Go
        ask http://127.0.0.1:18080/internal/domain-ask
        
        # Rate limiting pencegah abuse rate limit Let's Encrypt
        interval 2m
        burst 5
    }
}

# Blok server untuk menangani custom domain dinamis
https:// {
    tls {
        on_demand
    }

    # Teruskan request ke Next.js Web Frontend (Port 13000)
    reverse_proxy 127.0.0.1:13000 {
        header_up Host {host}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Blok global ini juga harus memuat `http_port`, `https_port`, dan `servers :8443 { listener_wrappers { proxy_protocol ... } }` dari Bagian 4.2a. Tanpa itu backend melihat semua pengunjung sebagai `127.0.0.1`.

### Parameter Kunci:
- **`ask http://127.0.0.1:18080/internal/domain-ask`**: Caddy akan otomatis memanggil URL ini sebelum meminta sertifikat baru. Backend Go akan merespons `200 OK` **hanya jika** hostname terdaftar dengan `type='custom'` dan `status='active'`. Jika tidak (atau berstatus `pending`/`failed`), backend merespons `404`, dan Caddy langsung menolak penerbitan TLS. Ini mencegah server disalahgunakan untuk menerbitkan sertifikat domain acak.
- **`burst 5` & `interval 2m`**: Membatasi penerbitan maksimal 5 sertifikat baru per 2 menit untuk mematuhi rate limit Let's Encrypt.

---

## 2a. Dashboard Travel & Super Admin di `app.klikumroh.id`

Dashboard (React SPA di folder `dashboard/`) disajikan di subdomain sendiri, `app.klikumroh.id`. Rutenya (`/`, `/prospects`, `/settings/...`, `/internal/...`) bentrok dengan web Next.js kalau ditaruh di `klikumroh.id`.

Alur login:
- Travel login di `https://klikumroh.id/login`, lalu dibuka `https://app.klikumroh.id/#handoff=...`. URL hanya berisi **kode sekali pakai** (berlaku 2 menit), bukan token. Respons login juga memasang cookie HttpOnly `ku_handoff` di domain `klikumroh.id` (path `/api/auth/handoff`). Dashboard menukar kode itu lewat `POST /api/auth/handoff/exchange`, dan penukaran hanya berhasil di browser yang memegang cookie tersebut. Jadi link berisi kode milik orang lain tidak bisa memasukkan pengunjung ke akun orang itu (login CSRF).
- Domain cookie ditentukan otomatis: host `klikumroh.id` atau `*.klikumroh.id` mendapat `Domain=klikumroh.id`. Jika domain platform berubah, isi `AUTH_COOKIE_DOMAIN` di `.env` backend.
- Kode handoff disimpan di memori proses Go. Jika backend nanti dijalankan lebih dari satu instance di belakang load balancer, penyimpanan ini harus dipindah ke database atau Redis dulu.
- Tanpa sesi, dashboard mengalihkan ke `https://klikumroh.id/login`.
- Super admin login langsung di `https://app.klikumroh.id/internal/login`.

### DNS
Tidak perlu record baru jika wildcard `*.klikumroh.id` sudah mengarah ke VPS (dipakai juga oleh subdomain travel). Jika belum ada wildcard, tambahkan **A record** `app` ke IP VPS dengan **DNS Only (Grey Cloud)**.

Slug `app` sudah termasuk slug terlarang saat pendaftaran (`reservedSlugs` di `internal/service/public_signup.go`), jadi tidak ada travel yang bisa memakai `app.klikumroh.id`.

### Build
```bash
cd dashboard
npm ci
npm run build
```
Salin isi `dashboard/dist/` ke server, misalnya ke `/var/www/klikumroh-dashboard/`.

Jangan isi `VITE_API_BASE`. Tanpa variabel itu dashboard memanggil API di origin-nya sendiri (`https://app.klikumroh.id/api/...`), dan Caddy meneruskannya ke backend Go.

### Caddyfile
Tambahkan blok ini di samping blok `https://` on-demand di atas:

```caddy
app.klikumroh.id {
    encode gzip

    # API dan file upload diteruskan ke backend Go (hanya didengar di 127.0.0.1).
    handle /api/* {
        reverse_proxy 127.0.0.1:18080
    }
    handle /uploads/* {
        reverse_proxy 127.0.0.1:18080
    }

    # Selain itu file statis SPA. Path yang tidak ada (misal /prospects/12) jatuh ke index.html.
    handle {
        root * /var/www/klikumroh-dashboard
        try_files {path} /index.html
        file_server
    }
}
```

> [!WARNING]
> **Jangan** teruskan `/internal/*` ke backend Go. Di domain ini `/internal/...` adalah halaman super admin milik SPA. Endpoint Go `/internal/domain-ask` hanya untuk Caddy dan tidak boleh bisa diakses dari internet (Bagian 3).

Blok dengan hostname eksplisit seperti ini mendapat sertifikat TLS biasa dari Caddy. Ia tidak lewat `on_demand`/ask endpoint, dan Caddy memilihnya lebih dulu daripada blok `https://`. Di Nginx SNI (Bagian 4), `app.klikumroh.id` ikut aturan `*.klikumroh.id` ke Caddy.

### Cara uji
1. `curl -s -o /dev/null -w "%{http_code}\n" https://app.klikumroh.id/api/public/pricing-plans` menghasilkan `200`.
2. `curl -s "https://app.klikumroh.id/internal/domain-ask?domain=contoh.com" | head -c 60` harus menampilkan awal HTML SPA (`<!doctype html>`), bukan respons dari backend Go.
3. Buka `https://app.klikumroh.id/prospects` tanpa login. Browser harus dialihkan ke `https://klikumroh.id/login`.
4. Login di `https://klikumroh.id/login` dengan travel uji. Browser harus mendarat di `https://app.klikumroh.id/` dan `#handoff=` hilang dari address bar. Di DevTools > Application > Cookies, `ku_handoff` harus ber-domain `.klikumroh.id` dan terhapus setelah dashboard terbuka. Travel yang belum bayar harus mendarat di halaman tagihan.
5. Klik **Keluar**, lalu buka `https://klikumroh.id` dan pilih paket. Form checkout harus tampil, bukan dashboard.

---

## 3. Keamanan Endpoint Ask (/internal/domain-ask)

> [!CAUTION]
> **KEPUTUSAN KEAMANAN NETWORK & FIREWALL LEVEL:**
> Endpoint `/internal/domain-ask` adalah endpoint tanpa autentikasi token karena dipanggil secara native oleh Caddy saat handshake TLS. Oleh karena itu, endpoint ini **HANYA BOLEH DIAKSES DARI LOCALHOST / CADDY INTERNAL**, dan **TIDAK BOLEH DIBUKA KE INTERNET PUBLIK**.

### Pengamanan di Level VPS:
1. **Backend Go Bind Localhost:**
   Pastikan backend Go selalu bind ke `127.0.0.1:18080` (sudah ditegakkan di konfigurasi default `.env` dan `AGENTS.md` Bagian 3.5), bukan `0.0.0.0:18080`.
2. **Firewall VPS (UFW / Iptables):**
   Port `18080` tidak boleh dibuka pada security group VPS / Firewall cloud publik.
3. **Nginx Public Reverse Proxy:**
   Pastikan konfigurasi virtual host publik Nginx tidak memiliki blok `proxy_pass` yang memetakan path `/internal/` ke publik.

---

## 3a. Kunci Enkripsi Token (APP_ENCRYPTION_KEY)

Token Conversions API Meta milik tiap travel disimpan terenkripsi (AES-256-GCM) memakai `APP_ENCRYPTION_KEY` di `.env` backend.

- **Diisi manual oleh pemilik produk di VPS**, tidak pernah oleh AI agent (AGENTS.md 3.2). Buat dengan: `openssl rand -base64 32`.
- Simpan cadangannya di tempat aman. **Jika kunci diganti atau hilang, semua token yang tersimpan tidak bisa dibaca** dan setiap travel harus memasukkan ulang tokennya di Pengaturan > Integrasi Meta.
- Tanpa kunci ini backend tetap jalan: Pixel di situs travel tetap aktif, tetapi token tidak bisa disimpan dan event server (Conversions API) tidak dikirim. Log startup menulis `[Meta] Conversions API disabled`.
- Backend mengirim event ke `graph.facebook.com` (HTTPS keluar). Pastikan firewall VPS mengizinkan koneksi keluar ke port 443.
- Versi Marketing API diatur lewat `META_GRAPH_VERSION` (default `v25.0`). Versi Meta punya tanggal kedaluwarsa: cek [daftar versi](https://developers.facebook.com/docs/graph-api/changelog/versions) setiap Meta merilis versi baru (sekitar tiap 4-6 bulan), naikkan nilainya, lalu restart backend dan kirim event uji dari salah satu travel.

---

## 4. Koeksistensi Port 80 & 443 (Nginx Stream SNI di aaPanel)

Karena VPS menjalankan Nginx (aaPanel) bersama puluhan website lain, Caddy tidak bisa langsung bind ke port publik 80/443. Gunakan Nginx Layer-4 `stream` SNI routing:

1. Buat file baru: `/www/server/panel/vhost/nginx/tcp/klikumroh-sni.conf`
2. Konfigurasi SNI mapping:
   - Traffic SNI dengan hostname KlikUmroh & custom domain mitra diteruskan ke Caddy internal (misal port 8443).
   - Traffic domain website lain di VPS diteruskan ke Nginx default (port internal 4433).
3. Jalankan `nginx -t` lalu reload Nginx dari panel.

> [!WARNING]
> **Belum pernah divalidasi di VPS.** Semua poin di bawah adalah keputusan dan pengecekan yang wajib dilakukan pemilik produk saat deploy, sebelum ada travel yang memakai custom domain. Contoh konfigurasi hanya ilustrasi, bukan konfigurasi yang sudah teruji.

### 4.1 Keputusan: ke mana `default` SNI diarahkan

Domain custom travel **tidak diketahui sebelumnya** dan terus bertambah (setiap travel yang menghubungkan domainnya). Nginx `stream` membaca hostname dari SNI (`ssl_preread`) dan mencocokkannya dengan `map`; domain yang tidak tercantum jatuh ke `default`. Ada dua pilihan, pilih salah satu sebelum deploy:

| Pilihan | Cara kerja | Konsekuensi |
|---|---|---|
| **A. `default` → Caddy** | Semua website lain di VPS (±116 situs aaPanel) dicantumkan eksplisit ke Nginx; semua hostname lain ke Caddy. | Domain travel baru langsung jalan tanpa ubah Nginx. Setiap situs baru di aaPanel **wajib** ditambahkan ke daftar, kalau lupa situs itu jatuh ke Caddy dan tidak tampil. |
| **B. `default` → Nginx** | Hanya `klikumroh.id`, `*.klikumroh.id`, dan domain travel yang sudah aktif dicantumkan ke Caddy. | Situs aaPanel lain aman. Setiap domain travel yang aktif harus ditulis ke file map lalu Nginx di-reload (perlu mekanisme otomatis atau langkah manual per travel); sebelum itu domain travel tidak jalan meski DNS-nya benar. |

Contoh bentuk `map` (ilustrasi pilihan A):

```nginx
map $ssl_preread_server_name $klikumroh_upstream {
    hostnames;
    situs-lain-satu.com      nginx_https;   # ulangi untuk setiap situs aaPanel
    .situs-lain-dua.com      nginx_https;
    default                  caddy_https;   # klikumroh.id, *.klikumroh.id, custom domain travel
}
upstream caddy_https { server 127.0.0.1:8443; }
upstream nginx_https { server 127.0.0.1:4433; }
server {
    listen 443;
    listen [::]:443;
    ssl_preread on;
    proxy_pass $klikumroh_upstream;
}
```

Catatan: agar Nginx `stream` bisa memegang port 443, virtual host HTTPS aaPanel yang ada harus dipindah ke port internal (misal `4433`). Cek juga apakah aaPanel mengembalikan `listen 443` saat situs diedit dari panel.

### 4.2 Port 80 (HTTP)

SNI hanya ada di HTTPS; `stream` tidak bisa membedakan hostname di port 80. Port 80 tetap dipegang Nginx biasa, sehingga:

- Pengunjung yang mengetik `http://namatravel.com` hanya sampai ke website travel jika Nginx punya `server` **default** di port 80 yang meneruskan host yang tidak dikenal ke port HTTP internal Caddy (misal Caddy `http_port 8081`, lalu `proxy_pass http://127.0.0.1:8081;` dengan `proxy_set_header Host $host;`). Jangan arahkan ke `18080`: itu port backend Go yang tidak boleh terbuka ke publik (Bagian 3). Caddy lalu mengalihkan ke HTTPS.
- Penerbitan sertifikat: Caddy mencoba challenge **HTTP-01** (butuh port 80 sampai ke Caddy) dan **TLS-ALPN-01** (lewat port 443, jalan selama SNI mengarah ke Caddy). Jika port 80 tidak diteruskan, pastikan TLS-ALPN-01 aktif (bawaan Caddy) dan uji penerbitan satu domain sebelum membuka fitur ke travel.
- Server default port 80 yang sudah ada di aaPanel (jika ada) harus dicek agar tidak menelan domain travel.

### 4.2a IP pengunjung asli sampai ke backend (PROXY protocol)

**Masalah.** Nginx `stream` meneruskan koneksi TLS apa adanya (Layer 4), jadi Caddy melihat semua pengunjung datang dari `127.0.0.1`. Caddy lalu menulis `X-Forwarded-For: 127.0.0.1` untuk semua request, Next.js meneruskannya apa adanya, dan backend Go (`middleware.ClientIP`, entri pertama `X-Forwarded-For`) menganggap semua orang satu IP. Akibatnya:
- semua rate limiter per IP (login travel/agen/affiliator/staf, form prospek, pendaftaran travel, klik link affiliator) berbagi **satu** jatah untuk seluruh pengunjung, sehingga satu orang yang salah login 5 kali bisa memblokir login semua orang;
- penjaga self-referral affiliator (IP pendaftaran travel vs IP login affiliator) diam-diam tidak aktif, karena IP loopback sengaja diabaikan;
- IP di Meta Conversions API dan `affiliator_clicks` tidak berguna.

**Solusi.** Nginx mengirim IP asli ke Caddy lewat **PROXY protocol**, dan Caddy membacanya. Caddy lalu mengisi `X-Forwarded-For` dengan IP asli, dan rantai selanjutnya (Next.js, Go) sudah benar tanpa perubahan kode.

`proxy_protocol on;` di Nginx berlaku untuk semua upstream dalam satu blok `server`, padahal situs aaPanel di port `4433` tidak mengerti PROXY protocol. Karena itu `map` mengarah ke dua listener stream internal: satu meneruskan PROXY header ke Caddy, satu membuangnya untuk situs aaPanel (yang tidak perlu diubah).

Cek dulu modul realip stream ada: `nginx -V 2>&1 | grep -o with-stream_realip_module` harus menampilkan `with-stream_realip_module`. Jika tidak ada, Nginx aaPanel perlu dikompilasi ulang dengan modul itu sebelum langkah ini.

```nginx
# Ganti blok upstream/server dari contoh 4.1 dengan ini (map tetap sama).
upstream caddy_https { server 127.0.0.1:8442; }   # listener internal ke Caddy
upstream nginx_https { server 127.0.0.1:4432; }   # listener internal ke situs aaPanel

# Pintu publik: baca SNI, tempelkan PROXY header berisi IP pengunjung.
server {
    listen 443;
    listen [::]:443;
    ssl_preread on;
    proxy_protocol on;
    proxy_pass $klikumroh_upstream;
}

# Ke Caddy: terima PROXY header dari pintu publik dan teruskan dengan IP asli.
server {
    listen 127.0.0.1:8442 proxy_protocol;
    set_real_ip_from 127.0.0.1;      # $remote_addr = IP pengunjung dari PROXY header
    proxy_protocol on;
    proxy_pass 127.0.0.1:8443;
}

# Ke situs aaPanel: buang PROXY header, situs lain tidak berubah.
server {
    listen 127.0.0.1:4432 proxy_protocol;
    proxy_pass 127.0.0.1:4433;
}
```

Di `Caddyfile`, opsi global (gabungkan dengan blok global di Bagian 2):

```caddy
{
    http_port  8081
    https_port 8443

    servers :8443 {
        listener_wrappers {
            # Hanya Nginx lokal yang boleh mengirim PROXY header; koneksi lain ditolak memalsukan IP.
            proxy_protocol {
                timeout 5s
                allow 127.0.0.1/32
            }
            tls
        }
    }
}
```

Catatan:
- `proxy_protocol` listener wrapper butuh Caddy v2.7 atau lebih baru (`caddy version`).
- **Jangan** pasang `trusted_proxies` di Caddy untuk listener publik. Tanpa itu Caddy mengabaikan `X-Forwarded-For` kiriman pengunjung dan menulis ulang dengan IP asli, sehingga IP tidak bisa dipalsukan. Backend Go mempercayai entri pertama header ini justru karena Caddy menulisnya ulang.
- Port 80 (Bagian 4.2) hanya mengalihkan ke HTTPS dan menjawab challenge sertifikat, jadi tidak perlu PROXY protocol.
- Caddy `8443` dan listener `8442`/`4432` harus hanya didengar di `127.0.0.1`.
- **Next.js juga wajib hanya didengar di `127.0.0.1:13000`** (mis. `next start -H 127.0.0.1 -p 13000`, atau `HOSTNAME=127.0.0.1` untuk output standalone). Backend Go hanya mempercayai `X-Forwarded-For` dari koneksi loopback dan membacanya dari kanan, melewati hop lokal. Kalau port 13000 terbuka ke internet, siapa pun bisa melewati Caddy dan mengirim `X-Forwarded-For` palsu lewat Next.js. Cek dari luar server: `curl -m 5 http://IP_VPS:13000` harus gagal tersambung.

**Cara uji** (wajib, sebelum membuka program affiliator ke publik):
1. Dari HP dengan data seluler (bukan WiFi server), buka `https://klikumroh.id/?aff=KODE_AFFILIATOR_UJI`.
2. Di server: `SELECT ip_address, clicked_at FROM affiliator_clicks ORDER BY id DESC LIMIT 1;` harus menampilkan IP publik HP (cek di whatismyip dari HP yang sama), **bukan** `127.0.0.1`.
3. Login portal affiliator uji dari HP itu, lalu `SELECT ip_address FROM affiliator_logins ORDER BY id DESC LIMIT 1;` harus IP yang sama.
4. Pastikan situs aaPanel lain masih terbuka normal lewat HTTPS.
5. Hapus data uji (klik, login, affiliator uji) setelah selesai.

**Cara uji Caddy menimpa `X-Forwarded-For` palsu** (wajib, bersama uji di atas). Backend Go mempercayai entri paling kanan `X-Forwarded-For` yang ditulis Caddy. Ini hanya aman kalau Caddy **membuang** header kiriman pengunjung, yaitu perilaku bawaan Caddy selama `trusted_proxies` tidak dipasang.

1. Cek konfigurasi: `grep -n trusted_proxies /etc/caddy/Caddyfile` (sesuaikan path) tidak boleh menghasilkan apa pun untuk listener publik.
2. Dari komputer **di luar** VPS (bukan di server, bukan lewat VPN ke server), catat IP publiknya (`curl -s https://api.ipify.org`), lalu kirim klik dengan header palsu lewat kedua jalur:
   ```bash
   # Jalur Next.js (klikumroh.id -> Caddy -> Next.js -> Go)
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://klikumroh.id/api/public/affiliator-clicks \
     -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.66" \
     -d '{"code":"KODE_LINK_AFFILIATOR_UJI"}'
   # Jalur langsung (app.klikumroh.id -> Caddy -> Go)
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://app.klikumroh.id/api/public/affiliator-clicks \
     -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.66, 198.51.100.77" \
     -d '{"code":"KODE_LINK_AFFILIATOR_UJI"}'
   ```
   Keduanya harus `204`. `KODE_LINK_AFFILIATOR_UJI` adalah kode link (bukan kode kupon) affiliator uji yang aktif; kode yang salah tidak dicatat.
3. Di server: `SELECT ip_address, clicked_at FROM affiliator_clicks ORDER BY id DESC LIMIT 2;` kedua baris harus berisi IP publik komputer tadi. Kalau muncul `203.0.113.66` atau `198.51.100.77` (alamat dokumentasi RFC 5737), Caddy meneruskan header palsu: cari dan hapus `trusted_proxies` di listener publik, reload Caddy, ulangi. Kalau muncul `127.0.0.1`, PROXY protocol di atas belum jalan.
4. Pastikan Next.js tidak bisa dihubungi langsung: dari komputer luar yang sama, `curl -m 5 http://IP_VPS:13000` harus gagal tersambung (timeout atau connection refused). Kalau tersambung, header palsu bisa masuk lewat Next.js tanpa Caddy.
5. Hapus baris klik uji: `DELETE FROM affiliator_clicks WHERE affiliator_id = <ID_AFFILIATOR_UJI> AND clicked_at >= '<waktu mulai uji>';`

### 4.3 Cara uji setelah konfigurasi

1. Daftarkan domain uji milik sendiri di dashboard travel uji (Website > Domain), ikuti tabel DNS-nya, klik **Periksa sekarang** sampai aktif.
2. Buka `https://www.domain-uji.com` → website travel tampil dengan sertifikat valid.
3. Buka `https://domain-uji.com/paket/1?ref=KODE` → dialihkan **307** ke `https://www.domain-uji.com/paket/1?ref=KODE` (path + query utuh).
4. Buka `http://domain-uji.com` → berakhir di `https://www.domain-uji.com`.
5. Buka `https://{slug}.klikumroh.id/?ref=KODE` → dialihkan 307 ke `https://www.domain-uji.com/?ref=KODE`.
6. Buka satu situs aaPanel lain via http dan https → tetap tampil normal.

---

## 4a. Custom Domain Travel: www + Tanpa www, dan `PLATFORM_IPS`

Perilaku aplikasi (sudah diimplementasikan dan teruji, migrasi `000055`):

- Travel mendaftarkan `www.namatravel.com` sebagai **domain utama**; pilihan bawaan "juga arahkan `namatravel.com`" membuat **alias** tanpa www.
- DNS yang diisi travel:
  - `www` → **CNAME** ke `cname.klikumroh.id`
  - `@` (domain utama tanpa www) → **A record** ke IP server KlikUmroh
  - `_klikumroh-verify.www` → **TXT** berisi nilai dari dashboard (satu TXT untuk keduanya)
- Alias baru bisa aktif setelah www aktif, dan hanya jika semua A/AAAA record-nya mengarah ke IP server KlikUmroh (IP lain ditolak).
- Pengunjung alias dialihkan **307** ke www dengan path + query utuh. Alamat bawaan `{slug}.klikumroh.id` selalu dialihkan ke domain utama (bukan alias).
- Endpoint ask Caddy tidak berubah: sertifikat hanya diterbitkan untuk domain berstatus `active`, termasuk alias.

### `PLATFORM_IPS` (environment backend)

Backend memverifikasi A record domain travel dengan membandingkan IP-nya ke IP server:

- Jika `PLATFORM_IPS` kosong, backend memakai hasil lookup `cname.klikumroh.id` (Bagian 1). Cukup pastikan A (dan AAAA jika ada IPv6) record tersebut benar.
- Jika diisi, nilainya dipakai apa adanya, dipisah koma, misal `PLATFORM_IPS=103.xxx.xxx.xxx,2a02:xxxx::1`. Wajib diperbarui jika IP server berubah.
- Jika keduanya tidak tersedia, alias tanpa www tidak bisa diverifikasi dan tabel DNS di dashboard menampilkan "Hubungi tim KlikUmroh" pada kolom A record.
- Jika server melayani IPv6, masukkan IPv6-nya juga: domain travel yang punya record AAAA akan ditolak jika IPv6 server tidak termasuk.

Diisi manual oleh pemilik produk di environment backend (aaPanel Go Project), bukan oleh AI agent.

## 5. Travel Demo di `demo.klikumroh.id`

Travel demo adalah travel biasa di database produksi dengan slug `demo` dan kolom `tenants.is_demo = 1`. Subdomain `*.klikumroh.id` sudah diarahkan ke Caddy, jadi **tidak perlu DNS, server, atau sertifikat baru**. Isinya (profil, paket, banner, testimoni, FAQ, gambar) ada di repo: `demo/fixtures.json` dan `demo/assets/`. Agen, prospek, komisi, pencairan, dan syiar harian dibuat otomatis oleh `cmd/seed-demo` dengan tanggal relatif terhadap saat dijalankan.

**Selama `is_demo = 1`, aplikasi otomatis:**
- menampilkan pita satu baris "Website demo KlikUmroh" di web publik dan portal agen, dan pita "Akun demo" di dashboard;
- memberi `noindex, nofollow` dan tidak memasang data terstruktur travel (tidak masuk Google);
- tidak pernah membuka WhatsApp setelah form minat (nomor demo memakai rentang `0800…`, bukan nomor HP);
- menolak (403) ganti password/profil admin, tambah/nonaktifkan anggota tim, reset password agen, custom domain, pengaturan Meta Pixel/CAPI, dan ganti password agen. Selain itu semua fitur boleh dicoba pengunjung.

**Langkah di VPS (dikerjakan pemilik produk, bukan AI agent):**

1. Deploy kode terbaru seperti biasa, lalu **matikan API** dan jalankan migrasi (menambah kolom `is_demo`):
   ```bash
   go run ./cmd/migrate
   ```
2. Isi kredensial demo di `.env` server (password minimal 8 karakter, jangan dipakai di tempat lain). Pengunjung **tidak perlu** password ini: tombol "Coba demo" di landing page masuk sekali klik lewat `POST /api/auth/demo-login` (dashboard) dan `POST /api/agent/demo-login` (portal agen), yang hanya berlaku untuk travel `is_demo = 1`. Password tetap wajib supaya akun demo juga bisa dipakai lewat form login biasa. Email admin demo harus belum dipakai travel lain:
   ```
   DEMO_SLUG=demo
   DEMO_ROOT_DOMAIN=klikumroh.id
   DEMO_ADMIN_EMAIL=...
   DEMO_ADMIN_PASSWORD=...
   DEMO_AGENT_EMAIL=...
   DEMO_AGENT_PASSWORD=...
   ```
3. Buat travel demo sekali (dari folder aplikasi, folder `uploads/` yang sama dengan API):
   ```bash
   go run ./cmd/seed-demo
   ```
   Perintah ini menolak berjalan kalau slug `demo` sudah dipakai travel sungguhan (`is_demo = 0`), dan tidak menghapus apa pun dalam kasus itu.
4. Pasang cron reset tiap malam, misalnya pukul 02.00 WIB (sesuaikan path dan user):
   ```
   0 2 * * * cd /www/wwwroot/klikumroh && /usr/local/go/bin/go run ./cmd/seed-demo --reset >> /var/log/klikumroh-demo.log 2>&1
   ```
   `--reset` menghapus travel demo lama beserta seluruh datanya dan foldernya di `uploads/`, lalu membangunnya ulang. Hanya travel dengan `is_demo = 1` yang bisa dihapus perintah ini. Sesi login demo ikut terhapus; pengunjung cukup login lagi.
5. Cek: di landing page `https://klikumroh.id` bagian "Coba demo tanpa daftar": "Buka website" (pita demo tampil), "Masuk dashboard" (`/demo`, langsung ke dashboard travel demo), dan "Masuk portal agen" (`demo.klikumroh.id/agen/login?demo=1`, langsung masuk sebagai agen demo).

**Mengubah isi demo:** atur ulang data travel contoh di lingkungan lokal, jalankan `node scripts/export-demo-fixtures.mjs <tenant_id>` dari root repo (menulis ulang `demo/fixtures.json` dan `demo/assets/`), commit, deploy. Malam berikutnya cron memakai isi baru.

**Catatan:** travel demo tidak dihitung di statistik super admin (jumlah travel, MRR, prospek, agen) dan tampil dengan status "Demo" di daftar travel. Langganannya diisi aktif 10 tahun sehingga tidak pernah ditagih atau ditangguhkan.

---

## 7. Mode server bersama: Nginx aaPanel + Cloudflare (tanpa Caddy)

Dipakai selama KlikUmroh menumpang di server aaPanel bersama. Prinsipnya: TLS selalu dihentikan Cloudflare di depan, Nginx aaPanel hanya meneruskan ke `127.0.0.1:13000` (web) dan `127.0.0.1:18080` (API, lewat rewrite web), dan port 80/443 tidak diubah.

### 7.1 Gambaran

| Lalu lintas | Jalur |
|---|---|
| `klikumroh.id`, `app.`, `demo.`, `<slug>.klikumroh.id` | Pengunjung, Cloudflare (zona KlikUmroh, oranye), Nginx aaPanel, Next.js 13000 |
| `www.namatravel.com` (domain travel) | Pengunjung, Cloudflare **milik travel** (oranye), `cname.klikumroh.id` (abu-abu, IP server), Nginx aaPanel, Next.js 13000 |

Karena Cloudflare yang menerbitkan sertifikat untuk domain travel, **tidak ada ACME, Caddy, atau endpoint `ask`** yang dipakai. Backend tetap hanya melayani host yang terdaftar dan terverifikasi (`TenantResolutionMiddleware`), dan verifikasi DNS menerima domain yang di-proxy Cloudflare selama TXT kepemilikan benar (`internal/service/domain.go`).

### 7.2 DNS zona klikumroh.id

| Name | Type | Content | Proxy |
|---|---|---|---|
| `@` | A | `IP_VPS` | Proxied |
| `*` | A | `IP_VPS` | Proxied |
| `www` | CNAME | `klikumroh.id` | Proxied |
| `cname` | A | `IP_VPS` | **DNS only** (wajib: CNAME dari akun Cloudflare lain ke nama yang di-proxy ditolak Cloudflare dengan error 1014) |
| `store` | CNAME | `domains.scalev.id` | Proxied (milik pihak lain) |

SSL/TLS zona: mode **Full (strict)** setelah sertifikat origin di 7.3 terpasang. Nyalakan *Always Use HTTPS*.

### 7.3 Sertifikat origin dan Nginx untuk klikumroh.id

1. Cloudflare: *SSL/TLS > Origin Server > Create Certificate* untuk `klikumroh.id` dan `*.klikumroh.id` (berlaku 15 tahun). Simpan `.pem` dan kunci privat.
2. aaPanel: buat **Proxy Project** untuk `klikumroh.id` dengan domain tambahan `*.klikumroh.id`, target `http://127.0.0.1:13000`, **kirim domain asli** (host asli diteruskan). Pasang sertifikat origin di tab SSL.
3. Jangan isi domain/vhost apa pun untuk port `18080`; API hanya diakses lewat rewrite web.
4. IP pengunjung asli: tambahkan di konfigurasi situs itu (server block), dengan rentang IP Cloudflare dari <https://www.cloudflare.com/ips/>:
   ```nginx
   # satu baris set_real_ip_from per rentang IPv4 dan IPv6 Cloudflare
   set_real_ip_from 173.245.48.0/20;
   # ... (semua rentang)
   real_ip_header CF-Connecting-IP;
   proxy_set_header X-Forwarded-For $remote_addr;   # menimpa, bukan menambah
   proxy_set_header X-Forwarded-Host $host;
   proxy_set_header X-Forwarded-Proto https;
   ```
   Backend hanya mempercayai `X-Forwarded-For` dari proxy lokal (`getClientIP`), jadi nilai ini yang dipakai untuk rate limit dan penjaga self-referral.

### 7.4 Domain milik travel (Nginx menerima host yang tidak dikenal)

Request dari Cloudflare travel datang ke `IP_VPS` dengan header `Host: www.namatravel.com`. Nginx harus meneruskannya ke Next.js apa adanya:

1. Cari berkas situs bawaan aaPanel yang memegang `default_server` (umumnya `/www/server/panel/vhost/nginx/0.default.conf`). **Backup dulu**, lalu ubah `location /` di blok default itu menjadi `proxy_pass http://127.0.0.1:13000;` dengan `proxy_set_header Host $host;` serta pengaturan real IP di 7.3 butir 4.
2. Jalankan `nginx -t`; hanya bila `syntax is ok` lanjut `nginx -s reload`.
3. Uji: `curl -H "Host: www.contoh-tidak-terdaftar.com" http://IP_VPS/` harus mengembalikan halaman 404 dari KlikUmroh (bukan halaman situs lain), dan situs-situs aaPanel lain tetap normal.

Efek sampingnya: domain asing yang diarahkan ke IP ini akan sampai ke KlikUmroh dan mendapat 404. Situs aaPanel lain tidak terpengaruh karena Nginx mencocokkan `server_name` mereka lebih dulu.

> [!WARNING]
> Butir 7.4 mengubah konfigurasi Nginx bersama dan **belum pernah diuji di server ini**. Lakukan di luar jam ramai, simpan salinan berkas asli, dan jalankan `nginx -t` sebelum reload. Jika tidak ingin menyentuh Nginx bersama, tunda fitur domain sendiri; subdomain `<slug>.klikumroh.id` tidak membutuhkannya.

### 7.5 Panduan untuk travel

Langkah dari membeli domain sampai aktif ada di dashboard travel (*Website > Domain > Panduan*) dan di `PANDUAN-DOMAIN-TRAVEL.md`. Ringkasnya: beli domain, daftar Cloudflare gratis, ganti nameserver, tambahkan domain di KlikUmroh, buat CNAME (oranye) dan TXT sesuai tabel, SSL mode **Full**.

Catatan untuk dukungan:
- SSL mode travel harus **Full**. *Flexible* menimbulkan pengalihan berulang, *Full (strict)* gagal (error 526) karena sertifikat origin tidak untuk domain travel.
- Domain travel wajib memakai DNS Cloudflare. Domain yang DNS-nya di tempat lain tidak mendapat HTTPS di mode ini.

### 7.6 Yang belum tervalidasi

1. Perubahan `default_server` di Nginx aaPanel (7.4) dan dampaknya ke situs lain.
2. Sertifikat origin wildcard di aaPanel Proxy Project untuk `*.klikumroh.id`.
3. Pembacaan `CF-Connecting-IP` oleh Nginx di server ini (uji: kunjungi dari HP, lalu cek `referral_clicks.ip_address` bukan IP Cloudflare).
4. Alur lengkap domain travel dari akun Cloudflare uji.

---

## 8. Membuat staf (super admin) pertama

Login ke `https://app.klikumroh.id/internal/login` butuh akun staf. `cmd/seed` **tidak boleh** dipakai di produksi (ia juga membuat travel uji, paket langganan, dan paket contoh). Gunakan perintah khusus:

```bash
cd /www/wwwroot/klikumroh
read -rs CREATE_STAFF_PASSWORD && export CREATE_STAFF_PASSWORD   # ketik kata sandi, tidak tampil di layar
./bin/klikumroh-create-staff -email pendiri@klikumroh.id -name "Nama Pendiri" -role owner
unset CREATE_STAFF_PASSWORD
```

- Kata sandi **hanya** dari env `CREATE_STAFF_PASSWORD` (minimal 12 karakter, maksimal 72 byte), tidak pernah lewat argumen, dan tidak dicetak.
- Disimpan sebagai hash bcrypt. Email yang sudah ada **ditolak**; perintah ini tidak pernah mengubah atau mereset akun.
- `-role` hanya label tampilan (`owner` atau `admin`), tidak memberi izin tambahan.
- Perintah dijalankan dari root repo agar `.env` (`DB_*`) terbaca. Staf berikutnya ditambahkan lewat Super Admin > Manajemen Staf.
