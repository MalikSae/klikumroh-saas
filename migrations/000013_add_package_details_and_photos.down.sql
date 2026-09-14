DROP TABLE IF EXISTS package_photos;

ALTER TABLE packages
DROP COLUMN itinerary,
DROP COLUMN facilities_included,
DROP COLUMN facilities_excluded,
DROP COLUMN hotel_info,
DROP COLUMN flight_info,
DROP COLUMN terms_conditions;
