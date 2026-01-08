-- migration: migrate branch foreign keys to ymca_branches
-- purpose: move existing branch references from public.branches to public.ymca_branches while keeping ids aligned
-- tables affected: public.ymca_branches and all tables with branch_id fks (classes, schedules, class_sessions, instructors, etc.)
-- created: 2026-01-08 (utc)

begin;

-- ============================================================================
-- 1) extend ymca_branches with app-specific branch settings fields
-- ============================================================================

alter table public.ymca_branches
  add column if not exists address text;

alter table public.ymca_branches
  add column if not exists state text;

alter table public.ymca_branches
  add column if not exists zip text;

alter table public.ymca_branches
  add column if not exists description text;

alter table public.ymca_branches
  add column if not exists schedule_email_from text;

alter table public.ymca_branches
  add column if not exists schedule_email_reply_to text;

alter table public.ymca_branches
  add column if not exists branch_manager_name text;

alter table public.ymca_branches
  add column if not exists branch_manager_email text;

alter table public.ymca_branches
  add column if not exists branch_manager_phone text;

alter table public.ymca_branches
  add column if not exists theme_color text;

-- backfill from existing public.branches (ids were seeded to match)
update public.ymca_branches y
set
  address = b.address,
  state = b.state,
  zip = b.zip,
  description = b.description,
  schedule_email_from = b.schedule_email_from,
  schedule_email_reply_to = b.schedule_email_reply_to,
  website_url = coalesce(y.website_url, nullif(b.website_url, '')),
  phone = coalesce(y.phone, nullif(b.phone, '')),
  branch_manager_name = b.branch_manager_name,
  branch_manager_email = b.branch_manager_email,
  branch_manager_phone = b.branch_manager_phone,
  theme_color = b.theme_color,
  address_line1 = coalesce(y.address_line1, nullif(b.address, '')),
  city = coalesce(y.city, nullif(b.city, '')),
  state_code = coalesce(y.state_code, nullif(lower(b.state), '')::char(2)),
  postal_code = coalesce(y.postal_code, nullif(b.zip, '')),
  notes = coalesce(y.notes, b.description),
  updated_at = now()
from public.branches b
where y.id = b.id;

-- ============================================================================
-- 2) repoint foreign keys from public.branches(id) -> public.ymca_branches(id)
--    ids match, so no data rewrite is needed.
-- ============================================================================

-- branch_program_groups.branch_id
alter table public.branch_program_groups
  drop constraint if exists branch_program_groups_branch_id_fkey;

alter table public.branch_program_groups
  add constraint branch_program_groups_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete cascade;

-- branch_schedule_recipients.branch_id
alter table public.branch_schedule_recipients
  drop constraint if exists branch_schedule_recipients_branch_id_fkey;

alter table public.branch_schedule_recipients
  add constraint branch_schedule_recipients_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete cascade;

-- class_sessions.branch_id
alter table public.class_sessions
  drop constraint if exists class_sessions_branch_id_fkey;

alter table public.class_sessions
  add constraint class_sessions_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete set null;

-- classes.branch_id
alter table public.classes
  drop constraint if exists classes_branch_id_fkey;

alter table public.classes
  add constraint classes_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete set null;

-- error_logs.branch_id
alter table public.error_logs
  drop constraint if exists error_logs_branch_id_fkey;

alter table public.error_logs
  add constraint error_logs_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete set null;

-- instructor_branches.branch_id
alter table public.instructor_branches
  drop constraint if exists instructor_branches_branch_id_fkey;

alter table public.instructor_branches
  add constraint instructor_branches_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete cascade;

-- instructors.branch_id
alter table public.instructors
  drop constraint if exists instructors_branch_fk;

alter table public.instructors
  add constraint instructors_branch_fk
  foreign key (branch_id) references public.ymca_branches(id) on update cascade on delete set null;

-- saved_queries.branch_id
alter table public.saved_queries
  drop constraint if exists saved_queries_branch_id_fkey;

alter table public.saved_queries
  add constraint saved_queries_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete cascade;

-- schedules.branch_id
alter table public.schedules
  drop constraint if exists schedules_branch_id_fkey;

alter table public.schedules
  add constraint schedules_branch_id_fkey
  foreign key (branch_id) references public.ymca_branches(id) on delete set null;

commit;
