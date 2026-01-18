-- Migration: create branch_user_ui_state (per-user UI preferences)
-- Purpose: Persist small UI preferences per user + branch (Smart Scheduler modal positions)
-- Tables affected: public.branch_user_ui_state (new)
-- Created: 2026-01-14 (utc)

begin;

-- ============================================================================
-- table: branch_user_ui_state
-- ============================================================================
-- Stores small UI preferences as JSONB values, scoped by:
--   - branch_id (tenant)
--   - user_id (auth user)
--   - scope (feature area, e.g. 'smart_scheduler')
--   - key (specific setting name)
--
-- Example values:
--   scope='smart_scheduler', key='add_session_modal_offset',  value={ "x": 12, "y": -8 }
--   scope='smart_scheduler', key='edit_session_modal_offset', value={ "x": 40, "y": 16 }

create table if not exists public.branch_user_ui_state (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.ymca_branches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  key text not null,
  value jsonb not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- Enable row level security (required)
alter table public.branch_user_ui_state enable row level security;

-- Unique per user + branch + feature scope + key
create unique index if not exists ux_branch_user_ui_state_branch_user_scope_key
  on public.branch_user_ui_state (branch_id, user_id, scope, key);

-- Common lookup index
create index if not exists idx_branch_user_ui_state_branch_user
  on public.branch_user_ui_state (branch_id, user_id);

-- Keep updated_at in sync on update
do $$
begin
  create trigger on_branch_user_ui_state_updated
    before update on public.branch_user_ui_state
    for each row execute function public.handle_updated_at();
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- rls policies (authenticated users only)
-- ============================================================================

do $$
begin
  create policy "authenticated_select_branch_user_ui_state"
    on public.branch_user_ui_state
    for select
    to authenticated
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_insert_branch_user_ui_state"
    on public.branch_user_ui_state
    for insert
    to authenticated
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_update_branch_user_ui_state"
    on public.branch_user_ui_state
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated_delete_branch_user_ui_state"
    on public.branch_user_ui_state
    for delete
    to authenticated
    using (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

-- Grant table privileges to authenticated (RLS still applies)
grant select, insert, update, delete on table public.branch_user_ui_state to authenticated;

commit;


