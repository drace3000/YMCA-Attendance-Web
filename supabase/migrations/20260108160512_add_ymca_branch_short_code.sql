-- migration: add short_code to ymca_branches
-- purpose: provide a short, human-friendly branch code (unique per association) for instructor readable ids
-- tables affected: public.ymca_branches
-- created: 2026-01-08 (utc)

begin;

alter table public.ymca_branches
  add column if not exists short_code text;

-- backfill for the initial GROC association branches
update public.ymca_branches
set short_code = 'BV'
where code = 'bay_view_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'CO'
where code = 'corning_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'ES'
where code = 'eastside_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'MW'
where code = 'maplewood_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'NW'
where code = 'northwest_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'SA'
where code = 'sands_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'SH'
where code = 'schottland_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'LS'
where code = 'the_lewis_street_ymca_neighborhood_center' and short_code is null;

update public.ymca_branches
set short_code = 'TR'
where code = 'the_thurston_road_ymca_neighborhood_center' and short_code is null;

update public.ymca_branches
set short_code = 'WW'
where code = 'the_y_at_watson_woods' and short_code is null;

update public.ymca_branches
set short_code = 'IS'
where code = 'the_ymca_at_innovation_square' and short_code is null;

update public.ymca_branches
set short_code = 'WS'
where code = 'westside_family_ymca' and short_code is null;

update public.ymca_branches
set short_code = 'AO'
where code = 'ymca_of_greater_rochester_association_office' and short_code is null;

update public.ymca_branches
set short_code = 'MB'
where code = 'main_branch' and short_code is null;

-- normalize to uppercase for safety
update public.ymca_branches
set short_code = upper(short_code)
where short_code is not null;

-- require short_code for current/future data hygiene
alter table public.ymca_branches
  alter column short_code set not null;

create unique index if not exists ymca_branches_association_short_code_unique
  on public.ymca_branches(association_id, short_code);

comment on column public.ymca_branches.short_code is
'Short, human-friendly branch code unique per association (e.g., BV). Used in instructor readable ids.';

commit;
