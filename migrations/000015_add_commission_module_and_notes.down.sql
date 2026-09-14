DROP TABLE IF EXISTS prospect_notes;
DROP TABLE IF EXISTS prospect_status_history;
DROP TABLE IF EXISTS commission_ledger;

ALTER TABLE agents
DROP FOREIGN KEY fk_agents_parent,
DROP COLUMN parent_agent_id;

ALTER TABLE tenants
DROP COLUMN commission_override_percentage,
DROP COLUMN commission_override_enabled;

ALTER TABLE packages
DROP COLUMN commission_amount;
