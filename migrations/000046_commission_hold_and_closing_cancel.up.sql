-- Closing = jamaah sudah bayar DP. Komisi agen tertahan sampai admin menandai jamaah lunas
-- (keputusan pendiri 29 Sep 2026; tidak ada modul pembayaran — KlikUmroh bukan ERP).
-- * prospects.paid_off_at: kapan admin menandai jamaah lunas (bukan status pipeline baru).
-- * commission_ledger.released_at: NULL = tertahan, terisi = boleh dicairkan agen.
-- * tenants.commission_release_on: kapan komisi bisa dicairkan ('lunas' default, atau 'dp' = langsung saat closing).
ALTER TABLE prospects
    ADD COLUMN paid_off_at TIMESTAMP NULL AFTER lost_reason;

ALTER TABLE commission_ledger
    ADD COLUMN released_at TIMESTAMP NULL AFTER notes;

-- Komisi yang sudah ada tetap "Siap Cair": saldo agen yang berjalan tidak berubah.
UPDATE commission_ledger SET released_at = created_at WHERE released_at IS NULL;

ALTER TABLE tenants
    ADD COLUMN commission_release_on ENUM('lunas', 'dp') NOT NULL DEFAULT 'lunas';
