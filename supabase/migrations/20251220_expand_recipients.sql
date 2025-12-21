-- Migration: Expand recipient fields for full contact information
-- Created: 2025-12-20
-- Purpose: Add detailed contact fields to branch_schedule_recipients

-- Add new columns
ALTER TABLE branch_schedule_recipients
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Migrate existing 'name' data to first_name (if any exists)
UPDATE branch_schedule_recipients
SET first_name = name
WHERE name IS NOT NULL AND first_name IS NULL;

-- Drop the old 'name' column (replaced by first_name/last_name)
ALTER TABLE branch_schedule_recipients DROP COLUMN IF EXISTS name;

-- Comments on new columns
COMMENT ON COLUMN branch_schedule_recipients.first_name IS 'Recipient first name (optional)';
COMMENT ON COLUMN branch_schedule_recipients.last_name IS 'Recipient last name (optional)';
COMMENT ON COLUMN branch_schedule_recipients.phone IS 'Contact phone with optional extension, format: (1234) 567-8901 ext 12345';
COMMENT ON COLUMN branch_schedule_recipients.address IS 'Street address (optional)';
COMMENT ON COLUMN branch_schedule_recipients.city IS 'City (optional)';
COMMENT ON COLUMN branch_schedule_recipients.state IS 'State abbreviation (optional)';
COMMENT ON COLUMN branch_schedule_recipients.zip_code IS 'ZIP code, format: 12345 or 12345-6789 (optional)';



