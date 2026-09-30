-- D4: consecutive failed DNS checks of an active custom domain (daily recheck + manual check).
-- A single failure no longer takes an active domain offline; after 3 failures in a row the
-- default subdomain stops redirecting to it, and one successful check resets the counter.
ALTER TABLE domains ADD COLUMN check_failures INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_check_at;
