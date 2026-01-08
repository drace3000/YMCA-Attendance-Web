-- migration: replace public.branches with a view over public.ymca_branches
-- purpose: avoid duplicate/stale branch data after migrating fks and app reads to ymca_branches
-- notes: non-destructive; preserves old table as public.branches_legacy
-- created: 2026-01-08 (utc)

begin;

-- rename the legacy table only if it exists and we haven't already renamed it
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'branches'
      and c.relkind = 'r' -- table
  ) and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'branches_legacy'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.branches rename to branches_legacy';
  end if;
end $$;

-- create/replace a compatibility view named public.branches backed by ymca_branches
create or replace view public.branches as
select
  y.id,
  y.code::text as code,
  y.name::text as name,
  y.created_at,
  y.address,
  y.city::text as city,
  y.state,
  y.zip,
  y.phone::text as phone,
  y.description,
  y.schedule_email_from,
  y.schedule_email_reply_to,
  y.website_url::text as website_url,
  y.branch_manager_name,
  y.branch_manager_email,
  y.branch_manager_phone,
  y.theme_color
from public.ymca_branches y;

commit;
