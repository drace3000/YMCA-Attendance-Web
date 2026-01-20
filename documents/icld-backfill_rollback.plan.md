# ICLD backfill rollback plan (local dev)

Copied from icld-backfill_3352ed9a.plan.md.

### Rollback plan (if results are not correct)

Goal: revert local dev DB to the pre-backfill state using the fresh validated dump from Step 0.

Rollback steps:

- Stop the app/dev server (to reduce DB connections).
- Restore **public schema only** from the dump (per local restore rules) using `pg_restore` inside the DB container.
- Re-run the Step 2 dry-run counts and the Slot Helper smoke test to confirm state matches pre-backfill.

Acceptance criteria:

- Restore completes without errors.
- Spot-check that the counts/behavior return to the pre-backfill baseline.

Tests (scope limited to rollback):

- `pg_restore --list` on the dump still succeeds (archive intact).
- After restore, Step 2 dry-run results match the pre-backfill dry-run output.


