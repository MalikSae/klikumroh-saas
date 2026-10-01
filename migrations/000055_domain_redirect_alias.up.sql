-- A custom domain can be an alias of another custom domain of the same travel (e.g. namatravel.com ->
-- www.namatravel.com). Visitors of the alias are redirected (307) to the primary, path and query kept.
-- Deleting the primary deletes its aliases.
ALTER TABLE domains
    ADD COLUMN redirect_to_domain_id BIGINT UNSIGNED NULL AFTER status,
    ADD INDEX idx_domains_redirect_to (redirect_to_domain_id),
    ADD CONSTRAINT fk_domains_redirect_to FOREIGN KEY (redirect_to_domain_id) REFERENCES domains(id) ON DELETE CASCADE;
