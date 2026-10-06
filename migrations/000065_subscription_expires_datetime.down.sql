-- Gagal bila ada masa aktif setelah 2038-01-19 (di luar jangkauan TIMESTAMP).
ALTER TABLE tenants
    MODIFY COLUMN subscription_expires_at TIMESTAMP NULL;
