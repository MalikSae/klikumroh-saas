ALTER TABLE agents
    ADD COLUMN rejection_reason TEXT NULL AFTER payment_status;
