-- migration: add instructors.readable_id and backfill instructor_branches
-- purpose: create a stable, human-friendly instructor id for cross-branch disambiguation
-- tables affected: public.instructors, public.instructor_branches
-- created: 2026-01-08 (utc)

begin;

-- ============================================================================
-- 1) ensure instructor_branches has at least one primary branch per instructor
-- ============================================================================

insert into public.instructor_branches (instructor_id, branch_id, is_primary, created_at)
select
  i.id,
  i.branch_id,
  true,
  now()
from public.instructors i
where i.branch_id is not null
  and not exists (
    select 1
    from public.instructor_branches ib
    where ib.instructor_id = i.id
      and ib.branch_id = i.branch_id
  );

-- ============================================================================
-- 2) add stable readable_id to instructors
-- ============================================================================

alter table public.instructors
  add column if not exists readable_id text;

comment on column public.instructors.readable_id is
'Stable, human-friendly instructor id: {ASSOCIATION}-{BRANCHSHORT}-{NICKNAME} (e.g., GROC-BV-ALEX). Does not auto-update once assigned.';

-- backfill readable_id from association + branch short_code + nickname
update public.instructors i
set readable_id = (
  upper(a.code) || '-' ||
  upper(b.short_code) || '-' ||
  upper(
    regexp_replace(
      regexp_replace(btrim(i.nickname), '\\s+', '_', 'g'),
      '[^a-zA-Z0-9_-]',
      '',
      'g'
    )
  )
)
from public.ymca_branches b
join public.ymca_associations a on a.id = b.association_id
where i.readable_id is null
  and i.branch_id = b.id;

-- collision guard: if sanitization causes collisions, append -2, -3, ...
with ranked as (
  select
    id,
    readable_id,
    row_number() over (partition by readable_id order by id) as rn
  from public.instructors
  where readable_id is not null
)
update public.instructors i
set readable_id = ranked.readable_id || '-' || ranked.rn::text
from ranked
where i.id = ranked.id
  and ranked.rn > 1;

-- require readable_id for all instructors (existing dataset has nickname+branch)
alter table public.instructors
  alter column readable_id set not null;

-- enforce case-insensitive uniqueness
create unique index if not exists instructors_readable_id_unique_ci
  on public.instructors (lower(readable_id));

commit;
