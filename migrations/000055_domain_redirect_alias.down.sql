ALTER TABLE domains
    DROP FOREIGN KEY fk_domains_redirect_to,
    DROP INDEX idx_domains_redirect_to,
    DROP COLUMN redirect_to_domain_id;
