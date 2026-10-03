-- Demo travel (3 Oct 2026): demo.klikumroh.id is a normal tenant marked is_demo = 1. Its data is rebuilt
-- every night by `go run ./cmd/seed-demo --reset`; while the flag is set the app turns off what must not
-- happen for a showcase account (WhatsApp redirect, Meta events, account and domain changes) and shows a
-- "demo" ribbon. Only the seeder sets this flag.
ALTER TABLE tenants ADD COLUMN is_demo TINYINT(1) NOT NULL DEFAULT 0;
