# PRD: KlikUmroh.id

**Versi:** 0.1 (Hasil Brainstorm)
**Status:** Draft — untuk validasi lanjutan sebelum development
**Pemilik Produk:** [Nama Founder]

---

## 1. Ringkasan Eksekutif

KlikUmroh.id adalah SaaS whitelabel untuk travel umroh yang berfokus **murni pada lead generation dan aktivasi agen** — bukan operasional/manajemen travel. Produk membantu travel umroh membuktikan channel akuisisi jamaah mana yang paling efektif (organik, paid ads, atau agen), lalu menyediakan tools untuk membangun atau mengoptimalkan channel agen — baik bagi travel yang jaringan agennya sudah ada tapi belum dibina, maupun yang ingin memulai dari nol.

---

## 2. Latar Belakang & Masalah

Industri travel umroh di Indonesia saat ini berada dalam kondisi **"Growth or Die"** — travel baru terus bermunculan setiap tahun, memperebutkan jamaah yang sama, dan travel yang tidak mampu tumbuh secara konsisten berisiko tergerus oleh pemain baru yang lebih agresif merebut pasar. Masalah utama yang dihadapi travel umroh adalah **kesulitan mendapatkan jamaah dalam jumlah yang banyak dan stabil** di tengah kompetisi yang semakin ketat tersebut.

Akar masalahnya bukan sekadar "tidak punya website", melainkan **travel tidak punya alat ukur untuk tahu channel akuisisi mana yang paling efektif**, sehingga alokasi sumber daya (waktu, budget) sering didasarkan pada perkiraan ("nerawang"), bukan data.

**Bukti pendukung (dari pengalaman lapangan sebagai konsultan):**
Sebuah travel menghabiskan puluhan juta rupiah/bulan untuk iklan (Meta/Google) dengan closing rate rendah, sementara jaringan agennya — yang sama sekali tidak dibina, tidak ada program aktivasi — ternyata menghasilkan jamaah lebih banyak. Setelah direkomendasikan mengalihkan sebagian budget ke pembinaan agen (reward, event, pelatihan), alokasi sumber daya travel menjadi lebih percaya diri dan terarah.

**Insight psikologis kunci:** Owner travel cenderung lebih nyaman dengan pengeluaran yang **risikonya rendah meski totalnya besar** (komisi agen hanya cair saat closing) dibanding pengeluaran **fixed cost dengan hasil tidak pasti** (budget iklan di muka). Insight ini turut memengaruhi keputusan model harga produk (lihat Bagian 10).

---

## 3. Tujuan Produk

- Membantu travel umroh menangkap dan pengelolaan minat prospek jamaah secara terstruktur.
- Memberi visibilitas data (funnel, sumber trafik) yang selama ini tidak dimiliki travel yang mengandalkan spreadsheet/WhatsApp manual.
- Menyediakan sistem aktivasi agen yang sederhana namun cukup untuk menumbuhkan jaringan agen secara terukur.
- Memungkinkan travel menjalankan operasional whitelabel-nya sendiri (branding, domain) tanpa terikat pada sistem ERP travel yang kompleks.

---

## 4. Target Pengguna (ICP)

**Utama:** Travel umroh yang ingin mengoptimalkan akuisisi jamaah melalui kanal agen. Ini mencakup dua sub-segmen:
- Travel yang **sudah punya jaringan agen** tapi belum dibina/dioptimalkan secara sistematis (kasus umum yang ditemukan di lapangan — agen ada, tapi tidak ada program aktivasi, tracking performa, atau insentif terstruktur).
- Travel yang **belum punya jaringan agen** dan ingin mulai membangun kanal akuisisi ini dari nol.

Skema komisi (flat vs override satu tier) adalah **pilihan fitur yang tersedia**, bukan syarat segmentasi. KlikUmroh menyasar travel yang serius mengoptimalkan kanal agen sebagai bagian dari strategi akuisisi, terlepas dari skema komisi apa yang akhirnya mereka pilih.

**Sumber pelanggan awal:** Puluhan travel umroh yang merupakan klien konsultasi pribadi pendiri — sudah menyatakan minat dan berada di waiting list sebagai design partner.

---

## 5. Lanskap Kompetitif & Positioning

Pasar software untuk travel umroh di Indonesia sudah cukup ramai, namun mayoritas pemain fokus pada **manajemen operasional travel** (jamaah, dokumen, keuangan), bukan pada lead generation:

| Kompetitor | Fokus Utama |
|---|---|
| MuslimPergi | Manajemen jamaah, paket, pembayaran, app mobile jamaah & agen |
| Erahajj | Akuntansi & pembukuan travel, sudah bermitra resmi dengan HIMPUH |
| ProHajj | Operasional harian, antarmuka sederhana |
| Barantum CRM | CRM leads, WhatsApp broadcast, omnichannel chat |
| ERP Umroh | ERP modular — termasuk landing page travel & panel agent (fitur paling dekat dengan KlikUmroh) |
| Inapsys InTravel | Sistem ERP/administrasi travel |

**Positioning KlikUmroh:** Sengaja **tidak** membangun fitur operasional (dokumen, visa, akuntansi, keberangkatan). Value proposition-nya adalah **attribution & aktivasi channel**, sesuatu yang tidak menjadi fokus vendor-vendor di atas karena mereka dibangun dari sudut pandang finance/operasional, bukan marketing.

**Risiko kompetitif yang perlu diperhatikan:** Beberapa kompetitor (ERP Umroh) sudah membundel landing page dasar ke paket mereka. Diferensiasi KlikUmroh harus jelas terlihat dari hasil (kualitas leads, closing rate, kejelasan atribusi), bukan sekadar "punya website".

---

## 6. Prinsip Desain Produk

1. **Simpel secara sengaja** — banyak travel mengeluhkan ERP kompetitor yang terlalu kompleks sehingga tim admin kembali ke Excel manual. KlikUmroh menghindari fitur berlebih.
2. **Data adalah produk, bukan sekadar website** — dashboard analitik/atribusi adalah nilai jual utama, bukan pelengkap.
3. **Tidak menggantikan sistem ops travel** — KlikUmroh murni lead-gen; data prospek di-*download* (CSV), tidak perlu integrasi API ke ERP eksternal di versi awal.
4. **Transparansi data sebagai fitur, bukan janji** — mengingat sensitivitas kepercayaan di industri ini (lihat Bagian 7.4).

---

## 7. Ruang Lingkup Fitur (MVP)

### 7.1 Core Loop
- Admin travel publish katalog paket umroh online.
- Prospek mengisi form minat.
- Admin mengelola status prospek melalui beberapa tahap sederhana: **Baru → Dihubungi → Tertarik → Closing / Tidak Lanjut**, dengan opsi catatan singkat alasan saat status "Tidak Lanjut" (mis. belum sempat dihubungi, masih pertimbangan, harga, kompetitor, dll). Catatan: ini bukan sistem CRM penuh (tidak ada reminder follow-up, penugasan tugas, atau otomasi pipeline) — statusnya sengaja tetap manual dan ringan agar datanya berguna untuk dashboard atribusi tanpa menambah kompleksitas operasional yang jadi alasan travel meninggalkan ERP kompetitor.
- Admin dapat men-download data prospek dalam format CSV.

### 7.2 Growth Loop — Sistem Agen
- Referral link unik per agen.
- Dashboard analitik funnel per agen: klik referral link → isi form → mengikuti tahapan status yang sama dengan Core Loop (Baru → Dihubungi → Tertarik → Closing / Tidak Lanjut). Funnel ini **terintegrasi langsung dengan status pipeline prospek** (bukan pencatatan status terpisah), sehingga data konsisten dan admin tidak perlu mengupdate status dua kali di tempat berbeda. Integrasi ini juga memungkinkan analisis drop-off per agen (mis. prospek dari agen tertentu banyak yang mentok di tahap "Dihubungi", mengindikasikan masalah serah terima follow-up).
- Leaderboard performa agen (ranking, kompetisi antar-agen).
- Jadwal event agen + fitur RSVP.
- Tips/konten promosi jualan — model hybrid: KlikUmroh menyediakan konten master, travel bisa menggunakan langsung, mengedit, atau menambahkan kontennya sendiri.

### 7.3 Infrastruktur Multi-tenant (Whitelabel)
- Setiap travel memiliki website dengan branding sendiri.
- Default menggunakan subdomain `[travel].klikumroh.id`.
- Opsi menggunakan custom domain.
- Data setiap travel terisolasi penuh — tidak tercampur antar travel.

### 7.4 Trust & Keamanan Data
- **Access log**: setiap akses staf KlikUmroh ke data travel (misalnya untuk keperluan support) tercatat dan dapat diaudit langsung oleh travel yang bersangkutan melalui dashboard mereka. Fitur ini menggantikan pendekatan "janji lisan" dengan jaminan yang dapat diverifikasi secara teknis.

---

## 8. Di Luar Ruang Lingkup untuk Versi Awal (Non-Goals)

- Fitur operasional travel (manajemen dokumen, visa, akomodasi, keberangkatan, akuntansi).
- Integrasi API langsung ke ERP travel eksternal (Erahajj, MuslimPergi, dll) — cukup export CSV.
- Model marketplace terpusat (agregasi traffic lintas-travel) — dicatat sebagai **opsi pengembangan masa depan**, bukan bagian dari MVP.
- Perhitungan cost-per-closing per channel secara otomatis (butuh input budget iklan & komisi agen) — dipertimbangkan untuk versi lanjutan setelah data dasar tervalidasi.

---

## 9. Kepatuhan Regulasi & Sikap Risiko

Peraturan Menteri Agama No. 8 Tahun 2018 melarang penjualan paket umroh dengan skema berjenjang/MLM, ponzi, atau investasi. Fitur agen KlikUmroh mendukung dua opsi komisi: **flat (single-tier)** dan **override satu tingkat**.

**Keputusan sadar:** KlikUmroh tetap menyediakan opsi override satu tingkat sebagai salah satu pilihan skema komisi (lihat Bagian 4) — bukan sebagai syarat segmentasi, karena temuan lapangan menunjukkan skema ini umum dipakai travel yang membangun jaringan agen secara agresif. Kepatuhan terhadap regulasi diserahkan sepenuhnya kepada masing-masing travel sebagai pemegang izin PPIU, apa pun skema komisi yang mereka pilih.

**Risiko residual yang perlu terus dipantau:** Selama sebagian signifikan pelanggan memilih skema override, risiko konsentrasi di area abu-abu regulasi yang sama tetap ada — jika terjadi tindakan penertiban oleh Kemenag, dampaknya berpotensi memengaruhi banyak pelanggan sekaligus, bukan satu per satu. Mitigasi yang disarankan: posisikan KlikUmroh secara legal dan komunikasi sebagai penyedia perangkat lunak netral, bukan pihak penyelenggara.

---

## 10. Model Bisnis & Harga

- **Model:** Flat subscription tier (bukan success-based fee), berdasarkan pertimbangan kesederhanaan operasional dan prediktabilitas pendapatan.
- **Design partner awal:** Kupon gratis 6 bulan.
- **Tanpa lock-in harga** — setelah masa promo berakhir, seluruh design partner mengikuti skema harga reguler yang berlaku saat itu.
- **Catatan risiko:** Karena kupon diberikan serentak ke seluruh design partner, ada potensi *mass churn point* di bulan ke-7 jika nilai produk belum cukup terasa. Perlu strategi mitigasi (lihat Bagian 14).

---

## 11. Go-to-Market

**Kanal utama (fase awal):** Jaringan konsultasi pribadi pendiri — puluhan travel umroh yang sudah menyatakan minat dan berada di waiting list sebagai design partner.

**Kanal lanjutan (fase pertumbuhan):** Partnership dengan asosiasi travel umroh:
- HIMPUH — 300+ anggota travel.
- AMPHURI — 482 anggota travel (asosiasi tertua & terbesar).
- Asphurindo, Kesthuri — alternatif belum tergarap.

**Catatan kompetitif:** Erahajj sudah memiliki partnership resmi dengan HIMPUH (memberikan bonus kuota transaksi untuk anggota HIMPUH). Untuk menghindari benturan langsung, jalur partnership asosiasi yang lebih terbuka adalah AMPHURI atau asosiasi lain yang belum digarap kompetitor.

---

## 12. Rencana Rollout

Seluruh travel di waiting list akan diaktifkan **secara bersamaan** (bukan bertahap per-batch pelanggan), karena mereka sudah menunggu dan berkomitmen.

**Pertanyaan terbuka terkait eksekusi:** Mengingat industri ini relatif kecil dan saling terhubung lewat asosiasi (risiko reputasi menyebar cepat jika ada masalah di awal), perlu diputuskan apakah:
- Seluruh scope fitur (core loop + growth loop lengkap) dibangun penuh sebelum rilis ke semua design partner, **atau**
- Core loop dirilis lebih dulu ke seluruh design partner, sementara fitur agen (referral, leaderboard, funnel, event, tips) dirilis bertahap dalam beberapa gelombang berikutnya (staged **by fitur**, bukan staged **by pelanggan**).

---

## 13. Metrik Keberhasilan (Awal)

*(Perlu difinalisasi, draft awal berdasarkan diskusi)*

- Jumlah travel aktif menggunakan platform pasca-onboarding.
- Jumlah prospek tertangkap per travel per bulan.
- Closing rate per channel (organik vs paid vs agen) — untuk memvalidasi tesis inti produk.
- Retensi travel setelah kupon 6 bulan berakhir (indikator utama willingness-to-pay).
- Tingkat aktivasi agen (jumlah agen aktif berbagi referral link per travel).

---

## 14. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Konsentrasi regulasi — sebagian pelanggan memakai skema override di area abu-abu Kemenag | Posisikan KlikUmroh sebagai penyedia software netral; pantau perkembangan regulasi |
| Onboarding massal produk yang masih baru → risiko reputasi menyebar cepat di komunitas travel | Pertimbangkan staged-by-fitur; pastikan core loop stabil sebelum fitur agen kompleks dirilis |
| Mass churn di bulan ke-7 (akhir masa kupon, tanpa lock-in harga) | Pastikan "aset" data (riwayat leaderboard, jaringan agen terdaftar) sudah cukup berharga sebagai switching cost sebelum kupon habis; pertimbangkan sebar tanggal expired kupon agar churn tidak terjadi serentak |
| Trust terkait akses data lintas-travel (potensi konflik kepentingan pendiri di industri ini) | Fitur access log yang dapat diaudit travel; kebijakan internal pembatasan akses data |
| Diferensiasi tergerus jika kompetitor ERP menambah fitur landing page/lead-gen | Terus perkuat kedalaman fitur atribusi (funnel, sumber trafik) yang bukan fokus kompetitor |

---

## 15. Pertanyaan Terbuka / Keputusan Tertunda

- Sequencing pembangunan: bangun semua fitur sekaligus vs staged-by-fitur.
- Mekanisme penyebaran tanggal *expired* kupon design partner (serentak vs disebar).
- Asosiasi mana yang akan didekati lebih dulu untuk partnership jangka menengah (AMPHURI vs Asphurindo vs Kesthuri).
- Kebijakan formal terkait pembatasan akses data internal tim KlikUmroh terhadap dashboard travel pelanggan.
- Apakah/berapa lama peran CMO travel tertentu akan tetap dipegang paralel dengan menjalankan KlikUmroh, mengingat implikasinya terhadap kebijakan isolasi data di atas.

---

## 16. Lampiran: Referensi Riset

- Regulasi: Peraturan Menteri Agama (PMA) No. 8 Tahun 2018 tentang Penyelenggaraan Perjalanan Ibadah Umrah (larangan skema berjenjang/MLM/ponzi).
- Asosiasi travel: HIMPUH (300+ anggota), AMPHURI (482 anggota).
- Kompetitor yang diteliti: MuslimPergi, Erahajj, ProHajj, Barantum CRM, ERP Umroh, Inapsys InTravel.
