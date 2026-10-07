-- Keputusan pendiri 7 Okt 2026: agen dapat mengajukan bukti pembayaran jamaah untuk diverifikasi admin
-- travel. kind 'closing' = bukti DP (disetujui -> prospek Closing, komisi dibukukan); kind 'paid_off' =
-- bukti pelunasan (disetujui -> prospek ditandai lunas, komisi tertahan dilepas). Bukan status pipeline baru:
-- prospek tetap di statusnya sampai admin menyetujui. Admin tetap bisa closing/menandai lunas langsung
-- (jamaah datang ke kantor); pengajuan yang masih menunggu lalu ikut dianggap selesai.
CREATE TABLE IF NOT EXISTS prospect_payment_requests (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id        BIGINT UNSIGNED NOT NULL,
    prospect_id      BIGINT UNSIGNED NOT NULL,
    agent_id         BIGINT UNSIGNED NOT NULL,
    kind             ENUM('closing','paid_off') NOT NULL,
    proof_url        VARCHAR(512) NOT NULL,
    amount           DECIMAL(15,2) NULL,
    note             VARCHAR(500) NULL,
    status           ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    rejection_reason VARCHAR(255) NULL,
    reviewed_by      BIGINT UNSIGNED NULL,
    reviewed_at      TIMESTAMP NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ppr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_ppr_prospect FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE,
    CONSTRAINT fk_ppr_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_ppr_reviewer FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_ppr_tenant_status (tenant_id, status),
    INDEX idx_ppr_tenant_prospect (tenant_id, prospect_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
