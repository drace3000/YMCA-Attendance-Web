-- migration: branch-scoped locations (alliance→association→branch aware via ymca_branches)
-- purpose:
--   - make public.locations belong to exactly one branch (public.ymca_branches)
--   - backfill existing locations to the initial local-dev branch: eastside_family_ymca
--   - enforce per-branch uniqueness for code/name (case-insensitive)
--   - prevent cross-branch session location usage by constraining (class_sessions.branch_id, class_sessions.location_id)
-- tables affected: public.locations, public.class_sessions
-- created: 2026-01-11 (utc)

begin;

-- ============================================================================
-- 1) locations: add branch_id and backfill to Eastside
-- ============================================================================

alter table public.locations
  add column if not exists branch_id uuid;

-- Backfill ALL existing locations to Eastside Family YMCA (initial dataset)
update public.locations l
set branch_id = b.id
from public.ymca_branches b
where l.branch_id is null
  and b.code = 'eastside_family_ymca';

-- Hard stop if the backfill didn't find the branch or left nulls behind.
do $$
begin
  if exists (select 1 from public.ymca_branches where code = 'eastside_family_ymca') is false then
    raise exception 'expected ymca_branches.code=eastside_family_ymca to exist for locations backfill';
  end if;

  if exists (select 1 from public.locations where branch_id is null) then
    raise exception 'locations.branch_id backfill incomplete (still contains nulls)';
  end if;
end;
$$;

-- Add/refresh FK to the hierarchy branch table.
alter table public.locations
  drop constraint if exists locations_branch_id_fkey;

alter table public.locations
  add constraint locations_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete cascade;

-- Now that existing rows are backfilled, enforce not-null.
alter table public.locations
  alter column branch_id set not null;

comment on column public.locations.branch_id is
'The branch that owns this location (Alliance→Association→Branch).';

-- ============================================================================
-- 2) locations: uniqueness becomes per-branch (NOT global)
--    NOTE: baseline had a global unique constraint on code (locations_code_key).
--          To allow the same location code/name in different branches, we drop it
--          and replace with per-branch unique indexes.
-- ============================================================================

alter table public.locations
  drop constraint if exists locations_code_key;

-- Case-insensitive uniqueness within a branch.
create unique index if not exists locations_branch_code_unique
  on public.locations (branch_id, lower(code));

create unique index if not exists locations_branch_name_unique
  on public.locations (branch_id, lower(name));

-- Helpful for lookups/pickers.
create index if not exists idx_locations_branch_id
  on public.locations (branch_id);

-- Support composite FK from class_sessions(branch_id, location_id).
-- (Postgres requires the referenced columns to be covered by a UNIQUE index/constraint.)
create unique index if not exists locations_branch_id_id_unique
  on public.locations (branch_id, id);

-- ============================================================================
-- 3) class_sessions: prevent cross-branch location usage
--    We replace the old FK on (location_id) with a composite FK on (branch_id, location_id).
--
--    IMPORTANT:
--    - We add this constraint as NOT VALID so it enforces for NEW/UPDATED rows immediately,
--      while avoiding migration failure if there is any legacy data drift to clean up later.
-- ============================================================================

alter table public.class_sessions
  drop constraint if exists class_sessions_location_id_fkey;

alter table public.class_sessions
  drop constraint if exists class_sessions_branch_location_fkey;

alter table public.class_sessions
  add constraint class_sessions_branch_location_fkey
  foreign key (branch_id, location_id)
  references public.locations(branch_id, id)
  on delete restrict
  not valid;

comment on constraint class_sessions_branch_location_fkey on public.class_sessions is
'Ensures sessions can only reference a location owned by the same branch (enforced for new/updated rows; legacy rows not validated yet).';

commit;

