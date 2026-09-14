CREATE TABLE tenants (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    slug                VARCHAR(100) NOT NULL UNIQUE,
    status              ENUM('trial','active','suspended','churned') NOT NULL DEFAULT 'trial',
    commission_scheme   ENUM('flat','override_one_tier') NOT NULL DEFAULT 'flat',
    coupon_expires_at   DATE NULL,
    brand_primary_color VARCHAR(7) NULL,
    brand_logo_url      VARCHAR(500) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
