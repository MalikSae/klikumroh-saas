ALTER TABLE tenants MODIFY COLUMN status ENUM('trial','active','suspended','churned') NOT NULL DEFAULT 'trial';
