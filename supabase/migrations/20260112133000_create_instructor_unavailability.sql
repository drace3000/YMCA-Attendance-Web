-- migration: create instructor_unavailability
-- purpose: store per-branch instructor unavailability rules for conflict detection (blocks scheduling when overlapping)
-- tables affected: public.instructor_unavailability
-- created: 2026-01-12 (utc)

begin;

-- ============================================
-- table: instructor_unavailability
-- ============================================
-- Design notes:
-- - Unavailability is branch-scoped (instructors may be shared across branches).
-- - Rules can be either:
--   - specific-date rules (date is set), OR
--   - weekly rules (day_of_week is set), OR
--   - both (allowed, but at least one must be present).
-- - If there is no entry for an instructor/branch, they are assumed available (per project rule).

create table if not exists public.instructor_unavailability (
  id uuid primary key default gen_random_uuid(),

  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,

  -- scope
  date date null,
  day_of_week text null,

  -- time window (stored as time; APIs should normalize to "hh:mm" strings)
  unavailable_start time not null,
  unavailable_end time not null,

  reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint instructor_unavailability_scope_chk check (
    date is not null or day_of_week is not null
  ),

  constraint instructor_unavailability_time_order_chk check (
    unavailable_end > unavailable_start
  ),

  constraint instructor_unavailability_day_chk check (
    day_of_week is null
    or day_of_week in (
      'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'
    )
  )
);

comment on table public.instructor_unavailability is
'Branch-scoped instructor unavailability rules used by scheduler conflict detection. If no record exists, instructor is assumed available.';

comment on column public.instructor_unavailability.date is
'Optional specific date (YYYY-MM-DD) the instructor is unavailable.';

comment on column public.instructor_unavailability.day_of_week is
'Optional day-of-week rule (e.g., MONDAY). When set, applies to all matching dates.';

comment on column public.instructor_unavailability.unavailable_start is
'Start time (inclusive) of unavailability window.';

comment on column public.instructor_unavailability.unavailable_end is
'End time (exclusive) of unavailability window.';

-- updated_at trigger (reuses the shared public.handle_updated_at function created in baseline migrations)
do $$
begin
  create trigger instructor_unavailability_set_updated_at
    before update on public.instructor_unavailability
    for each row execute function public.handle_updated_at();
exception
  when duplicate_object then null;
end $$;

-- ============================================
-- rls
-- ============================================
alter table public.instructor_unavailability enable row level security;

-- Read policies:
-- - keep reads permissive to preserve local/dev workflows and allow server APIs without a user JWT.
do $$
begin
  create policy "anon_select_instructor_unavailability"
    on public.instructor_unavailability for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_instructor_unavailability"
    on public.instructor_unavailability for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Write policies:
-- - allow writes for service_role (server-side APIs)
do $$
begin
  create policy "service_role_insert_instructor_unavailability"
    on public.instructor_unavailability for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_update_instructor_unavailability"
    on public.instructor_unavailability for update
    to service_role
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_delete_instructor_unavailability"
    on public.instructor_unavailability for delete
    to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Optional authenticated writes (for environments without service_role):
-- Only allow authenticated recipients (Branch/Admin) to manage rows for their own branch.
do $$
begin
  create policy "authenticated_insert_instructor_unavailability"
    on public.instructor_unavailability for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_unavailability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_update_instructor_unavailability"
    on public.instructor_unavailability for update
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_unavailability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    )
    with check (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_unavailability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_delete_instructor_unavailability"
    on public.instructor_unavailability for delete
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_unavailability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

grant select on table public.instructor_unavailability to anon, authenticated;
grant all on table public.instructor_unavailability to service_role;

-- ============================================
-- indexes
-- ============================================
create index if not exists idx_instructor_unavailability_branch_instructor
  on public.instructor_unavailability(branch_id, instructor_id);

create index if not exists idx_instructor_unavailability_branch_date
  on public.instructor_unavailability(branch_id, date)
  where date is not null;

create index if not exists idx_instructor_unavailability_branch_day_of_week
  on public.instructor_unavailability(branch_id, day_of_week)
  where day_of_week is not null;

commit;

