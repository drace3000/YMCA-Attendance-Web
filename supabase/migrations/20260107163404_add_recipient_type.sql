-- Migration: Add recipient_type to branch_schedule_recipients
-- Purpose: Enable routing of error notifications to Administrators
-- "Administrator" recipients receive system error notifications (all branches)
-- "Normal" recipients only receive schedule-related emails for their branch

-- Add recipient_type column with safe IF NOT EXISTS guard
ALTER TABLE branch_schedule_recipients
ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT 'Normal';

-- Add check constraint for valid values (drop first if exists for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_recipient_type'
  ) THEN
    ALTER TABLE branch_schedule_recipients
    ADD CONSTRAINT chk_recipient_type 
    CHECK (recipient_type IN ('Administrator', 'Normal'));
  END IF;
END $$;

-- Index for efficient Administrator lookups (error digest queries)
CREATE INDEX IF NOT EXISTS idx_recipients_type 
ON branch_schedule_recipients (recipient_type) 
WHERE recipient_type = 'Administrator';

-- Add descriptive comment
COMMENT ON COLUMN branch_schedule_recipients.recipient_type IS 
'Recipient type: Administrator (receives all system errors) or Normal (schedule emails only)';

