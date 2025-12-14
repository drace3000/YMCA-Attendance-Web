# Monthly Schedule Load Procedure (Supabase)

This document describes the process used to import monthly class schedules from CSV into the Supabase database. It reflects the steps executed for January 2025, including branch scoping, UTF-8 handling, validation, normalization, and exception logging.

## Prerequisites
- Schema:
  - `classes` with `branch_id` (NOT NULL), unique on `(branch_id, name)`.
  - `class_sessions` with `branch_id`, `schedule_id`, `class_id`, `location_id`, `day_of_week`, `start_time`, `end_time`, `session_date` (NOT NULL), `headcount`; unique on `(branch_id, schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date)`.
  - `session_instructors` (session_id, instructor_id).
  - `locations` populated with required codes (e.g., S, MB, C, EP, SPC, FG, FP/EP).
  - `instructors` populated with nicknames for the target branch.
- Target branch for imports: Eastside Family YMCA (`branch_id = 26d6acb8-5acf-4a32-ac24-343f30b1442c`).
- Schedule row for the month: e.g., `January 2025`, `month_start = 2025-01-01`, `status = draft`, with its `schedule_id`.

## Input CSV Format (example)
```
Day,Start Time,End Time,Class Name,Location,Instructor 1,Instructor 2,Date 1,Attendance 1,Date 2,Attendance 2,Date 3,Attendance 3,Date 4,Attendance 4,Date 5,Attendance 5
```
Each row is a recurring slot; date/attendance pairs capture specific calendar occurrences.

## Load Procedure (per month)

1) Create/clear staging table
```sql
CREATE TABLE IF NOT EXISTS public.staging_month_raw (
  day text, start_time text, end_time text,
  class_name text, location_code text,
  instructor1 text, instructor2 text,
  date1 text, att1 text, date2 text, att2 text,
  date3 text, att3 text, date4 text, att4 text, date5 text, att5 text
);
TRUNCATE public.staging_month_raw;
```

2) Load CSV with UTF-8
- In PowerShell (UTF-8 safe):
```powershell
Get-Content -Encoding UTF8 "path\month.csv" |
  docker exec -i supabase_db_YMCA-Attendance-Web psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "COPY public.staging_month_raw FROM STDIN CSV HEADER;"
```
- Or copy into the container and `\copy ... WITH (ENCODING 'UTF8')`.

3) Ensure reference data
- Add any missing locations (e.g., `EP`).
- Add any missing classes for the branch (e.g., `TOTAL BODY STRONG`).
- Add any missing instructors (by nickname) for the branch (e.g., `DANIELLE B`).

4) Run the load script
- Unpivots date/attendance pairs into per-date rows.
- Normalizes class names for matching by stripping non-alphanumeric characters and uppercasing:
  - `norm_class = upper(regexp_replace(class_name, '[^A-Za-z0-9 ]','', 'g'))`
  - `norm_name` likewise for `classes.name`.
- Validates:
  - Class match (branch_id + normalized name)
  - Location match by code
  - Instructors by nickname (primary/secondary)
- Exceptions:
  - Persist rows failing any lookup to `public.<month>_load_exceptions` (e.g., `jan_load_exceptions`).
  - Valid rows continue.
- Time fixes:
  - If `end_time <= start_time`, add 12 hours to `end_time` to satisfy the time-order check.
- Upsert sessions:
```sql
ON CONFLICT (branch_id, schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date)
DO UPDATE SET headcount = EXCLUDED.headcount;
```
- Insert instructors:
  - Primary and optional secondary via `session_instructors` with `ON CONFLICT DO NOTHING`.
- Summaries: exception count and valid rows processed.

5) Outputs
- Exceptions CSV exported from the container (e.g., `backups/jan-load-exceptions.csv`).
- Session counts:
```sql
SELECT count(*) AS sessions, count(DISTINCT session_date) AS dates
FROM class_sessions
WHERE schedule_id = <month_schedule_id>;
```

6) Validation / Reporting Examples
- By location (month/Saturday):
```sql
SELECT l.code, avg(headcount), count(*)
FROM class_sessions cs JOIN locations l ON l.id=cs.location_id
WHERE schedule_id=<month>
GROUP BY l.code;

SELECT l.code, avg(headcount), count(*)
FROM class_sessions cs JOIN locations l ON l.id=cs.location_id
WHERE schedule_id=<month> AND day_of_week='SATURDAY'
GROUP BY l.code;
```
- By class name:
```sql
SELECT c.name, avg(headcount), count(*)
FROM class_sessions cs JOIN classes c ON c.id=cs.class_id
WHERE schedule_id=<month>
GROUP BY c.name
ORDER BY c.name;
```
- Group averages (normalize class names, then match to arrays of normalized names).

## Notes / Lessons
- Encoding: always load CSV with UTF-8; normalization strips symbols but preserves originals in staging.
- Branch scoping: uniqueness keys include `branch_id`; classes are per-branch; sessions conflict key uses `branch_id` and `session_date`.
- Idempotency: upserts allow reruns; headcount updates on conflict.
- Time sanity: roll `end_time` forward 12h when `end_time <= start_time`.
- Exceptions: persist for review; fix missing class/location/instructor, then rerun the load.

## Quick Steps Recap (per month)
1) Truncate `staging_month_raw`.
2) UTF-8 load the month CSV into `staging_month_raw`.
3) Ensure missing locations/classes/instructors are added for the branch.
4) Run the load script (normalized matching, upserts, exceptions persisted).
5) Export exceptions CSV; verify session counts; run summary reports.








