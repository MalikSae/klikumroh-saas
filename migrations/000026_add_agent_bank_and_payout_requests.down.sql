DROP TABLE IF EXISTS commission_payout_requests;

ALTER TABLE agents
  DROP COLUMN bank_account_holder,
  DROP COLUMN bank_account_number,
  DROP COLUMN bank_name;
