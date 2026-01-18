-- migration: create schedule_clone_audit
-- purpose: audit log for schedule cloning actions (who cloned what, override usage, counts)
-- tables affected: public.schedule_clone_audit
-- created: 2026-01-12 (utc)

begin;

create table if not exists public.schedule_clone_audit (
  id uuid primary key default gen_random_uuid(),

  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  program_group_id uuid not null references public.program_groups(id) on delete restrict,

  source_schedule_id uuid not null references public.schedules(id) on delete restrict,
  target_schedule_id uuid not null references public.schedules(id) on delete restrict,

  source_month_start date not null,
  target_month_start date not null,

  missing_headcount_count integer not null default 0,
  override_missing_headcounts boolean not null default false,

  sessions_source_count integer not null default 0,
  sessions_created_count integer not null default 0,
  sessions_skipped_count integer not null default 0,
  deduped_skipped_count integer not null default 0,

  requested_by_email text null,
  requested_by_recipient_type text null,

  created_at timestamptz not null default now()
);

comment on table public.schedule_clone_audit is
'Audit log for Smart Scheduler clone actions. Used for support/debugging and operational traceability.';

alter table public.schedule_clone_audit enable row level security;

-- Read: allow anon/authenticated so the app can render logs in dev; can tighten later.
do $$
begin
  create policy "anon_select_schedule_clone_audit"
    on public.schedule_clone_audit for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_schedule_clone_audit"
    on public.schedule_clone_audit for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Writes: service_role only (server API).
do $$
begin
  create policy "service_role_insert_schedule_clone_audit"
    on public.schedule_clone_audit for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

grant select on table public.schedule_clone_audit to anon, authenticated;
grant all on table public.schedule_clone_audit to service_role;

create index if not exists idx_schedule_clone_audit_branch_group_created
  on public.schedule_clone_audit(branch_id, program_group_id, created_at desc);

commit;

