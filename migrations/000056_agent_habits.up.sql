-- Agent habit tracker (2 Oct 2026). Five fixed daily habits per agent; a day is "active" with 3 of 5.
-- agent_habit_logs keeps the habits the portal reports (share, contact via WhatsApp, caption, sumber);
-- contact by status change and notes are read from prospect_status_history / prospect_notes instead.
-- One row per agent, habit and day (log_date is the business day in WIB, set by the server).
CREATE TABLE IF NOT EXISTS agent_habit_logs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id  BIGINT UNSIGNED NOT NULL,
    agent_id   BIGINT UNSIGNED NOT NULL,
    habit_key  VARCHAR(20) NOT NULL,
    log_date   DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ahl_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ahl_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_ahl_agent_habit_day (tenant_id, agent_id, habit_key, log_date),
    INDEX idx_ahl_agent_day (tenant_id, agent_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "99 sumber jamaah" progress, moved from the agent's browser to the server (survives a new phone and
-- can be shown to the travel later). sumber_id is the id in web/data/sumber-jamaah.json.
CREATE TABLE IF NOT EXISTS agent_sumber_progress (
    tenant_id  BIGINT UNSIGNED NOT NULL,
    agent_id   BIGINT UNSIGNED NOT NULL,
    sumber_id  SMALLINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, agent_id, sumber_id),
    CONSTRAINT fk_asp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_asp_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
