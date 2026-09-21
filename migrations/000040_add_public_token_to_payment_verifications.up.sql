ALTER TABLE payment_verifications
ADD COLUMN public_token VARCHAR(64) NULL AFTER tenant_id;

UPDATE payment_verifications
SET public_token = MD5(CONCAT(id, RAND(), UNIX_TIMESTAMP()))
WHERE public_token IS NULL OR public_token = '';

ALTER TABLE payment_verifications
MODIFY COLUMN public_token VARCHAR(64) NOT NULL;

CREATE UNIQUE INDEX idx_pv_public_token ON payment_verifications (public_token);
