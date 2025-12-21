-- Migration: Add branch manager fields
-- Created: 2025-12-18
-- Purpose: Store branch manager contact information

ALTER TABLE branches
ADD COLUMN IF NOT EXISTS branch_manager_name TEXT,
ADD COLUMN IF NOT EXISTS branch_manager_email TEXT,
ADD COLUMN IF NOT EXISTS branch_manager_phone TEXT;

-- Comments
COMMENT ON COLUMN branches.branch_manager_name IS 'Name of the branch manager';
COMMENT ON COLUMN branches.branch_manager_email IS 'Email address of the branch manager';
COMMENT ON COLUMN branches.branch_manager_phone IS 'Phone number of the branch manager';