UPDATE tenants SET whatsapp_number = CONCAT('62', SUBSTRING(whatsapp_number, 2)) WHERE whatsapp_number LIKE '08%';
UPDATE tenants SET whatsapp_number = NULL WHERE whatsapp_number = '';

ALTER TABLE tenants ADD CONSTRAINT uq_tenants_whatsapp_number UNIQUE (whatsapp_number);
