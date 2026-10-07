-- Panduan rekrutmen agen (7 Okt 2026): centangan daftar periksa disimpan per travel, jadi seluruh tim travel
-- melihat progres yang sama di perangkat mana pun. Satu baris per butir yang dicentang; butir tanpa baris
-- berarti belum dicentang. item_id dibuat oleh dashboard dari urutan blok dan isi butir (contoh "3:k2j9x").
CREATE TABLE IF NOT EXISTS playbook_checks (
    tenant_id  BIGINT UNSIGNED NOT NULL,
    page_slug  VARCHAR(64) NOT NULL,
    item_id    VARCHAR(24) NOT NULL,
    checked_by BIGINT UNSIGNED NULL,
    checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, page_slug, item_id),
    CONSTRAINT fk_pbc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_pbc_user FOREIGN KEY (checked_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
