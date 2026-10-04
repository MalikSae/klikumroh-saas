DELETE FROM platform_settings WHERE `key` IN (
    'affiliator_first_rate', 'affiliator_renewal_rate', 'affiliator_coupon_discount',
    'affiliator_hold_days', 'affiliator_min_payout'
);

DROP TABLE IF EXISTS affiliator_commissions;
DROP TABLE IF EXISTS affiliator_payouts;

ALTER TABLE coupons
    DROP FOREIGN KEY fk_coupons_affiliator,
    DROP INDEX idx_coupons_affiliator,
    DROP COLUMN affiliator_id;

ALTER TABLE tenants
    DROP FOREIGN KEY fk_tenants_affiliator,
    DROP INDEX idx_tenants_affiliator,
    DROP COLUMN affiliated_at,
    DROP COLUMN affiliator_source,
    DROP COLUMN affiliator_id;

DROP TABLE IF EXISTS affiliator_clicks;
DROP TABLE IF EXISTS affiliator_sessions;
DROP TABLE IF EXISTS affiliators;
