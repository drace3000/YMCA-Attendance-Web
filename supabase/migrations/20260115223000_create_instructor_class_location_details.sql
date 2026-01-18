-- Migration: create instructor_class_location_details (instructor↔class↔location + minutes)
-- Purpose: Store branch-scoped “which instructors teach which classes and where” mapping from CSV
-- Tables affected: public.instructor_class_location_details (new)
-- Created: 2026-01-15 (utc)

begin;

create table if not exists public.instructor_class_location_details (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  minutes integer not null,

  -- Traceability fields (stored exactly as read from the source file)
  instructor_nickname text not null,
  class_name text not null,
  location_name text not null,
  source_file text not null,
  loaded_at timestamptz not null default timezone('utc'::text, now())
);

-- Validate minutes is at least 1 minute and not absurdly large.
-- (Importer will coerce 765 → 60 before insert.)
alter table public.instructor_class_location_details
  drop constraint if exists instructor_class_location_details_minutes_check;

alter table public.instructor_class_location_details
  add constraint instructor_class_location_details_minutes_check
  check (minutes >= 1 and minutes <= 360);

-- Dedupe exact duplicates; allow same instructor/class/location with different durations.
create unique index if not exists ux_icld_branch_instructor_class_location_minutes
  on public.instructor_class_location_details (branch_id, instructor_id, class_id, location_id, minutes);

create index if not exists idx_icld_branch_instructor
  on public.instructor_class_location_details (branch_id, instructor_id);

create index if not exists idx_icld_branch_class
  on public.instructor_class_location_details (branch_id, class_id);

create index if not exists idx_icld_branch_location
  on public.instructor_class_location_details (branch_id, location_id);

-- Enable RLS (required for Supabase-managed access patterns)
alter table public.instructor_class_location_details enable row level security;

-- Policies: mirror local-dev posture (similar to saved_queries) for now.
-- The loader uses postgres/pg, so RLS does not block the import.
do $$
begin
  create policy "authenticated_all_instructor_class_location_details"
    on public.instructor_class_location_details
    for all
    to authenticated
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "anon_select_instructor_class_location_details"
    on public.instructor_class_location_details
    for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

commit;


