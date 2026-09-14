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

## 4. Koeksistensi Port 80 & 443 (Nginx Stream SNI di aaPanel)

Karena VPS menjalankan Nginx (aaPanel) bersama puluhan website lain, Caddy tidak bisa langsung bind ke port publik 80/443. Gunakan Nginx Layer-4 `stream` SNI routing:

1. Buat file baru: `/www/server/panel/vhost/nginx/tcp/klikumroh-sni.conf`
2. Konfigurasi SNI mapping:
   - Traffic SNI dengan hostname KlikUmroh & custom domain mitra diteruskan ke Caddy internal (misal port 8443).
   - Traffic domain website lain di VPS diteruskan ke Nginx default (port internal 4433).
3. Jalankan `nginx -t` lalu reload Nginx dari panel.
