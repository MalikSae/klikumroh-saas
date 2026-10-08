# UI-STANDARDS.md — standar UI/UX form dan halaman auth

Dipakai untuk semua form di situs marketing (`web/components/marketing/ui/`), checkout, login travel, dan login/daftar affiliator.
Setiap aturan di bawah punya sumbernya. Jangan menebak: kalau ada aturan baru, baca sumbernya dulu lalu tambahkan di sini.

## Aturan, nilai, dan sumbernya

| # | Aturan | Nilai di proyek ini | Sumber |
|---|---|---|---|
| 1 | Tinggi kontrol (field dan tombol utama) sama di semua layar | **44px** (`--km-checkout-field-height`, `--ku-size-authControl`) | WCAG 2.5.8 (min 24px, AA), web.dev sign-in (target sentuh minimal 44×44px) |
| 2 | Teks isian | **16px** di semua layar (tidak memicu zoom iOS, mudah dibaca) | web.dev sign-in, web.dev forms |
| 3 | Border field kontras dengan latar | **>= 3:1** (`#8A8A93` di atas putih = 3,4:1) | WCAG 1.4.11 Non-text Contrast; web.dev: border `#ccc` atau lebih gelap |
| 4 | Teks placeholder | **>= 4,5:1** (`--km-muted`, 4,8:1) dan jangan dipakai sebagai label atau petunjuk | WCAG 1.4.3; GOV.UK Text input |
| 5 | Indikator fokus | Border 1px hitam (`--km-ink`), kontras tinggi dengan border biasa | WCAG 1.4.11 (indikator fokus >= 3:1) |
| 6 | Label | Selalu terlihat, **di atas** field, singkat | GOV.UK Text input, web.dev sign-in |
| 7 | Error | Teks merah **plus ikon** (bukan warna saja), tepat di bawah field, `aria-describedby`, awalan "Kesalahan:" untuk pembaca layar | NN/g Error messages, GOV.UK Text input/Validation |
| 8 | Isi pesan error | Katakan apa yang salah dan cara memperbaikinya, dalam bahasa antarmuka (Indonesia) | GOV.UK Validation, NN/g |
| 9 | Setelah submit gagal | Fokus keyboard pindah ke pesan error; field **tidak** dinonaktifkan (pakai `readOnly`); tombol memakai `aria-disabled`, bukan `disabled` | GOV.UK Validation; web.dev sign-in |
| 10 | Tombol tampilkan kata sandi | `<button type="button">`, **bisa dijangkau Tab**, `aria-label` berubah ("Tampilkan/Sembunyikan kata sandi"), `aria-pressed` | web.dev sign-in |
| 11 | Autofill | Login: email `autocomplete="username"`, sandi `current-password`; daftar: `email`, `new-password` | web.dev sign-in; WCAG 1.3.5 |
| 12 | Tautan kecil | Area ketuk tinggi minimal 24px (padding vertikal) | WCAG 2.5.8 |
| 13 | Teks sekunder | Kontras >= 4,5:1; ukuran minimal 13px | WCAG 1.4.3; AGENTS.md 3.10 |
| 14 | Tombol submit | Berlabel aksi ("Masuk ke Dashboard"), bukan "Submit" | web.dev sign-in |
| 15 | Jarak antar kelompok field | **16px di semua layar** (`--km-checkout-field-gap`); label ke field 6px; dua field sebaris: 24px | Pilihan pemilik produk. Pembanding: GOV.UK `form-group` 20px HP / 30px desktop (label 5px), IBM Carbon 32px. Kita sengaja lebih rapat dari keduanya. Dengan field 44px, 16px tetap memenuhi WCAG 2.5.8 (target tidak saling menempel). |

## Yang belum dipenuhi (butuh keputusan produk)
- **Tautan "Lupa kata sandi"** di login travel: web.dev menganjurkannya, tetapi belum ada alur reset kata sandi mandiri untuk admin travel (reset hanya lewat staf).
- **Border field di dashboard travel dalam aplikasi** (`.ku-input`, `--ku-line`) masih `#E4E4E7` (1,27:1). Perlu dinaikkan agar sesuai aturan 3.
- **Validasi saat blur** di checkout: GOV.UK menyarankan validasi saat submit; NN/g membolehkan saat field selesai diisi. Dipertahankan saat blur, tidak saat mengetik.

## Daftar periksa sebelum melapor UI selesai
1. Tab saja (tanpa mouse): semua kontrol terjangkau, urutannya wajar, fokus terlihat.
2. Semua state: kosong, fokus, error, loading, disabled, sukses.
3. Kontras diukur dengan angka (teks 4,5:1, batas kontrol dan indikator fokus 3:1).
4. Lebar 320px tanpa scroll horizontal; tinggi kontrol sama di desktop dan HP.
5. Teks error dan semua label dalam bahasa Indonesia; fokus tidak hilang setelah gagal.

## Sumber
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ (1.4.3, 1.4.11, 2.5.8, 1.3.5)
- web.dev, Sign-in form best practices: https://web.dev/articles/sign-in-form-best-practices
- GOV.UK Design System, Text input dan Validation: https://design-system.service.gov.uk/components/text-input/
- Nielsen Norman Group, Error messages in forms: https://www.nngroup.com/articles/errors-forms-design-guidelines/
