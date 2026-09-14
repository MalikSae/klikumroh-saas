CREATE TABLE packages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT NULL,
    price           DECIMAL(15,2) NULL,
    departure_date  DATE NULL,
    quota           INT NULL,
    status          ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_packages_tenant (tenant_id)
);
