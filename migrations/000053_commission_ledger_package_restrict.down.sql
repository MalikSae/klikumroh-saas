ALTER TABLE commission_ledger DROP FOREIGN KEY fk_commission_ledger_package;
ALTER TABLE commission_ledger
    ADD CONSTRAINT commission_ledger_ibfk_4 FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE;
