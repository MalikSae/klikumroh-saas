---
title: Kelola prospek yang masuk
slug: prospek-masuk
stage: tahap-3
label: wajib
order: 13
summary: Lihat dari mana calon jamaah datang, ubah statusnya dari Baru sampai Closing, tandai lunas, dan unduh daftar prospek ke CSV.
menu: Penjualan > Prospek
alias: [prospek, calon jamaah, status prospek, closing, form minat, bukti transfer, lunas, tandai lunas, unduh csv, tidak lanjut]
---

Prospek adalah calon jamaah yang meninggalkan datanya. Menu **Prospek** adalah tempat kerja utama Anda: semua calon jamaah dari website, iklan, dan agen masuk ke satu daftar, dan di sinilah statusnya Anda geser sampai Closing.

## Dari mana prospek datang

- **Website**: pengunjung mengisi formulir minat. Semua tombol kontak di website membuka formulir ini lebih dulu, tidak langsung ke WhatsApp.
- **Iklan**: formulir yang diisi pengunjung yang datang dari iklan. Kampanyenya tercatat di drawer prospek.
- **Agen**: pengunjung yang masuk lewat link referral agen, atau calon jamaah yang dicatat manual oleh agen. Prospek tercatat atas nama agen hanya bila agen itu berstatus aktif.

Di daftar, kolom **Kanal** menampilkan **Website**, **Iklan**, atau **Agen**. Semua prospek baru berstatus **Baru**, dan Anda mendapat notifikasi "Prospek baru".

Bila orang yang sama (nomor WhatsApp yang sama) mengisi lagi saat prospeknya masih berjalan, sistem tidak membuat prospek kedua. Prospek lama tetap dipakai, kolom yang kosong dilengkapi dari isian baru, catatan sistem ditambahkan, dan Anda mendapat notifikasi "Prospek mendaftar lagi". Bila nomor itu ternyata sudah Closing, prospek baru diberi catatan peringatan dan notifikasi "Nomor sudah pernah closing", agar komisi tidak dibayar dua kali.

## Status prospek

Status berurutan: **Baru**, **Dihubungi**, **Tertarik**, **Closing**, dan **Tidak lanjut**.

- **Closing** berarti jamaah sudah membayar DP. Setelah Closing, status tidak bisa diubah ke status lain; gunakan **Batalkan closing** bila jamaah batal.
- **Lunas** bukan status. Lunas adalah penanda terpisah pada prospek **Closing**: tertulis **Sudah DP, menunggu lunas** atau **Lunas**. Penanda ini yang melepas komisi agen yang tertahan (lihat bab [pencairan komisi](slug:pencairan-komisi)).

## Langkah

1. Buka **Prospek**. Di atas daftar ada tab **Semua**, **Baru**, **Dihubungi**, **Tertarik**, **Closing**, dan **Tidak lanjut**, masing-masing dengan jumlahnya. Di paling atas ada ringkasan 30 hari terakhir: **Prospek masuk**, **Jamaah closing**, **Konversi**, dan **Potensi pipeline**.
2. Untuk mempersempit daftar, pakai kotak cari (nama, nomor WhatsApp, domisili) dan **Filter**: **Kanal**, **Agen**, **Paket**, **Rencana berangkat**, dan **Pelunasan** (**DP, menunggu lunas** atau **Lunas**, berlaku untuk prospek Closing). Tombol **Reset** mengembalikan semua filter.
3. Klik satu baris. Drawer prospek terbuka. Bagian **Status** punya tombol untuk setiap status.
4. Pindahkan statusnya sesuai perkembangan:
   - **Dihubungi**: setelah Anda menghubungi calon jamaah (tombol **Hubungi via WhatsApp** di bagian bawah drawer membuka chat di WhatsApp; statusnya tetap Anda ubah sendiri).
   - **Tertarik**: bila prospek belum punya paket atau jumlah jamaah, sistem meminta yang belum ada dulu.
   - **Closing**: sistem meminta paket dan jumlah jamaah bila belum ada, lalu meminta konfirmasi. Bila prospek dibawa agen dan komisi paketnya sudah diatur, komisi langsung dibukukan.
   - **Tidak lanjut**: pilih **Alasan** (**Harga tidak cocok**, **Jadwal tidak cocok**, **Dana belum siap**, **Memilih travel lain**, **Tidak merespons**, atau **Lainnya**) dan tambahkan **Keterangan**; untuk **Lainnya** keterangan wajib.
5. Untuk prospek Closing yang jamaahnya sudah melunasi pembayaran, klik **Tandai lunas** lalu konfirmasi. Komisi agen yang tertahan menjadi siap dicairkan. **Batalkan closing** mengubah status menjadi Tidak lanjut (batal setelah DP), butuh alasan, dan membatalkan komisi agen untuk prospek itu.
6. Untuk mengoreksi data, klik **Edit data** (nama, nomor WhatsApp, paket, jumlah jamaah, rencana berangkat, domisili). Pada prospek Closing, mengubah paket atau jumlah jamaah membukukan koreksi komisi agen dan meminta **Alasan koreksi**.
7. Tulis **Catatan** (tombol **Simpan catatan**) untuk menyimpan hasil percakapan. Catatan tampil bagi tim dan agen. **Riwayat status** di bawahnya mencatat siapa mengubah apa dan kapan.

{{gambar: prospek-masuk-1.png | Halaman Prospek dengan tab status, filter, dan daftar prospek berkolom Nama, Paket, Kanal, Masuk, Status}}

{{gambar: prospek-masuk-2.png | Drawer prospek: tombol status Baru sampai Tidak lanjut, kartu Sudah DP menunggu lunas dengan tombol Tandai lunas, lalu data paket dan agen}}

### Bukti pembayaran dari agen

Agen bisa mengirim bukti transfer DP atau pelunasan dari portalnya. Bukti itu muncul di drawer prospek sebagai **Bukti DP dari agen** atau **Bukti pelunasan dari agen**, lengkap dengan fotonya (klik untuk memperbesar), nama agen, waktu, dan jumlah bila diisi. Cek dulu uangnya benar-benar masuk, lalu klik **Setujui closing** atau **Setujui lunas**; hasilnya sama persis dengan Anda mengubah status Closing atau menekan **Tandai lunas** sendiri. Bila bukti tidak sesuai, klik **Tolak** dan isi **Alasan**; agen menerima alasan itu dan bisa mengirim bukti yang benar. Di **Beranda**, bukti yang menunggu muncul sebagai "bukti pembayaran" pada **Perlu tindakan**.

### Unduh ke CSV

Klik **Unduh CSV** di kanan atas daftar. File berisi prospek sesuai tab dan filter yang sedang aktif, dengan kolom antara lain Nama, No. WhatsApp, Paket, Jumlah Jamaah, Sumber, Agen, Status, Tanggal Closing, dan Tanggal Lunas.

## Cek hasilnya

- Prospek pindah ke tab status yang baru dan angka di tab ikut berubah.
- Riwayat status di drawer menambah satu baris untuk setiap perubahan.
- Prospek Closing menampilkan **Sudah DP, menunggu lunas** atau **Lunas**; setelah **Tandai lunas**, tertulis tanggal ditandai lunas.
- Di **Beranda**, langkah **Dapatkan prospek pertama** menjadi **Selesai** begitu ada prospek.

## Kalau bermasalah

- **Status Closing tidak bisa diubah lagi.** Memang dikunci. Pakai **Batalkan closing** bila jamaah batal.
- **"Paket belum dipilih."** atau **"Jumlah jamaah harus angka bulat 1 sampai 50."** Lengkapi paket dan jumlah jamaah di dialog sebelum Tertarik atau Closing.
- **Muncul "Komisi paket ... belum diatur, jadi komisi agen tidak dibukukan."** Isi komisi di paket (bab [komisi per paket](slug:komisi-per-paket)). Untuk menghindari ini, isi komisi sebelum closing.
- **Perubahan gagal karena admin lain sudah mengubah prospek yang sama.** Drawer dimuat ulang dan menampilkan keadaan terbaru; ulangi bila perlu.
- **Prospek tidak bisa dihapus.** Prospek Closing, prospek yang pernah Closing lalu dibatalkan, dan prospek yang punya riwayat komisi hanya bisa dihapus data pribadinya lewat menu **Aksi lain > Hapus data pribadi** (untuk permintaan penghapusan data jamaah). Prospek lain, misalnya data spam atau uji, bisa dihapus lewat **Hapus prospek**.
- **Tampil "Data pribadi dihapus".** Nama, nomor, dan catatan prospek itu sudah dihapus atas permintaan jamaah; status, paket, dan riwayat komisi tetap tersimpan.

## Lanjut ke

[Tindak lanjut cepat](slug:tindak-lanjut-cepat)
