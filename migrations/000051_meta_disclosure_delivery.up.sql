-- N1: data is sent to Meta only for a jamaah whose consent text mentioned Meta (shown when the travel's
-- pixel is active). meta_disclosed_at records when that consent was given.
ALTER TABLE prospects
    ADD COLUMN meta_disclosed_at TIMESTAMP NULL AFTER meta_purchase_sent_at;

-- N2: delivery status of the travel's Conversions API events, shown in the dashboard so an expired or
-- revoked token does not silently cost the travel its ad conversions.
ALTER TABLE tenants
    ADD COLUMN meta_last_success_at TIMESTAMP NULL,
    ADD COLUMN meta_last_error VARCHAR(500) NULL,
    ADD COLUMN meta_last_error_at TIMESTAMP NULL;
