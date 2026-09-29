ALTER TABLE tenants
    DROP COLUMN meta_last_error_at,
    DROP COLUMN meta_last_error,
    DROP COLUMN meta_last_success_at;

ALTER TABLE prospects
    DROP COLUMN meta_disclosed_at;
