-- migration: add per-branch availability time range for instructor availability pickers
-- purpose: store a configurable time window (default 06:00–23:00) per branch for scheduling/availability UI
-- tables affected: public.ymca_branches
-- created: 2026-01-13 (utc)

begin;

-- ============================================
-- columns: availability_time_start/end
-- ============================================
-- These fields drive UI time pickers (e.g., Instructor Availability) to reduce noise and ensure
-- consistent branch-level scheduling windows.

alter table public.ymca_branches
  add column if not exists availability_time_start time not null default '06:00';

alter table public.ymca_branches
  add column if not exists availability_time_end time not null default '23:00';

comment on column public.ymca_branches.availability_time_start is
  'Per-branch earliest time shown in availability/scheduling time pickers (inclusive).';

comment on column public.ymca_branches.availability_time_end is
  'Per-branch latest time shown in availability/scheduling time pickers (inclusive). Must be after availability_time_start.';

-- Ensure the range is valid (end must be strictly after start).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ymca_branches_availability_time_range_chk'
  ) then
    alter table public.ymca_branches
      add constraint ymca_branches_availability_time_range_chk
      check (availability_time_end > availability_time_start);
  end if;
end $$;

commit;

