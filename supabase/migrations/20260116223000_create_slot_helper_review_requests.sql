-- migration: create_slot_helper_review_requests
-- purpose: add slot helper review requests, holds, and email log tables to track request lifecycle and active slot locks.
-- tables affected: slot_helper_review_requests, slot_helper_slot_holds, slot_helper_review_email_log
-- created: 2026-01-16 22:30:00 utc

begin;

create extension if not exists pgcrypto;

-- ============================================
-- section: slot helper review requests
-- ============================================
create table if not exists public.slot_helper_review_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  class_id uuid null references public.classes(id) on delete set null,
  location_id uuid null references public.locations(id) on delete set null,
  instructor_ids uuid[] not null default '{}'::uuid[],
  request_token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  sent_at timestamptz null,
  responded_at timestamptz null,
  response_selected_hold_ids uuid[] not null default '{}'::uuid[],
  response_comment text null,
  completed_at timestamptz null,
  overridden_at timestamptz null,
  created_by_user_id uuid null references auth.users(id) on delete set null
);

create index if not exists slot_helper_review_requests_branch_schedule_idx
  on public.slot_helper_review_requests (branch_id, schedule_id, created_at desc);

create index if not exists slot_helper_review_requests_token_idx
  on public.slot_helper_review_requests (request_token);

-- ============================================
-- section: slot helper slot holds (locks)
-- ============================================
create table if not exists public.slot_helper_slot_holds (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.slot_helper_review_requests(id) on delete cascade,
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  class_id uuid null references public.classes(id) on delete set null,
  location_id uuid not null references public.locations(id) on delete cascade,
  instructor_ids uuid[] not null default '{}'::uuid[],
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  transition_minutes int not null default 0,
  turnover_minutes int not null default 0,
  expires_at timestamptz not null,
  released_at timestamptz null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists slot_helper_slot_holds_request_idx
  on public.slot_helper_slot_holds (request_id);

create index if not exists slot_helper_slot_holds_branch_schedule_date_idx
  on public.slot_helper_slot_holds (branch_id, schedule_id, slot_date);

create index if not exists slot_helper_slot_holds_expires_idx
  on public.slot_helper_slot_holds (expires_at);

create index if not exists slot_helper_slot_holds_instructor_ids_gin
  on public.slot_helper_slot_holds using gin (instructor_ids);

-- ============================================
-- section: slot helper review email log
-- ============================================
create table if not exists public.slot_helper_review_email_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.slot_helper_review_requests(id) on delete cascade,
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  sent_at timestamptz not null default now(),
  from_email text not null,
  to_email text not null,
  subject text not null,
  message_id text null
);

create index if not exists slot_helper_review_email_log_lookup_idx
  on public.slot_helper_review_email_log (branch_id, schedule_id, sent_at desc);

-- ============================================
-- section: rls + policies
-- ============================================
alter table public.slot_helper_review_requests enable row level security;
alter table public.slot_helper_slot_holds enable row level security;
alter table public.slot_helper_review_email_log enable row level security;

-- policies rely on public.user_has_branch_access(branch_id)

-- slot_helper_review_requests
create policy "auth_select_slot_helper_review_requests_same_branch"
  on public.slot_helper_review_requests
  for select
  to authenticated
  using (public.user_has_branch_access(branch_id));

create policy "auth_insert_slot_helper_review_requests_same_branch"
  on public.slot_helper_review_requests
  for insert
  to authenticated
  with check (public.user_has_branch_access(branch_id));

create policy "auth_update_slot_helper_review_requests_same_branch"
  on public.slot_helper_review_requests
  for update
  to authenticated
  using (public.user_has_branch_access(branch_id))
  with check (public.user_has_branch_access(branch_id));

-- slot_helper_slot_holds
create policy "auth_select_slot_helper_slot_holds_same_branch"
  on public.slot_helper_slot_holds
  for select
  to authenticated
  using (public.user_has_branch_access(branch_id));

create policy "auth_insert_slot_helper_slot_holds_same_branch"
  on public.slot_helper_slot_holds
  for insert
  to authenticated
  with check (public.user_has_branch_access(branch_id));

create policy "auth_update_slot_helper_slot_holds_same_branch"
  on public.slot_helper_slot_holds
  for update
  to authenticated
  using (public.user_has_branch_access(branch_id))
  with check (public.user_has_branch_access(branch_id));

-- slot_helper_review_email_log
create policy "auth_select_slot_helper_review_email_log_same_branch"
  on public.slot_helper_review_email_log
  for select
  to authenticated
  using (public.user_has_branch_access(branch_id));

create policy "auth_insert_slot_helper_review_email_log_same_branch"
  on public.slot_helper_review_email_log
  for insert
  to authenticated
  with check (public.user_has_branch_access(branch_id));

commit;
