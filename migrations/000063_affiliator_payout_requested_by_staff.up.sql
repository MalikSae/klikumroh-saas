-- Jejak pencairan affiliator yang diajukan staf atas nama affiliator (keputusan pendiri 6 Okt 2026).
-- NULL = diajukan affiliator sendiri dari portal.
ALTER TABLE affiliator_payouts
    ADD COLUMN requested_by_staff_id BIGINT UNSIGNED NULL AFTER bank_account_holder,
    ADD INDEX idx_affiliator_payouts_requested_by_staff (requested_by_staff_id),
    ADD CONSTRAINT fk_affiliator_payouts_requested_by_staff FOREIGN KEY (requested_by_staff_id) REFERENCES staff_users (id) ON DELETE SET NULL;
