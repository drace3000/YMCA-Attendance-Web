-- Migration: Add branch email configuration and auxiliary recipients
-- Created: 2025-12-18
-- Purpose: Support schedule email distribution feature

-- Add email config columns to branches table
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS schedule_email_from TEXT,
ADD COLUMN IF NOT EXISTS schedule_email_reply_to TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Comment on new columns
COMMENT ON COLUMN branches.schedule_email_from IS 'From address for schedule distribution emails';
COMMENT ON COLUMN branches.schedule_email_reply_to IS 'Reply-to address for schedule distribution emails';
COMMENT ON COLUMN branches.website_url IS 'Branch website URL displayed on PDF footer';

-- Auxiliary recipients table (non-instructors who receive schedules)
CREATE TABLE IF NOT EXISTS branch_schedule_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, email)
);

-- Comment on table
COMMENT ON TABLE branch_schedule_recipients IS 'Stores auxiliary email recipients for schedule distribution per branch';

-- Index for efficient branch lookups
CREATE INDEX IF NOT EXISTS idx_branch_schedule_recipients_branch 
  ON branch_schedule_recipients(branch_id);

-- Grant permissions
GRANT ALL ON TABLE branch_schedule_recipients TO anon;
GRANT ALL ON TABLE branch_schedule_recipients TO authenticated;
GRANT ALL ON TABLE branch_schedule_recipients TO service_role;