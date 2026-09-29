-- Audit finding #6: migration 000034 seeded placeholder contact/bank data that looks real
-- (WhatsApp 6281234567890, account 7123456789). Blank ONLY those exact placeholder values so the UI
-- hides WhatsApp buttons / bank details until the owner fills real values in Pengaturan super admin.
-- Values already changed by the owner are left untouched.
UPDATE platform_settings SET `value` = '' WHERE `key` = 'whatsapp_number' AND `value` = '6281234567890';
UPDATE platform_settings SET `value` = '' WHERE `key` = 'bank_name' AND `value` = 'Bank Syariah Indonesia (BSI)';
UPDATE platform_settings SET `value` = '' WHERE `key` = 'bank_account_number' AND `value` = '7123456789';
UPDATE platform_settings SET `value` = '' WHERE `key` = 'bank_account_holder' AND `value` = 'PT Klik Umroh Digital';
