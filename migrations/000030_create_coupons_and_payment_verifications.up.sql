CREATE TABLE IF NOT EXISTS coupons (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_percentage DECIMAL(5,2) NOT NULL,
    max_uses INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    expires_at DATE NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_coupons_code (code),
    INDEX idx_coupons_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    coupon_id BIGINT UNSIGNED NOT NULL,
    tenant_id BIGINT UNSIGNED NOT NULL,
    redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_redemptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    INDEX idx_redemptions_tenant (tenant_id),
    INDEX idx_redemptions_coupon (coupon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_verifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    plan_id BIGINT UNSIGNED NOT NULL,
    coupon_code VARCHAR(50) NULL,
    amount DECIMAL(15,2) NOT NULL,
    final_amount DECIMAL(15,2) NOT NULL,
    proof_url VARCHAR(255) NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    rejection_reason TEXT NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_verifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_verifications_plan FOREIGN KEY (plan_id) REFERENCES pricing_plans (id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_verifications_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES staff_users (id) ON DELETE SET NULL,
    INDEX idx_pv_tenant (tenant_id),
    INDEX idx_pv_status (status),
    INDEX idx_pv_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
