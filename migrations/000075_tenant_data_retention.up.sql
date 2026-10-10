-- Data retention (founder decision 10 Oct 2026): a travel that stays unrenewed 90 days after its
-- suspension has its operational data removed. The tenant row, invoices, coupon redemptions, affiliator
-- commissions and staff access logs stay (bookkeeping / audit). These columns record the two warnings
-- (14 and 3 days before) and when the purge ran, so each step happens once per expiry.
ALTER TABLE tenants
    ADD COLUMN purge_warned_14_at DATETIME NULL AFTER subscription_expires_at,
    ADD COLUMN purge_warned_3_at DATETIME NULL AFTER purge_warned_14_at,
    ADD COLUMN data_purged_at DATETIME NULL AFTER purge_warned_3_at;
