ALTER TABLE domains
ADD COLUMN verification_failure_reason TEXT NULL AFTER status;
