---
name: class-locations-dual-list
overview: "Add dual-list duration + location selection in Class CRUD: left shows assigned values, right shows all options with selected disabled."
todos:
  - id: loc-left-list
    content: Left lists show assigned durations + locations from all mappings
    status: pending
  - id: loc-right-list
    content: Right lists show all durations/locations with selected disabled
    status: pending
  - id: loc-tests
    content: Add UI/API tests for dual-list behavior
    status: pending
---

# Class Locations + Durations Dual-List

## Context
- Class maintenance UI is in [`web/src/app/maintenance/classes-tab.tsx`](web/src/app/maintenance/classes-tab.tsx).
- Class-to-location mapping uses `instructor_class_location_details` with a placeholder instructor for class-level rows.
- You want **both durations and locations** to use dual lists: left list shows assigned values; right list shows all options with already-selected disabled.

## Plan

### Step 1: Left list = assigned durations + locations for the current class
- **Class durations** section has its own left list showing assigned durations for the current class.
- **Class locations** section has its own left list showing assigned locations for the current class.
- Derive left lists from mappings for the **currently edited class only** (including instructor-specific rows).
- Removing a duration/location only deletes **placeholder instructor** rows; real instructor rows remain intact.

Acceptance criteria:
- Durations and locations already used by any instructor for the **current class** appear in the left lists.
- Removing a duration/location does not delete instructor-specific mappings.

Tests:
- UI test asserts left lists include durations/locations from instructor-specific mappings.
- API delete tests ensure removal is scoped to placeholder rows only.

### Step 2: Right list = all durations + locations, disable selected
- **Class durations** section has its own right list of all durations (30–60, 15-min steps).
- **Class locations** section has its own right list of all branch locations.
- Disable items already present in the corresponding left lists.
- Clicking an enabled item adds placeholder mappings:
  - Duration click adds mappings for all selected locations × that duration.
  - Location click adds mappings for all selected durations × that location.

Acceptance criteria:
- Right lists show all durations/locations; items present on the left are disabled.
- Selecting a new duration/location adds mappings (cartesian with the other dimension).

Tests:
- UI test validates disabled state for already-selected durations/locations.
- UI test validates add flow posts mappings and updates left lists.

### Step 3: Layout + styling alignment
- Use same dual-list layout and styling as durations (Instructor-style section container, theme tokens).
- Keep error/loading states aligned with existing Class sections.

Acceptance criteria:
- Visual layout matches durations section with two-column list behavior.

Tests:
- Snapshot or DOM structure test for dual-list layout.

