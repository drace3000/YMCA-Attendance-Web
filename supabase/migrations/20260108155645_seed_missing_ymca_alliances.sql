-- migration: seed missing ymca alliances (complete 29 alliances)
-- purpose: bring ymca_alliances seed set in line with documents/ymca_database_schema.md
-- tables affected: public.ymca_alliances, public.ymca_alliance_states
-- created: 2026-01-08 (utc)

begin;

-- add the missing state alliances from the reference document
insert into public.ymca_alliances (code, name, short_name, alliance_type, website_url, headquarters_state_code, notes) values
  ('ga', 'state ymca of georgia', 'georgia alliance', 'state', null, 'ga', 'founded 1919'),
  ('il', 'illinois state alliance of ymcas', 'illinois alliance', 'state', null, 'il', null),
  ('mi', 'michigan alliance of ymcas', 'michigan alliance', 'state', null, 'mi', null),
  ('nc', 'north carolina alliance of ymcas', 'north carolina alliance', 'state', null, 'nc', null)
on conflict (code) do nothing;

-- add alliance-to-state mappings for state alliances (idempotent)
insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'ca', true from public.ymca_alliances where code = 'ca'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'tx', true from public.ymca_alliances where code = 'tx'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'fl', true from public.ymca_alliances where code = 'fl'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'oh', true from public.ymca_alliances where code = 'oh'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'pa', true from public.ymca_alliances where code = 'pa'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'ny', true from public.ymca_alliances where code = 'ny'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'nj', true from public.ymca_alliances where code = 'nj'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'in', true from public.ymca_alliances where code = 'in'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'mo', true from public.ymca_alliances where code = 'mo'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'va', true from public.ymca_alliances where code = 'va'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'wa', true from public.ymca_alliances where code = 'wa'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'az', true from public.ymca_alliances where code = 'az'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'ga', true from public.ymca_alliances where code = 'ga'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'il', true from public.ymca_alliances where code = 'il'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'mi', true from public.ymca_alliances where code = 'mi'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'nc', true from public.ymca_alliances where code = 'nc'
on conflict (state_code) do nothing;

insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'tn', true from public.ymca_alliances where code = 'tn'
on conflict (state_code) do nothing;

commit;
