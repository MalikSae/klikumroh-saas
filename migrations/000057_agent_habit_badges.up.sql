-- Habit tracker badges (3 Oct 2026): an agent earns a badge the first time their streak reaches 7, 30 or
-- 100 active days in a row. Kept once earned (a later broken streak does not take it back), shown on the
-- Kebiasaan page, the profile ID card and the leaderboard. One row per agent and milestone.
CREATE TABLE IF NOT EXISTS agent_habit_badges (
    tenant_id   BIGINT UNSIGNED NOT NULL,
    agent_id    BIGINT UNSIGNED NOT NULL,
    days        SMALLINT UNSIGNED NOT NULL,
    achieved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, agent_id, days),
    CONSTRAINT fk_ahb_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ahb_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
