# Rencana Implementasi — Meta Pixel + CAPI Platform KlikUmroh

Status: rencana, belum dikerjakan. Tanggal analisis: 14 Okt 2026.

## 1. Tujuan

Mengukur dan mengoptimasi iklan Meta Ads KlikUmroh sendiri untuk mengakuisisi travel umroh sebagai pengguna. Satu Pixel (dataset) untuk seluruh funnel klikumroh.id, dengan Conversions API (CAPI) di sisi server.

Ini terpisah dari fitur Pixel/CAPI per-travel yang sudah ada (`internal/service/meta.go`, `web/lib/metaPixel.ts`, `web/components/MetaPixel.tsx`). Fitur itu milik tiap travel untuk iklan jamaah dan **tidak diubah** (AGENTS.md 3.8).

## 2. Keputusan pendiri (14 Okt 2026)

1. Satu Pixel untuk semua event platform.
2. Event `Purchase` dikirim saat staf mengonfirmasi lunas (approve payment verification), bukan saat bukti transfer diunggah.
3. Nilai `Purchase` = harga paket langganan yang dibayar.
4. Pixel ID, token CAPI, dan Test Event Code diinput dari dashboard (super admin), bukan lewat file env.

## 3. Asumsi yang perlu dikonfirmasi

- "Dashboard" = dashboard super admin (`/internal/*`, `AdminSettingsView`), karena Pixel ini milik platform, bukan milik travel.
- `Purchase` hanya untuk pembayaran **pertama** tenant (`wasPending == true` di `ApproveVerificationExpecting`). Perpanjangan tidak dikirim agar iklan akuisisi tidak dioptimasi ke pembayaran ulang. Bila pendiri ingin perpanjangan ikut, ubah satu kondisi.
- Nilai = `final_amount` dikurangi `unique_code` (nilai paket setelah promo dan kupon, tanpa kode unik transfer). Verifikasi dulu bahwa `unique_code` memang ditambahkan ke `final_amount`.

## 4. Hasil analisis kode (kondisi sekarang)

| Hal | Kondisi |
|---|---|
| Pixel di host platform | Tidak ada. `web/app/layout.tsx` hanya memuat pixel dari `/api/public/meta-pixel` per-host travel. |
| Penyimpanan konfigurasi platform | Tabel key-value `platform_settings`. `UpdateSettings` memvalidasi semua field sekaligus (WA, bank, URL), jadi tidak cocok untuk token. |
| Enkripsi token | `util.SecretBox` (butuh `APP_ENCRYPTION_KEY`) sudah dipakai CAPI per-travel. |
| Signup travel | `POST /api/public/tenant-signup` (`internal/handler/public_signup.go`), `TenantSignupRequest` belum membawa fbp/fbc/UTM. |
| Konfirmasi lunas | `subscriptionService.ApproveVerificationExpecting` (`internal/service/subscription.go:723`), `wasPending` menandai pembayaran pertama. |
| Consent | Checkout sudah punya persetujuan Syarat dan Privasi (`CheckoutView.tsx` sekitar baris 1170). |
| CSP | Belum ditemukan konfigurasi CSP di `web/next.config.*`; commit `0623215` menambah response headers, lokasinya perlu dicek. |

## 5. Rancangan

### 5.1 Penyimpanan konfigurasi (backend)

Tiga key baru di `platform_settings` (tanpa migrasi skema, tabel sudah key-value):

- `meta_pixel_id` (angka 10-20 digit, divalidasi regex yang sama dengan CAPI per-travel)
- `meta_capi_token_enc` (token dienkripsi SecretBox, tidak pernah dikembalikan ke klien; hanya 4 karakter terakhir sebagai petunjuk)
- `meta_test_event_code`

Service baru `PlatformMetaService` (file baru `internal/service/platform_meta.go`), tidak menyentuh `PlatformSettingsService.UpdateSettings`. Memakai ulang fungsi hash, `metaUserData`, `post`, dan `deliver` dari `meta.go` (ekstrak ke helper bersama bila perlu, tanpa mengubah perilaku CAPI per-travel).

Endpoint:

- `GET /api/staff/platform-meta` dan `PUT /api/staff/platform-meta` (staf, pola sama dengan `platform-settings`)
- `POST /api/staff/platform-meta/test` (kirim event uji ke Test Events, wajib ada Test Event Code)
- `GET /api/public/platform-meta-pixel` (hanya `pixel_id`, publik, tanpa data lain)

Status pengiriman terakhir (sukses/gagal, tanpa token) disimpan di key `meta_last_success_at`, `meta_last_error`, `meta_last_error_at` agar kegagalan token terlihat di dashboard.

### 5.2 Atribusi signup (migrasi baru)

Tabel baru `tenant_ad_attribution` (satu baris per tenant, unik `tenant_id`):

`fbp`, `fbc`, `fbclid`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `event_source_url`, `client_ip`, `user_agent`, `lead_event_id`, `purchase_event_sent_at`, `created_at`.

Alasan tabel terpisah: data iklan tidak mencemari `tenants`, dan `purchase_event_sent_at` menjamin `Purchase` tidak terkirim dua kali (retry aman). Repository wajib `tenant_id` di setiap fungsi.

`TenantSignupRequest` mendapat objek opsional `ad_context` (fbp, fbc, fbclid, utm_*, event_source_url). IP dan user agent diambil server dari request (bukan dari body), pola sama dengan `ClientIP`. Nilai fbp/fbc divalidasi `cleanMetaCookie`.

### 5.3 Event

| Event | Sumber | Kapan | Dedup |
|---|---|---|---|
| `PageView` | Browser | Setiap halaman publik platform | - |
| `ViewContent` | Browser | Landing `/marketing` dan daftar harga terlihat | - |
| `InitiateCheckout` | Browser | `/checkout` dibuka | - |
| `Lead` | Browser + CAPI | Respons sukses `tenant-signup` | `event_id` dari backend (`lead_event_id`) |
| `Purchase` | CAPI saja | Staf approve pembayaran pertama | `event_id = purchase-pv-<id>` + `purchase_event_sent_at` |

`Lead` dikirim saat signup sukses (akun terbentuk, status pending), bukan saat bayar. Itu sinyal volume awal; `Purchase` jadi sinyal nilai. Event standar dipakai agar Meta bisa mengoptimasi tanpa konfigurasi custom conversion.

PII yang dikirim (email admin, WA admin, nama admin) selalu hash SHA-256 dan dinormalisasi sesuai spesifikasi Meta, memakai `metaUserData` yang sudah ada. `external_id` = `klikumroh-platform-<tenant_id>`.

### 5.4 Frontend (web)

- `layout.tsx`: bila `isPlatformHost(host)` dan tidak ada tenant, ambil `/api/public/platform-meta-pixel` dan render komponen pixel. Jangan aktif di host travel (sudah ditangani jalur per-travel).
- Komponen baru `PlatformMetaPixel` (atau `MetaPixel` diberi prop `excludedPrefixes`) dengan prefix dikecualikan: `/internal`, `/login`, dan halaman pasca-login. Memakai ulang `ensureFbqStub`, `trackMetaEvent`, `getMetaBrowserContext` dari `web/lib/metaPixel.ts`.
- `CheckoutView.tsx`: kirim `InitiateCheckout` saat mount, sertakan `ad_context` (fbp, fbc, fbclid, UTM dibaca dari query saat landing dan disimpan di cookie/sessionStorage agar bertahan sampai checkout) di body `tenant-signup`, lalu `trackMetaEvent('Lead', ..., eventId)` dari respons.
- Tidak ada warna/style/emoji baru (AGENTS.md 3.3, 3.4).

### 5.5 Dashboard super admin

Bagian baru di `AdminSettingsView.tsx`: Pixel ID, Access Token (field password, kosong = tidak diubah, tombol hapus), Test Event Code, tombol "Kirim event uji", dan status pengiriman terakhir. Penjelasan panjang lewat Tooltip, bukan paragraf (AGENTS.md 3.11). Ikon dari lucide-react.

## 6. Urutan kerja

1. Migrasi `tenant_ad_attribution` (matikan API dulu, AGENTS.md 5.1) dan repository + test.
2. `PlatformMetaService` + endpoint staf + endpoint publik pixel + test (validasi, token tidak bocor, ClearToken).
3. Atribusi di `TenantSignup` + `lead_event_id` di respons + CAPI `Lead`.
4. Hook `Purchase` di `ApproveVerificationExpecting` setelah transisi `approved` berhasil, hanya `wasPending`, fire-and-forget, tidak boleh menggagalkan approval.
5. Frontend: pixel platform, `InitiateCheckout`, `ad_context`, `Lead`.
6. Dashboard super admin.
7. Dokumentasi: `DEPLOY.md` (perlu `APP_ENCRYPTION_KEY`), `sprint-plan.md`.

## 7. Verifikasi (AGENTS.md bagian 6)

Tanpa screenshot. Bukti berupa data:

- `go build ./...` dan `go test ./...`.
- Test: token tidak pernah muncul di respons API maupun log; event `Lead` dan `Purchase` ke fake Graph API berisi `event_id`, nilai IDR benar, PII ter-hash; `Purchase` tidak terkirim untuk perpanjangan; retry tidak menggandakan (`purchase_event_sent_at`); kegagalan Meta tidak menggagalkan signup maupun approve.
- Test isolasi: atribusi tenant A tidak terbaca lewat jalur tenant B.
- Cek manual oleh pendiri di Events Manager > Test Events: event muncul, status dedup "Deduplicated" untuk `Lead`, Event Match Quality.
- Cek `fbq` tidak aktif di `/internal`, dashboard, dan situs travel.

## 8. Di luar kode (pendiri)

- Buat Pixel/dataset di Events Manager, generate access token CAPI.
- Isi `APP_ENCRYPTION_KEY` di VPS secara manual (AGENTS.md 3.2).
- Verifikasi domain `klikumroh.id` di Business Manager dan atur Aggregated Event Measurement (prioritas event: Purchase, Lead).
- Pastikan Kebijakan Privasi menyebut pemrosesan data oleh Meta untuk iklan.
- Cek CSP/response headers mengizinkan `connect.facebook.net` dan `www.facebook.com`.

## 9. Risiko

- `Purchase` bergantung pada kebiasaan staf menyetujui tepat waktu; keterlambatan menggeser sinyal. Mitigasi: `event_time` memakai waktu konfirmasi (CAPI menerima maksimum 7 hari ke belakang).
- Volume `Purchase` awal kecil, sehingga optimasi iklan sebaiknya mulai ke `Lead`, lalu pindah ke `Purchase` setelah cukup data.
- Token kedaluwarsa atau dicabut: terlihat lewat status pengiriman di dashboard, event tidak menggagalkan alur bisnis.
