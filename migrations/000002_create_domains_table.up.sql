CREATE TABLE domains (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id      BIGINT UNSIGNED NOT NULL,
    hostname       VARCHAR(255) NOT NULL UNIQUE,
    type           ENUM('subdomain','custom') NOT NULL,
    status         ENUM('pending','active','failed') NOT NULL DEFAULT 'pending',
    verified_at    TIMESTAMP NULL,
    last_check_at  TIMESTAMP NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_domains_tenant (tenant_id),
    INDEX idx_domains_hostname_status (hostname, status)
);
