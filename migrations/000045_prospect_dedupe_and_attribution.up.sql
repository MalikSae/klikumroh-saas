-- Prospect audit (#4, #5):
-- * phone_normalized: digits-only phone in 62xxxxxxxxx form, used to detect the same jamaah submitting
--   again while their earlier prospect is still open (first owner keeps the prospect).
-- * utm_* / fbclid: ad attribution captured on the public site (Meta Pixel/CAPI later reuses fbclid).
-- * prospect_notes.author_type gains 'system' for automatic notes ("masuk lagi via ...").
ALTER TABLE prospects
    ADD COLUMN phone_normalized VARCHAR(20) NULL AFTER phone,
    ADD COLUMN utm_source VARCHAR(100) NULL AFTER entry_method,
    ADD COLUMN utm_medium VARCHAR(100) NULL AFTER utm_source,
    ADD COLUMN utm_campaign VARCHAR(150) NULL AFTER utm_medium,
    ADD COLUMN fbclid VARCHAR(255) NULL AFTER utm_campaign,
    ADD INDEX idx_prospects_tenant_phone (tenant_id, phone_normalized);

UPDATE prospects
SET phone_normalized = CASE
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '') REGEXP '^0[0-9]{8,14}$'
            THEN CONCAT('62', SUBSTRING(REGEXP_REPLACE(phone, '[^0-9]', ''), 2))
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '') REGEXP '^62[0-9]{8,13}$'
            THEN REGEXP_REPLACE(phone, '[^0-9]', '')
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '') REGEXP '^8[0-9]{7,13}$'
            THEN CONCAT('62', REGEXP_REPLACE(phone, '[^0-9]', ''))
        ELSE NULL
    END;

ALTER TABLE prospect_notes
    MODIFY COLUMN author_type ENUM('admin', 'agent', 'system') NOT NULL;
