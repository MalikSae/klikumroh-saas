---
title: Isi komisi di setiap paket
slug: komisi-per-paket
stage: tahap-2
label: wajib
order: 9
summary: Isi komisi per jamaah di setiap paket yang tayang, supaya komisi agen benar-benar dibukukan saat prospek closing.
menu: Paket
alias: [komisi agen, komisi per jamaah, upah agen, komisi kosong, komisi paket, atur komisi]
---

Komisi agen ditentukan per paket, bukan satu angka untuk semua paket. Bila komisi sebuah paket kosong, agen yang membawa jamaah paket itu tidak mendapat komisi saat closing. Karena itu setiap paket yang tayang perlu punya komisi lebih dari 0.

## Langkah

1. Buka **Paket**. Kolom **Komisi agen** di daftar menampilkan nominal tiap paket, atau tanda "—" bila belum diisi.
2. Klik paket yang komisinya masih kosong. Anda juga bisa langsung ke sana dari **Beranda**: di **Panduan memulai**, tahap **Siap rekrut agen**, langkah **Atur komisi agen**, klik **Atur komisi** (tombol ini membuka paket tayang pertama yang komisinya kosong).
3. Di bagian **Harga & keberangkatan**, isi **Komisi agen per jamaah**. Di bawah kolom akan tampil persentasenya terhadap harga per jamaah, misalnya "x% dari harga". Komisi tidak boleh melebihi harga paket.
4. Klik **Simpan perubahan** (untuk paket yang sudah tayang) atau **Simpan** (untuk draf).
5. Ulangi untuk setiap paket yang tayang.

{{gambar: komisi-per-paket-1.png | Editor paket, bagian Harga & keberangkatan, kolom Komisi agen per jamaah terisi dengan persentase dari harga di bawahnya}}

Cara hitungnya: saat prospek yang dibawa agen menjadi Closing, komisi yang dibukukan adalah komisi paket dikalikan jumlah jamaah pada prospek itu. Kapan komisi itu boleh ditarik tergantung aturan di bab [aturan agen](slug:aturan-agen).

## Cek hasilnya

- Di daftar **Paket**, kolom **Komisi agen** semua paket tayang berisi nominal.
- Di **Beranda**, langkah **Atur komisi agen** menjadi **Selesai** hanya bila ada paket tayang dan semua paket tayang punya komisi lebih dari 0. Paket draf dan paket yang diarsipkan tidak dihitung. Bila Anda menayangkan paket baru tanpa komisi, langkah ini kembali belum selesai.
- Saat Anda mengubah status prospek berpaket menjadi Closing dan prospek itu dibawa agen, kotak konfirmasi memberi tahu bila komisi paketnya belum diatur.

## Kalau bermasalah

- **Muncul "Komisi tidak boleh melebihi harga paket."** Nominal komisi lebih besar dari harga per jamaah. Turunkan komisinya.
- **Closing dicatat tetapi agen tidak mendapat komisi.** Muncul peringatan "Komisi paket ... belum diatur, jadi komisi agen tidak dibukukan." Komisi paket kosong atau 0 saat closing. Prospek tanpa paket juga tidak menghasilkan komisi.
- **Langkah Atur komisi agen tidak selesai.** Masih ada paket tayang yang komisinya kosong atau 0. Cek kolom **Komisi agen** di daftar **Paket**.
- **Mengubah paket atau jumlah jamaah pada prospek yang sudah Closing.** Ini membukukan koreksi komisi agen dan meminta alasan koreksi (lihat bab [prospek masuk](slug:prospek-masuk)).

## Lanjut ke

[Buat target dan reward untuk agen](slug:target-dan-reward) (opsional), lalu [terima agen pertama](slug:terima-agen)
