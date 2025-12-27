# How To Properly “Full Restore” (Local Supabase)

This runbook documents the **safe and repeatable** way to fully restore the YMCA Attendance local Supabase database from a `.dump`/`pg_dump -Fc` archive.

## What “full restore” means here

- **Full restore of the application database** = restore everything in the `public` schema (tables, data, functions, RLS, indexes, triggers, etc.).
- We **do not** attempt to overwrite Supabase-managed schemas like `auth`, `realtime`, `storage`, or internal event triggers, because local Supabase runs those with superuser-owned objects that commonly cause `pg_restore` ownership/permission failures.

If you truly need an “all schemas” restore, you must restore as the true superuser (typically `supabase_admin`) with the correct password and accept that you may break local Supabase internals. For day-to-day development, **restore `public` only**.

---

## Prerequisites

- Docker Desktop is running
- Supabase local stack is running:

```powershell
supabase status
```

- You have a backup file created by `pg_dump -Fc` (custom format), e.g.:
  - `backups/supabase_backup_20251226_124854_full.dump`

---

## Step 0 — Identify the Postgres container name

```powershell
docker ps --filter "name=supabase_db" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Example output:
- `supabase_db_YMCA-Attendance-Web-2`

---

## Step 1 (recommended) — Take a safety backup before overwriting

This repo includes a local backup script:

```powershell
cd .\scripts
.\backup_dev.ps1
```

It will produce `backups/dev_backup_YYYYMMDD_HHMMSS.backup`.

---

## Step 2 — Copy the dump into the DB container

Copying into the container avoids Windows redirection/path issues and keeps the restore command simple.

```powershell
$dbContainer = "<PASTE_DB_CONTAINER_NAME>"
$dump = "C:\Projects\Cursor-YMCA-Web\YMCA-Attendance-Web\backups\supabase_backup_20251226_124854_full.dump"

docker cp $dump "${dbContainer}:/tmp/restore.dump"
```

---

## Step 3 — (Optional) terminate PostgREST sessions that may hold locks

If the stack is running, PostgREST may hold idle connections as `authenticator`. These can sometimes block drops during `--clean`.

```powershell
$dbContainer = "<PASTE_DB_CONTAINER_NAME>"

docker exec -i $dbContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c `
  "select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and usename='authenticator';"
```

If you see superuser sessions (e.g., `supabase_admin` for cron/net), you typically **cannot** terminate those as `postgres` in local Supabase, and you shouldn’t need to.

---

## Step 4 — Restore the application DB (`public` schema only)

This is the **recommended** “full restore” for local development.

```powershell
$dbContainer = "<PASTE_DB_CONTAINER_NAME>"

docker exec -i $dbContainer pg_restore -U postgres -d postgres `
  --clean --if-exists --no-owner --no-acl --verbose `
  --schema=public `
  /tmp/restore.dump
```

What the flags mean:
- `--schema=public`: restore only the app schema (avoids `auth`/`storage`/`realtime` permission issues).
- `--clean --if-exists`: drop existing objects first (destructive overwrite).
- `--no-owner --no-acl`: avoid ownership/privilege conflicts.
- `--verbose`: emits progress.

---

## Step 5 — Verify restore worked (sanity row counts)

```powershell
$dbContainer = "<PASTE_DB_CONTAINER_NAME>"
$sql = @"
select 'branches' as tbl, count(*) cnt from public.branches
union all select 'classes', count(*) from public.classes
union all select 'instructors', count(*) from public.instructors
union all select 'locations', count(*) from public.locations
union all select 'schedules', count(*) from public.schedules
union all select 'class_sessions', count(*) from public.class_sessions
union all select 'session_instructors', count(*) from public.session_instructors
union all select 'branch_schedule_recipients', count(*) from public.branch_schedule_recipients
order by tbl;
"@

echo $sql | docker exec -i $dbContainer psql -U postgres -d postgres
```

You should see expected counts (non-zero for main tables).

---

## Step 6 — Cleanup

```powershell
$dbContainer = "<PASTE_DB_CONTAINER_NAME>"
docker exec $dbContainer rm -f /tmp/restore.dump
```

---

## Troubleshooting

### “All schemas” restore fails with ownership/permission errors
Symptoms:
- `must be owner of relation auth.users`
- `permission denied for schema storage`
- event trigger errors like `Non-superuser owned event trigger must execute a non-superuser owned function`

Fix:
- Use the **recommended** restore with `--schema=public`.

### Restore fails due to locks / “database is being accessed by other users”
- Run the terminate-PostgREST step (terminate `authenticator` sessions) and retry restore.

### Dump/restore version mismatch
If you ever see `pg_restore: error: unsupported version ...`, run `pg_restore` from **inside** the container (as this guide does) so the tool version matches the DB image.


