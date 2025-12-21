# Supabase Environment Flow (Local → Staging → Production)

## Environments
- **Production (remote):** `pgsqtbblahihqesnvwxd` (already used by the instructor app)
- **Staging (remote):** `gchkarlboevsyxixeocd` (safe pre-prod testing)
- **Local (Docker via Supabase CLI):** disposable dev DB for day-to-day work

## What lives where
- **Schema/RLS/RPCs:** versioned in `supabase/migrations/`
- **Seeds/test data:** `supabase/seed.sql` (synthetic, non-PII). Applied on `supabase db reset` (local). For Staging, run the same seed manually or (if acceptable) reset Staging.
- **Baseline:** `supabase/migrations/20251212_baseline.sql` mirrors the current Prod schema.

## Typical workflow
1) **Local (Dev)**
   - Start stack: `supabase start`
   - Apply migrations + seeds: `supabase db reset`
   - Develop/test changes (schema/RLS/RPC/edge functions)

2) **Promote to Staging**
   - Link staging: `supabase link --project-ref gchkarlboevsyxixeocd`
   - Push migrations: `supabase db push`
   - (Optional) Apply seeds to Staging (run `seed.sql` manually or reset if wiping data is acceptable)
   - Test end-to-end

3) **Promote to Production**
   - Link prod: `supabase link --project-ref pgsqtbblahihqesnvwxd`
   - Push migrations: `supabase db push`
   - Do **not** copy PII to Staging/local; keep seeds synthetic

## Linking and pushing
- Link Staging: `supabase link --project-ref gchkarlboevsyxixeocd`
- Link Prod: `supabase link --project-ref pgsqtbblahihqesnvwxd`
- Push (when linked): `supabase db push`
- Check link state: `supabase status`

## Local URLs/keys (from `supabase start`)
- API URL: `http://127.0.0.1:54321`
- DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Anon (publishable) key: `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`

Use these in `web/.env.local` for local dev:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

## Seeding guidance
- Prefer small, synthetic data (no PII)
- Focus seeds on: branches, locations, class types, a handful of schedules/sessions/instructors/attendance rows
- Apply locally via `supabase db reset`. For Staging, apply seed SQL manually or reset if wiping data is acceptable

## Safety tips
- Always confirm link target before pushing: `supabase status`
- Avoid `supabase db reset` on Prod
- Keep migrations minimal, reviewable, and tested locally before Staging → Prod

## Making schema changes (migrations)
1) Ensure you're linked to the target (local/Staging/Prod):
   - Staging: `supabase link --project-ref gchkarlboevsyxixeocd`
   - Prod: `supabase link --project-ref pgsqtbblahihqesnvwxd`
2) Create a new migration file:
   ```powershell
   supabase migration new add_your_change
   ```
3) Edit the generated SQL (example):
   ```sql
   CREATE TABLE public.new_table (
     id text PRIMARY KEY
   );
   ```
4) Apply locally (Docker):
   ```powershell
   supabase db reset
   ```
5) Push to Staging when validated:
   ```powershell
   supabase link --project-ref gchkarlboevsyxixeocd
   supabase db push
   ```
6) After Staging testing, push to Prod:
   ```powershell
   supabase link --project-ref pgsqtbblahihqesnvwxd
   supabase db push
   ```

## Full database backup and restore (Local → Staging)

When you need to sync **all data** (not just schema) from local dev to staging:

### Step 1: Create backup from local dev

Use the backup script:
```powershell
cd C:\Projects\Cursor-YMCA-Web\YMCA-Attendance-Web\scripts
.\backup_dev.ps1
```

This creates a timestamped backup in `backups/dev_backup_YYYYMMDD_HHMMSS.backup`

### Step 2: Restore to Staging

Use a temporary Docker container with host networking to reach the remote database:

```powershell
# Set the backup file path
$backupFile = "C:\Projects\Cursor-YMCA-Web\YMCA-Attendance-Web\backups\dev_backup_YYYYMMDD_HHMMSS.backup"

# Restore to staging (replace PASSWORD with actual staging password)
docker run --rm --network host `
  -v "C:\Projects\Cursor-YMCA-Web\YMCA-Attendance-Web\backups:/backups" `
  -e PGPASSWORD='PASSWORD' `
  postgres:17 pg_restore --clean --if-exists --no-owner --no-acl `
  -h db.gchkarlboevsyxixeocd.supabase.co -p 5432 -U postgres -d postgres `
  /backups/dev_backup_YYYYMMDD_HHMMSS.backup
```

**Note:** You will see ~500+ errors related to system schemas (auth, storage, realtime, extensions) that Supabase manages. These are expected and can be ignored. The important `public` schema tables will restore correctly.

### Step 3: Apply any pending migrations to staging

If you have new migrations not yet in the backup:
```powershell
# Apply migration SQL directly
Get-Content "supabase\migrations\YYYYMMDD_migration_name.sql" | `
  docker run --rm -i --network host -e PGPASSWORD='PASSWORD' postgres:17 `
  psql -h db.gchkarlboevsyxixeocd.supabase.co -p 5432 -U postgres -d postgres
```

### Step 4: Verify sync

Compare row counts between local and staging:
```powershell
# Query to run on both environments
$sql = @"
SELECT 'branches' as tbl, COUNT(*) as cnt FROM branches
UNION ALL SELECT 'instructors', COUNT(*) FROM instructors
UNION ALL SELECT 'classes', COUNT(*) FROM classes
UNION ALL SELECT 'locations', COUNT(*) FROM locations
UNION ALL SELECT 'schedules', COUNT(*) FROM schedules
UNION ALL SELECT 'class_sessions', COUNT(*) FROM class_sessions
UNION ALL SELECT 'session_instructors', COUNT(*) FROM session_instructors
ORDER BY tbl;
"@

# Local dev
echo $sql | docker exec -i supabase_db_YMCA-Attendance-Web psql -U postgres -d postgres

# Staging
echo $sql | docker run --rm -i --network host -e PGPASSWORD='PASSWORD' postgres:17 `
  psql -h db.gchkarlboevsyxixeocd.supabase.co -p 5432 -U postgres -d postgres
```

### Staging connection details
- **Host:** `db.gchkarlboevsyxixeocd.supabase.co`
- **Port:** `5432`
- **User:** `postgres`
- **Database:** `postgres`
- **Password:** (stored securely, ask admin)

### Last sync performed
- **Date:** 2025-12-20
- **Tables synced:** 9 (branches, instructors, classes, locations, schedules, class_sessions, session_instructors, instructor_branches, branch_schedule_recipients)
- **Total rows:** ~19,000+
- **Result:** Local dev and staging fully synchronized (data + schema)

