-- Peran staf untuk badge OWNER / ADMIN di sidebar super admin (keputusan pendiri 6 Okt 2026).
-- Hanya tampilan: peran tidak memberi izin tambahan, dan API tidak bisa mengubahnya. Staf baru selalu 'admin'.
ALTER TABLE staff_users
    ADD COLUMN role ENUM('owner', 'admin') NOT NULL DEFAULT 'admin' AFTER status;

-- Akun staf pertama (id terkecil) adalah akun pendiri.
UPDATE staff_users SET role = 'owner'
WHERE id = (SELECT min_id FROM (SELECT MIN(id) AS min_id FROM staff_users) AS first_staff);
