-- Promo harga paket langganan (keputusan pendiri 7 Okt 2026): persen potongan per paket, opsional sampai
-- tanggal tertentu (inklusif, WIB; NULL = tanpa batas). Hanya untuk pembayaran pertama travel baru;
-- perpanjangan tetap harga normal. Kupon (termasuk kupon affiliator) dihitung dari harga setelah promo.
ALTER TABLE pricing_plans
    ADD COLUMN promo_percent DECIMAL(5,2) NULL AFTER is_public,
    ADD COLUMN promo_ends_at DATE NULL AFTER promo_percent;

-- Persen promo yang dipakai sebuah tagihan saat dibuat (snapshot): amount tetap harga normal paket,
-- final_amount = harga setelah promo, lalu kupon, lalu kode unik. Tagihan tetap sah walau promo
-- paketnya kemudian diubah atau berakhir.
ALTER TABLE payment_verifications
    ADD COLUMN promo_percent DECIMAL(5,2) NULL AFTER coupon_code;
