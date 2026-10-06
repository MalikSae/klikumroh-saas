-- Visibilitas paket langganan (keputusan pendiri 6 Okt 2026). FALSE = paket internal/khusus: tidak
-- tampil di daftar paket travel (signup publik, halaman Langganan) dan tidak bisa dipilih travel, kecuali
-- travel yang paket aktifnya memang paket itu (tetap bisa memperpanjang).
ALTER TABLE pricing_plans
    ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE AFTER price;
