-- Meta Purchase is reported once per prospect: a closing that is cancelled and closed again must not
-- count twice in the travel's ad reports (Meta cannot retract an event).
ALTER TABLE prospects
    ADD COLUMN meta_purchase_sent_at TIMESTAMP NULL AFTER meta_fbc;
