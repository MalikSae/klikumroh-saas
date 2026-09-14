CREATE TABLE agents (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(20) NULL,
    email           VARCHAR(255) NULL,
    referral_code   VARCHAR(50) NOT NULL UNIQUE,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_agents_tenant (tenant_id)
);
