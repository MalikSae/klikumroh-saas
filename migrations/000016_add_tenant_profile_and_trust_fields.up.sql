ALTER TABLE tenants
    ADD COLUMN tagline VARCHAR(255) NULL AFTER whatsapp_number,
    ADD COLUMN about_summary TEXT NULL AFTER tagline,
    ADD COLUMN ppiu_number VARCHAR(100) NULL AFTER about_summary,
    ADD COLUMN address TEXT NULL AFTER ppiu_number,
    ADD COLUMN phone VARCHAR(30) NULL AFTER address,
    ADD COLUMN email VARCHAR(255) NULL AFTER phone,
    ADD COLUMN trust_rating VARCHAR(10) NULL DEFAULT '4.9' AFTER email,
    ADD COLUMN trust_alumni_count VARCHAR(50) NULL DEFAULT '1.000+' AFTER trust_rating,
    ADD COLUMN trust_guarantee VARCHAR(100) NULL DEFAULT '100% Berangkat, Jadwal Pasti' AFTER trust_alumni_count,
    ADD COLUMN social_instagram VARCHAR(255) NULL AFTER trust_guarantee,
    ADD COLUMN social_facebook VARCHAR(255) NULL AFTER social_instagram,
    ADD COLUMN social_youtube VARCHAR(255) NULL AFTER social_facebook;
