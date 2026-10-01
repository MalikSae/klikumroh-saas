# Visi desain — Dashboard Travel KlikUmroh

**Ruang kerja yang tenang untuk tim travel yang sibuk.** Setiap layar menjawab satu pertanyaan:
*apa yang harus saya kerjakan sekarang, dan apakah hasilnya membaik?*

Acuan visual: referensi pendiri (gaya SellPilot) + prototipe `design/prototype.html`.

## Aturan yang mengikat semua layar

1. **Satu garis tepi.** Konten halaman punya padding 32px; judul, tab, kartu, dan tabel mulai dari tepi kiri
   yang sama. Tidak ada elemen yang menjorok sendiri.
2. **Kartu seperlunya, tidak pernah bersarang.** Halaman daftar (Prospek, Agen, Paket) tidak dibungkus kartu:
   tab, pencarian, filter, dan tabel langsung di halaman; **tabel satu-satunya bingkai**. Kartu hanya untuk
   mengelompokkan beberapa hal berbeda dalam satu layar (mis. grafik dan angka di Beranda). Tidak ada kartu di dalam kartu.
3. **Toolbar satu baris, tidak pernah turun ke baris kedua.** Pencarian di kiri, tombol **Filter** (satu popover
   berisi semua filter, dengan jumlah filter aktif) di sebelahnya, aksi di kanan.
4. **Warna punya tugas.** Palet mengikuti logo KlikUmroh: hitam dan abu netral. Hitam untuk aksi utama
   (satu per layar), item navigasi aktif, dan strip utama Beranda. Hijau hanya untuk status positif (Closing,
   tren naik), merah hanya untuk hal yang menunggu tindakan, amber untuk peringatan. Warna kanal grafik tetap.
5. **Navigasi tenang.** Sidebar sewarna bingkai; item aktif diberi latar abu lebih gelap + ikon hitam + huruf
   tebal. Garis pemisah tipis sebelum bagian bawah.
6. **Ritme tetap.** Kontrol 36px, baris tabel 52px, jarak antar blok 20px, jarak antar grup navigasi 16px.
7. **Keadaan kosong tetap rapi.** Tabel kosong tetap menampilkan header kolomnya; pesan kosong di tengah area
   tabel, bukan di tengah kartu raksasa.
