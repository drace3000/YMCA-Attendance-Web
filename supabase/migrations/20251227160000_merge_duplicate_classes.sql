-- Migration: Merge duplicate class names
-- Purpose: Normalize class names by merging duplicates
-- Tables affected: class_sessions, classes
-- Created: 2025-12-27 UTC
-- Note: Using UUIDs to avoid encoding issues with trademark/registered symbols

begin;

-- 1. AQUA FIT -> AQUAFIT (190 sessions to move)
-- From: c2456e6b-ce3f-45ba-aaa9-0dda53b64133 (AQUA FIT)
-- To:   a6e6ede9-ccbb-43d1-9335-382d26a70b72 (AQUAFIT)
update class_sessions 
set class_id = 'a6e6ede9-ccbb-43d1-9335-382d26a70b72'
where class_id = 'c2456e6b-ce3f-45ba-aaa9-0dda53b64133';

delete from classes where id = 'c2456e6b-ce3f-45ba-aaa9-0dda53b64133';

-- 2. GRIT - CARDIO -> GRIT-CARDIO (282 sessions to move)
-- From: 74278038-3938-48b1-8eec-6d5f53099108 (GRIT - CARDIO with trademark)
-- To:   3ad786c1-7b4b-4bbb-9551-a65bd06e4bb7 (GRIT-CARDIO with trademark)
update class_sessions 
set class_id = '3ad786c1-7b4b-4bbb-9551-a65bd06e4bb7'
where class_id = '74278038-3938-48b1-8eec-6d5f53099108';

delete from classes where id = '74278038-3938-48b1-8eec-6d5f53099108';

-- 3. SILVER CYCLE -> SILVER CYCLE with registered (0 sessions, just delete)
-- Delete: f49c645a-166c-4904-9066-9be9977604fb (SILVER CYCLE without symbol)
delete from classes where id = 'f49c645a-166c-4904-9066-9be9977604fb';

-- 4. ZUMBA GOLD + ZUMBA with registered GOLD -> ZUMBA GOLD with registered
-- Keep:   2a6cbe00-7bea-4a8f-b95f-d590b19d2846 (rename to ZUMBA GOLD with registered at end)
-- Delete: 97059d5d-c1b3-441b-b28a-6d415a8b6fbb (ZUMBA GOLD without symbol)

-- First rename the target class (move registered symbol to end)
update classes set name = 'ZUMBA GOLD' || chr(174) where id = '2a6cbe00-7bea-4a8f-b95f-d590b19d2846';

-- Then move sessions from ZUMBA GOLD to the renamed class (38 sessions)
update class_sessions 
set class_id = '2a6cbe00-7bea-4a8f-b95f-d590b19d2846'
where class_id = '97059d5d-c1b3-441b-b28a-6d415a8b6fbb';

delete from classes where id = '97059d5d-c1b3-441b-b28a-6d415a8b6fbb';

commit;

