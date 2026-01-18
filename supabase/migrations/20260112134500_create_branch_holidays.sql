-- migration: create holidays
-- purpose: store branch-scoped holiday dates used as scheduler warnings (holiday conflicts do not block scheduling)
-- tables affected: public.holidays
-- created: 2026-01-12 (utc)

begin;

-- ============================================
-- table: holidays
-- ============================================
-- Design notes:
-- - Holidays are branch-scoped because closures/observances may differ by branch.
-- - If there is no holiday row for a date, no holiday warning is produced.
-- - Holiday conflicts are warnings only (MEDIUM) and never block scheduling.

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holidays_unique_branch_date unique (branch_id, holiday_date)
);

comment on table public.holidays is
'Branch-scoped holiday dates used to surface warning-only (MEDIUM) conflicts in the scheduler.';

comment on column public.holidays.holiday_date is
'Holiday date (YYYY-MM-DD). Sessions on this date should be flagged as a warning.';

comment on column public.holidays.is_active is
'When false, the holiday is ignored by conflict detection (soft-disable).';

-- updated_at trigger (reuses public.handle_updated_at from baseline migrations)
do $$
begin
  create trigger holidays_set_updated_at
    before update on public.holidays
    for each row execute function public.handle_updated_at();
exception
  when duplicate_object then null;
end $$;

-- ============================================
-- rls
-- ============================================
alter table public.holidays enable row level security;

-- Read policies: safe to read for building UI + schedule warnings.
do $$
begin
  create policy "anon_select_holidays"
    on public.holidays for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_holidays"
    on public.holidays for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Writes: service_role for server-side APIs.
do $$
begin
  create policy "service_role_insert_holidays"
    on public.holidays for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_update_holidays"
    on public.holidays for update
    to service_role
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_delete_holidays"
    on public.holidays for delete
    to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Optional authenticated writes (for environments without service_role):
-- only allow authenticated recipients (Branch/Admin) to manage rows for their own branch.
do $$
begin
  create policy "authenticated_insert_holidays"
    on public.holidays for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = holidays.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_update_holidays"
    on public.holidays for update
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = holidays.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    )
    with check (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = holidays.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_delete_holidays"
    on public.holidays for delete
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = holidays.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

grant select on table public.holidays to anon, authenticated;
grant all on table public.holidays to service_role;

-- ============================================
-- indexes
-- ============================================
create index if not exists idx_holidays_branch_active_date
  on public.holidays(branch_id, holiday_date)
  where is_active = true;

commit;

