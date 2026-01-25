-- Migration: enable realtime on class_sessions
-- Tables affected: public.class_sessions (publication + RLS policy)
-- Author: AI Assistant
-- Date: 2026-01-25
--
-- Notes:
-- - Realtime will not deliver row changes unless the table is in the supabase_realtime publication.
-- - Realtime respects RLS; authenticated users must be allowed to SELECT the rows they subscribe to.

begin;

-- Enable realtime replication for class_sessions (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_sessions'
  ) then
    execute 'alter publication supabase_realtime add table public.class_sessions';
  end if;
exception
  when undefined_object then
    -- If the publication does not exist (unexpected in Supabase), skip.
    null;
end $$;

-- Allow authenticated branch recipients/admins to read sessions for their branch (required for realtime).
do $$
begin
  create policy "recipient_can_read_sessions_by_branch"
    on public.class_sessions
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.branch_schedule_recipients r
        where r.auth_user_id = auth.uid()
          and r.is_active = true
          and (
            r.recipient_type = 'Administrator'
            or r.branch_id = public.class_sessions.branch_id
          )
      )
    );
exception
  when duplicate_object then null;
end $$;

commit;

