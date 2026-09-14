CREATE TABLE promo_tips (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id   BIGINT UNSIGNED NULL,
    title       VARCHAR(255) NOT NULL,
    content     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_promotips_tenant (tenant_id)
);
