CREATE TABLE access_logs (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    BIGINT UNSIGNED NOT NULL,
    staff_id     BIGINT UNSIGNED NOT NULL,
    reason       VARCHAR(255) NULL,
    accessed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_accesslogs_tenant (tenant_id),
    INDEX idx_accesslogs_staff (staff_id)
);
