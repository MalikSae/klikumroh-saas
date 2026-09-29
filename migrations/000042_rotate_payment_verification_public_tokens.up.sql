-- Security: every public_token was exposed through the numeric-ID fallback on
-- /api/public/tenant-signup/{id}/status (removed in the same change). Legacy rows also
-- used 32-char MD5(RAND()) tokens. Rotate ALL tokens to 64-char hex from a CSPRNG.
-- Travels still pending can recover their new link by logging in (login returns public_token).
UPDATE payment_verifications
SET public_token = LOWER(HEX(RANDOM_BYTES(32)));
