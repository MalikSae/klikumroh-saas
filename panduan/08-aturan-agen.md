---
title: Atur program dan aturan agen
slug: aturan-agen
stage: tahap-2
label: wajib
order: 8
summary: Tentukan keuntungan, syarat, biaya pendaftaran, Komisi Pembinaan, dan kapan komisi boleh dicairkan sebelum Anda merekrut agen.
menu: Pengaturan > Aturan agen
alias: [aturan agen, syarat agen, biaya pendaftaran agen, komisi pembinaan, minimum tarik, poster rekrutmen, program agen, keuntungan agen]
---

Halaman ini menentukan apa yang dilihat calon agen di halaman daftar, berapa yang mereka bayar (boleh nol), dan kapan komisi mereka boleh ditarik. Isi dulu sebelum membagikan link pendaftaran, supaya calon agen langsung paham keuntungan dan syaratnya.

## Langkah

1. Buka **Pengaturan**, lalu pilih bagian **Aturan agen**.
2. Di bagian **Komisi per jamaah**, tidak ada yang diisi di sini. Besar komisi diatur di setiap paket lewat tautan **Paket** di halaman ini (lihat bab [komisi per paket](slug:komisi-per-paket)).
3. Di bagian **Komisi Pembinaan** (bonus untuk agen yang merekrut agen lain), centang **Beri Komisi Pembinaan ke perekrut (upline)** bila Anda ingin memakainya. Lalu isi **Persentase dari komisi agen rekrutan**, angka lebih dari 0 sampai 100.
   - Contoh dari layar: dengan 10%, agen rekrutan yang mendapat komisi Rp 1.000.000 membuat perekrutnya mendapat tambahan Rp 100.000 dari travel. Komisi agen rekrutan tidak dipotong.
   - Komisi Pembinaan hanya dibukukan bila perekrut berstatus aktif saat closing terjadi.
4. Di bagian **Pencairan komisi**, pilih salah satu pada **Komisi bisa dicairkan saat**:
   - **Setelah jamaah lunas**: komisi tertahan sejak DP sampai Anda menandai jamaah lunas. Lebih aman jika jamaah batal.
   - **Langsung saat DP**: komisi bisa dicairkan begitu prospek closing. Jika closing dibatalkan, komisi dipotong dari komisi berikutnya.
5. Masih di **Pencairan komisi**, isi **Minimal pencairan** (opsional). Pengajuan pencairan dari agen di bawah angka ini ditolak. Kosongkan bila tidak ada batas.
6. Di bagian **Pendaftaran agen** (yang dilihat calon agen di halaman daftar):
   - **Biaya pendaftaran** (opsional). Kosongkan atau isi 0 bila gratis. Bila diisi lebih dari 0, calon agen mentransfer biaya ini lalu mengunggah bukti, dan Anda menyetujuinya di **Agen**, tab **Pendaftaran**.
   - Bila biaya lebih dari 0, kolom **Bank tujuan**, **Nomor rekening**, dan **Atas nama** muncul dan wajib diisi.
   - **Keuntungan menjadi agen** (opsional di formulir, tetapi dibutuhkan agar langkah ini dianggap selesai). Tulis satu poin per baris.
   - **Syarat & ketentuan** (opsional di formulir, juga dibutuhkan agar langkah dianggap selesai). Calon agen wajib menyetujui teks ini saat mendaftar.
   - **Poster rekrutmen** (opsional): unggah gambar persegi, maksimal 8 MB. Poster tampil di halaman daftar agen dan tersimpan langsung saat diunggah, tanpa menunggu tombol simpan.
7. Klik **Simpan perubahan**. Tombol **Batalkan** mengembalikan isian ke versi tersimpan terakhir.

{{gambar: aturan-agen-1.png | Halaman Pengaturan > Aturan agen dengan bagian Komisi per jamaah, Komisi Pembinaan, Pencairan komisi, dan Pendaftaran agen}}

## Cek hasilnya

- Setelah menyimpan, muncul tulisan **Perubahan tersimpan**.
- Di **Beranda**, kartu **Panduan memulai**, tahap **Siap rekrut agen**, langkah **Atur program agen** menjadi **Selesai** bila **Keuntungan menjadi agen** dan **Syarat & ketentuan** sudah terisi. Biaya pendaftaran boleh 0 dan tidak memengaruhi langkah ini.
- Buka `alamat-website-Anda/agen/daftar` di browser. Di sana tampil biaya (atau tulisan **Pendaftaran mitra gratis**), daftar keuntungan, poster bila ada, dan tautan **Syarat & Ketentuan Kemitraan Agen** bila syarat diisi.

{{gambar: aturan-agen-2.jpg | Halaman daftar agen di website travel (tampilan HP): biaya pendaftaran, daftar keuntungan, dan formulir pendaftaran}}

## Kalau bermasalah

- **Tidak bisa menyimpan, muncul "Isi persentase antara 0 dan 100."** Komisi Pembinaan dicentang tetapi persentasenya kosong atau di luar 0 sampai 100.
- **Tidak bisa menyimpan, muncul "Wajib diisi jika ada biaya pendaftaran."** Biaya lebih dari 0 tetapi bank, nomor rekening, atau nama pemilik rekening belum diisi.
- **Tidak bisa menyimpan, muncul "Isi angka saja, contoh 150000 atau 150.000."** Kolom biaya atau minimal pencairan berisi huruf atau tanda lain. Kosongkan bila tidak ada.
- **Langkah Atur program agen belum selesai padahal biaya sudah diisi.** Yang dihitung hanya **Keuntungan menjadi agen** dan **Syarat & ketentuan**.
- **Tautan Syarat & Ketentuan tidak tampil di halaman daftar.** Kolom **Syarat & ketentuan** masih kosong.
- **Perubahan aturan pencairan tidak mengubah komisi yang sudah tercatat.** Komisi yang sudah dibukukan mengikuti aturan saat closing terjadi (lihat bab [pencairan komisi](slug:pencairan-komisi)).

## Lanjut ke

[Isi komisi di setiap paket](slug:komisi-per-paket)
