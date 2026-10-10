-- People who open the demo dashboard (10 Oct 2026). The demo asks for a short form first, so staff know who
-- tried it and can follow up. Platform level, not tied to a travel. One row per WhatsApp number: opening
-- the demo again updates the row and counts the visit.
CREATE TABLE IF NOT EXISTS demo_leads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    travel_name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    source VARCHAR(160) NULL,
    consent_at DATETIME NOT NULL,
    visit_count INT UNSIGNED NOT NULL DEFAULT 1,
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_demo_leads_phone (phone),
    KEY idx_demo_leads_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
