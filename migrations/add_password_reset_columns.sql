-- Migration script for password recovery feature
-- Run this in MySQL to add the required columns

USE auba_studio;

-- Add password reset token column
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS token_expiry DATETIME NULL;

-- Add data consent columns (for Colombian Ley 1581 compliance)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS data_consent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS consent_date DATETIME NULL;

-- Verify columns were added
DESCRIBE users;
