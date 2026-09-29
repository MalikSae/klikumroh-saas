-- S1: an invoice still waiting for payment is cancelled when KlikUmroh staff activate or extend the
-- subscription manually, so the travel is not asked (or able) to pay twice. 'rejected' is not reused
-- because it tells the travel to fix and re-upload its proof.
ALTER TABLE payment_verifications
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending';
