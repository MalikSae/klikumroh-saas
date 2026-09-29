-- Reverse of 000043 up: shift Go-written TIMESTAMP columns back by the SYSTEM offset.
SET @sys_off = TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', 'SYSTEM'));

UPDATE sessions SET expires_at = expires_at - INTERVAL @sys_off SECOND WHERE expires_at IS NOT NULL;
UPDATE agent_sessions SET expires_at = expires_at - INTERVAL @sys_off SECOND WHERE expires_at IS NOT NULL;
UPDATE staff_sessions SET expires_at = expires_at - INTERVAL @sys_off SECOND WHERE expires_at IS NOT NULL;

UPDATE tenants
SET subscription_expires_at = subscription_expires_at - INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE subscription_expires_at IS NOT NULL;

UPDATE payment_verifications
SET reviewed_at = reviewed_at - INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE reviewed_at IS NOT NULL;

UPDATE commission_payout_requests
SET reviewed_at = reviewed_at - INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE reviewed_at IS NOT NULL;

UPDATE domains
SET verified_at = IF(verified_at IS NULL, NULL, verified_at - INTERVAL @sys_off SECOND),
    last_check_at = IF(last_check_at IS NULL, NULL, last_check_at - INTERVAL @sys_off SECOND),
    updated_at = updated_at
WHERE verified_at IS NOT NULL OR last_check_at IS NOT NULL;

UPDATE agents
SET terms_accepted_at = terms_accepted_at - INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE terms_accepted_at IS NOT NULL;

UPDATE agent_target_achievements
SET achieved_at = achieved_at - INTERVAL @sys_off SECOND, updated_at = updated_at
WHERE achieved_at IS NOT NULL;
