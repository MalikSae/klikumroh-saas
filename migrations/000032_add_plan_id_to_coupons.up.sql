ALTER TABLE coupons ADD COLUMN plan_id BIGINT UNSIGNED NULL AFTER discount_percentage;
ALTER TABLE coupons ADD CONSTRAINT fk_coupons_plan FOREIGN KEY (plan_id) REFERENCES pricing_plans (id) ON DELETE SET NULL;
ALTER TABLE coupons ADD INDEX idx_coupons_plan (plan_id);
