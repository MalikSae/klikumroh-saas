---
title: Tayangkan paket pertama
slug: paket-pertama
stage: tahap-1
label: wajib
order: 3
summary: Buat atau sesuaikan paket umroh dengan harga dan tanggal berangkat, lalu tayangkan agar calon jamaah bisa memilihnya.
menu: Paket
alias: [tambah paket, harga umroh, tanggal berangkat, kuota, kursi, draf, tayangkan, paket tidak muncul, komisi agen, arsipkan, hapus paket]
---

Paket adalah yang dicari calon jamaah di website Anda. Selama paket masih berstatus draf, ia tidak tampil di website.

## Sebelum mulai

Saat akun travel diaktifkan dan Anda belum punya paket, sistem membuat satu paket contoh berstatus **Draf** bernama "Paket Umroh Reguler 9 Hari (Contoh)", lengkap dengan harga, tanggal berangkat, hotel, dan fasilitas contoh. Anda bisa menyesuaikannya, bukan membuat dari nol. Di Beranda, langkah **Tayangkan paket pertama** punya tombol **Edit paket contoh** yang membukanya langsung. Bila paket contoh tidak ada, tombolnya menjadi **Tambah paket**.

## Langkah

1. Buka menu **Paket**. Klik **Tambah paket**, atau klik paket contoh yang sudah ada di daftar.
2. Di bagian **Informasi paket**, isi **Nama paket** (wajib), misalnya "Umroh Reguler 9 Hari Januari". **Deskripsi** opsional; pisahkan paragraf dengan baris kosong.
3. Di bagian **Harga & keberangkatan**:
   - **Harga per jamaah**: wajib diisi sebelum paket bisa tayang.
   - **Komisi agen per jamaah**: formulir tidak memaksa mengisinya, tetapi isi sebelum merekrut agen supaya mereka tahu penghasilannya (lihat [komisi per paket](slug:komisi-per-paket)). Dibayar ke agen saat prospeknya closing. Tidak boleh lebih besar dari harga. Di bawah kolom ini tampil persentasenya terhadap harga.
   - **Tanggal berangkat**: opsional di formulir, tetapi dibutuhkan agar paket dihitung siap di checklist (lihat di bawah).
   - **Kuota kursi**: opsional, angka bulat. Kosongkan bila tidak dibatasi.
4. Klik **Simpan draf** untuk menyimpan tanpa menayangkan, atau **Tayangkan di website** untuk langsung tayang. Pada paket yang sudah ada dan masih draf, tombolnya **Simpan** dan **Tayangkan di website**.

{{gambar: paket-pertama-1.png | Editor paket, bagian Harga & keberangkatan: Harga per jamaah, Komisi agen per jamaah, Tanggal berangkat, dan Kuota kursi}}

Foto, hotel, penerbangan, dan fasilitas dijelaskan di [bab berikutnya](slug:detail-paket).

## Status paket

| Status | Artinya |
|---|---|
| **Draf** | Belum tampil di website. |
| **Tayang** | Tampil di website. |
| **Sudah berangkat** | Paket tayang yang tanggal berangkatnya sudah lewat (hitungan WIB). Tidak lagi tampil di website. |
| **Diarsipkan** | Disimpan, tidak tampil. |

Paket dianggap siap di checklist Beranda bila berstatus tayang, harganya lebih dari 0, dan tanggal berangkat terisi.

## Mengubah status atau menghapus

Di editor paket, klik tombol titik tiga (**Aksi paket**) di bar bawah:

- **Kembalikan ke draf**: tersedia untuk paket tayang; paket hilang dari website.
- **Arsipkan**: untuk paket yang sudah tidak dijual. Pada paket yang sudah diarsipkan, pilihannya menjadi **Kembalikan ke draf**.
- **Hapus paket**: menghapus paket dan fotonya secara permanen. Paket yang sudah dipakai prospek tidak bisa dihapus; arsipkan saja.

Bila ada perubahan yang belum disimpan, mengarsipkan atau mengembalikan ke draf akan menanyakan dulu, karena perubahan itu ikut tersimpan.

Di daftar **Paket**, filter menyediakan **Tayang dan draf**, **Tayang**, **Sudah berangkat**, **Draf**, **Diarsipkan**, dan **Semua**.

## Cek hasilnya

- Muncul pesan **Paket dibuat dan tayang di website.** atau **Paket tayang di website.**
- Pill di atas editor berubah menjadi **Tayang**, dan muncul tautan **Lihat di website**. Klik untuk membuka halaman paket seperti yang dilihat jamaah.
- Di Beranda, langkah **Tayangkan paket pertama** menjadi **Selesai**.

## Kalau bermasalah

- **"Isi harga sebelum paket tayang di website."** Harga wajib diisi untuk menayangkan.
- **"Komisi tidak boleh melebihi harga paket."** Kecilkan komisi.
- **"Isi angka bulat, atau kosongkan jika tidak dibatasi."** Kuota harus angka bulat minimal 1.
- **Paket sudah tayang tetapi tidak muncul di beranda website.** Cek tanggal berangkatnya: paket yang tanggalnya sudah lewat tidak ditampilkan. Beranda juga hanya menampilkan jadwal terdekat; daftar lengkap ada di tombol **Lihat semua**.
- **Langkah di Beranda belum selesai padahal paket tayang.** Pastikan harga lebih dari 0 dan tanggal berangkat terisi.
- **Paket tidak bisa dihapus.** Paket itu sudah dipakai prospek. Pilih **Arsipkan**.

## Lanjut ke

[Lengkapi detail paket](slug:detail-paket)
