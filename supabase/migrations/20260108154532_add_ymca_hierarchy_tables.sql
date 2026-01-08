-- migration: add ymca hierarchy tables (alliances/associations/branches)
-- purpose: introduce ymca org hierarchy tables for multi-tenant expansion per documents/ymca_database_schema.md
-- tables affected: public.us_states, public.ymca_alliances, public.ymca_alliance_states, public.ymca_associations, public.ymca_branches
-- created: 2026-01-08 (utc)

begin;

-- ============================================================================
-- enums
-- ============================================================================

do $$
begin
  create type public.ymca_alliance_type as enum ('state', 'regional');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- tables
-- ============================================================================

-- us states and territories
create table if not exists public.us_states (
  id uuid primary key default gen_random_uuid(),
  code char(2) not null unique,
  name varchar(100) not null,
  is_territory boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ymca alliances (state and regional)
create table if not exists public.ymca_alliances (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  name varchar(200) not null,
  short_name varchar(100),
  alliance_type public.ymca_alliance_type not null,
  website_url varchar(500),
  contact_email varchar(255),
  contact_phone varchar(50),
  headquarters_city varchar(100),
  headquarters_state_code char(2) references public.us_states(code),
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- alliance to state mapping (each state belongs to at most one alliance)
create table if not exists public.ymca_alliance_states (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.ymca_alliances(id) on delete cascade,
  state_code char(2) not null references public.us_states(code) on delete cascade,
  is_primary boolean default true,
  created_at timestamptz default now(),
  constraint unique_state_alliance unique (state_code)
);

-- ymca associations (independent nonprofits)
create table if not exists public.ymca_associations (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique,
  name varchar(200) not null,
  short_name varchar(100),
  alliance_id uuid references public.ymca_alliances(id),
  state_code char(2) not null references public.us_states(code),
  website_url varchar(500),
  main_phone varchar(50),
  main_email varchar(255),
  hq_address_line1 varchar(200),
  hq_address_line2 varchar(200),
  hq_city varchar(100),
  hq_state_code char(2) references public.us_states(code),
  hq_postal_code varchar(20),
  ein varchar(20),
  is_active boolean default true,
  subscription_tier varchar(50),
  subscription_status varchar(50) default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ymca branches (physical locations)
create table if not exists public.ymca_branches (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null,
  name varchar(200) not null,
  short_name varchar(100),
  association_id uuid not null references public.ymca_associations(id) on delete cascade,
  address_line1 varchar(200),
  address_line2 varchar(200),
  city varchar(100),
  state_code char(2) references public.us_states(code),
  postal_code varchar(20),
  county varchar(100),
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  timezone varchar(50) default 'america/new_york',
  phone varchar(50),
  email varchar(255),
  website_url varchar(500),
  is_active boolean default true,
  is_main_branch boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_branch_code_per_association unique (association_id, code)
);

-- ============================================================================
-- indexes
-- ============================================================================

create index if not exists idx_alliance_states_alliance on public.ymca_alliance_states(alliance_id);
create index if not exists idx_alliance_states_state on public.ymca_alliance_states(state_code);
create index if not exists idx_alliances_type on public.ymca_alliances(alliance_type);
create index if not exists idx_alliances_active on public.ymca_alliances(is_active);
create index if not exists idx_associations_alliance on public.ymca_associations(alliance_id);
create index if not exists idx_associations_state on public.ymca_associations(state_code);
create index if not exists idx_associations_active on public.ymca_associations(is_active);
create index if not exists idx_branches_association on public.ymca_branches(association_id);
create index if not exists idx_branches_state on public.ymca_branches(state_code);
create index if not exists idx_branches_active on public.ymca_branches(is_active);

-- ============================================================================
-- seed data (idempotent)
-- ============================================================================

-- us states (52)
insert into public.us_states (code, name, is_territory) values
  ('al', 'alabama', false),
  ('ak', 'alaska', false),
  ('az', 'arizona', false),
  ('ar', 'arkansas', false),
  ('ca', 'california', false),
  ('co', 'colorado', false),
  ('ct', 'connecticut', false),
  ('de', 'delaware', false),
  ('dc', 'district of columbia', true),
  ('fl', 'florida', false),
  ('ga', 'georgia', false),
  ('hi', 'hawaii', false),
  ('id', 'idaho', false),
  ('il', 'illinois', false),
  ('in', 'indiana', false),
  ('ia', 'iowa', false),
  ('ks', 'kansas', false),
  ('ky', 'kentucky', false),
  ('la', 'louisiana', false),
  ('me', 'maine', false),
  ('md', 'maryland', false),
  ('ma', 'massachusetts', false),
  ('mi', 'michigan', false),
  ('mn', 'minnesota', false),
  ('ms', 'mississippi', false),
  ('mo', 'missouri', false),
  ('mt', 'montana', false),
  ('ne', 'nebraska', false),
  ('nv', 'nevada', false),
  ('nh', 'new hampshire', false),
  ('nj', 'new jersey', false),
  ('nm', 'new mexico', false),
  ('ny', 'new york', false),
  ('nc', 'north carolina', false),
  ('nd', 'north dakota', false),
  ('oh', 'ohio', false),
  ('ok', 'oklahoma', false),
  ('or', 'oregon', false),
  ('pa', 'pennsylvania', false),
  ('pr', 'puerto rico', true),
  ('ri', 'rhode island', false),
  ('sc', 'south carolina', false),
  ('sd', 'south dakota', false),
  ('tn', 'tennessee', false),
  ('tx', 'texas', false),
  ('ut', 'utah', false),
  ('vt', 'vermont', false),
  ('va', 'virginia', false),
  ('wa', 'washington', false),
  ('wv', 'west virginia', false),
  ('wi', 'wisconsin', false),
  ('wy', 'wyoming', false)
on conflict (code) do nothing;

-- ymca alliances (seeded from document; codes are internal)
insert into public.ymca_alliances (code, name, short_name, alliance_type, website_url, headquarters_state_code, notes) values
  ('ca', 'california state alliance of ymcas', 'california alliance', 'state', 'https://www.ymcasofca.org/', 'ca', '33 independent ymcas + 3 armed services ymcas'),
  ('tx', 'texas state alliance of ymcas', 'texas alliance', 'state', 'https://texasallianceymcas.org/', 'tx', 'over 700 facilities'),
  ('fl', 'florida state alliance of ymcas', 'florida alliance', 'state', 'https://www.floridaymcas.org/', 'fl', '1 in 18 florida residents involved'),
  ('oh', 'ohio alliance of ymcas', 'ohio alliance', 'state', 'https://www.ohioymcas.org/', 'oh', '163 ymcas serving 800k+ families'),
  ('pa', 'pennsylvania state alliance of ymcas', 'pennsylvania alliance', 'state', 'https://psays.com/', 'pa', '58 associations, 108 branches'),
  ('ny', 'alliance of new york state ymcas', 'new york alliance', 'state', 'http://www.ymcanys.org/', 'ny', '38 independent ymcas, 135+ branches'),
  ('nj', 'new jersey ymca state alliance', 'new jersey alliance', 'state', 'https://www.njymca.org/', 'nj', null),
  ('in', 'indiana alliance of ymcas', 'indiana alliance', 'state', 'https://www.indianaymcas.org/', 'in', null),
  ('mo', 'missouri state alliance of ymcas', 'missouri alliance', 'state', 'https://moymca.org/', 'mo', '24 ymcas'),
  ('va', 'virginia alliance of ymcas', 'virginia alliance', 'state', 'https://virginiaymcaalliance.org/', 'va', null),
  ('wa', 'washington state alliance of ymcas', 'washington alliance', 'state', 'https://www.seattleymca.org/washington-ymcas/', 'wa', '15 ymcas, 50 branches, 8 camps'),
  ('az', 'alliance of arizona ymcas', 'arizona alliance', 'state', 'https://azymcas.org/', 'az', null),
  ('tn', 'state alliance of ymcas (tn)', 'tennessee alliance', 'state', null, 'tn', null),
  ('nne', 'ymca alliance of northern new england', 'northern new england', 'regional', 'https://nneymcas.org/', 'me', 'me, nh, vt - 25 ymcas'),
  ('umw', 'upper midwest alliance of ymcas', 'upper midwest', 'regional', 'https://www.uppermidwestymcas.org/', 'wi', 'wi, mn'),
  ('pac', 'pacific alliance of ymcas', 'pacific alliance', 'regional', null, 'wa', 'or, ak, id'),
  ('kywy', 'kentucky & west virginia alliance of ymcas', 'ky-wv alliance', 'regional', null, 'ky', null),
  ('mar', 'massachusetts alliance of ymcas', 'massachusetts', 'regional', null, 'ma', null),
  ('sne', 'southern new england alliance of ymcas', 'southern new england', 'regional', null, 'ct', 'ct, ri'),
  ('tri', 'ymca of the triangle', 'triangle', 'regional', 'https://www.ymcatriangle.org/', 'nc', 'nc triangle region'),
  ('gwr', 'gateway region ymca', 'gateway region', 'regional', 'https://gwrymca.org/', 'mo', 'st. louis metro'),
  ('rmt', 'rocky mountain alliance of ymcas', 'rocky mountain', 'regional', null, 'co', 'co, wy, mt'),
  ('swa', 'southwest alliance of ymcas', 'southwest', 'regional', null, 'nm', null),
  ('sea', 'southeast alliance of ymcas', 'southeast', 'regional', null, 'al', 'al, ms, la'),
  ('pra', 'puerto rico ymca alliance', 'puerto rico', 'regional', null, 'pr', null)
on conflict (code) do nothing;

-- alliance-state mappings (subset needed for our initial association + common examples)
insert into public.ymca_alliance_states (alliance_id, state_code, is_primary)
select id, 'ny', true from public.ymca_alliances where code = 'ny'
on conflict (state_code) do nothing;

-- initial association (greater rochester)
insert into public.ymca_associations (
  code, name, short_name, alliance_id, state_code, website_url, main_phone, main_email, hq_city, hq_state_code, is_active, notes
) values (
  'groc',
  'ymca of greater rochester',
  'greater rochester',
  (select id from public.ymca_alliances where code = 'ny'),
  'ny',
  'https://rochesterymca.org/',
  null,
  null,
  'rochester',
  'ny',
  true,
  'initial implementation association'
)
on conflict (code) do nothing;

-- seed ymca_branches from existing app branches (keeps ids aligned for later fk cutover)
insert into public.ymca_branches (
  id, code, name, short_name, association_id, city, state_code, postal_code, phone, email, is_active, is_main_branch, created_at, updated_at
)
select
  b.id,
  b.code,
  b.name,
  b.name,
  (select id from public.ymca_associations where code = 'groc'),
  nullif(b.city, ''),
  nullif(lower(b.state), '')::char(2),
  nullif(b.zip, ''),
  nullif(b.phone, ''),
  null,
  true,
  (b.code = 'main_branch'),
  now(),
  now()
from public.branches b
on conflict (association_id, code) do nothing;

-- ============================================================================
-- views and helper functions
-- ============================================================================

create or replace view public.v_org_hierarchy as
select
  al.code as alliance_code,
  al.name as alliance_name,
  al.alliance_type,
  assoc.code as association_code,
  assoc.name as association_name,
  assoc.hq_city as association_city,
  b.code as branch_code,
  b.name as branch_name,
  b.city as branch_city,
  b.state_code,
  b.is_active as branch_active
from public.ymca_branches b
join public.ymca_associations assoc on b.association_id = assoc.id
left join public.ymca_alliances al on assoc.alliance_id = al.id
order by al.name, assoc.name, b.name;

create or replace view public.v_association_summary as
select
  assoc.id,
  assoc.code,
  assoc.name,
  assoc.hq_city,
  assoc.state_code,
  al.name as alliance_name,
  assoc.subscription_tier,
  assoc.subscription_status,
  assoc.is_active,
  count(b.id) as branch_count,
  count(b.id) filter (where b.is_active) as active_branch_count
from public.ymca_associations assoc
left join public.ymca_alliances al on assoc.alliance_id = al.id
left join public.ymca_branches b on assoc.id = b.association_id
group by
  assoc.id, assoc.code, assoc.name, assoc.hq_city, assoc.state_code,
  al.name, assoc.subscription_tier, assoc.subscription_status, assoc.is_active;

create or replace function public.get_alliance_for_state(p_state_code char(2))
returns table (
  alliance_id uuid,
  alliance_code varchar(20),
  alliance_name varchar(200),
  alliance_type public.ymca_alliance_type,
  website_url varchar(500)
)
language sql
stable
as $$
  select a.id, a.code, a.name, a.alliance_type, a.website_url
  from public.ymca_alliances a
  join public.ymca_alliance_states yas on a.id = yas.alliance_id
  where yas.state_code = lower(p_state_code) and a.is_active = true;
$$;

create or replace function public.get_branches_for_association(p_association_code varchar(50))
returns table (
  branch_id uuid,
  branch_code varchar(50),
  branch_name varchar(200),
  city varchar(100),
  state_code char(2),
  is_active boolean
)
language sql
stable
as $$
  select b.id, b.code, b.name, b.city, b.state_code, b.is_active
  from public.ymca_branches b
  join public.ymca_associations a on b.association_id = a.id
  where a.code = lower(p_association_code)
  order by b.name;
$$;

-- ============================================================================
-- rls (read-only for lookup tables)
-- ============================================================================

alter table public.us_states enable row level security;
alter table public.ymca_alliances enable row level security;
alter table public.ymca_alliance_states enable row level security;
alter table public.ymca_associations enable row level security;
alter table public.ymca_branches enable row level security;

do $$
begin
  create policy "public_read_us_states" on public.us_states for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_read_ymca_alliances" on public.ymca_alliances for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_read_ymca_alliance_states" on public.ymca_alliance_states for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_read_ymca_associations" on public.ymca_associations for select using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_read_ymca_branches" on public.ymca_branches for select using (true);
exception when duplicate_object then null;
end $$;

commit;
