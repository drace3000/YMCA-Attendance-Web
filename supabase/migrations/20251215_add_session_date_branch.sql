-- Migration: Add session_date and branch_id to class_sessions
-- Date: 2024-12-15
-- Purpose: Support individual session dates and branch association

-- Add session_date column for specific occurrence dates
ALTER TABLE class_sessions 
ADD COLUMN IF NOT EXISTS session_date date;

-- Add branch_id column to associate sessions with a branch
ALTER TABLE class_sessions 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

-- Create index for session_date queries
CREATE INDEX IF NOT EXISTS idx_class_sessions_session_date 
ON class_sessions(session_date);

-- Create index for branch_id queries
CREATE INDEX IF NOT EXISTS idx_class_sessions_branch_id 
ON class_sessions(branch_id);

-- Drop the old unique constraint that doesn't include session_date
DROP INDEX IF EXISTS class_sessions_uniq;

-- Create new unique constraint including session_date
CREATE UNIQUE INDEX IF NOT EXISTS class_sessions_uniq 
ON class_sessions(schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date);

-- Add comments
COMMENT ON COLUMN class_sessions.session_date IS 'The specific date this session occurs';
COMMENT ON COLUMN class_sessions.branch_id IS 'The YMCA branch where this session takes place';
























