ALTER TABLE prospect_status_history
    DROP INDEX idx_psh_tenant_status_changed;

DROP TABLE IF EXISTS agent_target_achievements;
DROP TABLE IF EXISTS agent_targets;

