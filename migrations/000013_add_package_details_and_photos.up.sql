ALTER TABLE packages 
ADD COLUMN itinerary TEXT,
ADD COLUMN facilities_included TEXT,
ADD COLUMN facilities_excluded TEXT,
ADD COLUMN hotel_info TEXT,
ADD COLUMN flight_info TEXT,
ADD COLUMN terms_conditions TEXT;

CREATE TABLE package_photos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    package_id BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_package_id (package_id)
);
