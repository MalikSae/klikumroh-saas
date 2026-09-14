ALTER TABLE payment_verifications
    ADD COLUMN unique_code INT NOT NULL DEFAULT 0 AFTER final_amount;

