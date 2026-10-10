ALTER TABLE tenants
    DROP COLUMN data_purged_at,
    DROP COLUMN purge_warned_3_at,
    DROP COLUMN purge_warned_14_at;
