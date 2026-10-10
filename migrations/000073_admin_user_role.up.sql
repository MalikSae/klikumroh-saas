-- Team roles per travel: 'pic' (person in charge) manages subscription and team, 'admin' runs the
-- dashboard day to day. Existing members: the oldest account of each travel (its registrant) becomes PIC.
ALTER TABLE admin_users
    ADD COLUMN role ENUM('pic', 'admin') NOT NULL DEFAULT 'admin' AFTER status;

UPDATE admin_users au
JOIN (SELECT tenant_id, MIN(id) AS first_id FROM admin_users GROUP BY tenant_id) f
    ON f.first_id = au.id
SET au.role = 'pic';
