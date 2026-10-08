-- A WhatsApp number belongs to one affiliator (it is part of the self-referral guard). NULL (no number) stays allowed many times.
-- Fails if two affiliators already share a number: resolve those rows first (SELECT whatsapp, COUNT(*) FROM affiliators GROUP BY whatsapp HAVING COUNT(*) > 1).
ALTER TABLE affiliators ADD UNIQUE KEY uq_affiliators_whatsapp (whatsapp);
