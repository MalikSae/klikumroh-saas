UPDATE tenants SET status = 'active' WHERE status NOT IN ('active', 'inactive', 'pending');
ALTER TABLE tenants MODIFY COLUMN status ENUM('pending','active','inactive') NOT NULL DEFAULT 'active';
