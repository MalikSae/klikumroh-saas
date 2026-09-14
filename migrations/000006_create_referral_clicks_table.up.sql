CREATE TABLE referral_clicks (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id    BIGINT UNSIGNED NOT NULL,
    agent_id     BIGINT UNSIGNED NOT NULL,
    prospect_id  BIGINT UNSIGNED NULL,
    clicked_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address   VARCHAR(45) NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (prospect_id) REFERENCES prospects(id),
    INDEX idx_refclicks_tenant (tenant_id),
    INDEX idx_refclicks_agent (agent_id),
    INDEX idx_refclicks_clicked_at (clicked_at)
);
