ALTER TABLE tenants
    DROP COLUMN minimum_payout_amount,
    DROP COLUMN agent_terms_conditions,
    DROP COLUMN agent_bank_account_holder,
    DROP COLUMN agent_bank_account_number,
    DROP COLUMN agent_bank_name,
    DROP COLUMN agent_registration_benefits,
    DROP COLUMN agent_registration_fee;

DROP TABLE IF EXISTS agent_sessions;

ALTER TABLE agents
    DROP INDEX unique_tenant_phone,
    DROP INDEX unique_tenant_email,
    DROP COLUMN terms_accepted_at,
    DROP COLUMN payment_status,
    DROP COLUMN payment_proof_url,
    DROP COLUMN domisili,
    DROP COLUMN password_hash,
    MODIFY COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active';
