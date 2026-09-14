ALTER TABLE agents
  ADD COLUMN bank_name VARCHAR(100) NULL AFTER terms_accepted_at,
  ADD COLUMN bank_account_number VARCHAR(50) NULL AFTER bank_name,
  ADD COLUMN bank_account_holder VARCHAR(150) NULL AFTER bank_account_number;

CREATE TABLE commission_payout_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  agent_id BIGINT UNSIGNED NOT NULL,
  amount_requested DECIMAL(15,2) NOT NULL,
  status ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
  bank_name_snapshot VARCHAR(100) NOT NULL,
  bank_account_number_snapshot VARCHAR(50) NOT NULL,
  bank_account_holder_snapshot VARCHAR(150) NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payout_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_payout_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  CONSTRAINT fk_payout_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  INDEX idx_payout_tenant (tenant_id),
  INDEX idx_payout_agent (agent_id),
  INDEX idx_payout_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
