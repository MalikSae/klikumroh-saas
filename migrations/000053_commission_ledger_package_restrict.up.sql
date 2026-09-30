-- K0: deleting a package must never delete agents' commission history. The ledger kept
-- ON DELETE CASCADE on package_id, so once a closed prospect moved to another package the old package
-- could be deleted and its commission entries went with it. RESTRICT blocks such a delete instead
-- (the package can still be archived).
ALTER TABLE commission_ledger DROP FOREIGN KEY commission_ledger_ibfk_4;
ALTER TABLE commission_ledger
    ADD CONSTRAINT fk_commission_ledger_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT;
