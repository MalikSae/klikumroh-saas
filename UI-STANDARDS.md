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

## Portal agen: header dan area halaman (11 Okt 2026)

Satu sumber: `web/components/agent` (`AgentPageHeader`, `AgentPage`, `AgentShell.css`). Angkanya hanya ditulis di
`AgentShell.css`; jangan disalin ke halaman. Halaman tidak boleh menggambar header, wadah isi, spinner, blok memuat/gagal/kosong, atau
tombol sendiri (dijaga `scripts/check-agent-shell.js`, `npm run lint:agent-shell` di `/web`).

| Hal | Nilai |
|---|---|
| Tinggi header | 56px, sticky, garis tipis di bawah |
| Isi header | **hanya** panah kembali dan judul. Tidak ada tombol aksi (aturan pendiri) |
| Sub-halaman | area ketuk panah 44x44, panah 20px berpusat 26px dari tepi, judul 52px dari tepi |
| Halaman tab | tanpa panah, judul 16px dari tepi |
| Judul | font heading, 18px, 700, satu baris dengan elipsis |
| Umpan balik panah | kotak 32x32 di tengah area ketuk (hover, tekan, fokus) |
| Area isi | margin samping 16px, jarak antarblok 12px, 12px di atas blok pertama |
| Bawah area isi | 32px; dengan bar tab bawah: 96px + safe area perangkat |
| Aksi halaman | di isi halaman: baris `ag-shell-toolbar` (rata kanan) dengan `AgentButton` untuk aksi sekunder |
| Memuat | satu spinner: `ag-shell-spin` (ikon) atau `ag-shell-spinner` (cincin 32px) |
| Blok memuat, gagal, kosong | `AgentStateLoading`, `AgentStateError` (tombol Coba lagi), `AgentStateEmpty` (`panel`, `compact`) dari `AgentState.tsx` |
| Tombol | `AgentButton`: varian `primary` (brand), `outline`, `soft`, `ghost`, `danger`, `wa`; ukuran tinggi minimum `sm` 32px, `md` 40px, `lg` 46px (submit form), tumbuh bila label wrap; **pil penuh** (radius 999px, pengecualian AGENTS 3.10, 11 Okt 2026); padding horizontal 12px (`lg` 16px); `block` selebar wadah; `href` menjadikannya tautan |
| Tombol ikon | `AgentIconButton`: area sentuh 44x44, ikon 16-20px, `active` memakai warna brand; wajib `label` (nama aksesibel). Tombol tutup sheet memakai ukuran yang sama |
| Jarak | token `--tw-space-2/4/6/8/12/16/20/24/32/48` (dari `design-tokens.json` > `spacing`); komponen bersama memakai token, bukan angka px |
| Pencarian, filter, halaman | `AgentSearch` (ikon kiri, hapus kanan 44px), `AgentChips` (`tone="brand"` bila halaman memakai warna brand untuk chip aktif), `AgentPager` ("Hal x dari y") |
| Kartu | `AgentCard`: padding 16, radius 16 (`--tw-radius-card`), `card-shadow`, jarak isi 12. Varian `tint` (tint brand, satu blok yang menonjol), `list` (padding 0/16, baris membawa padding vertikalnya), `flush` (tanpa padding), `scroll` (daftar geser sampai tepi kanan); `href` menjadikannya tautan. Kelas halaman `*-card` / `*-panel` tidak boleh mengatur radius atau bayangan |
| Kepala kartu | `AgentCardHead` (judul, `meta`, `aside`, `link`, kontrol di kanan, `onToggle` untuk kartu yang membuka-menutup). Tingginya sebesar teksnya; kontrol kecil (ikon 24px, tautan) punya area sentuh 44px tanpa menambah tinggi, tombol `sm` menimpa padding kartu 5px. Judul selalu 16px dari tepi atas |
| Jarak isi kartu | hanya `gap` kartu (12). Anak kartu tidak punya `margin-top/bottom` atau margin negatif; pasangan rapat (label + nilai) dibungkus elemen ber-`gap` 4; pemisah = garis tipis, 12 di atas dan 12 di bawah. Pengecualian ditulis `/* card-margin-ok: alasan */` di CSS dan `data-card-spacing="tight"` di kartu |
| Pasangan teks | judul + keterangan (baris daftar, kepala kartu), label + nilai: 4px (`--tw-space-4`) di antaranya. Antar-pasangan dalam satu kartu: 12px |
| Audit kartu | `scripts/audit-cards.browser.js` dijalankan di halaman yang terbuka (konsol browser) dan mengembalikan `{ cards, violations }`; wajib kosong sebelum UI kartu dilaporkan selesai |
| Kotak bersarang di kartu | padding 12 (`--tw-space-12`), radius 12 (`--tw-radius-inset`), border tipis, tanpa bayangan |
| Radius | `--tw-radius-card` 16, `--tw-radius-inset` 12, `--tw-radius-control` 8 (input), `--tw-radius-pill` 999 (tombol, chip) |
| Pengecualian kartu | `rk-stat` (kartu komisi bergaya kartu bank), `lb-hero` (podium), `pf-idcard` (kartu identitas), dan ubin menu beranda (padding samping 8 agar muat 4 kolom) |
| Daftar | `AgentList` (panel putih, garis pemisah) + `AgentListRow` (`lead`, `title`, `titleAside`, `meta`, `aside`, `href` / `onClick`), tinggi minimum 64px |
| Sheet bawah | `AgentSheet` (grip, judul + tombol tutup, `onSubmit` bila berbentuk form, `locked` saat mengirim); dirender hanya saat terbuka |
| Status jamaah / komisi | `StatusLabel` + `lib/prospectStatus.ts`; warna dari token status, bukan brand |
| Format uang | `lib/money.ts` (`rupiah`, `rupiahJt`); jangan buat formatter sendiri |

Menambah halaman portal: pakai `<AgentPageHeader title=... onBack=... />` dan `<AgentPage withTabBar?>`. Bila butuh
kontrol yang dulu ditaruh di header, taruh di toolbar isi halaman.

## Tipografi portal agen (11 Okt 2026)

Sumber: `design-tokens.json` > `typography`. Pola mengikuti skema tiket.com: sedikit ukuran, tinggi baris sepasang
dengan ukuran, hierarki dari bobot dan warna. Variabel CSS dibuat `scripts/build-type-tokens.js` ke
`web/app/typography.css` (jangan diedit). Dijaga `npm run lint:typography`.

| Hal | Nilai |
|---|---|
| Ukuran | 10, 12, 14, 16, 18, 22, 28, 40 px. Tidak ada 11, 13, 15. Minimum 10px |
| Tinggi baris | Mengikuti ukuran: 10/14, 12/16, 14/20, 16/22, 18/24, 22/28, 28/34, 40/46 |
| Bobot | 400 (isi), 600 (penekanan), 700 (judul dan angka). Tidak ada 500, 800, 900 |
| Font | Plus Jakarta Sans untuk judul dan angka (16px ke atas), Roboto untuk selebihnya |
| Pakai | `font: var(--tw-type-<peran>)`, bukan `font-size` lepas |
| Skala pengguna | `--tw-type-scale` (default 1) mengalikan semua peran, jalur bagi pengaturan ukuran teks |

Peran: `page-title`, `modal-title`, `section-title` (judul); `kpi`, `kpi-sm`, `amount` (angka);
`body`, `body-strong` (isi, judul baris, label, tautan); `label`, `meta`, `micro` (kecil);
`button-sm`, `button-md`, `button-lg`; `input`.

Aturan penjaga: di `web/components/agent` dan navigasi bawah tidak boleh ada ukuran px literal; di `web/app/agen`
ukuran literal harus ada di skala; bobot di luar 400/600/700 ditolak.

## Sumber
- tiket.com (diukur 11 Okt 2026): 7 ukuran genap mobile, pasangan ukuran/tinggi baris, bobot 400/600/700.
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ (1.4.3, 1.4.11, 2.5.8, 1.3.5)
- web.dev, Sign-in form best practices: https://web.dev/articles/sign-in-form-best-practices
- GOV.UK Design System, Text input dan Validation: https://design-system.service.gov.uk/components/text-input/
- Nielsen Norman Group, Error messages in forms: https://www.nngroup.com/articles/errors-forms-design-guidelines/
