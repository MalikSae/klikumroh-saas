-- Pindahkan target lama (single) menjadi target baru (metric closing_pax)
INSERT INTO agent_targets
    (tenant_id, title, metric_type, metric_value, reward_description,
     period_start, period_end, status, created_at, updated_at)
SELECT id, 'Target Closing Jamaah', 'closing_pax', target_jamaah, NULL,
       target_period_start, target_period_end, 'active', NOW(), NOW()
FROM tenants
WHERE target_jamaah IS NOT NULL
  AND target_period_start IS NOT NULL
  AND target_period_end IS NOT NULL;

ALTER TABLE tenants
    DROP COLUMN target_period_start,
    DROP COLUMN target_period_end,
    DROP COLUMN target_jamaah;

