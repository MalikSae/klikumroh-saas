-- Timezone fix (audit finding #3).
-- Before this change the DSN had no time_zone/loc: the MySQL session ran in SYSTEM tz while the Go
-- driver sent time.Time values as UTC wall clock. MySQL interpreted those UTC wall values as SYSTEM
-- local time, so every TIMESTAMP written from Go was stored too early by the SYSTEM UTC offset.
-- From now on the DSN pins time_zone='+07:00' and loc=Asia/Jakarta (repository.MySQLDSN), so this
-- migration shifts ONLY the Go-written TIMESTAMP columns forward by the SYSTEM offset to restore the
-- real instant. Columns filled by CURRENT_TIMESTAMP/NOW() in SQL were already correct and are untouched.
-- On a server whose SYSTEM tz is UTC the offset is 0 and this migration is a no-op.
-- `updated_at = updated_at` keeps ON UPDATE CURRENT_TIMESTAMP columns from being bumped.

SET @sys_off = TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', 'SYSTEM'));

UPDATE sessions SET expires_at = expires_at + INTERVAL @sys_off SECOND WHERE expires_at IS NOT NULL;
UPDATE agent_sessions SET expires_at = expires_at + INTERVAL @sys_off SECOND WHERE expires_at IS NOT NULL;
UPDATE staff_sessions SET expires_at = expires_at + INTERVAL @sys_off SECOND WHERE expires_at IS NOT NULL;

UPDATE tenants
SET subscription_expires_at = subscription_expires_at + INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE subscription_expires_at IS NOT NULL;

UPDATE payment_verifications
SET reviewed_at = reviewed_at + INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE reviewed_at IS NOT NULL;

UPDATE commission_payout_requests
SET reviewed_at = reviewed_at + INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE reviewed_at IS NOT NULL;

UPDATE domains
SET verified_at = IF(verified_at IS NULL, NULL, verified_at + INTERVAL @sys_off SECOND),
    last_check_at = IF(last_check_at IS NULL, NULL, last_check_at + INTERVAL @sys_off SECOND),
    updated_at = updated_at
WHERE verified_at IS NOT NULL OR last_check_at IS NOT NULL;

UPDATE agents
SET terms_accepted_at = terms_accepted_at + INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE terms_accepted_at IS NOT NULL;

UPDATE agent_target_achievements
SET achieved_at = achieved_at + INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE achieved_at IS NOT NULL;
