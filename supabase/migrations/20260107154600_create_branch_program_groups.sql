-- Migration: create branch_program_groups and enable GroupX for Eastside
-- Purpose: Allow each branch to enable/disable global program groups
-- Tables affected: public.branch_program_groups
-- Created: 2026-01-07 (UTC)

begin;

-- ============================================
-- table: branch_program_groups (branch group enablement)
-- ============================================
create table if not exists public.branch_program_groups (
  branch_id uuid not null references public.branches(id) on delete cascade,
  program_group_id uuid not null references public.program_groups(id) on delete cascade,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (branch_id, program_group_id)
);

comment on table public.branch_program_groups is
'Join table for enabling program groups per branch.';

comment on column public.branch_program_groups.is_enabled is
'When true, the program group is enabled for the branch and can be scheduled.';

-- RLS
alter table public.branch_program_groups enable row level security;

-- Policies: safe to read; writes are service_role only via server APIs.
do $$
begin
  create policy "anon_select_branch_program_groups"
    on public.branch_program_groups for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_branch_program_groups"
    on public.branch_program_groups for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_insert_branch_program_groups"
    on public.branch_program_groups for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_update_branch_program_groups"
    on public.branch_program_groups for update
    to service_role
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_delete_branch_program_groups"
    on public.branch_program_groups for delete
    to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

grant select on table public.branch_program_groups to anon, authenticated;
grant all on table public.branch_program_groups to service_role;

create index if not exists idx_branch_program_groups_branch
  on public.branch_program_groups(branch_id);

create index if not exists idx_branch_program_groups_enabled
  on public.branch_program_groups(branch_id, is_enabled)
  where is_enabled = true;

-- ============================================
-- backfill: Eastside Family YMCA defaults to GroupX enabled
-- ============================================
insert into public.branch_program_groups (branch_id, program_group_id, is_enabled)
select b.id, g.id, true
from public.branches b
join public.program_groups g on g.code = 'GroupX'
where b.name = 'Eastside Family YMCA'
on conflict (branch_id, program_group_id) do update
set is_enabled = true;

commit;


