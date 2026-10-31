---
title: Kalau begini, cek ini
slug: kalau-begini-cek-ini
stage: bantuan
label:
order: 18
summary: Daftar masalah yang sering ditemui admin travel, penyebab yang mungkin, dan langkah mengeceknya.
menu: Panduan
alias: [tidak muncul, error, gagal, belum bisa, bingung, kenapa, masalah, tidak tampil, tidak bisa, hilang]
---

Cari gejala yang Anda alami di bawah ini. Setiap bagian menyebut penyebab yang memang dikenali sistem, lalu langkah untuk mengeceknya.

## Paket saya tidak muncul di website

Website hanya menampilkan paket yang berstatus **Tayang** dan belum berangkat. Cek berurutan:

1. Buka **Paket** dan lihat label status paket. Paket berlabel **Draf** atau **Arsip** tidak tampil di website. Buka paketnya, lalu klik **Tayangkan di website**.
2. Paket berlabel **Sudah berangkat** (tanggal berangkat sudah lewat, dihitung per hari menurut waktu WIB) otomatis keluar dari website. Ubah tanggal berangkatnya bila memang salah.
3. Paket baru tidak bisa ditayangkan tanpa harga. Isi harga dulu, lalu tayangkan.
4. Bila seluruh website yang tidak tampil, lihat bagian "Website saya terlihat kosong".

Lanjut: [Buat paket pertama](slug:paket-pertama) dan [Detail paket](slug:detail-paket).

## Harga atau tanggal berangkat tidak tampil di kartu paket

- **Harga**: paket yang tayang wajib berharga, jadi kartu paket menampilkan "Mulai Rp ..." selama harganya terisi lebih dari nol. Kalau tidak terlihat, cek apakah paket yang Anda lihat benar-benar paket yang tayang dan harganya sudah tersimpan.
- **Tanggal berangkat**: kolom tanggal bersifat opsional. Bila dikosongkan, kartu paket tidak menampilkan tanggal, dan paket tanpa tanggal tidak ikut saringan bulan di website.

Isi atau perbaiki lewat **Paket**, buka paketnya, lalu simpan. Lihat [Detail paket](slug:detail-paket).

## Agen tidak bisa masuk, atau akunnya menunggu persetujuan

- Agen yang baru mendaftar berstatus menunggu persetujuan. Buka **Agen > Pendaftaran** dan setujui atau tolak pendaftarannya. Agen yang masih menunggu, ditolak, atau dinonaktifkan tetap bisa masuk portal, tetapi fitur seperti komisi dan leaderboard menjawab "Akun belum aktif" sampai statusnya aktif.
- Agen yang dinonaktifkan atau ditolak keluar dari semua perangkat dan harus masuk ulang.
- Pendaftaran agen baru ditutup selama travel masih **Belum aktif** (belum bayar aktivasi) atau **Ditangguhkan**. Selesaikan pembayaran di **Pengaturan > Langganan**.
- Bila agen memakai kode referral perekrut yang diketik manual dan perekrutnya sedang tidak aktif, pendaftaran ditolak dengan pesan untuk mengosongkan kolom kode referral.
- Agen yang pendaftarannya ditolak karena bukti pembayaran, bisa mengunggah ulang bukti dan kembali ke status menunggu.

Lanjut: [Terima agen](slug:terima-agen) dan [Aturan agen](slug:aturan-agen).

## Prospek dari agen tidak tercatat atas nama agen

Prospek hanya dicatat atas nama agen bila semua ini terpenuhi:

1. Pengunjung masuk lewat link referral agen itu (`/ref/kode`). Kode disimpan di browser pengunjung selama 30 hari.
2. Agen berstatus **aktif**. Link agen yang masih menunggu, ditolak, atau dinonaktifkan tidak menghasilkan prospek atas namanya.
3. Kode referral milik agen di travel yang sama. Kode dari travel lain diabaikan.
4. Nomor jamaah belum menjadi prospek yang masih berjalan. Bila nomor yang sama masuk lagi saat prospek lamanya masih terbuka, tidak dibuat prospek kedua dan pemilik pertama tetap.

Prospek tanpa agen tercatat dengan kanal **Website** atau **Iklan**. Cek di **Prospek** kolom **Kanal**. Bila agen mengeluhkan, pastikan statusnya di **Agen**.

Lanjut: [Prospek masuk](slug:prospek-masuk) dan [Aturan agen](slug:aturan-agen).

## Komisi agen belum cair

Cek berurutan:

1. **Tertahan sampai lunas.** Dengan aturan **Setelah jamaah lunas** (**Pengaturan > Aturan agen**, bagian **Pencairan komisi**), komisi tertahan sejak Closing sampai Anda membuka prospeknya dan klik **Tandai lunas**. Dengan aturan **Langsung saat DP**, komisi bisa dicairkan begitu prospek Closing.
2. **Prospek belum Closing.** Komisi baru tercatat saat status prospek menjadi Closing.
3. **Komisi paket kosong.** Paket tanpa nilai komisi tidak memberi tahu agen apa yang ia dapat. Isi komisi di setiap paket yang tayang.
4. **Di bawah minimal pencairan.** Pengajuan di bawah angka **Minimal pencairan** ditolak.
5. **Pengajuan belum diproses.** Buka **Pencairan komisi**. Pengajuan agen berstatus menunggu persetujuan, lalu disetujui, lalu ditandai sudah ditransfer setelah Anda transfer.6. **Closing dibatalkan.** Komisi yang sudah tercatat dikoreksi; bila sebagian sudah bisa dicairkan, potongannya diambil dari komisi berikutnya.

Lanjut: [Pencairan komisi](slug:pencairan-komisi) dan [Komisi per paket](slug:komisi-per-paket).

## Domain saya belum aktif

Status domain di **Website > Domain** punya tiga kemungkinan: **Menunggu DNS**, **Aktif**, dan **Gagal diverifikasi**. Alasan kegagalan tampil di bawah nama domain. Penyebab yang dikenali panduan:

- Record belum dibuat, salah ketik, atau belum menyebar. Tunggu beberapa menit lalu klik **Periksa sekarang**.
- Nilai TXT tidak persis sama dengan tabel.
- Nameserver belum diganti ke Cloudflare sehingga domain belum Active di sana.
- Mode SSL Cloudflare bukan **Full**.
- Alamat tanpa www baru bisa aktif setelah alamat www aktif.

Langkah lengkap ada di [Pasang domain sendiri](slug:domain-sendiri). Ingat, alamat bawaan namatravel.klikumroh.id tetap bisa dipakai selama domain sendiri belum aktif.

## Website saya tidak muncul di Google

- Website yang **Ditangguhkan** (langganan lewat masa tenggang) diberi tanda agar tidak diindeks Google. Perpanjang langganan di **Pengaturan > Langganan**.
- Travel demo juga tidak diindeks.
- Alamat travel yang belum aktif tidak menampilkan website dan diberi tanda tidak diindeks.
- Judul, deskripsi, dan kota di **Website > SEO** kosong atau belum diisi. Isi agar hasil pencarian lebih jelas.

Lanjut: [SEO](slug:seo) dan [Bayar dan perpanjang langganan](slug:langganan-dan-pembayaran).

## Website saya terlihat kosong atau muncul pemberitahuan penangguhan

- **"Layanan Website Sedang Ditangguhkan Sementara"**: langganan sudah lewat masa tenggang 7 hari. Perpanjang di **Pengaturan > Langganan** (hanya PIC). Setelah pembayaran diverifikasi, website aktif lagi otomatis.
- **"Situs travel belum tersedia"**: alamat yang dibuka belum terhubung ke travel yang aktif. Periksa ejaan alamat, dan pastikan pembayaran aktivasi sudah diverifikasi.
- **"Situs sedang gangguan"**: halaman gagal memuat data travel. Klik **Muat ulang**; alamat dan link referral tetap terbawa.
- Website tampil tetapi beranda sepi: biasanya belum ada paket berstatus **Tayang** yang belum berangkat. Lihat gejala pertama di atas.

Lanjut: [Bayar dan perpanjang langganan](slug:langganan-dan-pembayaran) dan [Lihat website](slug:lihat-website).

## Checklist di Beranda tidak tercentang

Setiap langkah tercentang otomatis dari data travel Anda, bukan dicentang manual. Syaratnya:

- **Lengkapi profil travel**: nama travel terisi, dan alamat atau kota kantor terisi.
- **Pasang logo travel**: logo sudah diunggah.
- **Tayangkan paket pertama**: ada paket **Tayang** dengan harga dan tanggal berangkat.
- **Bangun kepercayaan**: ada minimal satu testimoni atau banner yang aktif.
- **Lihat website Anda**: tercentang setelah Anda klik **Buka website** dari kartu itu (di browser ini), atau setelah travel menerima prospek pertama.
- **Atur program agen**: **Keuntungan menjadi agen** dan **Syarat & ketentuan** keduanya terisi (**Pengaturan > Aturan agen**).
- **Atur komisi agen**: ada paket tayang, dan semua paket tayang punya komisi.
- **Buat target & reward**: ada minimal satu target.
- **Bagikan link pendaftaran agen**: ada minimal satu agen yang mendaftar. **Setujui agen pertama**: ada minimal satu agen aktif.
- **Dapatkan prospek pertama**: ada minimal satu prospek. **Tindak lanjuti prospek**: ada prospek yang statusnya bukan **Baru**.
- **Pasang pelacakan iklan**: Meta Pixel sudah diisi.
- **Pakai domain sendiri**: ada domain sendiri berstatus **Aktif**.
- **Undang tim**: ada lebih dari satu akun admin aktif.

Bila sudah dikerjakan tetapi belum tercentang, muat ulang halaman Beranda dan periksa syaratnya di atas. Bab terkait: [Profil travel](slug:profil-travel), [Logo dan warna](slug:logo-dan-warna), [Testimoni, banner, dan FAQ](slug:testimoni-banner-faq), [Target dan reward](slug:target-dan-reward), [Undang tim](slug:undang-tim).

## Lanjut ke

- [Istilah](slug:istilah)
