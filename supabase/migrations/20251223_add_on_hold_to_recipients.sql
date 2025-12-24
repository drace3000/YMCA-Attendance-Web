-- Add on_hold flag to branch_schedule_recipients to allow pausing delivery
-- Created: 2025-12-23

ALTER TABLE branch_schedule_recipients
ADD COLUMN IF NOT EXISTS on_hold BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN branch_schedule_recipients.on_hold IS 'If true, recipient is temporarily paused (on hold) from receiving schedule emails.';

-- Helpful index when filtering active recipients per branch
CREATE INDEX IF NOT EXISTS idx_branch_schedule_recipients_branch_on_hold
  ON branch_schedule_recipients (branch_id, on_hold);




