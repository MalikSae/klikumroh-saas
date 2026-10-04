-- IPs an affiliator registered or logged in from. A travel that signs up from one of these IPs is not
-- attributed to that affiliator (self-referral guard, keputusan pendiri 4 Okt 2026). Append-only: logging
-- out does not erase the history the guard relies on.
CREATE TABLE IF NOT EXISTS affiliator_logins (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    affiliator_id BIGINT UNSIGNED NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    logged_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_affiliator_logins_affiliator FOREIGN KEY (affiliator_id) REFERENCES affiliators (id) ON DELETE CASCADE,
    INDEX idx_affiliator_logins_lookup (affiliator_id, ip_address, logged_in_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
