-- migration: add auth fields + global unique email for recipients
-- purpose: prepare branch_schedule_recipients for branch manager authentication linking and lifecycle tracking
-- tables affected: public.branch_schedule_recipients
-- created: 2026-01-09 (utc)
--
-- notes:
-- - email uniqueness is enforced globally (entire table) and case-insensitive via a unique index on lower(email)
-- - this aligns with the requirement that each branch manager user is uniquely identified by email
-- - migration will raise an exception if duplicate emails exist after normalization

begin;

-- ============================================================================
-- 1) add authentication linkage + lifecycle columns
-- ============================================================================

alter table public.branch_schedule_recipients
  add column if not exists auth_user_id uuid;

comment on column public.branch_schedule_recipients.auth_user_id is
'References auth.users.id for the user who owns this recipient record (branch manager / admin). Nullable for legacy schedule-only recipients.';

alter table public.branch_schedule_recipients
  add column if not exists last_login_at timestamptz;

comment on column public.branch_schedule_recipients.last_login_at is
'Last successful login timestamp for this user (server-set).';

-- is_active: add as nullable first, backfill, then enforce not null + default.
alter table public.branch_schedule_recipients
  add column if not exists is_active boolean;

update public.branch_schedule_recipients
set is_active = true
where is_active is null;

alter table public.branch_schedule_recipients
  alter column is_active set default true;

alter table public.branch_schedule_recipients
  alter column is_active set not null;

comment on column public.branch_schedule_recipients.is_active is
'If false, the user account is deactivated and must not be allowed to sign in.';

-- needs_password_setup: add as nullable first, backfill, then enforce not null + default.
alter table public.branch_schedule_recipients
  add column if not exists needs_password_setup boolean;

update public.branch_schedule_recipients
set needs_password_setup = true
where needs_password_setup is null;

alter table public.branch_schedule_recipients
  alter column needs_password_setup set default true;

alter table public.branch_schedule_recipients
  alter column needs_password_setup set not null;

comment on column public.branch_schedule_recipients.needs_password_setup is
'If true, the user must change their temporary password at next login before accessing the app.';

-- ============================================================================
-- 2) normalize email and enforce global, case-insensitive uniqueness
-- ============================================================================

-- normalize existing emails to lowercase and trimmed (safe before uniqueness constraint).
update public.branch_schedule_recipients
set email = lower(btrim(email))
where email is not null
  and email <> lower(btrim(email));

-- guard: fail early if duplicates exist after normalization.
do $$
declare
  dup_list text;
begin
  select string_agg(email_ci, ', ') into dup_list
  from (
    select lower(email) as email_ci
    from public.branch_schedule_recipients
    where email is not null
    group by lower(email)
    having count(*) > 1
    order by lower(email)
    limit 20
  ) d;

  if dup_list is not null then
    raise exception 'duplicate emails found in public.branch_schedule_recipients (case-insensitive). resolve before applying unique constraint. examples: %', dup_list;
  end if;
end $$;

-- enforce case-insensitive uniqueness globally (entire table).
create unique index if not exists idx_recipients_email_unique_ci
  on public.branch_schedule_recipients (lower(email));

-- ============================================================================
-- 3) performance indexes
-- ============================================================================

create index if not exists idx_recipients_auth_user_id
  on public.branch_schedule_recipients (auth_user_id)
  where auth_user_id is not null;

commit;

