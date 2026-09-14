CREATE TABLE tenant_banners (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id     BIGINT UNSIGNED NOT NULL,
    title         VARCHAR(255) NOT NULL,
    image_url     VARCHAR(500) NOT NULL,
    subtitle      VARCHAR(255) NULL,
    cta_url       VARCHAR(500) NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_banners_tenant_order (tenant_id, display_order)
);
