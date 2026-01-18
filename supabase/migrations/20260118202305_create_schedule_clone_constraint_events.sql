-- Migration: create schedule_clone_constraint_events
-- Purpose: store detailed exception/constraint events from schedule cloning for reporting
-- Tables affected: public.schedule_clone_constraint_events
-- Author: AI Assistant
-- Date: 2026-01-18 (UTC)

begin;

create table if not exists public.schedule_clone_constraint_events (
  id uuid primary key default gen_random_uuid(),

  audit_id uuid not null references public.schedule_clone_audit(id) on delete cascade,
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  program_group_id uuid not null references public.program_groups(id) on delete restrict,

  source_schedule_id uuid null,
  target_schedule_id uuid not null,

  event_type text not null,

  source_session_id uuid null,
  class_id uuid null,
  location_id uuid null,

  target_session_date date null,
  target_day_of_week text null,
  target_start_time time null,
  target_end_time time null,

  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.schedule_clone_constraint_events is
  'Detailed exception/constraint events generated during Smart Scheduler clone actions. Used for Exception Report (PDF/email) and troubleshooting.';

alter table public.schedule_clone_constraint_events enable row level security;

-- Read: allow anon/authenticated so the app can render reports in dev; can tighten later.
do $$
begin
  create policy "anon_select_schedule_clone_constraint_events"
    on public.schedule_clone_constraint_events for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_schedule_clone_constraint_events"
    on public.schedule_clone_constraint_events for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Writes: service_role only (server API).
do $$
begin
  create policy "service_role_insert_schedule_clone_constraint_events"
    on public.schedule_clone_constraint_events for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

grant select on table public.schedule_clone_constraint_events to anon, authenticated;
grant all on table public.schedule_clone_constraint_events to service_role;

create index if not exists idx_schedule_clone_constraint_events_target_created
  on public.schedule_clone_constraint_events(target_schedule_id, created_at desc);

create index if not exists idx_schedule_clone_constraint_events_audit_created
  on public.schedule_clone_constraint_events(audit_id, created_at desc);

create index if not exists idx_schedule_clone_constraint_events_branch_group_created
  on public.schedule_clone_constraint_events(branch_id, program_group_id, created_at desc);

commit;

