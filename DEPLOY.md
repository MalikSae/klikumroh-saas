# Panduan Deployment & Konfigurasi Produksi — KlikUmroh.id

Dokumen ini memuat panduan langkah manual yang **HARUS dilakukan sendiri oleh pendiri/pemilik produk** saat melakukan deployment ke server produksi (VPS aaPanel).

> [!WARNING]
> **BATASAN AI AGENT (ANTIGRAVITY):**
> Antigravity dilarang mengeksekusi konfigurasi Caddy/Nginx secara langsung pada server produksi atau memegang kredensial VPS produksi. Seluruh langkah di bawah ini didokumentasikan untuk dijalankan secara manual oleh pemilik produk.

---

## 1. Setup DNS Zone untuk CNAME Target

Agar travel mitra dapat mengarahkan custom domain mereka ke KlikUmroh, domain target CNAME harus diatur di DNS zone `klikumroh.id`:

1. Buka DNS Management domain `klikumroh.id` (misal di Cloudflare atau registrar DNS Anda).
2. Tambahkan **A Record**:
   - **Name / Host:** `cname` (sehingga menjadi `cname.klikumroh.id`)
   - **IPv4 Address:** Masukkan IP Publik VPS KlikUmroh (contoh: `103.xxx.xxx.xxx`)
   - **Proxy status:** **DNS Only (Grey Cloud)** jika menggunakan Cloudflare. 
     *Catatan: Harus Grey Cloud agar request HTTP-01 challenge dari Let's Encrypt dapat langsung mencapai Caddy tanpa terhalang proxy Cloudflare.*
   - **TTL:** Auto atau 300 detik.

Setelah langkah ini selesai, setiap travel mitra yang mendaftarkan custom domain (misal: `umroh.travelamanah.com`) cukup menambahkan:
```
Type:  CNAME
Name:  umroh (atau subdomain yang diinginkan)
Target: cname.klikumroh.id
```

Domain utama tanpa subdomain (misal `travelamanah.com`) tidak boleh memakai CNAME, jadi memakai **A record** ke IP server. Detail pasangan www / tanpa www ada di Bagian 4a.

> [!NOTE]
> A record `cname.klikumroh.id` ini juga dipakai backend untuk mengetahui IP server (lihat `PLATFORM_IPS` di Bagian 4a). Jika server juga punya IPv6 yang melayani web, tambahkan **AAAA record** `cname` ke IPv6 tersebut.

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
        ask http://127.0.0.1:8080/internal/domain-ask
        
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

    # Teruskan request ke Next.js Web Frontend (Port 3000)
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### Parameter Kunci:
- **`ask http://127.0.0.1:8080/internal/domain-ask`**: Caddy akan otomatis memanggil URL ini sebelum meminta sertifikat baru. Backend Go akan merespons `200 OK` **hanya jika** hostname terdaftar dengan `type='custom'` dan `status='active'`. Jika tidak (atau berstatus `pending`/`failed`), backend merespons `404`, dan Caddy langsung menolak penerbitan TLS. Ini mencegah server disalahgunakan untuk menerbitkan sertifikat domain acak.
- **`burst 5` & `interval 2m`**: Membatasi penerbitan maksimal 5 sertifikat baru per 2 menit untuk mematuhi rate limit Let's Encrypt.

---

## 3. Keamanan Endpoint Ask (/internal/domain-ask)

> [!CAUTION]
> **KEPUTUSAN KEAMANAN NETWORK & FIREWALL LEVEL:**
> Endpoint `/internal/domain-ask` adalah endpoint tanpa autentikasi token karena dipanggil secara native oleh Caddy saat handshake TLS. Oleh karena itu, endpoint ini **HANYA BOLEH DIAKSES DARI LOCALHOST / CADDY INTERNAL**, dan **TIDAK BOLEH DIBUKA KE INTERNET PUBLIK**.

### Pengamanan di Level VPS:
1. **Backend Go Bind Localhost:**
   Pastikan backend Go selalu bind ke `127.0.0.1:8080` (sudah ditegakkan di konfigurasi default `.env` dan `AGENTS.md` Bagian 3.5), bukan `0.0.0.0:8080`.
2. **Firewall VPS (UFW / Iptables):**
   Port `8080` tidak boleh dibuka pada security group VPS / Firewall cloud publik.
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

- Pengunjung yang mengetik `http://namatravel.com` hanya sampai ke website travel jika Nginx punya `server` **default** di port 80 yang meneruskan host yang tidak dikenal ke port HTTP internal Caddy (misal Caddy `http_port 8081`, lalu `proxy_pass http://127.0.0.1:8081;` dengan `proxy_set_header Host $host;`). Jangan arahkan ke `8080`: itu port backend Go yang tidak boleh terbuka ke publik (Bagian 3). Caddy lalu mengalihkan ke HTTPS.
- Penerbitan sertifikat: Caddy mencoba challenge **HTTP-01** (butuh port 80 sampai ke Caddy) dan **TLS-ALPN-01** (lewat port 443, jalan selama SNI mengarah ke Caddy). Jika port 80 tidak diteruskan, pastikan TLS-ALPN-01 aktif (bawaan Caddy) dan uji penerbitan satu domain sebelum membuka fitur ke travel.
- Server default port 80 yang sudah ada di aaPanel (jika ada) harus dicek agar tidak menelan domain travel.

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
- menampilkan pita "Website demo KlikUmroh, bukan travel sungguhan" di web publik dan portal agen, dan pita "Akun demo" di dashboard;
- memberi `noindex, nofollow` dan tidak memasang data terstruktur travel (tidak masuk Google);
- tidak pernah membuka WhatsApp setelah form minat (nomor demo memakai rentang `0800…`, bukan nomor HP);
- menolak (403) ganti password/profil admin, tambah/nonaktifkan anggota tim, reset password agen, custom domain, pengaturan Meta Pixel/CAPI, dan ganti password agen. Selain itu semua fitur boleh dicoba pengunjung.

**Langkah di VPS (dikerjakan pemilik produk, bukan AI agent):**

1. Deploy kode terbaru seperti biasa, lalu **matikan API** dan jalankan migrasi (menambah kolom `is_demo`):
   ```bash
   go run ./cmd/migrate
   ```
2. Isi kredensial demo di `.env` server (dibagikan ke pengunjung lewat tombol "Coba demo", jadi jangan dipakai di tempat lain; password minimal 8 karakter). Email admin demo harus belum dipakai travel lain:
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
5. Cek: buka `https://demo.klikumroh.id` (pita demo tampil), login dashboard di `https://klikumroh.id` dengan akun admin demo, dan login portal agen di `https://demo.klikumroh.id/agen/login` dengan akun agen demo.

**Mengubah isi demo:** atur ulang data travel contoh di lingkungan lokal, jalankan `node scripts/export-demo-fixtures.mjs <tenant_id>` dari root repo (menulis ulang `demo/fixtures.json` dan `demo/assets/`), commit, deploy. Malam berikutnya cron memakai isi baru.

**Catatan:** travel demo belum dikecualikan dari statistik super admin (jumlah travel, dsb.). Langganannya diisi aktif 10 tahun sehingga tidak pernah ditagih atau ditangguhkan.
