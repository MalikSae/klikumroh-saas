# Panduan Admin Travel KlikUmroh (draf isi)

Sumber isi untuk halaman `/panduan` (rute web belum dibangun; menunggu isi disetujui). Satu file Markdown per bab. Hanya untuk dibaca admin travel; bukan dokumen internal.

## Format file

Nama file: `NN-slug.md` (NN = nomor bab dua digit).

```
---
title: Judul bab (kalimat perintah atau frasa, tanpa titik)
slug: slug-bab
stage: mulai | tahap-1 | tahap-2 | tahap-3 | lanjutan | bantuan
label: wajib | disarankan | opsional      # kosongkan untuk bab bantuan
order: 1
summary: Satu kalimat, dipakai di daftar dan hasil pencarian.
menu: Website > Identitas                   # lokasi di dashboard, persis seperti label menu
alias: [kata awam 1, kata awam 2]           # kata yang diketik admin saat bingung; bukan istilah teknis saja
---
```

Urutan isi bab:

1. Satu-dua kalimat: bab ini untuk apa dan kenapa penting.
2. `## Sebelum mulai` (hanya bila ada syarat).
3. `## Langkah` (daftar bernomor; nama tombol dan menu ditulis **tebal**, persis seperti di dashboard).
4. `## Cek hasilnya` (cara admin memastikan langkah berhasil).
5. `## Kalau bermasalah` (hanya gejala yang benar-benar bisa terjadi menurut kode).
6. `## Lanjut ke` (tautan ke bab berikutnya: `[teks](slug:nama-slug)`).

## Aturan penulisan

- Bahasa Indonesia sehari-hari yang rapi, sapaan "Anda". Hindari "jualan"; pakai "promosi" atau "cari jamaah". Hindari istilah teknis tanpa penjelasan satu kalimat.
- Label menu, tombol, dan status ditulis persis seperti di dashboard (cek kode, jangan menebak).
- Gambar layar: `{{gambar: berkas.png | keterangan}}` di baris sendiri, berkas ada di `web/public/panduan/`. Tanpa nama berkas (`{{gambar: keterangan}}`) berarti tempat gambar yang belum difoto. Foto dari akun demo (data fiktif); nomor panjang disamarkan.
- Tanpa emoji dan simbol Unicode sebagai ikon. Tanpa angka karangan (target konversi, estimasi waktu, benchmark). Hanya angka yang ada di kode atau UI.
- Jangan menyebut GA4 atau TikTok pixel (tidak ada fiturnya). Jangan menyarankan tombol WhatsApp langsung di web publik: semua kontak lewat form minat.
- Setiap klaim tentang perilaku sistem harus bisa ditunjuk ke kode. Yang tidak bisa diverifikasi: jangan ditulis, catat di laporan.

## Dari Markdown ke situs

- Frontmatter tambahan (opsional): `label_text: Wajib dibaca` mengganti tulisan lencana tanpa mengubah jenis label.
- `node scripts/build-panduan.js` memeriksa semua bab (slug, stage, label, alias, tautan `slug:`) lalu menulis `web/data/panduan.generated.json`. Dijalankan otomatis sebelum `npm run dev` dan `npm run build` di `/web`; gagal bila ada bab rusak.
- Setelah mengubah bab, jalankan skrip itu dan sertakan `panduan.generated.json` yang baru. `npm run test:panduan` gagal bila berkas itu usang.
- Bab `00-mulai-dari-sini` tampil di `/panduan`; bab lain di `/panduan/<slug>`.
