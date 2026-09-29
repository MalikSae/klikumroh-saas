ALTER TABLE prospects
    DROP COLUMN meta_fbc,
    DROP COLUMN meta_fbp;

ALTER TABLE tenants
    DROP COLUMN meta_test_event_code,
    DROP COLUMN meta_capi_token_enc,
    DROP COLUMN meta_pixel_id;
