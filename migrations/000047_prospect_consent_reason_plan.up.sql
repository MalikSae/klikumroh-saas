-- Prospect re-audit (29 Sep 2026), keputusan pendiri:
-- * consent_at: when the jamaah agreed (UU PDP 27/2022) to be contacted, from the public interest form.
-- * lost_reason_category: fixed reason for 'Tidak Lanjut' so losses can be analysed; lost_reason keeps the detail.
-- * departure_plan ('YYYY-MM') and domicile (kota): what CS needs to offer the right package.
ALTER TABLE prospects
    ADD COLUMN consent_at TIMESTAMP NULL AFTER fbclid,
    ADD COLUMN lost_reason_category VARCHAR(30) NULL AFTER lost_reason,
    ADD COLUMN departure_plan VARCHAR(7) NULL AFTER jumlah_jamaah,
    ADD COLUMN domicile VARCHAR(100) NULL AFTER departure_plan;

UPDATE prospects
SET lost_reason_category = CASE
        WHEN lost_reason LIKE 'Batal setelah DP:%' THEN 'batal_setelah_dp'
        ELSE 'lainnya'
    END
WHERE status = 'tidak_lanjut';
