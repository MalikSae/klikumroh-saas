CREATE TABLE IF NOT EXISTS agent_targets (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id          BIGINT UNSIGNED NOT NULL,
    title              VARCHAR(150) NULL,
    metric_type        ENUM('closing_pax','mitra_baru_count') NOT NULL,
    metric_value       INT NOT NULL,
    reward_description TEXT NULL,
    period_start       DATE NOT NULL,
    period_end         DATE NOT NULL,
    status             ENUM('active','closed') NOT NULL DEFAULT 'active',
    created_by         BIGINT UNSIGNED NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_agent_targets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_targets_creator FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_agent_targets_tenant_status (tenant_id, status),
    INDEX idx_agent_targets_period (tenant_id, period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_target_achievements (
    id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id                   BIGINT UNSIGNED NOT NULL,
    target_id                   BIGINT UNSIGNED NOT NULL,
    agent_id                    BIGINT UNSIGNED NOT NULL,
    achieved_value              INT NOT NULL,
    achieved_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reward_status               ENUM('pending','given') NOT NULL DEFAULT 'pending',
    reward_given_at             TIMESTAMP NULL,
    reward_given_by             BIGINT UNSIGNED NULL,
    reward_description_snapshot TEXT NULL,
    notes                       TEXT NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ata_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ata_target FOREIGN KEY (target_id) REFERENCES agent_targets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ata_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_ata_giver FOREIGN KEY (reward_given_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    UNIQUE KEY uniq_target_agent (target_id, agent_id),
    INDEX idx_ata_tenant_target (tenant_id, target_id),
    INDEX idx_ata_agent (tenant_id, agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perbaikan performa: index untuk query progres target (dihindari pembungkus DATE() pada kolom changed_at).
ALTER TABLE prospect_status_history
    ADD INDEX idx_psh_tenant_status_changed (tenant_id, new_status, changed_at);
