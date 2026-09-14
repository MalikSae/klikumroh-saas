-- 1. Create staff_users table (global, no tenant_id)
CREATE TABLE IF NOT EXISTS staff_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create staff_sessions table
CREATE TABLE IF NOT EXISTS staff_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    staff_user_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create pricing_plans table (platform data, no tenant_id)
CREATE TABLE IF NOT EXISTS pricing_plans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    period_months INT NOT NULL,
    price DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Update tenants table
ALTER TABLE tenants
    DROP COLUMN coupon_expires_at,
    ADD COLUMN current_plan_id BIGINT UNSIGNED NULL AFTER commission_scheme,
    ADD COLUMN subscription_expires_at TIMESTAMP NULL AFTER current_plan_id,
    ADD CONSTRAINT fk_tenants_current_plan FOREIGN KEY (current_plan_id) REFERENCES pricing_plans(id) ON DELETE SET NULL;
