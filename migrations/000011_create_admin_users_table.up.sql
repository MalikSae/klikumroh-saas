CREATE TABLE admin_users (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id      BIGINT UNSIGNED NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    name           VARCHAR(255) NOT NULL,
    status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_adminusers_tenant (tenant_id)
);
