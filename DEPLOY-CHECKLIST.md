# Daftar Periksa Deploy Pertama — KlikUmroh.id

Untuk deploy pertama ke server aaPanel bersama (`145.79.12.184`, Ubuntu 24, Nginx 1.24, MariaDB 10.11, Node.js v22). Centang berurutan; **berhenti di langkah pertama yang gagal** dan perbaiki sebelum lanjut. Penjelasan lengkap tiap langkah ada di `DEPLOY.md` (nomor bagian disebut di tiap butir).

Dikerjakan **manual oleh pemilik produk** (AGENTS.md 3.2): `.env` produksi, kata sandi, dan kunci tidak diisi oleh asisten AI.

Status per 12 Okt 2026: port `18080` dan `13000` sudah diperiksa kosong. Dua hal di Bagian "Penghalang" belum selesai.

---

## Penghalang (selesaikan sebelum mulai)

- [x] **Staf/super admin pertama**: sudah ada `cmd/create-staff` (DEPLOY.md Bagian 8). `cmd/seed` tidak boleh dipakai di produksi.
- [ ] **Dashboard di `app.klikumroh.id`** pada mode server bersama belum tertulis di `DEPLOY.md` (Bagian 2a masih memakai Caddy). Lihat langkah 9 di bawah; tambahkan ke `DEPLOY.md` setelah teruji.
- [ ] **Backup server** sudah ada dan bisa dipulihkan (langkah 1). Server berisi 100+ situs lain.

---

## 1. Persiapan dan backup

- [ ] Buat snapshot/backup server dari panel penyedia VPS (bukan hanya aaPanel). Catat waktu dan namanya.
- [ ] aaPanel: **Cron** > tambah tugas *Backup database* dan *Backup website* harian ke lokasi di luar server bila tersedia.
- [ ] Di Terminal aaPanel: `uname -m` (harus `x86_64`; kalau `aarch64`, build binary `arm64`), `df -h /` (disk cukup), `free -h`.
- [ ] Buat folder kerja: `mkdir -p /www/wwwroot/klikumroh/{bin,uploads,storage}` dan `mkdir -p ~/backup`.

## 2. Database (MariaDB 10.11)

- [ ] aaPanel > **Databases** > buat database `klikumroh` (utf8mb4) dengan **user khusus** (bukan `root`), kata sandi kuat, akses hanya `127.0.0.1`. Simpan kredensial di pengelola kata sandi.
- [ ] Buat database percobaan `klikumroh_trial` dengan user yang sama (dipakai langkah 5 untuk uji migrasi, dihapus sesudahnya).

## 3. Berkas aplikasi

- [ ] Unggah kode ke `/www/wwwroot/klikumroh` (zip dari `git archive main`, atau `git clone` bila server punya deploy key). Pastikan ada: `migrations/`, `web/`, `dashboard/`, `design-tokens.json`, `demo/`, `scripts/`, `.env.example`.
- [ ] Salin `.env.example` ke `.env` lalu isi (DEPLOY 0.2): `DB_*` (user khusus), `HOST=127.0.0.1`, `PORT=18080`, `APP_ENCRYPTION_KEY` (buat baru, **simpan cadangannya**), `PLATFORM_IPS=145.79.12.184`, `PLATFORM_ORIGIN=https://klikumroh.id`, `DEMO_*` (kata sandi demo kuat). **Kosongkan semua `SEED_*`.**
- [ ] `chmod 600 .env` dan pemilik file = user non-root yang akan menjalankan aplikasi (mis. `www`).

## 4. Build backend

- [ ] Di komputer lokal: `powershell -ExecutionPolicy Bypass -File scriptsuild-linux.ps1` (menghasilkan `dist/klikumroh-api`, `klikumroh-migrate`, `klikumroh-seed-demo`, `klikumroh-create-staff`).
- [ ] Unggah keempatnya ke `/www/wwwroot/klikumroh/bin/` lalu `chmod +x bin/*`.
- [ ] `file bin/klikumroh-api` harus menampilkan `ELF 64-bit ... x86-64` (arsitektur cocok). Jangan menjalankan binary API di sini; ia langsung menyalakan server.

## 5. Migrasi (uji dulu di salinan)

- [ ] Uji di database percobaan: `DB_NAME=klikumroh_trial ./bin/klikumroh-migrate up` dari root repo. Harus selesai tanpa `dirty` sampai versi **000076** (DEPLOY 0.4, AGENTS 5.1). Jika gagal, jangan lanjut; perbaiki penyebabnya.
- [ ] Hapus `klikumroh_trial`.
- [ ] Jalankan di database asli: `./bin/klikumroh-migrate up`. **Jangan pernah `down`.**
- [ ] Cek tabel inti ada: `legal_documents`, `demo_leads`, kolom `admin_users.role`, kolom `tenants.data_purged_at`.

## 6. Menjalankan backend (aaPanel Go Project)

- [ ] **Website > Go Project > Add**: executable `/www/wwwroot/klikumroh/bin/klikumroh-api`, nama `klikumroh-api`, port `18080`, user `www`, working directory = `/www/wwwroot/klikumroh`, domain **kosong** (DEPLOY 0.3a).
- [ ] Uji dari Terminal: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/api/public/platform-settings` harus `200`.
- [ ] `ss -lntp | grep 18080` harus menunjukkan **`127.0.0.1:18080`**, bukan `0.0.0.0`.
- [ ] Dari komputer lain: `http://145.79.12.184:18080` tidak boleh tersambung.

## 7. Build dan jalankan web (Next.js)

- [ ] Di server: `cd /www/wwwroot/klikumroh/web && npm ci && BACKEND_INTERNAL_URL=http://127.0.0.1:18080 npm run build` (env **wajib saat build**, DEPLOY 0.3).
- [ ] `cp -r public .next/standalone/web/` dan `mkdir -p .next/standalone/web/.next && cp -r .next/static .next/standalone/web/.next/`.
- [ ] **Website > Node.js Project > Add**: direktori `/www/wwwroot/klikumroh/web/.next/standalone/web`, file `server.js`, port `13000`, user `www`, domain kosong, env: `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `PORT=13000`, `BACKEND_INTERNAL_URL=http://127.0.0.1:18080`, `PLATFORM_ORIGIN=https://klikumroh.id`.
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:13000/` harus `200`; `ss -lntp | grep 13000` harus `127.0.0.1:13000`.

## 8. Dashboard (React)

- [ ] `cd /www/wwwroot/klikumroh/dashboard && npm ci && npm run build` (**jangan** isi `VITE_API_BASE`).
- [ ] Hasilnya `dashboard/dist/`.

## 9. Nginx aaPanel: situs publik dan dashboard

- [ ] Cloudflare > SSL/TLS > Origin Server: buat sertifikat origin untuk `klikumroh.id` dan `*.klikumroh.id` (DEPLOY 7.3). Simpan `.pem` dan kunci.
- [ ] aaPanel **Proxy Project** `klikumroh.id` + domain tambahan `*.klikumroh.id` ke `http://127.0.0.1:13000`, kirim domain asli, pasang sertifikat origin.
- [ ] aaPanel situs statis `app.klikumroh.id`, root `/www/wwwroot/klikumroh/dashboard/dist`, sertifikat origin yang sama, dengan aturan: `location /api/` dan `location /uploads/` ke `http://127.0.0.1:18080`; selain itu `try_files $uri /index.html`. **`/internal/*` jangan diteruskan ke backend.**
- [ ] Pengaturan real IP Cloudflare di kedua situs (DEPLOY 7.3 butir 4): `set_real_ip_from` rentang Cloudflare, `real_ip_header CF-Connecting-IP`, `proxy_set_header X-Forwarded-For $remote_addr`.
- [ ] `nginx -t` harus `syntax is ok` sebelum `reload`. Setelah reload, buka 3 situs aaPanel lain dan pastikan masih normal.

## 10. DNS dan Cloudflare

- [ ] Buat record (DEPLOY 7.2): `@`, `*`, `www` **Proxied**; `cname` **DNS only**; `store` biarkan.
- [ ] SSL/TLS: mode **Full (strict)**, *Always Use HTTPS* aktif.
- [ ] `dig +short klikumroh.id` dan `dig +short demo.klikumroh.id` mengembalikan IP Cloudflare; `dig +short cname.klikumroh.id` mengembalikan `145.79.12.184`.
- [ ] Email Routing atau MX untuk `support@klikumroh.id` (footer memuatnya).

## 11. Akun dan pengaturan awal

- [ ] Buat staf pertama dari root repo: `read -rs CREATE_STAFF_PASSWORD && export CREATE_STAFF_PASSWORD; ./bin/klikumroh-create-staff -email <email> -name "<nama>" -role owner; unset CREATE_STAFF_PASSWORD` (DEPLOY.md Bagian 8). Login di `https://app.klikumroh.id/internal/login`.
- [ ] **Pengaturan Global**: nomor WhatsApp CS, rekening bank, dan tautan. Tanpa rekening, halaman tagihan menampilkan "rekening belum tersedia".
- [ ] **Paket Langganan**: buat 3, 6, dan 12 bulan beserta harga dan promo (produksi tidak ikut seed).
- [ ] **Dokumen Legal**: tinjau draf, isi nama badan hukum dan kontak resmi, lalu **terbitkan** Syarat & Ketentuan dan Kebijakan Privasi. Pendaftaran travel baru tertutup selama keduanya belum terbit.
- [ ] Atur peran staf lain (bila ada) dan kata sandi kuat.

## 12. Uji asap dari luar server (DEPLOY 0.4 langkah 8)

- [ ] `https://klikumroh.id` tampil lengkap (CSS, gambar, harga paket).
- [ ] `https://klikumroh.id/syarat-ketentuan` dan `/kebijakan-privasi` tampil.
- [ ] `https://app.klikumroh.id/api/public/pricing-plans` menghasilkan `200`.
- [ ] Daftar travel uji di checkout: tagihan terbit, unggah bukti, setujui dari super admin, travel aktif, login dashboard travel (handoff ke `app.klikumroh.id`).
- [ ] Website travel uji `https://<slug>.klikumroh.id` tampil; form minat masuk sebagai prospek.
- [ ] IP pengunjung asli tercatat: buka link referral dari HP, lalu `SELECT ip_address FROM referral_clicks ORDER BY id DESC LIMIT 1;` bukan IP Cloudflare.
- [ ] `https://app.klikumroh.id/prospects` tanpa login dialihkan ke `https://klikumroh.id/login`.
- [ ] Hapus travel dan data uji sesudahnya.

## 13. Demo

- [ ] `./bin/klikumroh-seed-demo` sekali (DEPLOY Bagian 5). Server **tidak punya Go terpasang**, jadi pakai binary; jangan memakai `go run` di cron.
- [ ] Cron aaPanel malam hari: `cd /www/wwwroot/klikumroh && ./bin/klikumroh-seed-demo --reset >> /var/log/klikumroh-demo.log 2>&1`.
- [ ] `https://klikumroh.id/demo`: form demo terbuka, data masuk ke Super Admin > Lead Demo.

## 14. Domain milik travel (opsional, boleh setelah peluncuran)

- [ ] Ubah `default_server` Nginx sesuai DEPLOY 7.4 (backup dulu, `nginx -t`). Uji `curl -H "Host: www.contoh-tidak-terdaftar.com" http://145.79.12.184/` menghasilkan 404 dari KlikUmroh.
- [ ] Uji alur lengkap dengan satu domain dan akun Cloudflare uji, mengikuti `PANDUAN-DOMAIN-TRAVEL.md`.

## 15. Setelah rilis

- [ ] Pantau 24 jam pertama: log backend, penggunaan RAM/CPU server, dan situs aaPanel lain.
- [ ] Pastikan backup harian berjalan dan **coba restore** sekali ke database percobaan.
- [ ] Job retensi data berjalan harian dan hanya menghapus travel yang kedaluwarsa lebih dari 97 hari (aman di database kosong).
- [ ] Catat versi (commit) yang berjalan, tanggal deploy, dan lokasi cadangan `APP_ENCRYPTION_KEY`.

---

## Rollback

1. Jika gagal **sebelum** migrasi: hentikan Go/Node Project dan hapus proxy Nginx baru; server lain tidak berubah.
2. Jika gagal **sesudah** migrasi: restore database dari backup langkah 1 (jangan `migrate down`), pasang binary lama, build ulang web.
3. Perubahan Nginx: pulihkan berkas konfigurasi yang dibackup, `nginx -t`, `reload`.
4. DNS: ubah record `@`/`*`/`www` kembali atau hapus; layanan lain di zona tidak terpengaruh.
