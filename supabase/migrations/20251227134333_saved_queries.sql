-- Migration: Add saved_queries table
-- Purpose: Store natural language queries per branch for reuse
-- Tables affected: public.saved_queries (new)
-- Created: 2025-12-27

BEGIN;

-- Create saved_queries table
CREATE TABLE IF NOT EXISTS public.saved_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, name)
);

-- Enable RLS
ALTER TABLE public.saved_queries ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "authenticated_all_saved_queries"
  ON public.saved_queries FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon users to read (for local dev)
CREATE POLICY "anon_select_saved_queries"
  ON public.saved_queries FOR SELECT
  TO anon
  USING (true);

-- Allow anon users to insert/update/delete (for local dev)
CREATE POLICY "anon_insert_saved_queries"
  ON public.saved_queries FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon_update_saved_queries"
  ON public.saved_queries FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_delete_saved_queries"
  ON public.saved_queries FOR DELETE
  TO anon
  USING (true);

-- Create index for faster branch lookups
CREATE INDEX IF NOT EXISTS idx_saved_queries_branch_id ON public.saved_queries(branch_id);

COMMIT;


