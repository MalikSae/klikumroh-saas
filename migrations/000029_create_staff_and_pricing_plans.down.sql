ALTER TABLE tenants
    DROP FOREIGN KEY fk_tenants_current_plan,
    DROP COLUMN current_plan_id,
    DROP COLUMN subscription_expires_at,
    ADD COLUMN coupon_expires_at DATE NULL AFTER commission_scheme;

DROP TABLE IF EXISTS pricing_plans;
DROP TABLE IF EXISTS staff_sessions;
DROP TABLE IF EXISTS staff_users;
