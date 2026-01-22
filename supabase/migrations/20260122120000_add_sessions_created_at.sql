-- Migration: add sessions created_at
-- Tables affected: public.class_sessions
-- Author: AI Assistant
-- Date: 2026-01-22

begin;

alter table public.class_sessions
add column if not exists created_at timestamptz default now();

commit;
