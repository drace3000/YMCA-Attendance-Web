---
name: Load instructor-class-location CSV
overview: Create a branch-scoped mapping table for instructor↔class↔location (+minutes), then add a one-off loader script to ingest `documents/2026.01.15.1632.Eastside_Family_YMCA_Instructor_Class_Details_by_Location.csv` for Eastside Family YMCA, preserving the existing trademark/registration characters and coercing `765` minutes to `60`.
---

## Goal

Load the provided CSV into a **new DB table** that captures “which instructors teach which classes and what locations classes are being held”, scoped to **Eastside Family YMCA**.

## Execution rule (step gating)

- Do **not** start Step N+1 until **all acceptance criteria** in Step N are met.
- If the Step N test plan finds an error, fix it and **re-run Step N test plan** until it is clean.

## Decisions captured (requirements)

- **Branch scope**: Eastside only (`ymca_branches.code = 'eastside_family_ymca'`).
- **Text handling**: load strings **exactly as-is** from the source file / DB conventions (no normalization/cleanup of the values that get stored).
- **Minutes fix**: treat `765` as `60` wherever it occurs.
- **Uniqueness rule**: `minutes` is part of the uniqueness key (same instructor + class + location may appear multiple times with different durations).
- **Duplicates**: if an entry is an exact duplicate (including minutes), dedupe it (store one row).
- **Reference resolution**: resolve to existing `instructors` (by nickname), `classes` (by name), and `locations` (by name). If anything is missing/ambiguous, **fail and report** (no partial load).

## Inputs

- **Source file**: `documents/2026.01.15.1632.Eastside_Family_YMCA_Instructor_Class_Details_by_Location.csv`
- **CSV columns**: `Instructor Nickname`, `Class Name`, `Minutes`, `Location`
- **Known edge cases**:
  - `Minutes=765` appears (must be coerced to `60` before insert).
  - Same instructor + class + location can appear multiple times with different `Minutes` (must remain separate entries).

## Step 1 — Add the new mapping table (migration)

### Work

- Create a new Supabase migration under `supabase/migrations/` that creates a table (proposed name) `public.instructor_class_location_details`.
- Proposed columns:
  - `id uuid primary key default gen_random_uuid()`
  - `branch_id uuid not null references public.ymca_branches(id) on delete cascade`
  - `instructor_id uuid not null references public.instructors(id) on delete restrict`
  - `class_id uuid not null references public.classes(id) on delete restrict`
  - `location_id uuid not null references public.locations(id) on delete restrict`
  - `minutes int not null` (add a check constraint; importer will coerce `765→60` prior to insert)
  - Traceability fields (stored exactly as read from CSV): `instructor_nickname text not null`, `class_name text not null`, `location_name text not null`, `source_file text not null`, `loaded_at timestamptz not null default now()`
- Indexes/constraints:
  - Unique index for idempotent imports (and “dedupe exact duplicates”): `(branch_id, instructor_id, class_id, location_id, minutes)`
  - Lookup indexes: `(branch_id, instructor_id)`, `(branch_id, class_id)`, `(branch_id, location_id)`

### Acceptance criteria

- Migration applies cleanly.
- Table exists with the expected columns and foreign keys.
- Unique constraint includes `minutes`.

### Test plan

- Apply migrations locally (Supabase local workflow you use today).
- Run a sanity query to confirm schema:
  - table exists
  - FKs reference `public.ymca_branches`, `public.instructors`, `public.classes`, `public.locations`
  - unique index covers `(branch_id, instructor_id, class_id, location_id, minutes)`

## Step 2 — Implement the loader (dry-run first)

### Work

- Add `tools/load-instructor-class-location-details.js` (CommonJS; follow patterns in `tools/load-excel-sessions.js`).
- Read the CSV as UTF-8 and parse rows.
- **Lookup normalization (for matching only)**:
  - Use `trim + toUpperCase + collapse spaces` when building lookup keys for instructor nickname, class name, and location name.
  - Store the raw CSV values as-is in the traceability columns.
- Resolve references:
  - Branch: query `public.ymca_branches` where `code='eastside_family_ymca'`
  - Instructors: match by `instructors.nickname` (branch-scoped where applicable)
  - Classes: match by `classes.name` (branch-scoped; if duplicates exist across program groups, treat as ambiguous and fail)
  - Locations: match by `locations.name` (branch-scoped)
- Minutes rules:
  - parse int; if `765` set to `60`
  - if minutes is not a valid integer after coercion, treat as an error
- Two-pass behavior:
  - Pass 1: resolve + validate; collect all missing/ambiguous refs + invalid minutes; **write nothing**
  - Pass 2: in a DB transaction, upsert rows into `public.instructor_class_location_details`
- CLI:
  - default to `--dry-run` to print counts + any issues without writing
  - `--apply` (or `--write`) to perform inserts/upserts
  - `--file <path>` to override source file path

### Acceptance criteria

- `--dry-run` completes with:
  - a clear summary (row counts, unique rows, duplicates)
  - a clear error report if anything is missing/ambiguous
  - exit code is non-zero when errors exist, zero when clean
- No DB writes occur during `--dry-run`.

### Test plan

- Run `node tools/load-instructor-class-location-details.js --dry-run --file documents/2026.01.15.1632.Eastside_Family_YMCA_Instructor_Class_Details_by_Location.csv`
- Verify output includes:
  - total rows read (excluding header)
  - number of distinct rows by `(instructor_nickname, class_name, location_name, minutes)` after `765→60`
  - list of any missing instructors/classes/locations
  - list of any ambiguous matches (if applicable)

## Step 3 — Run import (write mode) and verify results

### Work

- Execute the loader in write mode (transactional upsert).
- Ensure the upsert key uses `(branch_id, instructor_id, class_id, location_id, minutes)` so duration variations remain separate.

### Acceptance criteria

- Loader finishes successfully (exit code 0) and prints inserted/updated counts.
- Mapping table contains expected number of rows for Eastside:
  - equals distinct row count after dedupe (including minutes in uniqueness), not necessarily the raw CSV row count.
- Spot checks match expectations:
  - e.g., same instructor/class/location with different minutes yields multiple rows.

### Test plan

- Run `node tools/load-instructor-class-location-details.js --apply --file documents/2026.01.15.1632.Eastside_Family_YMCA_Instructor_Class_Details_by_Location.csv`
- Run SQL spot checks:
  - counts by instructor nickname and by class
  - verify at least one known “same triple, different minutes” case results in 2 rows
  - verify `minutes=765` does not exist; corresponding rows are stored as `60`

## Step 4 — (Optional) Expose the mapping for UI/reporting

### Work

- If needed, add an API route (or extend an existing one) to query `public.instructor_class_location_details` by branch and return rows grouped for UI/reporting.

### Acceptance criteria

- API returns branch-scoped results only.
- UI/report can display instructor → class → locations (with minutes).

### Test plan

- Call the API with Eastside branch selected and verify returned counts match DB.
- Verify access rules match existing branch-scoping behavior in the app.


