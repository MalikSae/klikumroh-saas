-- Ad attribution of a travel's signup, for KlikUmroh's own Meta Pixel + Conversions API (14 Okt 2026).
-- * One row per travel, written once at signup (first write wins).
-- * fbp / fbc / fbclid / utm_*: what the browser brought from the ad click, so server-side Lead and
--   Purchase events can be matched to the same Meta user.
-- * lead_event_id: event ID shared by the browser Lead and the server Lead (Meta deduplicates them).
-- * purchase_event_sent_at: claimed once when the first payment is confirmed, so Purchase is never sent twice.
CREATE TABLE IF NOT EXISTS tenant_ad_attribution (
    tenant_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    fbp VARCHAR(255) NULL,
    fbc VARCHAR(255) NULL,
    fbclid VARCHAR(255) NULL,
    utm_source VARCHAR(120) NULL,
    utm_medium VARCHAR(120) NULL,
    utm_campaign VARCHAR(200) NULL,
    utm_content VARCHAR(200) NULL,
    utm_term VARCHAR(200) NULL,
    event_source_url VARCHAR(500) NULL,
    client_ip VARCHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    lead_event_id VARCHAR(64) NULL,
    purchase_event_sent_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tenant_ad_attribution_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
