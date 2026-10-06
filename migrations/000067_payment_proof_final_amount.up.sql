-- Keputusan pendiri 6 Okt 2026: bukti transfer tetap disimpan saat staf mengubah paket/kupon tagihan
-- (dibutuhkan untuk upsell), tetapi modal pembayaran staf memperingatkan bila total tagihan tidak lagi
-- sama dengan nominal saat bukti diunggah. Kolom ini menyimpan final_amount tagihan pada saat bukti
-- yang sekarang tersimpan; NULL bila tidak ada bukti.
ALTER TABLE payment_verifications
    ADD COLUMN proof_final_amount DECIMAL(15,2) NULL AFTER proof_url;

-- Backfill terbaik yang tersedia: nominal saat bukti diunggah tidak tercatat sebelumnya.
UPDATE payment_verifications
SET proof_final_amount = final_amount
WHERE proof_url IS NOT NULL AND proof_url <> '';
