DELETE FROM prospect_notes WHERE author_type = 'system';

ALTER TABLE prospect_notes
    MODIFY COLUMN author_type ENUM('admin', 'agent') NOT NULL;

ALTER TABLE prospects
    DROP INDEX idx_prospects_tenant_phone,
    DROP COLUMN fbclid,
    DROP COLUMN utm_campaign,
    DROP COLUMN utm_medium,
    DROP COLUMN utm_source,
    DROP COLUMN phone_normalized;
