DROP INDEX idx_pv_public_token ON payment_verifications;
ALTER TABLE payment_verifications DROP COLUMN public_token;
