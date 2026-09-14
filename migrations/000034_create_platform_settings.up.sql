CREATE TABLE IF NOT EXISTS platform_settings (
    `key` VARCHAR(64) PRIMARY KEY,
    `value` TEXT NOT NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO platform_settings (`key`, `value`) VALUES
('whatsapp_number', '6281234567890'),
('bank_name', 'Bank Syariah Indonesia (BSI)'),
('bank_account_number', '7123456789'),
('bank_account_holder', 'PT Klik Umroh Digital')
ON DUPLICATE KEY UPDATE `key` = `key`;
