---
title: Bayar dan perpanjang langganan
slug: langganan-dan-pembayaran
stage: lanjutan
label: wajib
label_text: Wajib dibaca
order: 15
summary: Cara membayar aktivasi, memperpanjang langganan, memakai kupon, dan apa yang terjadi pada website kalau langganan lewat masa aktif.
menu: Pengaturan > Langganan
alias: [langganan, bayar, invoice, tagihan, kupon, suspend, ditangguhkan, website mati, masa tenggang, perpanjang, trial, bukti transfer]
---

Langganan menentukan apakah website travel Anda tampil untuk calon jamaah. Kalau masa aktif habis dan tidak diperpanjang, website berhenti tampil, jadi bab ini wajib dibaca sebelum Anda mulai promosi.

## Sebelum mulai

- Menu **Langganan** hanya muncul untuk akun berperan **PIC**. Akun berperan Admin tidak melihat menunya; kalau dibuka lewat alamat langsung, Admin dikembalikan ke **Profil travel**. Peran dijelaskan di [Undang tim](slug:undang-tim).
- Anda perlu foto atau tangkapan layar bukti transfer (JPG, PNG, atau WebP, maksimal 10 MB).

## Langkah

### Pembayaran pertama (aktivasi)

Travel yang baru mendaftar berstatus **Belum aktif**. Selama belum aktif, hanya halaman pembayaran yang bisa dibuka; menu lain mengarahkan Anda kembali ke tagihan. Website dan dashboard terbuka penuh setelah pembayaran diverifikasi.

1. Buka **Pengaturan > Langganan**. Bila belum ada tagihan, pilih paket di bagian **Pilih paket aktivasi**.
2. Isi **Kode kupon** bila punya, lalu klik **Pakai** (lihat bagian kupon di bawah).
3. Cek rincian **Total**, lalu klik **Lanjut ke pembayaran**.
4. Di halaman invoice, transfer ke rekening yang tertera di bagian **Transfer bank**. Salin jumlahnya dengan tombol salin di samping **Total transfer**. Jumlah sudah termasuk **kode unik** 3 digit agar pembayaran Anda mudah dicocokkan, jadi transfer persis sesuai total.
5. Klik **Unggah bukti transfer** dan pilih berkas bukti.
6. Tunggu verifikasi. Halaman menampilkan keterangan "Diverifikasi maksimal 24 jam" dan status tagihan berubah menjadi **Sedang diverifikasi**.

Anda juga bisa mengunduh invoice lewat **Unduh PDF**.

{{gambar: halaman invoice dengan Total transfer, kotak Transfer bank, dan tombol Unggah bukti transfer}}

### Perpanjang langganan

1. Buka **Pengaturan > Langganan**. Bagian **Paket saat ini** menampilkan status dan sisa hari.
2. Klik **Perpanjang langganan**. Pilihan paket dan kupon muncul otomatis bila langganan sudah masuk 30 hari terakhir, sudah lewat masa aktif, atau website ditangguhkan.
3. Pilih paket di **Pilih paket perpanjangan**, lalu lanjutkan seperti pembayaran pertama.

Selama ada tagihan yang belum dibayar, Anda bisa memilih **Ganti paket** (hanya sebelum bukti transfer diunggah). Tagihan lama yang belum dibayar akan diganti oleh tagihan baru.

### Kupon dan promo

- Masukkan kode di kolom **Kode kupon**, lalu klik **Pakai**. Bila berlaku, tampil keterangan "Diskon ... % diterapkan" dan baris **Kupon** di rincian total.
- Kupon dipotong dari harga setelah promo paket (bila ada). Promo paket berjudul "pembayaran pertama" hanya untuk travel yang belum pernah membayar.
- Satu kupon hanya bisa dipakai sekali oleh satu travel. Kupon juga bisa ditolak karena tidak ditemukan, sudah tidak aktif, kedaluwarsa, kuotanya habis, atau tidak berlaku untuk paket yang dipilih. Alasannya tampil di bawah kolom kupon.
- Kupon tidak boleh dibiarkan terketik tanpa dicek: bila kode terisi tetapi tidak valid, tagihan tidak dibuat sampai kolomnya dikosongkan atau diperbaiki.

## Cek hasilnya

- **Paket saat ini** menampilkan label **Aktif** dan "Aktif sampai ... , sisa ... hari".
- Di **Riwayat tagihan**, tagihan Anda berstatus **Lunas**. Status lainnya: **Menunggu pembayaran**, **Sedang diverifikasi**, **Ditolak**, **Dibatalkan**.
- Di **Beranda** muncul pengingat bila langganan perlu perhatian: pembayaran aktivasi belum selesai atau sedang diverifikasi, masa aktif tinggal 30 hari atau kurang, masa tenggang, atau ditangguhkan. Tombol di pengingat membawa Anda langsung ke tagihan.

## Masa tenggang dan penangguhan

- **Masa tenggang** adalah 7 hari sesudah masa aktif berakhir. Selama itu layanan tetap berjalan dan **Paket saat ini** berlabel **Masa tenggang** dengan sisa harinya.
- Lewat masa tenggang, status berubah menjadi **Ditangguhkan**:
  - Website publik hanya menampilkan pemberitahuan bahwa layanan sedang ditangguhkan, bukan paket dan halaman travel. Pemberitahuan itu tidak memuat kontak travel.
  - Data terstruktur (yang memuat telepon, email, dan alamat) dan Meta Pixel tidak dipasang, dan halaman diberi tanda agar tidak diindeks Google.
  - Form minat ditutup, dan pendaftaran agen baru tidak dibuka.
  - Dashboard dan portal agen menjadi hanya-lihat: data tetap bisa dibaca, tetapi perubahan tidak bisa disimpan.
- Membayar tagihan perpanjangan dan mengunggah bukti tetap bisa dilakukan saat ditangguhkan. Setelah pembayaran diverifikasi, website aktif kembali otomatis.

## Kalau bermasalah

- **Bukti transfer ditolak.** Invoice menampilkan banner **Bukti transfer ditolak** beserta alasannya. Unggah ulang bukti yang benar lewat **Unggah ulang bukti transfer**. Bila sudah ada tagihan lain yang terbuka, buka tagihan itu; tagihan yang ditolak tidak berlaku lagi.
- **Menu Langganan tidak ada.** Akun Anda berperan Admin. Minta PIC mengubah peran Anda, atau PIC yang melakukan pembayaran.
- **"Rekening tujuan belum tersedia".** Hubungi tim KlikUmroh lewat tautan **Hubungi KlikUmroh** di bagian bawah invoice sebelum transfer.
- **Unggahan gagal.** Pastikan berkasnya gambar (JPG, PNG, atau WebP) dan tidak lebih dari 10 MB.
- **Kupon ditolak.** Baca alasan di bawah kolom kupon; pilih paket lain bila kupon dibatasi untuk paket tertentu.
- Website tampak kosong atau berisi pemberitahuan penangguhan: lihat [Kalau begini, cek ini](slug:kalau-begini-cek-ini).

## Lanjut ke

- [Undang tim](slug:undang-tim)
- [Pasang domain sendiri](slug:domain-sendiri)
- [Kalau begini, cek ini](slug:kalau-begini-cek-ini)
