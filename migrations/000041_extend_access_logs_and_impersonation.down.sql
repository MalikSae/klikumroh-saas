ALTER TABLE sessions
    DROP FOREIGN KEY fk_sessions_impersonated_staff,
    DROP COLUMN impersonation_reason,
    DROP COLUMN impersonated_by_staff_id;

ALTER TABLE access_logs
    DROP FOREIGN KEY fk_accesslogs_staff,
    DROP INDEX idx_accesslogs_session_path,
    DROP INDEX idx_accesslogs_tenant_accessed,
    DROP COLUMN session_id,
    DROP COLUMN path,
    DROP COLUMN http_method,
    DROP COLUMN action;
