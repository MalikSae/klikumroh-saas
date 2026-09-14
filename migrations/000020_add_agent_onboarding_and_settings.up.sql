ALTER TABLE agents
    MODIFY COLUMN status ENUM('pending','active','inactive','rejected') NOT NULL DEFAULT 'pending',
    ADD COLUMN password_hash VARCHAR(255) NULL AFTER email,
    ADD COLUMN domisili VARCHAR(150) NULL AFTER password_hash,
    ADD COLUMN payment_proof_url VARCHAR(500) NULL AFTER domisili,
    ADD COLUMN payment_status ENUM('not_applicable','awaiting_proof','pending_verification','verified') NOT NULL DEFAULT 'not_applicable' AFTER payment_proof_url,
    ADD COLUMN terms_accepted_at TIMESTAMP NULL AFTER payment_status,
    ADD UNIQUE INDEX unique_tenant_email (tenant_id, email),
    ADD UNIQUE INDEX unique_tenant_phone (tenant_id, phone);

CREATE TABLE agent_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    agent_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    INDEX idx_agent_sessions_agent (agent_id)
);

ALTER TABLE tenants
    ADD COLUMN agent_registration_fee DECIMAL(15,2) NULL,
    ADD COLUMN agent_registration_benefits TEXT NULL,
    ADD COLUMN agent_bank_name VARCHAR(100) NULL,
    ADD COLUMN agent_bank_account_number VARCHAR(50) NULL,
    ADD COLUMN agent_bank_account_holder VARCHAR(150) NULL,
    ADD COLUMN agent_terms_conditions TEXT NULL,
    ADD COLUMN minimum_payout_amount DECIMAL(15,2) NULL;
