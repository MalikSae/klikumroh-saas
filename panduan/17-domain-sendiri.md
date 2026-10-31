---
title: Pasang domain sendiri
slug: domain-sendiri
stage: lanjutan
label: opsional
order: 17
summary: Buka website travel di alamat Anda sendiri, misalnya www.namatravel.com, lewat Cloudflare gratis.
menu: Website > Domain
alias: [domain, www, dns, cloudflare, nameserver, ssl, gembok, domain belum aktif, custom domain, alamat website]
---

Alamat bawaan seperti namatravel.klikumroh.id sudah cukup untuk mulai: website sudah tayang di sana dan Anda bisa langsung membagikan linknya. Domain sendiri bersifat opsional dan tidak menghalangi website tayang. Pasang kalau Anda ingin alamat yang lebih mudah diingat, misalnya `www.namatravel.com`.

Alamat bawaan tetap aktif selama domain sendiri dipasang. Setelah domain sendiri aktif, pengunjung alamat bawaan diarahkan ke domain sendiri dengan path dan parameter linknya tetap terbawa, termasuk link referral agen.

## Sebelum mulai

- Anda perlu domain yang sudah dibeli. Domain bisa dibeli di penyedia domain mana pun (Niagahoster, Rumahweb, Namecheap, dan sejenisnya); pilih nama yang pendek dan mudah diingat. Simpan akun dan emailnya.
- Domain ini dipasang lewat akun Cloudflare milik Anda (gratis). Cloudflare yang menerbitkan gembok HTTPS dan meneruskan pengunjung ke KlikUmroh, jadi Anda tidak mengurus sertifikat.
- Siapkan waktu cukup: perubahan nameserver dan DNS bisa butuh beberapa menit sampai 24 jam untuk menyebar.
- Jangan menghapus domain atau layanan email yang sudah berjalan di domain itu sebelum record-nya Anda pindahkan ke Cloudflare.

## Langkah

### 1. Daftar Cloudflare dan tambahkan domain

1. Buka `dash.cloudflare.com` dan buat akun.
2. Pilih **Add a domain**, masukkan domain Anda, lalu pilih paket **Free**.
3. Cloudflare menampilkan dua alamat **nameserver**. Salin keduanya.

### 2. Arahkan nameserver ke Cloudflare

1. Masuk ke akun tempat Anda membeli domain dan cari pengaturan nameserver domain itu.
2. Ganti nameserver lama dengan dua alamat dari Cloudflare, lalu simpan.
3. Tunggu sampai Cloudflare menandai domain **Active**, baru lanjut.

### 3. Tambahkan domain di KlikUmroh

1. Buka **Website > Domain**.
2. Di bagian **Domain sendiri**, isi **Nama domain** dengan alamat utama, misalnya `www.namatravel.com`. Tulis nama domain saja, tanpa `https://`.
3. Biarkan kotak **Juga arahkan namatravel.com ke www.namatravel.com (disarankan)** tercentang, agar pengunjung yang mengetik tanpa www ikut sampai ke website Anda.
4. Klik **Tambah domain**. KlikUmroh menampilkan tabel record dengan kolom **Tipe**, **Host**, dan **Nilai**, dan status **Menunggu DNS**.

{{gambar: domain-sendiri-1.png | Website > Domain: Alamat bawaan, kolom Nama domain, dan tombol Tambah domain}}

### 4. Buat record di Cloudflare

1. Di Cloudflare buka domain Anda, lalu **DNS > Records**.
2. Untuk setiap baris di tabel KlikUmroh, klik **Add record** dan salin Tipe, Host, dan Nilai persis seperti di tabel. Tombol salin di tabel mengisi Host dalam bentuk yang biasa dipakai panel DNS (misalnya `@` untuk domain tanpa www).
3. Record **CNAME** dan **A**: biarkan **Proxied** (awan oranye). Record **TXT**: selalu **DNS only**.
4. Hapus record A atau CNAME lama untuk host yang sama, misalnya bawaan hosting sebelumnya, agar tidak bentrok.
5. Salin nilai TXT tanpa tanda kutip dan tanpa spasi tambahan.

Bila alamat utama Anda domain tanpa www, tabel meminta record **A**, bukan CNAME. Tabel selalu menampilkan record yang benar untuk alamat yang Anda isi.

### 5. Atur SSL di Cloudflare

1. Buka **SSL/TLS > Overview** dan pilih mode **Full**. Jangan **Flexible** dan jangan **Full (strict)**.
2. Buka **SSL/TLS > Edge Certificates** dan nyalakan **Always Use HTTPS**.

### 6. Periksa di KlikUmroh

1. Kembali ke **Website > Domain** dan klik **Periksa sekarang**.
2. Bila record sudah terbaca, status berubah menjadi **Aktif**. Bila belum, tunggu beberapa menit lalu klik lagi.
3. Buka `https://www.namatravel.com`. Website travel tampil dengan gembok HTTPS.

## Cek hasilnya

- Status di samping nama domain adalah **Aktif**, dengan keterangan "Terhubung sejak ...".
- Alamat tanpa www dan alamat bawaan membuka website di alamat utama. Alamat tanpa www baru bisa aktif setelah alamat www aktif.
- Di Beranda, langkah **Pakai domain sendiri** tercentang setelah ada domain sendiri yang aktif.
- Link website yang disalin dari dashboard mengikuti domain sendiri yang aktif.

## Kalau bermasalah

Bila pemeriksaan gagal, KlikUmroh menampilkan status **Gagal diverifikasi** beserta alasannya di bawah nama domain.

- **Record belum terbaca.** Cek ulang tabel (tipe, host, nilai), tunggu beberapa menit, lalu klik **Periksa sekarang**.
- **TXT tidak cocok.** Nilai TXT harus persis sama dengan tabel, tanpa tanda kutip atau spasi tambahan.
- **Domain belum Active di Cloudflare.** Nameserver di penyedia domain belum diganti; ulangi langkah 2.
- **Halaman berputar atau "terlalu banyak pengalihan".** Mode SSL Cloudflare masih Flexible; ubah ke **Full**.
- **Error 525 atau 526.** Mode SSL Full (strict); ubah ke **Full**.
- **Muncul situs lain atau halaman hosting lama.** Masih ada record A atau CNAME lama untuk host yang sama; hapus.
- **Tanpa www tidak terbuka, tetapi www terbuka.** Alamat tanpa www belum ditambahkan atau recordnya belum dibuat sesuai tabel.
- **Aktif tetapi muncul peringatan "Pemeriksaan DNS terakhir gagal ...x".** Pastikan record DNS tidak berubah atau terhapus.
- Ingin berhenti memakai domain sendiri: klik **Hapus** di samping domain. Website kembali memakai alamat bawaan.

Masih terkendala? Hubungi tim KlikUmroh dan sertakan nama domain Anda.

## Lanjut ke

- [Lihat website Anda](slug:lihat-website)
- [SEO](slug:seo)
- [Kalau begini, cek ini](slug:kalau-begini-cek-ini)
