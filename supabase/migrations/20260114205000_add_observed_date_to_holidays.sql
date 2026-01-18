-- migration: add observed_date to holidays (and merge legacy observed rows)
-- purpose:
-- - store an optional observed date (the day a holiday is actually observed) on the base holiday row
-- - migrate legacy imports that inserted a second "observed" row (is_observed = true) into observed_date
-- tables affected: public.holidays
-- created: 2026-01-14 (utc)

begin;

-- ============================================
-- schema change
-- ============================================

-- Observed date is not a yes/no flag. It is the date the holiday is actually observed (often a nearby weekday).
alter table public.holidays
add column if not exists observed_date date null;

comment on column public.holidays.observed_date is
'If present, the holiday is observed on this date (e.g., when the actual date falls on a weekend).';

-- ============================================
-- data migration (safe, import-only)
-- ============================================
-- Historical behavior: the importer inserted two rows:
-- - actual holiday row: is_observed = false (or null), holiday_date = actual date
-- - observed holiday row: is_observed = true, holiday_date = observed date
--
-- New behavior: keep ONE row (actual date) and store observed_date on it.
--
-- We only migrate rows that look like importer output:
-- - ho.is_observed = true
-- - ho.import_source is not null (and typically like 'US_FEDERAL%')
-- - a matching base row exists for the same branch + import_source + name + year with is_observed != true

-- 1) Copy observed date from the observed row into the base row.
update public.holidays h
set observed_date = ho.holiday_date
from public.holidays ho
where ho.is_observed = true
  and ho.import_source is not null
  and h.branch_id = ho.branch_id
  and h.import_source = ho.import_source
  and h.name = ho.name
  and extract(year from h.holiday_date) = extract(year from ho.holiday_date)
  and coalesce(h.is_observed, false) = false
  and h.observed_date is null;

-- 2) Delete the legacy observed rows ONLY when a base row exists for the same year.
delete from public.holidays ho
where ho.is_observed = true
  and ho.import_source is not null
  and exists (
    select 1
    from public.holidays h
    where h.branch_id = ho.branch_id
      and h.import_source = ho.import_source
      and h.name = ho.name
      and extract(year from h.holiday_date) = extract(year from ho.holiday_date)
      and coalesce(h.is_observed, false) = false
  );

-- 3) Normalize: ensure base rows remain non-observed flags (legacy column kept for backward compatibility).
update public.holidays
set is_observed = false
where is_observed is null;

commit;

