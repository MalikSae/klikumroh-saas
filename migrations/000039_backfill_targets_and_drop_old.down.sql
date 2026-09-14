-- CATATAN IRREVERSIBEL (AGENTS.md 5.1):
-- Data target lama yang sudah dipindahkan ke agent_targets dan kolomnya di-drop
-- tidak dapat dipulihkan secara otomatis.
-- Down-migration ini hanya mengembalikan struktur kolom nullable yang kosong.
ALTER TABLE tenants
    ADD COLUMN target_period_start DATE NULL,
    ADD COLUMN target_period_end DATE NULL,
    ADD COLUMN target_jamaah INT NULL;

