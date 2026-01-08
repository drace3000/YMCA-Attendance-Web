-- Migration: Create error_logs table for production error tracking
-- Purpose: Store application errors with context for debugging and notification
-- Includes Branch and User context for multi-tenant tracking

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code text NOT NULL,           -- Timestamp-based unique ID, e.g., "20260107-153045-a1b2c3"
  error_type text NOT NULL,           -- "DB_ERROR", "API_ERROR", "NETWORK_ERROR", "CLIENT_ERROR", "AUTH_ERROR"
  message text NOT NULL,              -- Technical error message
  
  -- Branch context (for multi-branch tracking)
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name text,                   -- Denormalized for quick reference in emails
  
  -- User context (for user-specific tracking)
  user_id uuid,                       -- Auth user ID if authenticated
  user_email text,                    -- User email for identification in digests
  
  -- Error details
  context jsonb,                      -- Additional context (page, action, params, etc.)
  stack_trace text,                   -- Stack trace if available
  source text,                        -- "client" or "server"
  url text,                           -- Page/API URL where error occurred
  user_agent text,                    -- Browser info for client errors
  
  -- Aggregation and notification tracking
  occurrence_count int DEFAULT 1,     -- For grouping repeated errors
  first_occurred_at timestamptz DEFAULT now(),
  last_occurred_at timestamptz DEFAULT now(),
  notified_at timestamptz,            -- When Administrators were notified
  resolved_at timestamptz,            -- When marked resolved (for future use)
  
  created_at timestamptz DEFAULT now()
);

-- Index for digest query (unnotified errors) - partial index for efficiency
CREATE INDEX IF NOT EXISTS idx_error_logs_unnotified 
ON public.error_logs (notified_at) 
WHERE notified_at IS NULL;

-- Index for error grouping (finding similar errors)
CREATE INDEX IF NOT EXISTS idx_error_logs_type_message 
ON public.error_logs (error_type, message);

-- Index for branch filtering
CREATE INDEX IF NOT EXISTS idx_error_logs_branch 
ON public.error_logs (branch_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_error_logs_created 
ON public.error_logs (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous users to insert errors (client-side logging)
do $$
begin
  create policy "anon_insert_errors" on public.error_logs
    for insert to anon
    with check (true);
exception
  when duplicate_object then null;
end $$;

-- Policy: Allow authenticated users to insert errors
do $$
begin
  create policy "authenticated_insert_errors" on public.error_logs
    for insert to authenticated
    with check (true);
exception
  when duplicate_object then null;
end $$;

-- Policy: Only service role can read errors (for digest API)
do $$
begin
  create policy "service_select_errors" on public.error_logs
    for select to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Policy: Only service role can update errors (for marking notified)
do $$
begin
  create policy "service_update_errors" on public.error_logs
    for update to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Grant permissions
GRANT INSERT ON TABLE public.error_logs TO anon;
GRANT INSERT ON TABLE public.error_logs TO authenticated;
GRANT ALL ON TABLE public.error_logs TO service_role;

-- Add table comment
COMMENT ON TABLE public.error_logs IS 
'Production error log for tracking application errors. Administrators receive digest notifications for critical/repeated errors.';

