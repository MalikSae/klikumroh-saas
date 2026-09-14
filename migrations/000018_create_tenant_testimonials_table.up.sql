CREATE TABLE tenant_testimonials (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id     BIGINT UNSIGNED NOT NULL,
    name          VARCHAR(255) NOT NULL,
    package_name  VARCHAR(255) NOT NULL,
    rating        TINYINT UNSIGNED NOT NULL DEFAULT 5,
    quote         TEXT NOT NULL,
    avatar_url    VARCHAR(500) NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    INDEX idx_testimonials_tenant_order (tenant_id, display_order)
);
