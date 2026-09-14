ALTER TABLE tenants
    ADD COLUMN city VARCHAR(100) NULL AFTER address,
    ADD COLUMN province VARCHAR(100) NULL AFTER city,
    ADD COLUMN meta_title VARCHAR(255) NULL AFTER social_youtube,
    ADD COLUMN meta_description VARCHAR(500) NULL AFTER meta_title,
    ADD COLUMN meta_keywords VARCHAR(255) NULL AFTER meta_description,
    ADD COLUMN og_image_url VARCHAR(500) NULL AFTER meta_keywords;
