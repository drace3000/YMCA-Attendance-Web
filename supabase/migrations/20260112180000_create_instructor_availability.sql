-- migration: create instructor_availability
-- purpose: store per-branch instructor availability windows (allow-list) scoped to a schedule month (YYYY-MM)
-- tables affected: public.instructor_availability
-- created: 2026-01-12 (utc)

begin;

-- ============================================
-- table: instructor_availability
-- ============================================
-- Design notes:
-- - Availability is branch-scoped (instructors may be shared across branches).
-- - Rules are month-scoped (schedule_month = 'YYYY-MM') and day-of-week scoped.
-- - If there is NO availability entry for an instructor/branch/month, assume AVAILABLE (no enforcement).
-- - If there IS at least one availability entry for an instructor/branch/month, sessions must be fully contained within at least one window for that day.

create table if not exists public.instructor_availability (
  id uuid primary key default gen_random_uuid(),

  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,

  schedule_month text not null,
  day_of_week text not null,

  -- time window (stored as time; APIs should normalize to "HH:mm" strings)
  available_start time not null,
  available_end time not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint instructor_availability_schedule_month_chk check (
    schedule_month ~ '^\d{4}-\d{2}$'
  ),

  constraint instructor_availability_time_order_chk check (
    available_end > available_start
  ),

  constraint instructor_availability_day_chk check (
    day_of_week in (
      'SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'
    )
  ),

  constraint instructor_availability_unique unique (
    branch_id, instructor_id, schedule_month, day_of_week, available_start, available_end
  )
);

comment on table public.instructor_availability is
'Branch-scoped instructor availability windows (allow-list) scoped to schedule_month (YYYY-MM). If no records exist for an instructor/branch/month, instructor is assumed available (no enforcement).';

comment on column public.instructor_availability.schedule_month is
'Schedule month in ISO form YYYY-MM (e.g., 2026-01).';

comment on column public.instructor_availability.day_of_week is
'Day-of-week rule (e.g., MONDAY). Applies to all matching dates within schedule_month.';

comment on column public.instructor_availability.available_start is
'Start time (inclusive) of availability window.';

comment on column public.instructor_availability.available_end is
'End time (exclusive) of availability window.';

-- updated_at trigger (reuses shared public.handle_updated_at from baseline migrations)
do $$
begin
  create trigger instructor_availability_set_updated_at
    before update on public.instructor_availability
    for each row execute function public.handle_updated_at();
exception
  when duplicate_object then null;
end $$;

-- ============================================
-- rls
-- ============================================
alter table public.instructor_availability enable row level security;

-- Read policies:
-- - keep reads permissive to preserve local/dev workflows and allow server APIs without a user JWT.
do $$
begin
  create policy "anon_select_instructor_availability"
    on public.instructor_availability for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_instructor_availability"
    on public.instructor_availability for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Write policies:
-- - allow writes for service_role (server-side APIs)
do $$
begin
  create policy "service_role_insert_instructor_availability"
    on public.instructor_availability for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_update_instructor_availability"
    on public.instructor_availability for update
    to service_role
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_delete_instructor_availability"
    on public.instructor_availability for delete
    to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Optional authenticated writes (for environments without service_role):
-- Only allow authenticated recipients (Branch/Admin) to manage rows for their own branch.
do $$
begin
  create policy "authenticated_insert_instructor_availability"
    on public.instructor_availability for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_availability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_update_instructor_availability"
    on public.instructor_availability for update
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_availability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    )
    with check (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_availability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_delete_instructor_availability"
    on public.instructor_availability for delete
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and r.branch_id = instructor_availability.branch_id
          and r.recipient_type in ('Administrator', 'Branch')
      )
    );
exception
  when duplicate_object then null;
end $$;

grant select on table public.instructor_availability to anon, authenticated;
grant all on table public.instructor_availability to service_role;

-- ============================================
-- indexes
-- ============================================
create index if not exists idx_instructor_availability_branch_instructor_month
  on public.instructor_availability(branch_id, instructor_id, schedule_month);

create index if not exists idx_instructor_availability_branch_month
  on public.instructor_availability(branch_id, schedule_month);

create index if not exists idx_instructor_availability_branch_instructor_month_day
  on public.instructor_availability(branch_id, instructor_id, schedule_month, day_of_week);

commit;

