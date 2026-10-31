---
title: Proses pencairan komisi agen
slug: pencairan-komisi
stage: tahap-2
label: wajib
order: 12
summary: Setujui permintaan tarik saldo agen, transfer ke rekeningnya di luar aplikasi, lalu tandai sudah ditransfer; pahami kenapa komisi bisa tertahan sampai jamaah lunas.
menu: Kemitraan > Pencairan komisi
alias: [pencairan, tarik saldo, bayar komisi, komisi agen belum cair, lunas, komisi tertahan, tandai sudah ditransfer, cairkan saldo agen]
---

Agen menarik komisinya dengan mengajukan pencairan di portalnya. Di sini Anda menyetujui atau menolak pengajuan itu, lalu mentransfer uangnya sendiri ke rekening agen dan menandainya di dashboard. KlikUmroh tidak memindahkan uang: transfer dilakukan Anda di luar aplikasi.

## Kapan komisi bisa ditarik

Komisi dibukukan saat prospek menjadi Closing (jamaah sudah membayar DP). Bisa tidaknya ditarik ditentukan aturan di **Pengaturan > Aturan agen**, bagian **Pencairan komisi** (lihat bab [aturan agen](slug:aturan-agen)):

- **Setelah jamaah lunas**: komisi **tertahan** sejak DP. Komisi baru bisa ditarik setelah Anda menandai jamaah itu lunas.
- **Langsung saat DP**: komisi langsung bisa ditarik begitu prospek Closing.

Lunas bukan status di alur prospek. Lunas adalah penanda terpisah pada prospek yang berstatus Closing, yang Anda atur lewat tombol **Tandai lunas** di drawer prospek (lihat bab [prospek masuk](slug:prospek-masuk)). Begitu jamaah ditandai lunas, komisi agen yang tertahan menjadi **Siap dicairkan** dan agen mendapat notifikasi "Komisi Anda sekarang bisa dicairkan".

Saldo agen terlihat di halaman agen (**Kemitraan > Agen**, klik nama agen), bagian **Saldo komisi**: **Siap dicairkan**, **Diproses** (pengajuan yang belum selesai), **Tertahan** (komisi dari jamaah yang belum lunas), dan **Potensi** (perkiraan dari prospek yang belum closing, belum pasti).

## Langkah

1. Buka **Pencairan komisi** (grup **KEMITRAAN**). Di atas ada ringkasan **Perlu disetujui**, **Siap ditransfer**, **Ditransfer bulan ini**, dan **Total ditransfer**. Saat ada pengajuan baru, Anda mendapat notifikasi "Pengajuan pencairan baru" dan **Beranda** menampilkan "pencairan komisi" pada **Perlu tindakan**.
2. Secara bawaan daftar menampilkan filter **Perlu tindakan**. Opsi lain di **Filter > Status**: **Menunggu persetujuan**, **Siap ditransfer**, **Sudah ditransfer**, **Ditolak**, dan **Semua**. Kolom daftar: **Agen**, **Jumlah**, **Rekening tujuan**, **Diajukan**, **Status**.
3. Untuk pengajuan berstatus **Menunggu persetujuan**, klik **Setujui**, lalu konfirmasi. Atau klik **Tolak**, isi **Alasan penolakan** (wajib, dikirim ke agen), lalu **Tolak pencairan**. Saldo kembali ke **Siap dicairkan** milik agen.
4. Pengajuan yang disetujui berubah menjadi **Siap ditransfer**. Transfer sejumlah yang tertera ke **Rekening tujuan** di luar aplikasi. Ikon salin di samping nomor rekening memudahkan Anda menyalinnya.
5. Setelah uang terkirim, klik **Tandai sudah ditransfer** dan konfirmasi **Sudah ditransfer**. Status menjadi **Sudah ditransfer** dan agen mendapat notifikasi berisi bank dan nama pemilik rekening.
6. Bila transfer gagal (misalnya rekening salah) pada pengajuan **Siap ditransfer**, klik **Batalkan**, isi **Alasan pembatalan** (wajib, dikirim ke agen), lalu **Batalkan pencairan**. Jumlahnya kembali ke saldo siap cair agen dan agen bisa mengajukan ulang.

{{gambar: pencairan-komisi-1.png | Halaman Pencairan komisi dengan ringkasan di atas dan daftar pengajuan berstatus Menunggu persetujuan dan Siap ditransfer, lengkap dengan tombol Setujui, Tolak, Tandai sudah ditransfer}}

### Mencairkan atas nama agen

Dari halaman agen, tombol **Cairkan saldo agen** (di bagian **Saldo komisi**) mengajukan pencairan untuk seluruh saldo **Siap dicairkan** agen itu ke rekening yang tersimpan di profilnya. Pengajuan ini kemudian diproses seperti biasa di **Pencairan komisi**: setujui, transfer, tandai sudah ditransfer. Tombol hanya muncul bila ada saldo siap cair dan tidak ada pengajuan lain yang sedang diproses.

### Aturan yang berlaku untuk pengajuan agen

- Agen hanya bisa punya satu pengajuan yang sedang diproses (**Menunggu persetujuan** atau **Siap ditransfer**) pada satu waktu.
- Jumlah yang diajukan tidak boleh melebihi saldo siap cair, dan tidak boleh di bawah **Minimal pencairan** bila Anda mengisinya. Minimal ini tidak berlaku untuk **Cairkan saldo agen** yang Anda ajukan dari halaman agen.
- Saat Anda menyetujui atau menandai sudah ditransfer, sistem mengecek ulang bahwa saldo agen masih mencukupi. Bila tidak (misalnya ada closing dibatalkan), proses ditolak dengan penjelasan.
- Bila closing dibatalkan, komisinya dikoreksi. Bagian yang sudah sempat cair dipotong dari komisi agen berikutnya.

## Cek hasilnya

- Pengajuan yang selesai berstatus **Sudah ditransfer** dan masuk hitungan **Ditransfer bulan ini** dan **Total ditransfer**.
- Di halaman agen, **Riwayat komisi** menampilkan pencairannya beserta statusnya, dan alasan bila ditolak.
- Setiap perubahan status (disetujui, ditolak, dibatalkan, ditransfer) dikirim ke agen sebagai notifikasi di portalnya.

## Kalau bermasalah

- **Komisi agen belum bisa dicairkan padahal prospeknya sudah Closing.** Aturan travel adalah **Setelah jamaah lunas** dan jamaahnya belum ditandai lunas. Komisi ada di **Tertahan**. Tandai lunas di drawer prospek.
- **"Pengajuan ini tidak bisa disetujui karena statusnya ..."** atau pesan serupa. Admin lain sudah memproses pengajuan yang sama; daftar dimuat ulang dan menampilkan status sebenarnya.
- **Tombol Cairkan saldo agen tidak muncul.** Tidak ada saldo siap cair, atau agen masih punya pengajuan yang sedang diproses.
- **"Data rekening agen belum lengkap."** Saat Anda mencairkan atas nama agen, bank, nomor rekening, atau nama pemilik di profil agen belum lengkap. Minta agen mengajukan sendiri dari portalnya; rekening yang ia isi saat mengajukan tersimpan untuk pengajuan berikutnya.
- **Agen berstatus Nonaktif tidak bisa mengajukan sendiri.** Anda tetap bisa mencairkan atas namanya lewat **Cairkan saldo agen**.

## Lanjut ke

[Prospek yang masuk dan status pipeline](slug:prospek-masuk)
