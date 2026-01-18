# Smart Scheduler — Paginated Sessions + Background Prefetch (Future Plan)

> **Status:** Not scheduled / future consideration (do not implement now)  
> **Goal:** Reduce “Select Schedule” lag by showing the first page quickly, then fetching remaining sessions in the background.  
> **Constraints:** Testing scope limited to changes; **do not run** `npm run build`.

## Summary (what this plan delivers)
- **Fast first paint**: load first page of sessions quickly when schedule changes.
- **Background prefetch**: continue fetching remaining pages without blocking the grid.
- **Progress UI**: a **spinner button** in the Day header spacer area (red-square spot). Clicking shows progress.
- **Add Session feedback**: when **Add Session** is clicked, show a spinner + text **“Loading”** inside the button until the Add flow popup/modal is visible.
- **Correctness gating**: while background prefetch is running, **disable any controls that require full session data**; re-enable once fully loaded.

## Key files involved
- API: `web/src/app/api/scheduling/sessions/route.ts`
- Grid UI: `web/src/app/scheduling/sessions-tab.tsx`
- Page header controls: `web/src/app/scheduling/page.tsx`
- Reference: `documents/supabase-pagination-guide.md`

## Important design decision (minimize regressions)
To avoid breaking other callers/tests, keep the sessions API **backward compatible**:
- If `limit`/`offset` query params are **provided** → return a paginated page + metadata
- If `limit`/`offset` are **missing** → keep current behavior (return full schedule as today)

This lets the new paginated behavior be opt-in from `SessionsTab` without surprising other parts of the app.

---

## Step 1 — API: add pagination + `totalCount` metadata

### Implementation
Update `GET` in `web/src/app/api/scheduling/sessions/route.ts`:
- Parse optional query params:
  - `limit` (clamp 25–200)
  - `offset` (clamp >= 0)
- Apply stable ordering for pagination:
  - `order('session_date')`, `order('start_time')`, `order('id')`
- If pagination is requested:
  - use `.range(offset, offset + limit - 1)`
  - use `select(..., { count: 'exact' })` to get `totalCount`
  - return:
    - `sessions`
    - `page: { offset, limit, returned, totalCount, hasMore, nextOffset }`
- Keep existing instructor enrichment, but only for session IDs returned in the page.

### Acceptance criteria
- **AC1**: With no `limit/offset`, response matches current shape: `{ sessions: [...] }`.
- **AC2**: With `limit/offset`, response includes `page.totalCount` and correct `hasMore/nextOffset`.
- **AC3**: Pagination order is stable (no duplicates/skips within a steady dataset).

### Tests (targeted only)
Add a new API test file (Vitest) for GET pagination behavior, e.g.:
- `web/src/__tests__/api/scheduling-sessions-pagination.test.ts`

Test cases:
- **T1**: GET without `limit/offset` returns full (mock expects no `.range()` usage).
- **T2**: GET with `limit/offset` calls `.range(from,to)` and returns `page` metadata.
- **T3**: `totalCount` is passed through (mock Supabase count value).

Run (no build):
- `cd web; npm test -- scheduling-sessions-pagination`

Auto-advance rule:
- If these tests pass (and only these tests were affected), proceed to Step 2.

---

## Step 2 — UI: fetch page 1 quickly + background prefetch remaining pages

### Implementation
Update `web/src/app/scheduling/sessions-tab.tsx` to replace the single “fetch all” with:
- **Initial fetch**:
  - request `limit=PAGE_SIZE&offset=0`
  - show the first page in the grid immediately
- **Background loop**:
  - while `hasMore`, fetch next pages and append to `sessions`
- Track load state:
  - `isInitialPageLoading` (blocks the whole grid only until page 1 arrives)
  - `isBackgroundPrefetching`
  - `loadedCount` / `totalCount`
  - `isFullyLoaded`
- Add a callback to parent (new prop), e.g. `onLoadStateChange({ isFullyLoaded, loadedCount, totalCount, isBackgroundPrefetching })`
- Ensure cancellation when schedule/branch changes:
  - ignore stale responses and stop background loop when inputs change.

### Acceptance criteria
- **AC1**: On schedule select, page 1 renders without waiting for all pages.
- **AC2**: Background prefetch continues until complete; `sessions.length` reaches `totalCount`.
- **AC3**: `onSessionsLoaded(allSessions)` fires only once **after full load** (so downstream export/filters that depend on complete data remain correct).
- **AC4**: Switching schedules mid-prefetch does not mix sessions across schedules.

### Tests (targeted only)
Update/add component tests under `web/src/__tests__/components/`:
- Add: `web/src/__tests__/components/sessions-tab-pagination-prefetch.test.tsx`

Test cases:
- **T1**: First page appears (rows rendered) after first GET returns.
- **T2**: Subsequent GET calls occur (offset increments) and rows append.
- **T3**: `onSessionsLoaded` only called after final page.
- **T4**: ScheduleId change cancels prior loop (no append from stale responses).

Run:
- `cd web; npm test -- sessions-tab-pagination-prefetch`

Auto-advance rule:
- If these tests pass, proceed to Step 3.

---

## Step 3 — Grid header: spinner button + progress popover (red-square area)

### Placement (existing spacer)
Use the Day header alignment spacer in `web/src/app/scheduling/sessions-tab.tsx`:
```text
<span className="inline-flex h-8 w-8" aria-hidden="true" />
```

### Behavior
- Show spinner button **only** when:
  - page 1 has rendered AND `isBackgroundPrefetching === true`
- Clicking the spinner opens a small popover with:
  - `Loaded {loadedCount}/{totalCount}` (or `Loaded {loadedCount}/…` until count known)
  - Optional percentage when total known
- When background prefetch completes, spinner hides and the spacer returns (layout unchanged).

### Acceptance criteria
- **AC1**: Spinner is hidden during initial page blocking load.
- **AC2**: Spinner appears during background prefetch; hides when fully loaded.
- **AC3**: Clicking spinner shows progress popover; progress values update as pages append.

### Tests (targeted only)
Extend `sessions-tab-pagination-prefetch.test.tsx`:
- **T1**: Spinner absent during initial load, present during background prefetch, absent when complete.
- **T2**: Popover opens on click and displays correct progress text.

Run:
- `cd web; npm test -- sessions-tab-pagination-prefetch`

Auto-advance rule:
- If tests pass, proceed to Step 4.

---

## Step 4 — Add Session button shows “Loading” while its popup opens

### Problem
The **Add Session** button can take several seconds before the Add flow popup appears. Add immediate feedback in the button.\n+
### Implementation
In `web/src/app/scheduling/sessions-tab.tsx`, enhance the **Add Session** button so the user gets immediate feedback during the lag before the Add flow popup appears.\n+
Recommended approach:
- Add a local state flag (example): `addSessionOpening`.
- On Add Session click:
  - set `addSessionOpening = true`
  - disable the Add Session button to prevent double-clicks
  - render button content as: spinner icon + `Loading`
- Clear `addSessionOpening` when the Add flow popup is actually visible.
  - In this codebase, Add Session opens the Slot Helper first (`slotHelperOpen`). Clear the loading state when the slot helper dialog is mounted/open.\n+
Important:
- Do **not** use artificial delays (no `setTimeout` “fixes”). Drive this from real UI state (popup open/mounted).
- Optional: if the button still doesn’t repaint quickly, wrap the expensive popup open in a React transition (`startTransition`) so the button paints first.

### Acceptance criteria
- **AC1**: Clicking **Add Session** immediately changes the button content to spinner + `Loading` and disables the button.
- **AC2**: Once the Add flow popup is visible, the button returns to normal (icon + `Add Session`) and is re-enabled (subject to other gating).
- **AC3**: Repeated clicks while opening do not open duplicate popups/modals.

### Tests (targeted only)
Add a component test, e.g.:
- `web/src/__tests__/components/sessions-tab-add-session-loading-button.test.tsx`

Test cases:
- **T1**: Clicking Add Session shows `Loading` + spinner and disables the button.
- **T2**: When the slot helper dialog renders/opens, the button returns to normal.

Run:
- `cd web; npm test -- sessions-tab-add-session-loading-button`

Auto-advance rule:
- If tests pass, proceed to Step 5.

---

## Step 5 — Disable controls that depend on full session data until fully loaded

### What must be disabled (per requirements)
While `isFullyLoaded === false` (but page 1 already visible), disable:

- **Top header actions** (in `web/src/app/scheduling/page.tsx`):
  - Print Schedule
  - Publish
  - Clone Next Month

- **In-grid actions/controls that depend on complete schedule** (in `web/src/app/scheduling/sessions-tab.tsx`):
  - Add Session (circled red) — depends on full session data being loaded
  - Conflict checklist `PRINT` action/button
  - The additional “circled red” controls that rely on complete session counts/conflict computation
    - Implementation note: likely includes conflict counters / risk pills (HIGH/MED/LOW/ALL/RESET) if they assume full schedule

Also note:
- **Week Start / Date** dropdowns are derived from `sessionsForPrint` in `page.tsx`. If `onSessionsLoaded` only fires once fully loaded, these will naturally stay disabled until full load completes (because their option arrays remain empty).

### UX
- Disabled controls should show a short tooltip/title such as:
  - “Loading full schedule…”
- (Optional) tooltip can reference the spinner popover progress.

### Acceptance criteria
- **AC1**: Controls listed above are disabled during background prefetch.
- **AC2**: Controls re-enable immediately when `isFullyLoaded` flips true.
- **AC3**: No action is allowed that would produce incorrect output (partial-print/export, wrong conflict gating, etc.).

### Tests (targeted only)
Add/update component tests:
- `web/src/__tests__/components/scheduling-page-controls-disabled-while-loading.test.tsx`

Test cases:
- **T1**: With `isFullyLoaded=false`, Print/Publish/Clone are disabled.
- **T2**: With `isFullyLoaded=false`, Add Session is disabled.
- **T3**: With `isFullyLoaded=true`, they are enabled (subject to existing conflict gates).

Update existing tests as needed (minimal changes):
- `web/src/__tests__/components/scheduling-page-publish-confirm.test.tsx` may need to mock “full load complete” so Publish button behavior is unchanged.

Run:
- `cd web; npm test -- scheduling-page-controls-disabled-while-loading`

Auto-advance rule:
- If tests pass, proceed to Step 6.

---

## Step 6 — Manual verification checklist (no build)

### Acceptance criteria
- **AC1**: Selecting a schedule renders sessions quickly (page 1) and does not feel blocked by full load.
- **AC2**: Spinner appears in Day header during background load; popover progress increases.
- **AC3**: Clicking Add Session shows the `Loading` state until the popup is visible.
- **AC4**: Print/Publish/Clone/Add Session/conflict-print controls remain disabled until background load completes.
- **AC5**: Once fully loaded, controls re-enable and behave exactly as before.

### Manual test steps
- Start dev server (`cd web; npm run dev`)
- Navigate to Smart Scheduler
- Select a schedule with lots of sessions
- Observe:
  - first rows render quickly
  - spinner appears in header; click shows progress
  - Add Session shows Loading while opening its popup
  - gated controls disabled until full load
  - controls enable after full load

