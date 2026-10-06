-- Bug hunt putaran 5: hanya pemeriksaan DNS harian (job) yang menambah check_failures, dan paling banyak
-- sekali per ~hari meski API sering di-restart (job jalan sebentar setelah start). Klik "Verifikasi"
-- manual tidak mengubah kolom ini.
ALTER TABLE domains
    ADD COLUMN daily_check_at DATETIME NULL AFTER check_failures;
