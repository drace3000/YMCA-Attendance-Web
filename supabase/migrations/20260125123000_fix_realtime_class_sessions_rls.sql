-- Migration: fix realtime RLS for class_sessions (recipient email-based access)
-- Tables affected: public.class_sessions (RLS policy)
-- Author: AI Assistant
-- Date: 2026-01-25
--
-- Notes:
-- - The web app determines recipient access by matching the authenticated user's email to
--   public.branch_schedule_recipients.email (see web/src/lib/requireRecipientAccess.ts).
-- - Realtime subscriptions respect RLS; authenticated users must be able to SELECT rows.

begin;

-- Remove the previous (auth_user_id-based) policy if it exists.
do $$
begin
  drop policy if exists "recipient_can_read_sessions_by_branch" on public.class_sessions;
exception
  when undefined_object then null;
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
        where lower(btrim(r.email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
          and r.is_active = true
          and r.recipient_type <> 'Member'
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

