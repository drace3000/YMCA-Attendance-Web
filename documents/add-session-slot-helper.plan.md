# Smart Scheduler: Add Session Slot Helper (bounded by Availability Time Range)

## Execution rules (required)
- Cross off each step below as it is completed.
- Automatically proceed to the next step only when there are no testing errors in the current step.
- For each step, run only the step's listed tests (step scope). The final step is the only full app regression test.
- If a step’s tests fail: stop, fix, and re-run that step’s tests until green.

## Goal
When the user clicks **Add Session**, show a **Slot Helper** that:
- Scans the **currently selected schedule month only**
- Uses **15-minute increments**
- Uses the branch **Availability Time Range** from Settings (`availability_time_start`, `availability_time_end`) as the **start/end of day bounds** for candidate times
- Lets the user set:
  - Duration (15-min increments)
  - Transition buffer minutes (instructor)
  - Turnover buffer minutes (location)
  - Day of week filter (or All)
- For each candidate date/time, shows:
  - available locations (single-select)
  - available instructors (multi-select)
- On OK, opens the existing Add Session modal prefilled with date/time/location/instructors (user then picks class + saves)

## Confirmed behavior
- Scope: only sessions within the currently selected month schedule are considered.
- Constraints: must satisfy both location + instructor constraints.
- No availability rules in that month for an instructor => treat as available any time.
- Final step: open the existing Add Session modal prefilled.
- Instructor selection in helper: multiple instructors (multi-select).

## Key integration: Availability Time Range
- Candidate time generation is bounded by the branch availability range:
  - `dayStartHHmm = normalizeHm(branch.availability_time_start ?? "06:00")`
  - `dayEndHHmm = normalizeHm(branch.availability_time_end ?? "23:00")`
- Candidate slot start times are generated in 15-minute increments in `[dayStartHHmm, dayEndHHmm)` such that `slotEnd <= dayEndHHmm`.

---

## Steps (check off as completed)

### [x] Step 1 — Slot computation module (pure + tested)
**Files**
- Add: `web/src/lib/scheduling/slot-helper.ts`
- Add: `web/src/__tests__/lib/slot-helper.test.ts`

**Implementation**
- Pure function inputs include `dayStartHHmm`/`dayEndHHmm` (from Availability Time Range).
- Compute candidate slots per date using 15-min increments, then filter by:
  - existing sessions (with buffers)
  - instructor availability rules (month-scoped; no rules => anytime)
  - holidays (closed day / closed window)
- Output grouped results: date -> slot -> `availableLocationIds` + `availableInstructorIds`.

**Acceptance criteria**
- Time generation respects Availability Time Range bounds.
- Buffers and constraints are applied correctly.

**Test plan (gate)**
- `npm test -- src/__tests__/lib/slot-helper.test.ts`

---

### [x] Step 2 — Pass Availability Time Range into SessionsTab
**Files**
- Update: `web/src/app/scheduling/page.tsx`
- Update: `web/src/app/scheduling/sessions-tab.tsx`

**Implementation**
- Read selected branch’s `availability_time_start/end` (same source used by Settings page) and pass as props to SessionsTab.
- Normalize and default to `06:00–23:00` if unset.

**Acceptance criteria**
- SessionsTab can bound helper slot computation using the Settings-defined range.

**Test plan (gate)**
- `npm test -- src/__tests__/components/sessions-tab-conflicts-ui.test.tsx`

---

### [x] Step 3 — Slot Helper modal UI + OK/Skip/Cancel flow
**Files**
- Update: `web/src/app/scheduling/sessions-tab.tsx`

**Implementation**
- Add Slot Helper modal (portal to `document.body`).
- Inputs: duration, transition, turnover, day filter.
- Show candidate rows; per-row:
  - Location dropdown filtered to available
  - Instructor multi-select filtered to available
- OK => prefill existing Add Session modal (`addForm`) and open it.
- Skip helper => open blank Add Session modal.

**Acceptance criteria**
- OK prefills Add Session date/start/end/location/instructors.

**Test plan (gate)**
- `npm test -- src/__tests__/components/sessions-tab-conflicts-ui.test.tsx`

---

### [x] Step 4 — UI tests for helper
**Files**
- Update: `web/src/__tests__/components/sessions-tab-conflicts-ui.test.tsx`

**Test plan (gate)**
- `npm test -- src/__tests__/components/sessions-tab-conflicts-ui.test.tsx`

---

### [x] Step 5 — Full regression (final gate)
**Test plan**
- `npm test`


