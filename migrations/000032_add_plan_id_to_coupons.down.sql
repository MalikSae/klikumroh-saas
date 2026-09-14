ALTER TABLE coupons DROP FOREIGN KEY fk_coupons_plan;
ALTER TABLE coupons DROP INDEX idx_coupons_plan;
ALTER TABLE coupons DROP COLUMN plan_id;
