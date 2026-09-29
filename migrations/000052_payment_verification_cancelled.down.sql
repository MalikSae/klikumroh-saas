-- Cancelled invoices fall back to 'rejected' (the closest meaning) before the value is removed.
UPDATE payment_verifications SET status = 'rejected' WHERE status = 'cancelled';
ALTER TABLE payment_verifications
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending';
