-- Migration: Add is_active columns for soft delete support
-- Date: 2024-12-14
-- Purpose: Enable soft delete on instructors, classes, and locations tables
--          to preserve referential integrity with class_sessions

-- Add is_active column to instructors table
ALTER TABLE instructors 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add is_active column to classes table
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add is_active column to locations table
ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Create partial indexes for efficient filtering of active records
-- These indexes optimize queries that filter on is_active = true (the common case)
CREATE INDEX IF NOT EXISTS idx_instructors_is_active 
ON instructors(is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_classes_is_active 
ON classes(is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_locations_is_active 
ON locations(is_active) 
WHERE is_active = true;

-- Add comments for documentation
COMMENT ON COLUMN instructors.is_active IS 'Soft delete flag. Inactive instructors are hidden from scheduling but preserved for historical reports.';
COMMENT ON COLUMN classes.is_active IS 'Soft delete flag. Inactive classes are hidden from scheduling but preserved for historical reports.';
COMMENT ON COLUMN locations.is_active IS 'Soft delete flag. Inactive locations are hidden from scheduling but preserved for historical reports.';

