---
name: DB modal position prefs
overview: Persist Smart Scheduler Add/Edit modal drag offsets per user+branch in Supabase (DB), with safe fallbacks for dev bypass/tests. Add a small API route to read/write these preferences and wire `SessionsTab` to load/save them.
---

## Persist Smart Scheduler modal positions (DB)

### Goal

Store the **last drag/drop position** for the Smart Scheduler **Add Session** and **Edit Session** popups in the database **per user + per branch**, and restore those positions when each modal opens.

### Execution rule (automatic step gating)

- We will implement this work in **Step 1 → Step 2 → Step 3** order.
- **We do not proceed to the next step** until the current step’s **Test plan** passes with:
  - **0 failing tests**, and
  - **no TypeScript/lint/build errors** introduced by that step.
- If a step’s tests fail, we fix until the step is green, then proceed.

### Approach (high-level)

- Add a small preference table in Supabase keyed by `branch_id + user_id + scope + key`.
- Add a Next.js API route to **GET** the saved positions and **UPSERT** updates.
- Update `SessionsTab` to:
  - load saved offsets when the modal opens (or once on mount)
  - persist offsets to DB on drag end
  - keep `localStorage` as a fast fallback (and for DEV_AUTH_BYPASS / unauthenticated dev passthrough)

### Files to change

- DB migration: `supabase/migrations/`
- API route: `web/src/app/api/scheduling/ui-state/route.ts`
- UI wiring: `web/src/app/scheduling/sessions-tab.tsx`

### Step 1 — Add DB table + RLS

- Create a migration that adds a table (example name): `public.branch_user_ui_state`.
- Columns:
  - `id uuid pk default gen_random_uuid()`
  - `branch_id uuid not null references public.ymca_branches(id) on delete cascade`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `scope text not null` (use `'smart_scheduler'`)
  - `key text not null` (use `'add_session_modal_offset'` and `'edit_session_modal_offset'`)
  - `value jsonb not null` (store `{ "x": number, "y": number }`)
  - `created_at`, `updated_at` + `handle_updated_at` trigger
  - unique constraint on `(branch_id, user_id, scope, key)`
- RLS policies:
  - authenticated: select/insert/update/delete where `auth.uid() = user_id`

**Acceptance criteria**

- Migration applies cleanly.
- Table enforces uniqueness per user+branch+key.
- Users can only read/write their own rows.

**Test plan**

- Apply the migration to local dev (no resets):
  - `supabase status` (confirm local is running)
  - `supabase db push` (applies new migration)
- Validate schema shape with a quick spot check (example via Studio or psql):
  - Table exists and has the expected columns / unique constraint
  - RLS enabled
- Gate: **0 failing tests** (run the normal unit test suite used for this repo; if unchanged, proceed).

### Step 2 — API route for load/save

- Implement `web/src/app/api/scheduling/ui-state/route.ts`:
  - `GET ?branch_id=...` returns `{ addOffset, editOffset }` for the current user + resolved branch.
  - `POST` (or `PUT`) accepts `{ branch_id, key, value }` and upserts.
- Use `requireRecipientAccess(req, { allowDevPassthrough: true })` to resolve branch the same way Scheduling does.
- Use `createSupabaseAuthRouteClient(req)` for DB operations so RLS is enforced using the caller’s JWT.
- Use `serverErrorResponse(...)` for consistent error shape.

**Acceptance criteria**

- Authenticated user can GET/UPSERT their own saved offsets.
- Requests for a branch recipient ignore spoofed `branch_id` and use their assigned branch.
- Dev passthrough returns safe no-op behavior (UI falls back to localStorage).
- API does not leak internal DB errors in the public response (uses safe messages + `error_code`).

**Test plan**

- Manual validation (local):
  - With an authenticated session, call GET and confirm it returns the saved offsets.
  - Drag a modal once (from Step 3 wiring or by temporary call), confirm upsert row exists for `(branch_id, user_id, scope, key)`.
- Automated:
  - Run `npm test` (or the project’s standard test command) and ensure **0 failures**.

### Step 3 — Wire `SessionsTab` to DB-backed persistence

- Update `useDraggableModal` / modal wiring in `web/src/app/scheduling/sessions-tab.tsx`:
  - Load offsets from the new API route (per branch) and apply them via a `setOffset(...)` capability.
  - On drag end (`pointerup`), persist offset:
    - update `localStorage` immediately (fast)
    - fire-and-forget `fetch('/api/scheduling/ui-state', ...)` to upsert to DB
  - Make all network calls best-effort and fully wrapped in try/catch to avoid test/runtime unhandled rejections.

**Acceptance criteria**

- Drag Add/Edit modal → close → reopen → modal appears at last dropped position.
- Refresh the page (same user + same branch) → open Add/Edit → restored from DB.
- DEV_AUTH_BYPASS / unauthenticated local dev still works using localStorage only.
- If DB write fails, UI still behaves correctly (no crashes; localStorage still updates).

**Test plan**

- Run `npm test -- src/__tests__/components/sessions-tab-conflicts-ui.test.tsx`.
- Run full `npm test` regression (no failures).
- Gate: do not proceed past this step unless full regression is green.

### Notes / constraints

- This change intentionally does **not** attempt to move/resize the browser OS window; browsers restrict that in normal tabs.

