-- Migration: add schedule approval lock
-- Tables affected: public.schedules
-- Author: AI Assistant
-- Date: 2026-01-18 (UTC)
--
-- Adds a schedule-level approval flag. When false, the schedule is considered
-- "pending approval" and must be treated as read-only by the app (no edits,
-- adds, deletes, or publish) until approved.

begin;

alter table public.schedules
add column if not exists is_approved boolean not null default true;

comment on column public.schedules.is_approved is
  'If false, schedule is locked pending approval; app must block edits/adds/deletes/publish until approved.';

commit;

