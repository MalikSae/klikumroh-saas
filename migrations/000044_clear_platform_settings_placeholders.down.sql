-- Restore the 000034 placeholders only where the value is still empty.
UPDATE platform_settings SET `value` = '6281234567890' WHERE `key` = 'whatsapp_number' AND `value` = '';
UPDATE platform_settings SET `value` = 'Bank Syariah Indonesia (BSI)' WHERE `key` = 'bank_name' AND `value` = '';
UPDATE platform_settings SET `value` = '7123456789' WHERE `key` = 'bank_account_number' AND `value` = '';
UPDATE platform_settings SET `value` = 'PT Klik Umroh Digital' WHERE `key` = 'bank_account_holder' AND `value` = '';
