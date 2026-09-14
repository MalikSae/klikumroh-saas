# Screen Inventory — KlikUmroh.id (Disusun Ulang dari Nol)

Dokumen ini bukan daftar layar berdasarkan fitur yang kebetulan sudah dibangun, tapi disusun dari kebutuhan tiap peran sebagai produk yang layak jual. Tiga sudut pandang berbeda dipakai secara sengaja:

- **Dashboard Travel** — didekati sebagai *produk SaaS* (siapa pun yang bayar berlangganan berhak dapat pengalaman lengkap: onboarding, billing, tim, notifikasi), bukan sekadar kumpulan modul CRUD.
- **Web Publik** — didekati dari *perjalanan calon jamaah* (awareness → percaya → memutuskan → setelah submit), karena ini keputusan besar dan mahal buat mereka, bukan transaksi impulsif.
- **Dashboard Agen** — didekati dari *apa yang bikin orang termotivasi jualan*, bukan sekadar tempat menampilkan data.

Setiap layar diberi catatan singkat kenapa dia perlu ada.

---

## A. Dashboard Travel (Admin) — Produk SaaS

### A.1 Onboarding & Autentikasi
| Layar | Kenapa Perlu |
|---|---|
| Sign Up (Buat Akun Travel) | Titik akhir dari funnel pendaftaran di Bagian D — akun aktif setelah pembayaran diverifikasi Master Admin |
| Login | Titik masuk harian |
| Lupa Password / Reset Password | Standar produk berlogin |
| Onboarding Wizard (setup pertama kali) | Kesan pertama paling menentukan — pandu isi branding, paket pertama, tunjukkan link subdomain jadi |

### A.2 Beranda & Notifikasi
| Layar | Kenapa Perlu |
|---|---|
| Dashboard Overview (Beranda) | Ringkasan yang berguna dibuka tiap hari: prospek baru, closing rate, funnel channel |
| Pusat Notifikasi | "Ada prospek baru", "agen baru daftar" — closes the loop |

### A.3 Katalog Paket
| Layar | Kenapa Perlu |
|---|---|
| List Paket | Kelola inventori jualan |
| Tambah/Edit Paket | Idealnya multi-step (info dasar → itinerary → harga & kuota & **nilai komisi agen** → **galeri foto**, upload multi-file dengan urutan bisa diatur) |
| Preview Paket | Lihat persis tampilan di web publik sebelum publish |

### A.4 Manajemen Prospek (CRM)

**Alur (baru, dikonfirmasi):** List Prospek → Detail Prospek (halaman tersendiri, bukan cuma modal) → Edit Prospek (halaman tersendiri, terpisah dari alur ubah status)

| Layar | Kenapa Perlu |
|---|---|
| List Prospek (+ filter channel/status/agen/tanggal) | Kerja harian admin |
| **Detail Prospek** *(diperluas)* | Lihat rincian di bawah |
| **Edit Prospek** *(halaman terpisah, baru)* | Perbaiki data (nama, WhatsApp, jumlah jamaah, paket) — sengaja terpisah dari alur ubah status, karena ubah status harus tercatat di riwayat sedangkan edit data murni koreksi input |
| Papan Status (Kanban) | Alternatif visual drag-and-drop antar status |
| Export | Sudah ada, tetap relevan |

**Detail Prospek — Isi Konten:**
| Bagian | Kenapa Perlu |
|---|---|
| Info Kontak | Nama, No WhatsApp (klik langsung buka chat). **Email dihapus** — sudah diputuskan tidak diperlukan sama sekali, sudah dihapus dari form publik |
| Konteks Masuk | Sumber channel, nama agen (kalau ada, link ke Detail Agen), paket yang diminati (link ke Detail Paket), **jumlah jamaah**, tanggal masuk, badge kalau `entry_method` input manual agen |
| **Info Komisi** *(baru)* | Kalau status BELUM closing: "Potensi Komisi" dihitung live (`commission_amount × jumlah_jamaah`). Kalau SUDAH closing: "Komisi" diambil dari baris `commission_ledger` yang sudah tercatat (nilai permanen, tidak ikut berubah walau harga paket diubah belakangan). Disembunyikan sepenuhnya kalau prospek tidak punya agen (organik/paid) |
| Status Pipeline | Status saat ini, alasan (kalau Tidak Lanjut), tombol "Ubah Status" |
| Riwayat Perubahan Status | Timeline dari `prospect_status_history` — tanggal, status lama→baru, siapa yang mengubah (admin/agen) |
| **Catatan Bebas** *(baru)* | Log bertumpuk (bukan satu kotak yang ketimpa) — progres follow-up dari waktu ke waktu, bisa ditulis admin maupun agen pemilik prospek tersebut |

### A.5 Sistem Agen
| Layar | Kenapa Perlu |
|---|---|
| List Agen | Kelola siapa saja agen aktif |
| Antrean Persetujuan Agen Baru | Konsekuensi keputusan agen self-register. Kalau mode pendaftaran berbayar, tampilkan juga status verifikasi pembayaran per agen di antrean ini |
| **Pengaturan Pendaftaran Agen** | **Baru** — admin atur mode Gratis vs Berbayar, kalau berbayar: nominal biaya, deskripsi benefit yang didapat, info rekening bank travel untuk instruksi transfer. **Tambahan:** Syarat & Ketentuan Agen (teks bebas, opsional) — ditampilkan + wajib dicentang setuju saat alur pendaftaran agen beneran dibangun nanti. **Tambahan:** Minimum Saldo untuk Pengajuan Pencairan (angka, tanpa default — admin isi sendiri sesuai kebijakan masing-masing) |
| **Pengaturan Skema Komisi** *(baru)* | Aktifkan/nonaktifkan override satu-tier, kalau aktif atur persentasenya (berlaku tenant-wide, bukan per-paket) |
| Tambah Agen Manual | Admin tetap perlu jalur pintas tanpa nunggu agen daftar sendiri |
| Detail Agen (profil + funnel) | Evaluasi performa satu-satu |
| Leaderboard (sudut admin) | Alat evaluasi tim lapangan |
| Event Agen (List/Buat/Detail+RSVP) | Sesuai rencana fitur aktivasi |
| **Approval Pengajuan Pencairan Komisi** *(baru)* | Uang travel ke agennya sendiri — murni urusan admin travel, bukan Master Admin |

### A.6 Tools Marketing
| Layar | Kenapa Perlu |
|---|---|
| Hub Tools Marketing | Halaman induk berisi kartu-kartu tools, dibangun bertahap |
| Tips Promosi (Kelola Konten) | Tool pertama yang sudah punya alur admin jelas — master + custom per travel |
| **Script WA** *(nama dikonfirmasi, halaman belum dibangun)* | Template balasan WhatsApp siap pakai buat agen |
| **Sumber Jamaah** *(baru, nama dikonfirmasi, halaman belum dibangun)* | Konten panduan soal ke mana/bagaimana agen mencari calon jamaah |
| **Bank Caption** *(nama dikonfirmasi, halaman belum dibangun)* | Kumpulan teks caption siap pakai buat promosi |
| **Bank Konten** *(baru, nama dikonfirmasi, halaman belum dibangun)* | Kumpulan aset visual (foto/video/template) siap pakai, beda dari Bank Caption yang teks |

*Kelima ini muncul sebagai daftar menu di Tools Marketing (baik sisi admin kelola konten, maupun sisi agen konsumsi) — untuk sekarang cukup entri menu tanpa tujuan halaman, isi/desain tiap halaman dibahas menyusul terpisah satu-satu.*

### A.7 Analitik & Laporan
| Layar | Kenapa Perlu |
|---|---|
| Analitik Funnel (organik/paid/agen) | Tesis inti produk — layak jadi halaman utuh, bukan cuma angka kecil di beranda |
| Laporan (exportable) | Kebutuhan lanjutan dari analitik |

### A.8 Pengaturan — Dianalisis Mendalam, Dipecah per Kebutuhan

| Sub-bagian | Isi | Kenapa Dipisah |
|---|---|---|
| **Profil Travel** | Nama resmi, alamat, kontak, nomor izin PPIU, deskripsi "Tentang Kami" | Ini konten legal/faktual, beda kebutuhan dari branding visual |
| **Branding** | Logo header (beda dari favicon), Favicon, Warna Primer, Warna Sekunder | Warna sekunder saat ini sudah dipakai di kode tapi **belum ada kolom database-nya** — gap yang perlu ditambal |
| **SEO & Meta** | Judul Website (title tag), Meta Description, Gambar Open Graph (preview saat link di-share ke WhatsApp/sosmed) | Krusial karena distribusi utama produk ini lewat share link personal (WA/IG) — tanpa OG image, preview link kosong/jelek |
| **Tracking Pixel** *(pertimbangan lanjutan)* | ID Meta Pixel, GA4, TikTok Pixel — opsional per travel | Menyambung ke tesis produk soal atribusi channel, untuk travel yang jalankan iklan sendiri |
| **Domain & Custom Domain** | Terkait Sprint 5 | Sudah direncanakan terpisah |
| **Tim / Manajemen Pengguna** | Undang admin tambahan | Skema `admin_users` sudah siap menampung banyak admin per tenant, tinggal UI |
| **Langganan & Tagihan** | Plan aktif, tanggal berakhir, riwayat pembayaran, diskon yang pernah dipakai | Sesuai model bisnis di PRD, belum ada rancangan sama sekali |
| **Preferensi Notifikasi** | Nyala/mati notifikasi tertentu | Standar SaaS |
| **Log Akses** | Terkait Sprint 6 | Sudah direncanakan |

### A.9 Panduan Pengguna *(Baru, menu terpisah dari Bantuan & Dukungan)*
| Layar | Kenapa Perlu |
|---|---|
| List Kategori/Artikel Panduan | Tutorial & dokumentasi cara pakai produk — dibaca sendiri, sifatnya edukatif |
| Detail Artikel/Tutorial | Konten step-by-step per topik |

### A.10 Bantuan & Dukungan (Sistem Tiket) *(Baru — beda dari Panduan Pengguna)*
| Layar | Kenapa Perlu |
|---|---|
| List Tiket Saya | Riwayat permintaan bantuan yang pernah diajukan |
| Buat Tiket Baru | Ajukan masalah/pertanyaan ke tim KlikUmroh |
| Detail Tiket (thread balasan) | Percakapan bolak-balik sampai selesai |

### A.11 Akun Pribadi
| Layar | Kenapa Perlu |
|---|---|
| Profil Saya & Ganti Password | Kebutuhan dasar akun personal, terpisah dari pengaturan travel |

---

## B. Web Publik — dari Sudut Pandang Jamaah

### B.0 Struktur Navigasi (Berlaku di Semua Halaman Web Publik)

**Header:** hanya logo travel (klik kembali ke Beranda). Tidak ada menu apa pun di header — semua navigasi dikonsolidasikan ke satu tempat (bottom navbar) untuk menghindari dua jalur ke tujuan yang sama.

**Bottom Navbar (4 item, thumb-zone):**
| Item | Perilaku |
|---|---|
| Beranda | Navigasi biasa |
| Paket | Navigasi ke `/paket` |
| **Chat** | **Bukan link statis** — kondisional: kalau ada konteks referral aktif (kode `ref` dari link agen), langsung buka WhatsApp **agen tersebut** (pesan pre-filled), tanpa form. Kalau tidak ada konteks referral, fallback ke WhatsApp default travel. Prospek yang closing lewat jalur ini tidak otomatis tercatat di funnel — ditangkap lewat fitur "Tambah Prospek Manual" di Dashboard Agen (Bagian C.4) |
| Menu | Buka bottom sheet (bukan halaman baru): Tentang Kami, Testimoni, FAQ, Kontak — dipisah garis pembatas dari link kecil "Daftar jadi Agen" dan "Login Agen" (sengaja tidak menonjol, mayoritas pengunjung adalah calon jamaah bukan calon agen) |

**Catatan teknis:** perlu `padding-bottom: env(safe-area-inset-bottom)` agar bottom navbar tidak tertutup UI bawaan browser mobile (khususnya Safari iOS).

### B.1 Awareness (Baru Tahu) — Landing Page
| Bagian | Kenapa Perlu |
|---|---|
| Section Banner Carousel/Slide (**foto asli diupload travel**, bukan warna blok) | Hero visual pertama kali dibuka — foto asli bekerja jauh lebih emosional daripada teks |
| Strip Kepercayaan (izin PPIU, pengalaman, rating) | Ditaruh sedini mungkin, sebelum keraguan sempat muncul |
| Kenapa Pilih Kami (3-4 poin manfaat) | Jawab keberatan umum secara proaktif |
| Section Card Paket dengan filter (default tab **Rekomendasi**, bukan Terbaru) | Kurasi cepat, bantu orang yang bingung memilih |
| Navigasi "Lihat Semua" → `/paket` | Pintu masuk ke katalog lengkap |
| Testimoni Jamaah (setelah katalog) | Bukti sosial diperkuat setelah mereka lihat apa yang ditawarkan |
| Tentang Kami (versi ringkas + link "Selengkapnya") | Jangan penuh di beranda, cukup potongan + tautan |
| FAQ Ringkas (3-5 pertanyaan) | Objection handling terakhir sebelum titik keputusan |
| CTA Akhir | Rekap argumen — akses kontak sendiri sudah terjamin lewat bottom navbar |

*(Detail kata-per-kata/copy halaman ini dibahas terpisah)*

### B.2 Discovery (Eksplorasi)
| Layar | Kenapa Perlu |
|---|---|
| Katalog Paket `/paket` (list lengkap + filter durasi/harga/bulan) | Halaman tersendiri, terpisah dari landing |

### B.3 Consideration (Pertimbangan)

**Detail Paket — Struktur Final (Disetujui, Sudah Dibangun):**

Header (back + judul + share) → Galeri Foto (carousel) → Nama Travel + status PPIU → Judul Paket → Kotak Harga ("mulai dari" + sisa kuota) → Info Kilat (keberangkatan, penerbangan) → Deskripsi Perjalanan → **Tab: Fasilitas / Akomodasi / Itinerary / Syarat & Ketentuan** → Badge Kepercayaan (Resmi Kemenag, Pasti Berangkat) → Info Travel (kontak, izin) → **Floating Bottom Bar** (harga ringkas + tombol "Konsultasi Sekarang" ke WhatsApp, nempel permanen di bawah)

| Bagian | Kenapa Perlu |
|---|---|
| Galeri Foto (carousel multi-foto) | Beda dari hero Beranda yang cuma 1 banner — di sini beberapa foto spesifik paket |
| Judul & Info Kilat | Nama paket, tanggal keberangkatan, sisa kuota — kebaca sekilas tanpa scroll |
| Harga ("mulai dari") | Satu angka untuk MVP, breakdown per tipe kamar menyusul di fase lanjutan |
| Tab Fasilitas (Termasuk/Tidak Termasuk) | Nyambung ke pesan "harga transparan" di Beranda |
| Tab Akomodasi | Detail hotel Makkah & Madinah — teks bebas dari `hotel_info` |
| Tab Itinerary | Teks bebas dari kolom `itinerary`, sinyal paket direncanakan matang |
| Tab Syarat & Ketentuan | Kebijakan pembatalan, dokumen dibutuhkan, dari `terms_conditions` |
| Floating Bottom Bar (harga + CTA WhatsApp) | Akses konversi permanen — **catatan:** ini elemen fixed kedua berdampingan dengan BottomNavbar global (B.0), keputusan sadar diterima apa adanya |

**Catatan status:** section "Paket Lainnya (cross-sell)" di bawah — belum dikonfirmasi ada di build saat ini, cek saat development fitur selanjutnya menyentuh halaman ini.

**Halaman lain di section ini:**
| Layar | Kenapa Perlu |
|---|---|
| Tentang Kami | Profil travel, legalitas/izin PPIU — isi dari Pengaturan > Profil Travel |
| Testimoni Jamaah | Sinyal kepercayaan sosial |
| Galeri Foto (halaman tersendiri) | Kumpulan foto keberangkatan sebelumnya, terpisah dari galeri per-paket |
| FAQ Umum | Kurangi keraguan sebelum kontak admin |

### B.4 Decision (Memutuskan)
| Layar | Kenapa Perlu |
|---|---|
| Form Minat / Konsultasi — **berbentuk Modal** (dikonfirmasi) | Muncul di atas konteks halaman (katalog/detail paket) tanpa memutus alur baca |

### B.5 Post-Action (Setelah Submit) — Bercabang
| Kondisi | Perilaku |
|---|---|
| Submit biasa (bukan dari link referral) | Tampilkan pesan sukses statis |
| Submit dari link referral agen | Tampilkan pesan sukses singkat, lalu **auto-redirect ke `wa.me/{nomor agen}`** — menyambungkan calon jamaah langsung ke agen yang mereferensikan |

### B.6 Dukungan
| Layar | Kenapa Perlu |
|---|---|
| Kontak Kami | Alamat, peta, WhatsApp, telepon |

### B.7 Konten — Ditunda
| Layar | Status |
|---|---|
| Blog/Artikel | **Pending**, dikonfirmasi ditunda |

### B.8 Error/Edge State
| Layar | Kenapa Perlu |
|---|---|
| 404 Tenant/Domain Tidak Ditemukan | Saat ini jatuh ke halaman generic Next.js |
| Paket Tidak Ditemukan / Kuota Penuh | State yang pasti kejadian |

---

## C. Dashboard Agen — dari Sudut Kebutuhan Aktivasi

### C.1 Onboarding — Kini Bercabang (Gratis vs Berbayar)
| Layar | Kenapa Perlu |
|---|---|
| Form Pendaftaran Agen (publik, di web tenant) | Titik masuk, sama untuk kedua mode. Kalau diakses lewat link referral agen lain, otomatis tercatat sebagai upline (`parent_agent_id`) — link referral yang sama dipakai baik untuk form minat jamaah maupun form daftar agen, dibedakan dari form mana yang diisi, bukan link terpisah. **Field: Nama Lengkap, Nomor WhatsApp, Email (wajib — beda dari form jamaah, fungsinya untuk reset password karena tidak ada WhatsApp Business API buat kirim link reset otomatis), Domisili (autocomplete kota/kabupaten, dataset statis di-bundle frontend), Password+Konfirmasi, centang Syarat & Ketentuan (muncul hanya kalau tenant sudah mengisi teksnya). Kondisional: Upload Bukti Transfer (hanya mode Berbayar). SENGAJA TIDAK diminta di sini: data rekening bank — ditunda sampai agen pertama kali mengajukan pencairan, supaya form pendaftaran tetap ringan/rendah friksi**. **Unik per-tenant:** email dan nomor WhatsApp — mencegah dua akun agen pakai identitas sama di travel yang sama (bukan unik global, satu orang boleh jadi agen di travel berbeda) |
| **Halaman Status Pendaftaran** *(revisi — BUKAN dua layar sekali-tampil terpisah seperti draft sebelumnya, tapi SATU halaman persisten yang bisa diakses lewat login kapan saja, isinya dinamis sesuai status)* | Login TETAP bisa diakses berapa pun status agennya — cuma isi yang ditampilkan beda: `pending` + mode Berbayar + belum ada bukti transfer → tampilkan instruksi pembayaran + tombol upload (bisa diulang kapan saja sampai agen sempat transfer, tidak hilang begitu ditutup); `pending` + bukti sudah diupload → "Menunggu verifikasi pembayaran & persetujuan"; `pending` mode Gratis → "Menunggu persetujuan admin"; `rejected` → "Pendaftaran tidak disetujui". Ini menjawab gap: agen yang belum sempat transfer saat itu juga, bisa balik lagi kapan saja lewat login yang sama |
| Login | Standar — **tidak diblokir oleh status**, lihat baris di atas |
| Lupa Password | Standar |

### C.2 Struktur Navigasi (Mobile-First, Dikonfirmasi)

Mengikuti pola **Web Publik** (bottom navbar, card-based) — **BUKAN** pola Dashboard Admin (sidebar desktop). Alasan: agen adalah orang lapangan yang cek saldo/share link/pantau leaderboard dari HP di sela kerjaan, bukan staf kantoran yang buka laptop tiap hari. Warna brand tetap dinamis ikut tenant, konsisten dengan Web Publik — ini tetap portal milik travel masing-masing, bukan produk KlikUmroh berdiri sendiri.

**Rename istilah (khusus sisi agen — sisi admin TETAP "Prospek"):** "Prospek" → **"Jamaah"** di semua permukaan agen (nama tab navbar, judul section, judul halaman). Alasan: "Jamaah" adalah bahasa yang beneran dipakai agen sehari-hari, sedangkan admin travel lebih familiar istilah CRM/sales ("Prospek") — dua audiens, dua kosakata, disengaja beda.

**Bottom Navbar (4 slot):** Beranda / **Jamaah** / Leaderboard / Menu

**Beranda — urutan berdasarkan seberapa sering dibutuhkan, bukan sekadar daftar fitur:**
| Urutan | Elemen | Kenapa Perlu |
|---|---|---|
| 1 | Sapaan ("Halo, [Nama]") | Konteks singkat |
| **1.5** | **Target Bulanan** *(baru)* — progress bar tipis, bukan kartu penuh | Target berlaku general untuk semua agen (diatur admin: periode + satu angka target jamaah), progress dihitung dari jamaah closing milik agen ybs dalam periode itu. Ditaruh ringkas di atas kartu saldo, tidak bersaing menonjol dengan itu |
| 2 | **Kartu Saldo Komisi** (paling menonjol) — **kini terpisah dua** | **Siap Cair**: `SUM(commission_ledger)` — komisi yang sudah tercatat permanen (closing = sudah admin verifikasi pembayaran). **Tertunda**: total Potensi Komisi dari SEMUA jamaah agen yang belum closing (reuse konsep yang sama dari Detail Prospek, dijumlah). Tombol "Ajukan Pencairan" merujuk ke saldo Siap Cair, aktif kalau di atas `minimum_payout_amount` |
| 3 | **Link Referral & Share** | Kerjaan harian utama agen — selalu di layar pertama, bukan disembunyikan di menu. Tombol "Salin Link" dan "Bagikan ke WhatsApp" langsung tersedia |
| 4 | Ringkasan **Jamaah** | Angka cepat: Baru, Diproses, Closing — detail lengkap ada di tab Jamaah |
| 5 | Teaser Leaderboard | "Anda peringkat #3 bulan ini" + link ke leaderboard penuh — elemen gamifikasi yang bikin orang balik buka besok |

### C.3 Tab Jamaah
| Layar | Kenapa Perlu |
|---|---|
| Daftar Jamaah Saya | List individual jamaah yang masuk lewat referral atau ditambahkan manual — agen bisa ubah status (Baru/Dihubungi/Tertarik/Tidak Lanjut), **kecuali ke Closing** (tetap eksklusif admin, karena men-trigger `commission_ledger` dan terikat verifikasi pembayaran). Setiap perubahan tercatat di riwayat status lengkap dengan siapa yang mengubah |
| Tambah Jamaah Manual | Menangkap closing yang terjadi lewat chat WhatsApp langsung (tombol Chat di navbar publik) yang nggak pernah lewat form — tanpa ini, jamaah yang berhasil closing lewat jalur itu hilang dari funnel sama sekali |

### C.4 Tab Leaderboard
| Layar | Kenapa Perlu |
|---|---|
| Leaderboard Penuh | Dedicated tab (bukan cuma teaser di Beranda) — kompetisi ini dari awal jadi alasan kuat kenapa fitur aktivasi agen ini dibangun |

### C.5 Tab Menu (Catch-all)
| Layar | Kenapa Perlu |
|---|---|
| Saldo Komisi & Pengajuan Pencairan (detail lengkap) | Riwayat per transaksi dari `commission_ledger`, form ajukan pencairan ke rekening pribadi — versi ringkas sudah ada di Beranda, ini versi lengkapnya |
| Tools Marketing | Konsumsi konten dari 5 tools: Tips Promosi, Script WA, Sumber Jamaah, Bank Caption, Bank Konten — dibangun bertahap oleh admin, tiap halaman dibahas menyusul terpisah |
| Event & RSVP | Rasa keterlibatan di luar sekadar jualan |
| Profil Saya & Ganti Password | Standar |

---

## D. Website Marketing KlikUmroh.id (Domain Root — Bukan Whitelabel Tenant)

**Beda fundamental dari Bagian B:** Bagian B adalah web publik *milik tiap travel* (subdomain/custom domain, tenant-aware). Ini adalah web *milik KlikUmroh sendiri* di domain root `klikumroh.id`, buat menjual produk ke calon travel — audiensnya pemilik/pengelola travel, bukan calon jamaah.

**Keputusan teknis yang perlu diambil:** dibangun sebagai project terpisah (di luar `TenantResolutionMiddleware`, karena memang tidak ada konteks tenant di domain root), bukan dipaksa masuk ke app `/web` yang sama.

### D.1 Konten Marketing
| Layar | Kenapa Perlu |
|---|---|
| Landing/Homepage | Hero, value proposition, ringkasan fitur, CTA daftar |
| Fitur | Detail kemampuan produk (katalog, prospek, sistem agen, dst) |
| Harga | Transparansi biaya berlangganan |
| Testimoni/Studi Kasus | Dari design partner yang sudah pakai — bukti sosial ke calon travel lain |
| Tentang Kami | Cerita KlikUmroh sebagai perusahaan, beda dari "Tentang Kami" versi travel di Bagian B |
| FAQ | Pertanyaan umum calon pelanggan |
| Kontak / Jadwalkan Demo | Jalur alternatif selain langsung daftar |

### D.2 Alur Pendaftaran & Checkout (Sales Funnel)
| Layar | Kenapa Perlu |
|---|---|
| Form Pendaftaran Travel | Data dasar travel + akun admin pertama |
| Pilih Plan Langganan (3/6/12 Bulan) & Checkout | Tampilkan harga per periode, kolom kode kupon opsional (potongan %, dihitung dari total tagihan plan yang dipilih) |
| Halaman Instruksi Pembayaran | Transfer ke rekening KlikUmroh — pola yang sama persis dengan alur pendaftaran agen berbayar, sengaja konsisten |
| Halaman Menunggu Verifikasi Pembayaran | Sampai disetujui lewat Approval Pembayaran di Master Admin, baru akun travel aktif dan bisa login ke dashboard |

---

## E. Master Admin (Internal KlikUmroh — Bukan Milik Travel Manapun)

Scope sengaja diminimalkan sesuai kebutuhan aktual: satu orang (pemilik produk) yang butuh visibilitas dan kontrol lintas-tenant, bukan portal operasional penuh.

| Layar | Kenapa Perlu |
|---|---|
| Login (terpisah dari login admin travel) | Autentikasi sendiri, tidak numpang ke sistem sesi travel |
| Daftar Tenant | Lihat semua travel terdaftar, plan langganan aktif dan tanggal berakhirnya |
| Approval Pembayaran | **Khusus Langganan Travel** (pendaftaran baru dari alur D.2 maupun perpanjangan setelah masa langganan berakhir) — uang yang mengalir ke rekening KlikUmroh. **Bukan** tempat verifikasi pembayaran pendaftaran agen (itu uang ke rekening travel, urusan admin travel sendiri di Bagian A.5) |
| **Kelola Plan Harga** *(baru)* | Atur plan langganan yang tersedia — nama, periode (3/6/12 bulan), harga per periode. Ini sumber data yang tampil di halaman Checkout (D.2) |
| **Kelola Kupon** *(modul khusus, baru)* | List kupon aktif, Buat Kupon Baru (kode, **persentase diskon** dari tagihan — bukan durasi gratis, kupon 100% efektif jadi "gratis" sebagai kasus khusus dari mekanisme yang sama, cocok untuk kupon design partner), batas pemakaian, tanggal kedaluwarsa kode, Riwayat Pemakaian per kupon. Dipakai baik lewat self-apply di Checkout (D.2) maupun digrant manual oleh master admin langsung ke tenant tertentu |
| Kelola Tiket | List SEMUA tiket dari semua travel (bukan per-tenant seperti view travel), balas langsung |

**Catatan implikasi skema (tambahan dari sebelumnya):**
- Tabel baru `staff_users` dan `staff_sessions` — terpisah dari `admin_users`/`sessions` karena `tenant_id` di situ NOT NULL (by design, Sprint 1.75), sementara staf KlikUmroh secara sah tidak terikat satu tenant
- `support_tickets` perlu bisa diakses dua cara: admin travel lihat tiketnya sendiri (`tenant_id` difilter seperti biasa), master admin lihat semua tiket (pengecualian lintas-tenant yang disengaja, sama polanya dengan `FindByEmail`/`FindByHostname` sebelumnya — harus didokumentasikan jelas di kode agar tidak dikira pelanggaran aturan isolasi tenant)

---

## F. Shared States (Berlaku di Semua Role)

- **Empty state** (belum ada data) — pesan yang membantu, bukan sekadar "tidak ada data"
- **Loading state**
- **Error state** (403/404/500)
- **Konfirmasi aksi destruktif** (hapus paket, tolak agen, dst)

---

## Catatan: Implikasi ke Skema Database

Beberapa keputusan di atas butuh kolom/tabel baru yang belum ada di `Arsitektur-Teknis-KlikUmroh.md`:

- `tenants`: tambah `brand_secondary_color`, `favicon_url`, `seo_title`, `seo_description`, `og_image_url`, dan opsional `meta_pixel_id`/`ga4_id`/`tiktok_pixel_id`
- `tenants`: tambah field profil — `official_name`, `address`, `ppiu_license_number`, `about_description`
- **Modul Billing & Plan Harga** (revisi dari draft sebelumnya):
  - Tabel baru `pricing_plans`: `id`, `name`, `period_months` (3/6/12), `price` — dikelola Master Admin, jadi sumber tampilan di Checkout (D.2)
  - Tabel baru `coupons`: `code`, `discount_percentage` (bukan durasi gratis — kupon 100% = efektif gratis, kasus khusus dari mekanisme yang sama), `max_uses`, `expires_at`, `status`
  - Tabel baru `coupon_redemptions`: audit siapa pakai kupon apa, di plan mana, kapan
  - `tenants`: **ganti** `coupon_expires_at` (terlalu sempit, cuma cocok untuk kasus gratis) menjadi `current_plan_id` (FK ke `pricing_plans`) dan `subscription_expires_at` (berlaku untuk semua jenis langganan — gratis lewat kupon 100% maupun bayar penuh, satu field yang sama)
  - `payment_verifications` (tipe `tenant_subscription`): tambah `plan_id`, `coupon_code` (nullable), `final_amount` (setelah diskon) — supaya ada jejak plan dan diskon apa yang dipakai saat verifikasi
- `tenants` atau tabel baru `agent_registration_settings`: `registration_fee` (0 = gratis), `registration_benefits` (text), `bank_name`, `bank_account_number`, `bank_account_holder`
- `agents`: tambah `password_hash` (untuk login mandiri) — **sekarang bukan lagi opsional**, jadi prasyarat langsung dari fitur "Tambah Prospek Manual" di Dashboard Agen
- Tabel baru `agent_sessions` — auth terpisah untuk agen, mengikuti pola yang sama dengan `staff_sessions` (Bagian D), bukan numpang ke `sessions` milik admin travel
- Tabel baru `prospect_status_history`: `id`, `prospect_id`, `tenant_id`, `changed_by_type` (`admin`/`agent`), `changed_by_id` (`admin_user_id` atau `agent_id` tergantung type), `old_status`, `new_status`, `changed_at` — jejak lengkap siapa mengubah status apa dan kapan, bukan cuma kolom `status` yang ditimpa tiap kali berubah
- Tabel baru `prospect_notes`: `id`, `tenant_id`, `prospect_id`, `author_type` (`admin`/`agent`), `author_id`, `note_text`, `created_at` — log bertumpuk (bukan kolom tunggal yang ditimpa), bisa ditulis admin maupun agen pemilik prospek (validasi kepemilikan sama seperti aturan ubah status di Bagian C.4)
- `prospects.email` — tidak lagi dikoleksi dari form publik (dihapus dari field form), kolom tetap ada di skema untuk kompatibilitas data lama, tidak ditampilkan di Detail Prospek
- **Aturan kritis baru** (setara pentingnya dengan validasi `package_id`/`parent_agent_id`): endpoint ubah status prospek yang diakses agen wajib memvalidasi DUA lapis — `tenant_id` cocok (seperti biasa) DAN `agent_id` di baris prospek itu sama dengan agen yang login (agen cuma boleh ubah prospek miliknya sendiri, bukan milik agen lain di tenant yang sama). Status `closing` ditolak (403) kalau diminta lewat sesi agen — hanya `admin_users` yang boleh set status itu
- `prospects`: tambah kolom `entry_method` (`web_form` / `agent_manual`) — penanda audit ringan agar admin travel bisa membedakan prospek yang masuk lewat form publik vs diinput manual oleh agen, tanpa proses approval yang menghambat
- `prospects`: tambah kolom `jumlah_jamaah` (INT, nullable, default dianggap 1 kalau kosong) — diisi dari field opsional "Rencana Jumlah Jamaah" di form minat, dipakai sebagai pengali komisi
- `tenants`: tambah `whatsapp_number` (nomor WA default travel, **disimpan dalam format ternormalisasi** — diawali `62`, bukan `0` atau `+62` — supaya bisa langsung dipakai membangun link `wa.me` tanpa normalisasi ulang tiap kali) — dibutuhkan tombol Chat di navbar publik dan sebagai fallback redirect form minat kalau tidak ada konteks referral
- **Tabel `payment_verifications`** (bukan `subscriptions`/`invoices`/integrasi gateway — sesuai keputusan manual/lean), **khusus tipe `tenant_subscription`** (uang ke rekening KlikUmroh, direview Master Admin): `id`, `tenant_id`, `plan_id`, `coupon_code`, `amount` (tagihan asli), `final_amount` (setelah diskon), `proof_url`, `status` (pending/approved/rejected), `reviewed_by` (staff_user_id), `reviewed_at`, `created_at`. `tenants.subscription_expires_at` diperpanjang sesuai `period_months` dari plan yang dibayar, begitu status `approved`. Verifikasi pembayaran pendaftaran agen berbayar **cukup field `payment_proof_url`/`payment_status` langsung di tabel `agents`** (bukan tabel gabungan) — karena itu direview admin travel dalam alur approval agen yang sudah ada (Bagian A.5), bukan Master Admin
- **Kebijakan Enforcement Langganan Kedaluwarsa** (ditemukan sebagai gap lewat audit, baru diputuskan): begitu `subscription_expires_at` lewat (tanpa masa tenggang untuk MVP) — **Dashboard Admin masuk mode read-only untuk semua aksi tulis** (GET tetap normal). **PENGECUALIAN WAJIB:** endpoint Langganan & Tagihan (ajukan perpanjangan + upload bukti) harus tetap bisa diakses meski status expired, itu satu-satunya jalan keluar. **Web Publik dan Portal Agen SENGAJA TIDAK ikut dikunci** — yang menunggak itu travel (pihak bayar), bukan jamaah/agen; mematikan situs publik justru memotong sumber pendapatan travel yang harusnya dipakai buat bayar. Suspensi penuh (situs publik + portal agen) dicatat sebagai eskalasi lanjutan untuk kasus churn total, belum dibangun sekarang.
- Tabel baru `staff_users` dan `staff_sessions` — auth internal KlikUmroh, terpisah dari `admin_users`/`sessions` (lihat Bagian E)
- Tabel baru untuk sistem tiket: `support_tickets`, `support_ticket_messages`
- Tabel baru untuk artikel panduan: `guide_articles` (kemungkinan besar konten global KlikUmroh, bukan per-tenant)
- **Modul Komisi & Pencairan** (baru):
  - `packages`: tambah `commission_amount` (nilai komisi langsung per paket)
  - `tenants`: tambah `commission_override_enabled`, `commission_override_percentage` (berlaku tenant-wide)
  - `agents`: tambah `parent_agent_id` (self-referential, **wajib divalidasi tenant sama** — aturan kritis setara validasi `package_id` di Sprint 2), plus `bank_name`/`bank_account_number`/`bank_account_holder` untuk tujuan pencairan **(diisi belakangan saat pengajuan pencairan pertama, bukan saat registrasi)**
  - **Gap kritis ditemukan:** `agents.status` saat ini `ENUM('active','inactive')` — **wajib diperluas jadi `ENUM('pending','active','inactive','rejected')`** sebelum alur pendaftaran-approval bisa berfungsi. Tanpa `pending`, tidak ada state "menunggu review admin"
  - `agents`: tambah **UNIQUE constraint pada `(tenant_id, email)` dan `(tenant_id, phone)`** — mencegah dua agen di travel yang sama pakai email/nomor WA sama. Validasi eksplisit di handler (pesan error jelas: "Email sudah terdaftar sebagai agen"), jangan cuma andalkan error mentah dari DB constraint
  - `agents`: tambah `domisili` VARCHAR (teks bebas hasil pilihan autocomplete, bukan FK ke tabel wilayah — dataset kota/kabupaten di-bundle statis di frontend, sumber dari dataset publik yang sudah dikenal akurat seperti `cahyadsn/wilayah`, bukan ditulis manual)
  - `agents`: tambah `payment_proof_url`, `payment_status` (kalau mode registrasi berbayar), `terms_accepted_at` (nullable, diisi saat centang setuju S&K)
  - Tabel baru `commission_ledger` — dibuat otomatis setiap admin ubah status prospek ke "closing": `tenant_id`, `agent_id`, `prospect_id`, `package_id`, `type` (`direct`/`override`/**`correction`**), `amount` (**boleh negatif** untuk koreksi pengurangan), `notes` (nullable, wajib diisi kalau `type='correction'` — alasan koreksi), `created_at`. **Formula amount**: komisi langsung = `packages.commission_amount × COALESCE(prospects.jumlah_jamaah, 1)`; komisi override = `tenants.commission_override_percentage × komisi langsung di atas`. **Rate yang dipakai adalah yang berlaku PERSIS saat status berubah ke closing** (bukan saat prospek pertama masuk, bukan snapshot) — keputusan sadar, diterima risikonya. Baris ini sekaligus jadi jejak audit, tidak perlu field verifikasi terpisah. **Status: tidak lagi bisa ditunda** — Detail Prospek (Bagian A.4) butuh menampilkan nilai permanen ini untuk prospek yang sudah closing, jadi trigger penulisannya harus dibangun bersamaan, bukan modul terpisah di kemudian hari
  - **Mekanisme koreksi**: kalau admin mengubah `jumlah_jamaah` pada prospek yang statusnya SUDAH closing, sistem TIDAK mengubah baris ledger asli — sistem menambah baris baru bertipe `correction` dengan selisihnya (bisa negatif), sehingga saldo akhir benar tapi riwayat closing asli tetap utuh sebagai jejak. UI Edit Prospek wajib menampilkan peringatan eksplisit kalau prospek yang diedit sudah closing, sebelum perubahan disimpan
  - **Repeat booking dari nomor yang sama:** *ditunda dari MVP* — begitu ada kemungkinan referral beda-agen di kunjungan berikutnya, ini langsung nyerempet ke aturan atribusi klik (lihat di bawah). Tidak perlu tabel/kolom identitas pelanggan sekarang; setiap submission tetap jadi baris `prospects` independen.
- **Atribusi Klik Referral Berbasis Cookie** — ✅ **SUDAH DIIMPLEMENTASIKAN DAN TERVERIFIKASI** (dibangun proaktif oleh Antigravity sebelum prompt formal dikirim, hasilnya sesuai keputusan):
  - `/ref/{code}` men-set cookie `ref_code` (first-party, `httpOnly: false` — sengaja agar bisa dibaca client-side, isinya cuma kode referral bukan data sensitif) dengan masa berlaku 30 hari.
  - **Model: `last_click`, 30 hari — hardcoded, bukan kolom `tenants.attribution_model` yang bisa diatur admin.** Setiap akses `/ref/{code}` baru selalu menimpa cookie yang lama, tanpa pengecualian. Keputusan ini dianggap cukup untuk MVP, kolom konfigurasi ditunda sampai benar-benar dibutuhkan (dibangun kalau ada permintaan, bukan disiapkan lebih dulu).
  - **Fallback dari cookie ditangani di FRONTEND** (`ProspectModal.tsx` baca `document.cookie`), bukan di backend Go — backend cuma menerima `referral_code` apa pun yang sudah diisi di body request. Ini beda dari rencana awal (backend baca cookie), tapi diterima karena saat ini cuma ada satu jalur publik pembuatan prospek (modal ini). Kalau nanti ada jalur kedua, logic pembacaan cookie ini perlu didobel di situ.
  - **Validasi cross-tenant tetap berlaku** di jalur ini — `agent.TenantID == tenantID` dicek di service layer terlepas dari apakah `referral_code` datang dari URL atau dari cookie, sudah diverifikasi lewat skenario cookie lintas-tenant.
  - Tabel baru `commission_payout_requests`: `tenant_id`, `agent_id`, `amount_requested`, `status` (pending/approved/rejected/paid), `reviewed_by` (admin_user_id — **bukan staff_user_id**, ini approval admin travel). **Aturan bisnis (bukan bagian task Pengaturan, dicatat untuk task Pengajuan Pencairan nanti):** agen tidak boleh membuat pengajuan baru selama masih ada pengajuan berstatus `pending` miliknya — validasi di endpoint submit, bukan di skema
  - `tenants`: tambah `minimum_payout_amount` (nullable, admin isi sendiri tanpa default) dan `agent_terms_conditions` TEXT (nullable, opsional) — dua field baru untuk halaman Pengaturan Sistem Agen
  - **Catatan untuk masa depan** (belum dieksekusi, baru relevan saat alur pendaftaran agen beneran dibangun): `agents.terms_accepted_at` TIMESTAMP nullable — dicatat saat agen mendaftar dan mencentang setuju Syarat & Ketentuan, sebagai bukti persetujuan minimal (bukan sistem versioning dokumen penuh)
- **Modul Upload Foto** (baru, prasyarat Detail Paket):
  - Tabel baru `package_photos`: `id`, `tenant_id`, `package_id`, `file_path` (path relatif di bawah root uploads), `sort_order`, `created_at`
  - **Penyimpanan:** disk VPS langsung (bukan object storage pihak ketiga untuk MVP), struktur folder `/uploads/{tenant_id}/packages/{package_id}/{nama-file-acak}.webp` — nama file digenerate server (UUID), **tidak pernah** memakai nama file asli dari pengguna (mencegah path traversal/collision)
  - **Upload (tulis):** lewat Go backend — `POST /api/dashboard/packages/{id}/photos`, protected `AuthMiddleware`, validasi ukuran file maksimum, validasi isi file benar-benar gambar (cek magic bytes, bukan cuma ekstensi/Content-Type klaim klien), resize (`github.com/disintegration/imaging`, pure Go) lalu convert ke WebP (`github.com/deepteams/webp` atau `github.com/skrashevich/go-webp` — **pure Go, tanpa CGO**, kompatibel dengan cross-compile `CGO_ENABLED=0` yang sudah diputuskan di Sprint 7)
  - **Serve (baca):** **langsung oleh Nginx sebagai static file**, bukan lewat Next.js atau Go backend — satu location block `/uploads/` yang berlaku sama di semua subdomain maupun custom domain (karena Nginx adalah pintu masuk terdepan untuk semua domain di arsitektur SNI routing kita). Backend Go dan Next.js tidak pernah ikut campur saat foto ditampilkan, cuma saat diunggah
  - **Catatan keamanan:** location block `/uploads/` di Nginx wajib eksplisit menonaktifkan eksekusi script apa pun (tidak boleh diproses sebagai PHP dll) — mengingat VPS ini berbagi dengan 118 situs lain, folder upload yang bisa mengeksekusi file adalah risiko lintas-situs, bukan cuma risiko internal produk ini
- **Modul Target Bulanan Agen** (baru):
  - `tenants`: tambah `target_period_start` DATE, `target_period_end` DATE, `target_jamaah` INT — satu target general berlaku sama untuk semua agen aktif tenant tsb (bukan per-agen), admin yang mengatur periode dan angkanya
  - **Progress per agen** dihitung dari `prospect_status_history`: `SUM(prospects.jumlah_jamaah)` untuk baris `prospect_status_history` dengan `new_status='closing'` DAN `changed_at` di antara `target_period_start` dan `target_period_end`, di-join ke `prospects` untuk filter `agent_id` yang bersangkutan. Sengaja pakai tanggal PERUBAHAN status ke closing (bukan `created_at` prospek), supaya progress mencerminkan kapan closing-nya benar-benar terjadi
- **Formula "Siap Cair" (final, untuk saat modul Pengajuan Pencairan dibangun nanti):** `SUM(commission_ledger.amount) - SUM(commission_payout_requests.amount_requested WHERE status IN ('pending','approved','paid'))` — pengajuan yang belum ditolak dianggap "sudah dijatah", tidak boleh dihitung dobel sebagai saldo tersedia. Untuk sekarang (belum ada modul pencairan), `saldo_komisi` di endpoint dashboard-summary masih murni `SUM(commission_ledger.amount)` tanpa pengurangan — perlu diperbarui begitu modul pencairan dibangun
- **"Tertunda" (baru, ditambahkan ke dashboard-summary):** `SUM` dari Potensi Komisi (formula yang sama dengan Detail Prospek: `commission_amount × COALESCE(jumlah_jamaah,1)`) untuk SEMUA jamaah milik agen yang berstatus SELAIN `closing` dan SELAIN `tidak_lanjut`. Bukan konsep baru — reuse langsung dari Bagian A.4

Ini belum perlu dieksekusi sekarang — dicatat dulu supaya saat masuk fase implementasi, perubahan skema ini sudah diantisipasi, bukan kejutan di tengah jalan.
