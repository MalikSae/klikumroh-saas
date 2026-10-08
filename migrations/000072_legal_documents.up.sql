-- Syarat & Ketentuan and Kebijakan Privasi of the platform, written by staff and shown on the public site.
-- A draft is edited freely; publishing copies it to published_* (what visitors see), so an edit never reaches
-- the public page until it is published again. Two fixed rows, one per public slug.
CREATE TABLE IF NOT EXISTS legal_documents (
    slug VARCHAR(40) NOT NULL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    draft_content MEDIUMTEXT NOT NULL,
    published_title VARCHAR(150) NULL,
    published_content MEDIUMTEXT NULL,
    published_at DATETIME NULL,
    updated_by BIGINT UNSIGNED NULL,
    published_by BIGINT UNSIGNED NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO legal_documents (slug, title, draft_content) VALUES
    ('syarat-ketentuan', 'Syarat & Ketentuan', ''),
    ('kebijakan-privasi', 'Kebijakan Privasi', '')
ON DUPLICATE KEY UPDATE slug = slug;
