-- Migration: add program_group_id + branch_id to schedules, and program_group_id to classes
-- Purpose: Scope schedules and classes to a program group; enable per-branch/per-group schedules
-- Tables affected: public.schedules, public.classes
-- Created: 2026-01-07 (UTC)

begin;

-- ============================================
-- schedules: add branch_id + program_group_id
-- ============================================
alter table public.schedules
  add column if not exists branch_id uuid;

alter table public.schedules
  add column if not exists program_group_id uuid;

-- Ensure constraints exist (drop/recreate safely)
alter table public.schedules
  drop constraint if exists schedules_branch_id_fkey;

alter table public.schedules
  add constraint schedules_branch_id_fkey
  foreign key (branch_id) references public.branches(id) on delete set null;

alter table public.schedules
  drop constraint if exists schedules_program_group_id_fkey;

alter table public.schedules
  add constraint schedules_program_group_id_fkey
  foreign key (program_group_id) references public.program_groups(id) on delete restrict;

comment on column public.schedules.branch_id is
'The branch this schedule belongs to.';

comment on column public.schedules.program_group_id is
'The program group this schedule belongs to.';

-- Backfill existing schedules to Eastside + GroupX (current local dev dataset)
update public.schedules s
set branch_id = b.id
from public.branches b
where s.branch_id is null
  and b.name = 'Eastside Family YMCA';

update public.schedules s
set program_group_id = g.id
from public.program_groups g
where s.program_group_id is null
  and g.code = 'GroupX';

-- Make columns NOT NULL after backfill
alter table public.schedules
  alter column branch_id set not null;

alter table public.schedules
  alter column program_group_id set not null;

-- Uniqueness: one schedule per branch + group + month_start
create unique index if not exists schedules_branch_group_month_key
  on public.schedules(branch_id, program_group_id, month_start);

create index if not exists idx_schedules_branch_group
  on public.schedules(branch_id, program_group_id);

-- ============================================
-- classes: add program_group_id
-- ============================================
alter table public.classes
  add column if not exists program_group_id uuid;

alter table public.classes
  drop constraint if exists classes_program_group_id_fkey;

alter table public.classes
  add constraint classes_program_group_id_fkey
  foreign key (program_group_id) references public.program_groups(id) on delete restrict;

comment on column public.classes.program_group_id is
'The program group this class belongs to.';

-- Backfill existing classes to GroupX
update public.classes c
set program_group_id = g.id
from public.program_groups g
where c.program_group_id is null
  and g.code = 'GroupX';

alter table public.classes
  alter column program_group_id set not null;

create index if not exists idx_classes_program_group_id
  on public.classes(program_group_id);

commit;


