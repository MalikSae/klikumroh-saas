-- Default draft text for the platform's two legal pages (Syarat & Ketentuan, Kebijakan Privasi).
-- DRAFT only: nothing is published here. Staff review the text in Pengaturan Global > Dokumen Legal and
-- publish it themselves. Only an empty draft is filled, so a text staff already wrote is never overwritten.
-- Text format: "## " heading, "- " list item, blank line = new paragraph.

UPDATE legal_documents
SET title = 'Syarat & Ketentuan',
    draft_content = 'Terakhir diperbarui: 10 Oktober 2026

Syarat & Ketentuan ini mengatur penggunaan layanan KlikUmroh.id ("KlikUmroh"), yaitu perangkat lunak berlangganan untuk biro perjalanan umroh ("Travel") mengelola website, calon jamaah, dan agen. Dengan mendaftar atau memakai layanan, Anda menyatakan telah membaca dan menyetujui ketentuan ini.

## 1. Tentang layanan

KlikUmroh menyediakan website atas nama Travel, formulir minat calon jamaah, pencatatan prospek, dashboard admin, dan sistem agen dengan tautan referral. KlikUmroh adalah penyedia perangkat lunak. KlikUmroh bukan penyelenggara perjalanan ibadah umroh, tidak menjual paket kepada jamaah, dan tidak menjadi pihak dalam perjanjian antara Travel dengan jamaah maupun antara Travel dengan agen.

## 2. Akun dan keamanan

- Pendaftar adalah penanggung jawab (PIC) akun Travel dan menyatakan berwenang mewakili Travel tersebut.
- Data yang diberikan saat mendaftar harus benar dan dijaga tetap terbaru.
- Anda bertanggung jawab atas kerahasiaan email dan kata sandi, serta atas semua tindakan yang dilakukan lewat akun Travel, termasuk oleh anggota tim yang Anda tambahkan.
- Segera hubungi kami bila Anda menduga akun dipakai pihak lain.

## 3. Paket langganan dan pembayaran

- Layanan diberikan berdasarkan paket langganan dengan harga dan masa aktif yang tertera pada halaman pendaftaran atau tagihan.
- Pembayaran dilakukan dengan transfer bank ke rekening KlikUmroh yang tertera pada tagihan, sesuai jumlah total termasuk kode unik, lalu bukti transfer diunggah pada halaman tagihan.
- Pembayaran diverifikasi oleh tim KlikUmroh, umumnya paling lama 1 x 24 jam. Layanan penuh aktif setelah pembayaran diverifikasi.
- Promo dan kupon berlaku sesuai syarat yang tertera, dan promo awal hanya berlaku untuk pembayaran pertama.
- Harga dapat berubah. Perubahan tidak memengaruhi tagihan yang sudah diterbitkan.

## 4. Masa aktif, perpanjangan, dan penangguhan

- Langganan berlaku selama masa aktif paket. Pengingat perpanjangan ditampilkan di dashboard menjelang masa aktif berakhir.
- Setelah masa aktif berakhir, layanan tetap berjalan selama masa tenggang 7 hari agar Travel dapat memperpanjang.
- Bila belum diperpanjang setelah masa tenggang, layanan ditangguhkan: website tidak ditampilkan dan data hanya dapat dilihat. Penangguhan tidak menghapus data, dan layanan kembali dapat dipakai penuh setelah perpanjangan diverifikasi.
- Bila langganan belum diperpanjang 90 hari setelah penangguhan, data operasional Travel (prospek, agen, paket, dan berkas yang diunggah) dihapus permanen. Pemberitahuan dikirim lewat dashboard 14 hari dan 3 hari sebelum tanggal penghapusan, dan Travel dapat mengunduh CSV prospek dari dashboard sebelum tanggal itu.
- Data tagihan dan pembayaran tidak ikut dihapus dan disimpan sesuai kewajiban pembukuan.

## 5. Garansi uang kembali 14 hari

Pembayaran pertama dapat dikembalikan 100% bila Travel mengajukan pembatalan dalam 14 hari sejak layanan diaktifkan. Pengajuan disampaikan melalui WhatsApp CS KlikUmroh, dan pengembalian dana diproses secara manual ke rekening pengirim. Garansi tidak berlaku untuk perpanjangan dan tidak berlaku bila akun terbukti melanggar ketentuan ini.

## 6. Tanggung jawab Travel

- Travel bertanggung jawab penuh atas isi website, paket, harga, jadwal, foto, dan klaim yang dipublikasikan, serta atas izin usaha penyelenggaraan perjalanan ibadah umroh (PPIU) yang dimilikinya.
- Travel bertanggung jawab atas hubungan, perjanjian, pembayaran, dan pelayanan kepada jamaah, termasuk keberangkatan.
- Travel bertanggung jawab atas hubungan dan perjanjian dengan agennya, termasuk besaran komisi, syarat pencairan, dan kewajiban pajak. KlikUmroh hanya menyediakan alat pencatatan.
- Travel memastikan memiliki dasar yang sah untuk mengolah data pribadi calon jamaah dan agen yang dimasukkan atau dikumpulkan lewat layanan ini, sesuai Kebijakan Privasi dan peraturan yang berlaku.

## 7. Penggunaan yang dilarang

- Menampilkan informasi palsu, menyesatkan, atau penawaran yang tidak dapat dipenuhi.
- Mengunggah konten yang melanggar hukum, hak cipta, atau hak pihak lain.
- Mengakses data Travel lain, mengganggu, atau mencoba menembus keamanan sistem.
- Menggunakan layanan untuk spam, penipuan, atau kegiatan yang melanggar hukum.
- Menjual kembali atau meniru layanan tanpa izin tertulis.

## 8. Domain kustom

Travel dapat memakai domain sendiri sesuai petunjuk di dashboard. Travel menjamin berhak atas domain tersebut dan bertanggung jawab atas pengaturan DNS-nya. Sertifikat keamanan diterbitkan otomatis setelah domain terverifikasi.

## 9. Hak kekayaan intelektual

Perangkat lunak, tampilan, dan merek KlikUmroh adalah milik KlikUmroh. Langganan hanya memberi hak pakai selama masa aktif dan tidak memindahkan kepemilikan. Konten yang diunggah Travel tetap milik Travel, dan Travel memberi KlikUmroh izin menampilkannya untuk menjalankan layanan.

## 10. Ketersediaan dan batas tanggung jawab

- KlikUmroh berupaya menjaga layanan tetap tersedia, namun tidak menjamin layanan bebas gangguan, kesalahan, atau pemeliharaan.
- Layanan diberikan sebagaimana adanya. KlikUmroh tidak menjamin jumlah prospek, pendaftar, atau penjualan yang akan diperoleh Travel.
- Sepanjang diizinkan hukum, tanggung jawab KlikUmroh atas suatu klaim dibatasi paling banyak sebesar biaya langganan yang dibayar Travel pada periode berjalan, dan tidak mencakup kerugian tidak langsung seperti hilangnya keuntungan atau peluang.

## 11. Penghentian

- Travel dapat berhenti berlangganan dengan tidak memperpanjang.
- KlikUmroh dapat menangguhkan atau menutup akun yang melanggar ketentuan ini, setelah pemberitahuan bila memungkinkan.
- Travel dapat meminta penghapusan data melalui WhatsApp CS, sebagaimana diatur dalam Kebijakan Privasi. Data tagihan dan pembayaran tetap disimpan sesuai kewajiban pembukuan.

## 12. Perubahan ketentuan

KlikUmroh dapat memperbarui ketentuan ini. Perubahan penting diberitahukan lewat dashboard atau kontak yang terdaftar. Memakai layanan setelah perubahan berlaku berarti menyetujui ketentuan yang baru.

## 13. Hukum yang berlaku dan kontak

Ketentuan ini tunduk pada hukum Republik Indonesia. Perselisihan diselesaikan terlebih dahulu secara musyawarah, dan bila tidak tercapai diselesaikan melalui pengadilan yang berwenang di Indonesia. Pertanyaan tentang ketentuan ini dapat disampaikan melalui nomor WhatsApp CS yang tercantum di situs KlikUmroh.id.'
WHERE slug = 'syarat-ketentuan' AND TRIM(draft_content) = '';

UPDATE legal_documents
SET title = 'Kebijakan Privasi',
    draft_content = 'Terakhir diperbarui: 10 Oktober 2026

Kebijakan Privasi ini menjelaskan bagaimana KlikUmroh.id ("KlikUmroh") mengumpulkan, memakai, dan melindungi data pribadi saat Travel, agen, dan calon jamaah memakai layanan kami, sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.

## 1. Peran kami

- Untuk data akun Travel, anggota tim, dan agen (pendaftaran, login, tagihan), KlikUmroh bertindak sebagai pengendali data.
- Untuk data calon jamaah yang masuk lewat website sebuah Travel, Travel adalah pengendali data dan KlikUmroh bertindak sebagai pemroses yang menyimpannya atas nama Travel itu.

## 2. Data yang kami kumpulkan

- Data akun: nama, email, nomor WhatsApp, nama travel, alamat, nomor izin PPIU, dan kata sandi (disimpan dalam bentuk hash, tidak pernah sebagai teks asli).
- Data pembayaran langganan: nominal, bukti transfer, dan status verifikasi.
- Data calon jamaah yang diisi lewat formulir minat: nama, nomor WhatsApp, domisili, rencana keberangkatan, paket yang diminati, jumlah jamaah, serta waktu persetujuan.
- Data agen: nama, kontak, kode referral, data rekening untuk pencairan komisi, dan aktivitas yang terkait komisi.
- Data teknis: alamat IP, jenis perangkat dan peramban, halaman yang dibuka, dan sumber kunjungan (misalnya tautan referral atau iklan), untuk keamanan dan pencatatan atribusi.
- Data pengguna demo: nama, nomor WhatsApp, nama travel, dan domisili travel (kota atau kabupaten) yang diisi sebelum membuka dashboard demo, beserta waktu persetujuan, jumlah kunjungan, dan sumber kunjungan.

## 3. Tujuan penggunaan

- Menyediakan dan menjalankan layanan: website Travel, pencatatan prospek, dashboard, dan sistem agen.
- Memverifikasi pembayaran, menerbitkan tagihan, dan menghitung komisi.
- Menghubungi Travel atau agen terkait akun, tagihan, dan dukungan.
- Menjaga keamanan, mencegah penyalahgunaan, dan memenuhi kewajiban hukum.
- Menghubungi pengguna demo terkait demo dan layanan KlikUmroh, sesuai persetujuan yang diberikan pada formulir demo.
- Meningkatkan layanan dengan data yang tidak mengidentifikasi individu.

## 4. Persetujuan calon jamaah

Formulir minat meminta persetujuan calon jamaah sebelum data dikirim, dan waktu persetujuan dicatat. Dengan mengirim formulir, calon jamaah menyetujui datanya diterima oleh Travel yang bersangkutan dan agennya untuk dihubungi terkait paket umroh.

## 5. Dengan siapa data dibagikan

- Travel dan agen yang relevan, hanya untuk data prospek yang masuk lewat website atau tautan mereka. Data satu Travel tidak dapat dilihat oleh Travel lain.
- Penyedia infrastruktur dan layanan teknis yang membantu kami menjalankan layanan, dengan kewajiban menjaga kerahasiaan.
- Meta (Facebook dan Instagram), hanya bila Travel mengaktifkan integrasi Meta Pixel atau Conversions API untuk pengukuran iklan. Travel yang mengaktifkannya bertanggung jawab atas pemberitahuan kepada pengunjung websitenya.
- Pihak berwenang bila diwajibkan oleh hukum.

Kami tidak menjual data pribadi.

## 6. Cookie dan teknologi serupa

Kami memakai cookie atau penyimpanan lokal seperlunya untuk menjaga sesi login, mengingat tautan referral agen selama 30 hari agar atribusi tidak hilang, dan menjaga keamanan. Pengaturan peramban Anda dapat menolak cookie, namun sebagian fitur mungkin tidak berfungsi.

## 7. Penyimpanan dan keamanan

- Data akun dan data prospek disimpan selama langganan Travel aktif. Bila langganan tidak diperpanjang, data operasional (prospek, agen, paket, dan berkas) dihapus permanen 90 hari setelah layanan ditangguhkan, dengan pemberitahuan 14 hari dan 3 hari sebelumnya.
- Data tagihan, bukti pembayaran, dan catatan akses staf disimpan lebih lama sesuai kewajiban pembukuan dan keperluan audit, dengan akses terbatas.
- Permintaan penghapusan data pribadi dipenuhi, kecuali data yang wajib kami simpan menurut hukum.
- Data pengguna demo disimpan selama diperlukan untuk menindaklanjuti minat Anda dan dapat dihapus atas permintaan.
- Koneksi memakai enkripsi (HTTPS), kata sandi disimpan sebagai hash, dan akses data dipisahkan per Travel.
- Bukti pembayaran dan berkas pribadi disimpan pada penyimpanan privat dan hanya dapat dibuka oleh pihak yang berwenang.
- Tidak ada sistem yang sepenuhnya aman. Bila terjadi insiden yang berdampak pada data pribadi, kami memberitahukan pihak terdampak sesuai peraturan.

## 8. Hak Anda

Anda berhak meminta akses, perbaikan, atau penghapusan data pribadi, menarik persetujuan, dan menyampaikan keberatan atas pemrosesan tertentu. Calon jamaah sebaiknya mengajukan permintaan kepada Travel yang bersangkutan, yang dapat menindaklanjutinya lewat dashboard. Untuk data akun dan data lain yang kami kendalikan, hubungi kami lewat WhatsApp CS. Kami menanggapi dalam waktu wajar sesuai peraturan yang berlaku.

## 9. Anak di bawah umur

Layanan ditujukan bagi pelaku usaha dan calon jamaah dewasa. Data anak yang dimasukkan sebagai bagian dari rombongan keluarga menjadi tanggung jawab orang tua atau wali yang mengisinya.

## 10. Perubahan kebijakan

Kebijakan ini dapat diperbarui. Perubahan penting diberitahukan lewat dashboard atau situs, dan tanggal pembaruan di bagian atas diubah.

## 11. Kontak

Pertanyaan atau permintaan terkait data pribadi dapat disampaikan melalui nomor WhatsApp CS yang tercantum di situs KlikUmroh.id.'
WHERE slug = 'kebijakan-privasi' AND TRIM(draft_content) = '';
