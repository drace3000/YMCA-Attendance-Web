-- Migration: create_reschedule_feedback_requests_and_logs
-- Tables affected: schedule_reschedule_requests, schedule_reschedule_email_log, schedule_reschedule_submit_notify_log
-- Author: AI Assistant
-- Date: 2026-01-15 (UTC)
--
-- Purpose:
-- - Store token-based instructor feedback requests for proposed reschedules (48-hour expiry)
-- - Track emails sent from branch manager -> instructor (sent_at, from/to/subject)
-- - Track notification emails sent when instructor submits feedback (to branch manager)

begin;

create extension if not exists pgcrypto;

create table if not exists public.schedule_reschedule_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  request_token text not null unique,
  request_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  responded_at timestamptz null,
  response_selected_session_ids uuid[] not null default '{}'::uuid[],
  response_comment text null
);

create index if not exists schedule_reschedule_requests_lookup_idx
  on public.schedule_reschedule_requests (branch_id, schedule_id, instructor_id, created_at desc);

create index if not exists schedule_reschedule_requests_token_idx
  on public.schedule_reschedule_requests (request_token);

create table if not exists public.schedule_reschedule_email_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  sent_at timestamptz not null default now(),
  from_email text not null,
  to_email text not null,
  subject text not null,
  message_id text null
);

create index if not exists schedule_reschedule_email_log_lookup_idx
  on public.schedule_reschedule_email_log (branch_id, schedule_id, instructor_id, sent_at desc);

create table if not exists public.schedule_reschedule_submit_notify_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  notified_at timestamptz not null default now(),
  to_email text not null,
  subject text not null,
  message_id text null
);

create index if not exists schedule_reschedule_submit_notify_log_lookup_idx
  on public.schedule_reschedule_submit_notify_log (branch_id, schedule_id, instructor_id, notified_at desc);

alter table public.schedule_reschedule_requests enable row level security;
alter table public.schedule_reschedule_email_log enable row level security;
alter table public.schedule_reschedule_submit_notify_log enable row level security;

-- RLS policies (authenticated only). Token-based public access is handled via server routes using service role.
-- Allow authenticated users who have a recipient record for the branch.
-- NOTE: This is intentionally stricter than the server-side service role access.
create or replace function public.user_has_branch_access(target_branch_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.branch_schedule_recipients r
    where r.auth_user_id = auth.uid()
      and r.branch_id = target_branch_id
      and r.is_active = true
  );
$$;

revoke all on function public.user_has_branch_access(uuid) from public;
grant execute on function public.user_has_branch_access(uuid) to authenticated;

create policy "auth_select_reschedule_requests_same_branch"
  on public.schedule_reschedule_requests
  for select
  to authenticated
  using (public.user_has_branch_access(branch_id));

create policy "auth_insert_reschedule_requests_same_branch"
  on public.schedule_reschedule_requests
  for insert
  to authenticated
  with check (public.user_has_branch_access(branch_id));

create policy "auth_update_reschedule_requests_same_branch"
  on public.schedule_reschedule_requests
  for update
  to authenticated
  using (public.user_has_branch_access(branch_id))
  with check (public.user_has_branch_access(branch_id));

create policy "auth_select_reschedule_email_log_same_branch"
  on public.schedule_reschedule_email_log
  for select
  to authenticated
  using (public.user_has_branch_access(branch_id));

create policy "auth_insert_reschedule_email_log_same_branch"
  on public.schedule_reschedule_email_log
  for insert
  to authenticated
  with check (public.user_has_branch_access(branch_id));

create policy "auth_select_reschedule_submit_notify_log_same_branch"
  on public.schedule_reschedule_submit_notify_log
  for select
  to authenticated
  using (public.user_has_branch_access(branch_id));

create policy "auth_insert_reschedule_submit_notify_log_same_branch"
  on public.schedule_reschedule_submit_notify_log
  for insert
  to authenticated
  with check (public.user_has_branch_access(branch_id));

commit;


