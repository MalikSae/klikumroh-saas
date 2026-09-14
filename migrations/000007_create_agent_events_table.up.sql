CREATE TABLE agent_events (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    BIGINT UNSIGNED NOT NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT NULL,
    event_date   DATETIME NOT NULL,
    location     VARCHAR(255) NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_events_tenant (tenant_id)
);
