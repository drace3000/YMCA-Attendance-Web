-- Migration: add region to associations and zip to branches
-- Idempotent: use IF NOT EXISTS for new columns

BEGIN;

ALTER TABLE public.ymca_associations
  ADD COLUMN IF NOT EXISTS region text;

ALTER TABLE public.ymca_branches
  ADD COLUMN IF NOT EXISTS zip text;

COMMIT;
