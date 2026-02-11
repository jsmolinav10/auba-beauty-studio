-- Migration: Fix schema bugs (BUG-07, BUG-08)
-- BUG-07: Expand bookings status ENUM to include all states used by the app
-- BUG-08: Add payment_status and payment_ref columns for ePayco integration

USE auba_studio;

-- BUG-07: Update the status ENUM to include all states
ALTER TABLE bookings 
MODIFY COLUMN status ENUM('pending','confirmed','in_progress','completed','cancelled','no_show') DEFAULT 'pending';

-- BUG-08: Add payment columns
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(100) DEFAULT NULL;

-- Verify
SELECT 'Schema updated successfully' as info;
DESCRIBE bookings;
