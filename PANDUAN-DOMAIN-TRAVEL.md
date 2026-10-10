# Panduan: Pasang Domain Sendiri di Website Travel

Untuk travel yang ingin website-nya dibuka di `www.namatravel.com`, bukan di `namatravel.klikumroh.id`. Prosesnya sekali jalan, gratis selain harga domain, dan tidak butuh keahlian teknis. Sediakan 30 sampai 60 menit; sisanya menunggu pengaturan menyebar (menit sampai 24 jam).

Alamat bawaan `namatravel.klikumroh.id` tetap bisa dipakai kapan saja. Domain sendiri bersifat opsional.

---

## Gambaran

1. Beli domain.
2. Daftar Cloudflare (gratis) dan tambahkan domain ke sana.
3. Arahkan nameserver domain ke Cloudflare.
4. Tambahkan domain di dashboard KlikUmroh.
5. Buat record DNS di Cloudflare sesuai tabel dari KlikUmroh.
6. Atur SSL di Cloudflare.
7. Periksa di KlikUmroh sampai statusnya aktif.

Cloudflare yang menerbitkan sertifikat HTTPS (gembok) dan meneruskan pengunjung ke KlikUmroh, sehingga tidak ada sertifikat yang perlu Anda urus.

---

## 1. Beli domain

- Beli di penyedia domain mana pun (Niagahoster, Rumahweb, Namecheap, GoDaddy, dan sejenisnya).
- Pilih nama yang pendek dan mudah diingat, misalnya `namatravel.com` atau `namatravel.id`.
- Simpan email dan kata sandi akun penyedia domain. Anda akan membukanya lagi di langkah 3.

## 2. Daftar Cloudflare dan tambahkan domain

1. Buka `dash.cloudflare.com` dan buat akun (gratis).
2. Pilih **Add a domain** lalu masukkan domain Anda, misalnya `namatravel.com`.
3. Pilih paket **Free**.
4. Cloudflare menampilkan dua alamat **nameserver**, misalnya `xxx.ns.cloudflare.com` dan `yyy.ns.cloudflare.com`. Salin keduanya.

## 3. Arahkan nameserver ke Cloudflare

1. Masuk ke akun tempat Anda membeli domain.
2. Cari pengaturan **Nameserver** (atau *DNS Management / Name Server*) untuk domain Anda.
3. Ganti nameserver lama dengan dua alamat dari Cloudflare, lalu simpan.
4. Tunggu. Di Cloudflare, status domain berubah menjadi **Active** (beberapa menit sampai 24 jam). Anda bisa melanjutkan setelah itu.

> Jangan menghapus domain atau layanan email yang sudah berjalan di domain itu sebelum memindahkan record-nya ke Cloudflare.

## 4. Tambahkan domain di dashboard KlikUmroh

1. Buka **Website > Domain** di dashboard travel.
2. Isi alamat utama, misalnya `www.namatravel.com`.
3. Biarkan pilihan *juga arahkan namatravel.com* tercentang agar alamat tanpa `www` ikut menuju website Anda.
4. Klik **Tambah**. KlikUmroh menampilkan tabel berisi record yang harus dibuat (Tipe, Host, Nilai).

## 5. Buat record DNS di Cloudflare

1. Di Cloudflare, buka domain Anda lalu **DNS > Records**.
2. Untuk setiap baris di tabel KlikUmroh klik **Add record** dan salin Tipe, Name (Host), dan Content (Nilai) persis seperti di tabel.
3. Pengaturan **Proxy status**:
   - Record **CNAME** dan **A**: biarkan **Proxied** (awan oranye).
   - Record **TXT**: otomatis **DNS only**, biarkan.
4. Hapus record `A`/`CNAME` lama untuk host yang sama (misalnya bawaan hosting sebelumnya) agar tidak bentrok.
5. Salin nilai TXT tanpa tanda kutip dan tanpa spasi tambahan.

## 6. Atur SSL di Cloudflare

1. Buka **SSL/TLS > Overview** dan pilih mode **Full**.
   - Jangan **Flexible** (menyebabkan halaman berputar tanpa henti).
   - Jangan **Full (strict)** (menyebabkan error 526).
2. Buka **SSL/TLS > Edge Certificates** dan nyalakan **Always Use HTTPS**.

## 7. Periksa di KlikUmroh

1. Kembali ke **Website > Domain** dan klik **Periksa sekarang**.
2. Status berubah menjadi **Aktif** bila record sudah terbaca. Perubahan DNS kadang butuh beberapa menit, jadi ulangi bila belum.
3. Buka `https://www.namatravel.com`. Website travel Anda tampil dengan gembok HTTPS.
4. Alamat tanpa `www` dan alamat bawaan (`namatravel.klikumroh.id`) otomatis dialihkan ke alamat utama, termasuk link referral agen.

---

## Jika bermasalah

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Status gagal, "CNAME/A belum mengarah" | Record belum dibuat atau salah ketik, atau DNS belum menyebar | Cek ulang tabel, tunggu 10 menit, klik Periksa sekarang |
| Status gagal, "TXT belum ditemukan" | Nilai TXT salah, ada tanda kutip atau spasi | Salin ulang nilai TXT persis |
| Domain di Cloudflare tidak *Active* | Nameserver di penyedia domain belum diganti | Ulangi langkah 3 |
| Halaman berputar, "terlalu banyak pengalihan" | Mode SSL Cloudflare *Flexible* | Ubah ke **Full** |
| Error 525 atau 526 | Mode SSL *Full (strict)* | Ubah ke **Full** |
| Muncul situs lain atau halaman hosting lama | Record A/CNAME lama masih ada | Hapus record lama untuk host yang sama |
| `www` terbuka tetapi tanpa `www` tidak | Pilihan alias tidak dicentang atau record root belum dibuat | Tambahkan alias di KlikUmroh dan buat record sesuai tabel |

Masih terkendala? Hubungi tim KlikUmroh melalui WhatsApp atau email yang tertera di situs, sertakan nama domain dan tangkapan layar halaman Domain.
