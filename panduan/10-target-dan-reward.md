---
title: Buat target dan reward untuk agen
slug: target-dan-reward
stage: tahap-2
label: opsional
order: 10
summary: Pasang target jamaah closing atau agen baru dalam satu periode beserta hadiahnya, lalu akhiri target dan catat siapa yang berhak.
menu: Kemitraan > Target & reward
alias: [target, reward, hadiah agen, bonus agen, target agen, akhiri target, tandai diberikan]
---

Target mendorong agen aktif sejak bulan pertama. Anda menentukan yang dihitung, jumlah minimal, periode, dan hadiahnya. Agen melihat target yang masih berjalan, progresnya, dan hadiahnya di dashboard agen. Bab ini opsional: agen tetap bisa bekerja tanpa target.

## Langkah

1. Buka **Target & reward** (grup **KEMITRAAN**). Daftar menampilkan kolom **Target**, **Periode**, **Hadiah**, **Agen tercapai**, dan **Status**.
2. Klik **Buat target**. Isi:
   - **Nama target** (opsional). Bila kosong, nama dibuat otomatis, misalnya "10 jamaah closing".
   - **Yang dihitung**: **Jamaah closing** atau **Agen baru direkrut**. Pilihan ini tidak bisa diubah setelah target dibuat.
   - **Jumlah jamaah** (atau **Jumlah agen**): angka bulat lebih dari 0.
   - **Mulai** dan **Selesai**. Isian awalnya adalah tanggal awal dan akhir bulan ini.
   - **Hadiah**: wajib diisi, misalnya "Bonus Rp 2.000.000 atau voucher umroh".
3. Klik **Buat target**. Drawer target terbuka.
4. Selama periode berjalan, drawer menampilkan **Progres agen** (jumlah tercapai per agen). Gunakan **Ubah target** di menu **Aksi target** untuk mengoreksi isiannya, selama target belum diakhiri.
5. Setelah periode lewat, status target menjadi **Perlu ditutup** dan muncul peringatan di atas daftar. Buka target itu lalu klik **Akhiri target**. Sistem mencatat agen yang mencapai target sebagai penerima hadiah.
6. Di target yang sudah **Ditutup**, daftar **Agen yang berhak mendapat hadiah** muncul. Setelah Anda memberikan hadiahnya di luar aplikasi, klik **Tandai diberikan** pada agen itu (catatan opsional, misalnya ditransfer ke rekening mana). Statusnya menjadi **Hadiah diberikan**.
7. Menu **Aksi target** juga punya **Unduh CSV pencapaian** (untuk target yang sudah ditutup) dan **Hapus target**.

{{gambar: target-dan-reward-1.png | Daftar Target & reward dengan kolom Target, Periode, Hadiah, Agen tercapai, dan Status}}

{{gambar: target-dan-reward-2.png | Drawer target yang berjalan, berisi Yang dihitung, Minimal, Hadiah, dan bar Progres agen}}

Status target yang tampil: **Belum mulai**, **Berjalan**, **Perlu ditutup**, dan **Ditutup**.

## Cek hasilnya

- Target baru muncul di daftar dengan status **Berjalan** (atau **Belum mulai** bila periodenya di depan).
- Di **Beranda**, langkah **Buat target & reward** pada tahap **Siap rekrut agen** menjadi **Selesai** bila travel punya minimal satu target.
- Agen melihat bagian **Target dan reward** di dashboard agennya selama periode target belum lewat.

## Kalau bermasalah

- **Tidak bisa menyimpan, "Isi angka bulat lebih dari 0."** Jumlah target kosong, desimal, atau 0.
- **"Tulis hadiah agar agen tahu apa yang dikejar."** Kolom **Hadiah** masih kosong.
- **"Tanggal selesai harus sama atau setelah tanggal mulai."** Perbaiki periode.
- **Mengakhiri sebelum periode selesai.** Sistem meminta konfirmasi **Tetap akhiri sekarang**. Hanya agen yang sudah mencapai target saat itu yang dicatat berhak hadiah, progres sesudahnya tidak dihitung, dan target tidak bisa diubah lagi.
- **Tidak bisa menghapus target.** Target yang sudah punya catatan pencapaian disimpan sebagai riwayat, jadi menu **Hapus target** tidak tersedia untuknya.
- **Hadiah target jamaah closing belum bisa ditandai diberikan.** Di daftar penerima tertulis "n jamaah belum lunas". Sistem menahan hadiah target berbasis closing selama masih ada jamaah yang dihitung namun baru DP, kecuali travel memilih komisi cair saat DP. Tandai jamaah lunas (atau batalkan closing-nya) dulu. Untuk target **Agen baru direkrut**, aturan ini tidak berlaku.
- **Hadiah ditolak karena capaian turun.** Bila ada closing yang dibatalkan setelah target ditutup dan capaian agen kini di bawah target, sistem menolak penandaan hadiah.

## Lanjut ke

[Terima agen pertama](slug:terima-agen)
