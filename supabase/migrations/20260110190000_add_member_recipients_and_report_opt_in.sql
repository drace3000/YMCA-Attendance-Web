-- migration: add member recipients + report opt-in
-- purpose: extend branch_schedule_recipients recipient_type values and add receives_reports flag for Member recipients
-- tables affected: public.branch_schedule_recipients
-- created: 2026-01-10 (utc)

begin;

-- ============================================================================
-- 0) temporarily drop old recipient_type constraint (it only allowed Normal/Admin)
--    so we can safely backfill Normal -> Branch before adding the new constraint.
-- ============================================================================

alter table public.branch_schedule_recipients
  drop constraint if exists chk_recipient_type;

-- ============================================================================
-- 1) add receives_reports flag (default false)
-- ============================================================================

alter table public.branch_schedule_recipients
  add column if not exists receives_reports boolean;

update public.branch_schedule_recipients
set receives_reports = false
where receives_reports is null;

alter table public.branch_schedule_recipients
  alter column receives_reports set default false;

alter table public.branch_schedule_recipients
  alter column receives_reports set not null;

comment on column public.branch_schedule_recipients.receives_reports is
'If true (Member recipients only), include this email in the report Email recipient pickers (To/CC/BCC).';

-- ============================================================================
-- 2) rename Normal -> Branch (data + default)
-- ============================================================================

update public.branch_schedule_recipients
set recipient_type = 'Branch'
where recipient_type = 'Normal';

-- Ensure any newly inserted rows default to Branch (instead of legacy Normal).
alter table public.branch_schedule_recipients
  alter column recipient_type set default 'Branch';

-- ============================================================================
-- 3) expand recipient_type constraint
--    allow: Administrator | Branch | Member
-- ============================================================================

alter table public.branch_schedule_recipients
  add constraint chk_recipient_type
  check (recipient_type in ('Administrator', 'Branch', 'Member'));

-- ============================================================================
-- 4) indexes (optional, improves picker performance)
-- ============================================================================

create index if not exists idx_recipients_member_reports_opt_in
  on public.branch_schedule_recipients (branch_id)
  where recipient_type = 'Member' and receives_reports = true;

commit;

