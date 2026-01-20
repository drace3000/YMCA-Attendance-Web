---
name: class-crud-mapping
overview: Update Class Maintenance UI to match Instructor styling and add inline Class Location + Duration assignment backed by instructor_class_location_details, using an Unassigned placeholder instructor for class-only mappings.
todos:
  - id: placeholder-instructor
    content: Ensure placeholder instructor exists per branch.
    status: pending
  - id: api-class-mapping
    content: Add class-scoped CRUD to instructor_class_location_details API.
    status: pending
  - id: ui-class-sections
    content: Style Class edit section like Instructor page.
    status: pending
  - id: ui-duration-location
    content: Add inline duration + location sections with chips.
    status: pending
  - id: tests
    content: Cover API and UI flows with tests.
    status: pending
---

# Class CRUD Location + Duration Mapping

## Context

- Class edit UI is in [`web/src/app/maintenance/classes-tab.tsx`](web/src/app/maintenance/classes-tab.tsx); it currently renders a single form section.
- Mapping source is `public.instructor_class_location_details` (schema in [`supabase/migrations/20260115223000_create_instructor_class_location_details.sql`](supabase/migrations/20260115223000_create_instructor_class_location_details.sql)) and is already used by Add Session Helper via [`web/src/app/api/scheduling/instructor-class-location-details/route.ts`](web/src/app/api/scheduling/instructor-class-location-details/route.ts).
- Direction: **Class CRUD** manages **class ↔ location + duration** now. **Instructor CRUD** (later) will remain **class-only** and will apply instructors to the existing class mappings rather than defining location/duration there.
- We will store class-level mappings using a special **Unassigned** instructor record so we can keep a single source of truth in `instructor_class_location_details`.
- Safeguard: Class CRUD must **never modify or delete** mappings tied to real instructors. It should only touch rows whose `instructor_id` matches the Unassigned placeholder.

## Plan (stepwise with acceptance + tests)

### Step 1: Placeholder instructor for class-only mappings

Scope:

- Ensure a stable **Unassigned** instructor exists per branch and can be resolved by the mapping API.

Acceptance criteria:

- When Class CRUD writes mappings, a placeholder instructor ID is always available for the current branch.
- Placeholder is created once and reused (no duplicates).
- Class CRUD operations do not alter rows for real instructors (only Unassigned placeholder rows are edited).

Tests:

- API unit test that requesting class mappings triggers placeholder resolution/creation when missing.

### Step 2: Class-scoped mapping API (GET/POST/DELETE)

Scope:

- Update [`web/src/app/api/scheduling/instructor-class-location-details/route.ts`](web/src/app/api/scheduling/instructor-class-location-details/route.ts) to support class-scoped access while preserving existing behavior.

Acceptance criteria:

- `GET` supports `class_id` filter (branch-scoped).
- `POST` inserts class mappings with required fields + placeholder instructor fields and traceability.
- `DELETE` removes a mapping by id (or composite key).
- Existing Add Session Helper flow still works unchanged.
- `DELETE` never removes mappings for real instructors (guarded by placeholder instructor id).

Tests:

- Extend `web/src/__tests__/api/scheduling-instructor-class-location-details.test.ts` for class‑scoped `GET/POST/DELETE`.

### Step 3: Restyle Class edit section to match Instructor page

Scope:

- In [`web/src/app/maintenance/classes-tab.tsx`](web/src/app/maintenance/classes-tab.tsx), wrap the Class Name/Category/Description form in the same section style as Instructor edit.

Acceptance criteria:

- The circled Class section visually matches Instructor edit sections (rounded card, border, heading, spacing).

Tests:

- Component snapshot or targeted render test asserting the new section container structure/classes.

### Step 4: Add “Class durations” inline section

Scope:

- Add dual-list duration selection:
  - Left list shows **current assigned durations** (derived from ALL class mappings, including real instructor rows).
  - Right list shows **all possible durations** (30–60 in 15‑min steps) with add action; already‑selected durations are disabled.

Acceptance criteria:

- Current assigned durations appear even if they only exist in instructor-specific mappings.
- User can remove a duration from the left list (removing only placeholder rows for that duration; real instructor rows are preserved by safeguard).
- Right list disables durations already selected on the left.
- New durations persist via mapping API using placeholder instructor.

Tests:

- UI test validates dual-list rendering and disabled state for already-selected durations.
- UI test for adding/removing durations updates left list.
- API test already covers insert; reuse when durations are posted.

### Step 5: Add “Class locations” inline section

Scope:

- Add location selection (branch-scoped) with chips and add/remove actions.
- Save mapping combinations as **cartesian product** of selected durations × locations.

Acceptance criteria:

- Multiple locations can be added/removed inline.
- Each selected duration × location creates a mapping row (cartesian).
- Empty/loading/error states mirror Instructor availability section patterns.

Tests:

- UI test for selecting locations and verifying rendered chips.
- API test validating cartesian insert count for duration×location.

### Step 6: Regression verification (no full build)

Scope:

- Run only tests related to the above changes (no `npm run build`).

Acceptance criteria:

- All new/updated tests pass.
- No unrelated test suites executed.

Tests:

- Targeted `vitest` runs scoped to new/updated tests only.

## Notes / Assumptions

- Placeholder instructor is used only for class-level mappings. Instructor CRUD later will assign instructors to classes (class-only UI) by updating or cloning these mappings.
- Source field can be set to a consistent value like `manual_class_ui` to differentiate from CSV imports.
- UI uses existing selection list components and styling rules (PopoverSelect / theme tokens).

