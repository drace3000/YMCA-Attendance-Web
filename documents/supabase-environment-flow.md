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
1) Ensure you’re linked to the target (local/Staging/Prod):
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

