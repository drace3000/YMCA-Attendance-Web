-- migration: extend holidays for closures + observed/import tracking
-- purpose: support branch-specific full-day/partial-day closures and track imported federal holidays for idempotent UI/import behavior
-- tables affected: public.holidays
-- created: 2026-01-13 (utc)

begin;

-- ============================================
-- columns: closure + observed + import tracking
-- ============================================
-- note: all additions are non-destructive and default-safe.

alter table public.holidays
  add column if not exists is_closed boolean not null default false;

comment on column public.holidays.is_closed is
'When true, this holiday represents a branch closure. Used for conflict detection. Defaults false so branches opt-in.';

alter table public.holidays
  add column if not exists closed_start_time time null;

comment on column public.holidays.closed_start_time is
'Optional closure start time (HH:MM). When set, closed_end_time must also be set. If both null, closure applies to the full day when is_closed=true.';

alter table public.holidays
  add column if not exists closed_end_time time null;

comment on column public.holidays.closed_end_time is
'Optional closure end time (HH:MM). Must be after closed_start_time. Used for partial-day closures.';

alter table public.holidays
  add column if not exists is_observed boolean not null default false;

comment on column public.holidays.is_observed is
'If true, this row represents the observed date for a holiday (vs the actual date). Federal holiday imports may insert both actual + observed rows.';

alter table public.holidays
  add column if not exists import_source text null;

comment on column public.holidays.import_source is
'Optional marker indicating a row was imported from a known source (e.g., US_FEDERAL_2024_2027). Used to hide re-import option per branch.';

-- ============================================
-- constraints
-- ============================================
-- enforce valid time windows:
-- - either both times are null
-- - or both times are present and end_time > start_time
do $$
begin
  alter table public.holidays
    add constraint holidays_closed_time_window_valid
    check (
      (closed_start_time is null and closed_end_time is null)
      or
      (closed_start_time is not null and closed_end_time is not null and closed_end_time > closed_start_time)
    );
exception
  when duplicate_object then null;
end $$;

commit;

