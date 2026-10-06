-- Bug hunt putaran 5: TIMESTAMP berakhir 2038-01-19, sedangkan masa aktif langganan bisa menumpuk
-- (perpanjangan manual 120 bulan, bayar di muka) melewati batas itu, lalu setiap approve/perubahan manual
-- untuk travel tersebut gagal. DATETIME berlaku sampai 9999. Runner migrasi memakai time_zone +07:00
-- (repository.MySQLDSN), sama seperti API, jadi nilai lama dikonversi ke jam WIB yang sama persis.
ALTER TABLE tenants
    MODIFY COLUMN subscription_expires_at DATETIME NULL;
