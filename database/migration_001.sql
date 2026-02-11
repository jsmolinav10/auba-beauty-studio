-- Migration Script: Adding Time Support and Manicurist Authentication
-- Execute with: mysql -u root -p auba_studio < database/migration_001.sql
-- 
-- NOTE: Only run this if you already have the old schema without booking_time
-- If you're starting fresh, just run schema.sql instead.

USE auba_studio;

-- 1. Add booking_time column to bookings table (if not exists)
-- Check if column exists before adding
SET @column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'auba_studio' 
    AND TABLE_NAME = 'bookings' 
    AND COLUMN_NAME = 'booking_time'
);

SET @sql = IF(@column_exists = 0, 
    'ALTER TABLE bookings ADD COLUMN booking_time TIME NOT NULL DEFAULT ''09:00:00'' AFTER booking_date',
    'SELECT ''Column booking_time already exists'' as info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Add authentication fields to manicurists table (if not exist)
SET @phone_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'auba_studio' 
    AND TABLE_NAME = 'manicurists' 
    AND COLUMN_NAME = 'phone'
);

SET @sql = IF(@phone_exists = 0, 
    'ALTER TABLE manicurists ADD COLUMN phone VARCHAR(15) UNIQUE AFTER name',
    'SELECT ''Column phone already exists'' as info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pass_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'auba_studio' 
    AND TABLE_NAME = 'manicurists' 
    AND COLUMN_NAME = 'password'
);

SET @sql = IF(@pass_exists = 0, 
    'ALTER TABLE manicurists ADD COLUMN password VARCHAR(255) AFTER phone',
    'SELECT ''Column password already exists'' as info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Update existing manicurists with default credentials
-- Password: auba2026 (valid bcrypt hash)
UPDATE manicurists SET 
    phone = CASE id
        WHEN 1 THEN '3001234567'
        WHEN 2 THEN '3007654321'
        WHEN 3 THEN '3009876543'
        ELSE CONCAT('300', LPAD(id, 7, '0'))
    END,
    password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
WHERE phone IS NULL OR phone = '';

-- 4. Verify changes
SELECT '=== Migration Results ===' as Info;

SELECT 'Bookings table structure:' as Info;
DESCRIBE bookings;

SELECT 'Manicurists with credentials:' as Info;
SELECT id, name, phone, specialty, 
       CASE WHEN password IS NOT NULL AND password != '' THEN '✓ Set' ELSE '✗ Missing' END as password_status
FROM manicurists;
