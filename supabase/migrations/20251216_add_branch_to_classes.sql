-- Migration: Add branch_id to classes table
-- Date: 2025-12-16
-- Purpose: Associate classes with a branch (matching local schema)

-- Add branch_id column to classes table
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS branch_id uuid NOT NULL DEFAULT gen_random_uuid();

-- Add foreign key constraint
ALTER TABLE classes
DROP CONSTRAINT IF EXISTS classes_branch_id_fkey;

ALTER TABLE classes 
ADD CONSTRAINT classes_branch_id_fkey 
FOREIGN KEY (branch_id) REFERENCES branches(id);

-- Create index for branch queries
CREATE INDEX IF NOT EXISTS idx_classes_branch_id 
ON classes(branch_id);

-- Add unique constraint for branch + name combination
ALTER TABLE classes
DROP CONSTRAINT IF EXISTS classes_branch_name_key;

ALTER TABLE classes 
ADD CONSTRAINT classes_branch_name_key 
UNIQUE (branch_id, name);

-- Add comment
COMMENT ON COLUMN classes.branch_id IS 'The YMCA branch this class belongs to';



















