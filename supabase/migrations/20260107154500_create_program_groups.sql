-- Migration: create program_groups and seed YMCA program categories
-- Purpose: Introduce a global master list of program groups (e.g., GroupX, Aquatics) used by branches/schedules/classes
-- Tables affected: public.program_groups
-- Created: 2026-01-07 (UTC)

begin;

-- ============================================
-- table: program_groups (global master list)
-- ============================================
create table if not exists public.program_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  sort_order int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.program_groups is
'Global master list of program groups. Branches can enable/disable groups; schedules/classes are scoped to a group.';

comment on column public.program_groups.code is
'Stable program group code used by the app and seeds (e.g., GroupX, Aquatics).';

comment on column public.program_groups.sort_order is
'Display order for UI selectors (lower first).';

-- RLS (required for all tables in this project)
alter table public.program_groups enable row level security;

-- Policies: groups are safe to read publicly; writes are service_role only (via server API routes).
do $$
begin
  create policy "anon_select_program_groups"
    on public.program_groups for select
    to anon
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_select_program_groups"
    on public.program_groups for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_insert_program_groups"
    on public.program_groups for insert
    to service_role
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_update_program_groups"
    on public.program_groups for update
    to service_role
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "service_role_delete_program_groups"
    on public.program_groups for delete
    to service_role
    using (true);
exception
  when duplicate_object then null;
end $$;

grant select on table public.program_groups to anon, authenticated;
grant all on table public.program_groups to service_role;

-- ============================================
-- seed: 8 default groups (with provided descriptions)
-- ============================================
insert into public.program_groups (code, name, description, sort_order, is_active)
values
  ('GroupX', 'Group Exercise', 'fitness classes like yoga, cycling, Zumba, strength training', 1, true),
  ('Wellness', 'Wellness', 'personal training, fitness assessments, health coaching', 2, true),
  ('Aquatics', 'Aquatics', 'swim lessons, lap swimming, water aerobics, lifeguard training', 3, true),
  ('YouthDevelopment', 'Youth Development', 'after-school programs, summer camps, teen leadership', 4, true),
  ('Sports', 'Sports', 'youth and adult leagues, basketball, volleyball, soccer, pickleball', 5, true),
  ('ChildCare', 'Child Care', 'early learning centers, preschool, before/after school care', 6, true),
  ('ActiveOlderAdults', 'Active Older Adults', 'programs specifically for seniors like SilverSneakers', 7, true),
  ('FamilyPrograms', 'Family Programs', 'family nights, parent-child activities', 8, true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

commit;


