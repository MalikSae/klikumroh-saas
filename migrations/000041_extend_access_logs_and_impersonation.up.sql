-- Sprint 6: Access Log & Trust
-- 1. Extend access_logs with action detail so travel can audit exactly what staff accessed.
ALTER TABLE access_logs
    ADD COLUMN action VARCHAR(50) NOT NULL DEFAULT 'akses_data' AFTER staff_id,
    ADD COLUMN http_method VARCHAR(10) NULL AFTER action,
    ADD COLUMN path VARCHAR(500) NULL AFTER http_method,
    ADD COLUMN session_id BIGINT UNSIGNED NULL AFTER path,
    ADD CONSTRAINT fk_accesslogs_staff FOREIGN KEY (staff_id) REFERENCES staff_users(id),
    ADD INDEX idx_accesslogs_tenant_accessed (tenant_id, accessed_at),
    ADD INDEX idx_accesslogs_session_path (tenant_id, session_id, http_method, path(191), accessed_at);

-- 2. Mark impersonation sessions so AuthMiddleware can log every request made by staff.
ALTER TABLE sessions
    ADD COLUMN impersonated_by_staff_id BIGINT UNSIGNED NULL AFTER tenant_id,
    ADD COLUMN impersonation_reason VARCHAR(255) NULL AFTER impersonated_by_staff_id,
    ADD CONSTRAINT fk_sessions_impersonated_staff FOREIGN KEY (impersonated_by_staff_id) REFERENCES staff_users(id);
