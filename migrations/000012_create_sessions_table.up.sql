CREATE TABLE sessions (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token          VARCHAR(255) NOT NULL UNIQUE,
    admin_user_id  BIGINT UNSIGNED NOT NULL,
    tenant_id      BIGINT UNSIGNED NOT NULL,
    expires_at     TIMESTAMP NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    INDEX idx_sessions_token (token),
    INDEX idx_sessions_admin_user (admin_user_id)
);
