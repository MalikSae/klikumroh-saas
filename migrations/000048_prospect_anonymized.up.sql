-- UU PDP 27/2022 right to erasure (keputusan pendiri, 29 Sep 2026):
-- a prospect with commission history cannot be deleted, so its personal data is removed instead
-- ("anonimkan"). anonymized_at records when that happened; the row itself stays for the commission trail.
ALTER TABLE prospects
    ADD COLUMN anonymized_at TIMESTAMP NULL AFTER paid_off_at;
