-- Meta Pixel + Conversions API per travel (keputusan pendiri, 29 Sep 2026).
-- * meta_pixel_id: public Pixel/Dataset ID, loaded on the travel's public site.
-- * meta_capi_token_enc: Conversions API access token, AES-256-GCM encrypted with APP_ENCRYPTION_KEY
--   (never stored or returned in plain text).
-- * meta_test_event_code: optional code from Events Manager > Test Events, used while testing.
ALTER TABLE tenants
    ADD COLUMN meta_pixel_id VARCHAR(20) NULL,
    ADD COLUMN meta_capi_token_enc TEXT NULL,
    ADD COLUMN meta_test_event_code VARCHAR(40) NULL;

-- Browser identifiers of the visitor at lead time (_fbp / _fbc cookies), so the server-side Purchase
-- event sent at closing can be matched to the same Meta user. Cleared on anonymization.
ALTER TABLE prospects
    ADD COLUMN meta_fbp VARCHAR(255) NULL AFTER fbclid,
    ADD COLUMN meta_fbc VARCHAR(255) NULL AFTER meta_fbp;
