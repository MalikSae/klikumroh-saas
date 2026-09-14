ALTER TABLE packages
ADD COLUMN commission_amount DECIMAL(15,2) NULL;

ALTER TABLE tenants
ADD COLUMN commission_override_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN commission_override_percentage DECIMAL(5,2) NULL;

ALTER TABLE agents
ADD COLUMN parent_agent_id BIGINT UNSIGNED NULL,
ADD CONSTRAINT fk_agents_parent FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL;

CREATE TABLE commission_ledger (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    agent_id BIGINT UNSIGNED NOT NULL,
    prospect_id BIGINT UNSIGNED NOT NULL,
    package_id BIGINT UNSIGNED NULL,
    type ENUM('direct', 'override', 'correction') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_agent_id (agent_id),
    INDEX idx_prospect_id (prospect_id)
);

CREATE TABLE prospect_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    prospect_id BIGINT UNSIGNED NOT NULL,
    changed_by_type ENUM('admin', 'agent') NOT NULL,
    changed_by_id BIGINT UNSIGNED NOT NULL,
    old_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_prospect_id (prospect_id)
);

CREATE TABLE prospect_notes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    prospect_id BIGINT UNSIGNED NOT NULL,
    author_type ENUM('admin', 'agent') NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_prospect_id (prospect_id)
);
