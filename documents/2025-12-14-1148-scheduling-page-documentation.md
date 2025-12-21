# Scheduling Page Documentation

> **Purpose:** This document provides full context for the Scheduling feature implementation. Reference this document when continuing development on remaining phases or making enhancements.

---

## Table of Contents
1. [Overview](#overview)
2. [Current Implementation Status](#current-implementation-status)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [File Structure](#file-structure)
6. [Component Details](#component-details)
7. [API Routes](#api-routes)
8. [UI/UX Decisions](#uiux-decisions)
9. [Remaining Phases](#remaining-phases)
10. [Known Issues and Considerations](#known-issues-and-considerations)

---

## Overview

The Scheduling feature allows branch managers to:
- View and manage monthly class session schedules
- Edit session details (day, time, class, location, instructors, headcount)
- Filter/search sessions by Day, Class, Location, or Instructor
- (Planned) Copy schedules from previous months
- (Planned) Print schedules in a wall-poster format matching Excel template

### Key Principle
**Minimal database changes** - Uses existing `schedules`, `class_sessions`, and `session_instructors` tables that already drive the Reports page. Only one index was added for performance.

---

## Current Implementation Status

### Phase 1: Foundation (COMPLETED)
- [x] Navigation menu entry "Scheduling" with Calendar icon
- [x] Database index: `idx_class_sessions_schedule_branch` on `(schedule_id, branch_id)`
- [x] Basic page structure with branch/schedule selectors

### Phase 2: Sessions Grid (COMPLETED)
- [x] Sessions API routes (GET, POST, PUT, DELETE)
- [x] Schedules API route (GET list)
- [x] Sessions grid with all columns
- [x] Inline editing with Popover-based dropdowns
- [x] Search/filter functionality
- [x] Custom sorting (Sat to Fri, then by start time)
- [x] Instructor multi-select dropdown
- [x] Headcount editing

### Phase 3: Copy Previous Month (PENDING)
- [ ] API: `/api/scheduling/copy-month`
- [ ] UI: Month copy workflow

### Phase 4: Print Preview (PENDING)
- [ ] PDF generation matching Excel wall-poster format
- [ ] Two-column layout by day
- [ ] Color coding by class type

### Phase 5: Helper Tab (PENDING)
- [ ] Step-by-step manager instructions

---

## Architecture

```
+-------------------------------------------------------------+
|                    Scheduling Page                           |
|  +-----------+  +-----------+  +-----------+                |
|  |  Branch   |  | Schedule  |  |  Refresh  |                |
|  | Selector  |  | Selector  |  |  Button   |                |
|  | (Popover) |  | (Popover) |  | (Popover) |                |
|  +-----------+  +-----------+  +-----------+                |
|                                                              |
|  +--------------------------------------------------------+ |
|  |                   SessionsTab                          | |
|  |  +--------------------------------------------------+  | |
|  |  | Search Bar + Radio Filters (DAY|CLASS|LOC|INST)  |  | |
|  |  +--------------------------------------------------+  | |
|  |  +--------------------------------------------------+  | |
|  |  |              Sessions Table                      |  | |
|  |  |  - Day, Start, End, Class, Location, Instructor  |  | |
|  |  |  - Date, HC, Actions (Edit/Delete)               |  | |
|  |  |  - Inline edit row with Popover dropdowns        |  | |
|  |  +--------------------------------------------------+  | |
|  |  +--------------------------------------------------+  | |
|  |  |         Day Count Summary (7 columns)            |  | |
|  |  +--------------------------------------------------+  | |
|  +--------------------------------------------------------+ |
|                                                              |
|  +-----------+  +-----------+  +-----------+                |
|  |Sched Grid |  |Print Prev |  |  Helper   |                |
|  |   (Tab)   |  |   (Tab)   |  |   (Tab)   |                |
|  +-----------+  +-----------+  +-----------+                |
+-------------------------------------------------------------+
```

---

## Database Schema

### Tables Used (Existing - No Modifications)

```sql
-- schedules: Monthly schedule records
schedules (
  id UUID PRIMARY KEY,
  branch_id UUID REFERENCES branches(id),
  name TEXT,                    -- e.g., "August 2025"
  month_start DATE,             -- First day of month
  status TEXT,                  -- 'draft' | 'published'
  cloned_from_id UUID,          -- For copy-from-previous tracking
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- class_sessions: Individual session records
class_sessions (
  id UUID PRIMARY KEY,
  branch_id UUID REFERENCES branches(id),
  schedule_id UUID REFERENCES schedules(id),
  class_id UUID REFERENCES classes(id),
  location_id UUID REFERENCES locations(id),
  day_of_week TEXT,             -- 'SATURDAY', 'SUNDAY', etc.
  start_time TIME,
  end_time TIME,
  session_date DATE,
  effective_month DATE,
  headcount INTEGER,
  created_at TIMESTAMPTZ
)

-- session_instructors: Many-to-many junction
session_instructors (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES class_sessions(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES instructors(id),
  created_at TIMESTAMPTZ
)
```

### Index Added (Phase 1)
```sql
CREATE INDEX idx_class_sessions_schedule_branch
ON class_sessions(schedule_id, branch_id);
```

---

## File Structure

```
web/src/app/scheduling/
  page.tsx              # Main page with selectors, tabs, refresh button
  sessions-tab.tsx      # Sessions grid component with edit functionality

web/src/app/api/scheduling/
  schedules/
    route.ts            # GET: List all schedules
  sessions/
    route.ts            # GET, POST, PUT, DELETE for sessions
```

---

## Component Details

### page.tsx - Main Scheduling Page

**State:**
- `activeTab`: 'grid' | 'print' | 'helper'
- `branches[]`, `selectedBranchId` (defaults to "Eastside Family YMCA")
- `schedules[]`, `selectedScheduleId` (defaults to most recent)
- `refreshKey` for triggering data reload
- `branchDropdownOpen`, `scheduleDropdownOpen`

**Features:**
- Branch selector: Popover dropdown with Building2 icon
- Schedule selector: Popover dropdown with Calendar icon, shows status badge
- Refresh button with contextual popover message
- Tab navigation: Schedule Grid, Print Preview, Helper

### sessions-tab.tsx - Sessions Grid Component

**Props:**
```typescript
type SessionsTabProps = {
  scheduleId: string;
  branchId: string;
  refreshKey: number;
};
```

**State:**
- `sessions[]`: Fetched session data with class, location, instructors
- `classes[]`, `locations[]`, `instructors[]`: Reference data for dropdowns
- `editingId`: ID of session being edited (null if none)
- `editForm`: Form data for inline editing
- `searchTerm`, `filterField`: Search/filter state
- Dropdown open states for Day, Class, Location, Instructor

**Features:**
1. **Search Bar:**
   - Text input with X clear button
   - Radio buttons: DAY | CLASS | LOCATION | INSTRUCTOR
   - "Contains" search mode

2. **Sessions Table:**
   - Columns: Day, Start, End, Class, Location, Instructor(s), Date, HC, Actions
   - Sorted: Saturday to Friday, then by start_time
   - Alternating row colors
   - Edit pencil and delete trash icons

3. **Inline Edit Row:**
   - Background: `bg-[var(--brand-strong)]/20` (darker theme tonal)
   - All fields use Popover-based dropdowns matching Branch selector style
   - Dropdowns have `bg-black/95 backdrop-blur-md` for visibility
   - Instructor dropdown shows actual nicknames, supports multi-select
   - Time inputs styled to match
   - Headcount: number input
   - Save/Cancel buttons

4. **Day Count Summary:**
   - 7 cards showing session count per day

---

## API Routes

### GET /api/scheduling/schedules
Returns all schedules ordered by `month_start` DESC.

**Response:**
```json
{
  "schedules": [
    {
      "id": "uuid",
      "name": "August 2025",
      "month_start": "2025-08-01",
      "status": "published",
      "published_at": "2025-08-01T00:00:00Z",
      "created_at": "2025-07-15T00:00:00Z"
    }
  ]
}
```

### GET /api/scheduling/sessions
**Query Params:** `schedule_id`, `branch_id` (both required)

**Response:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "branch_id": "uuid",
      "schedule_id": "uuid",
      "class_id": "uuid",
      "location_id": "uuid",
      "day_of_week": "SATURDAY",
      "start_time": "09:00:00",
      "end_time": "10:00:00",
      "session_date": "2025-08-02",
      "headcount": 15,
      "class": { "id": "uuid", "name": "Yoga" },
      "location": { "id": "uuid", "code": "GX1", "name": "Group Exercise 1" },
      "instructors": [
        { "id": "uuid", "nickname": "MIKEY", "first_name": "Mike", "last_name": "Smith" }
      ]
    }
  ]
}
```

**Note:** Instructor fetching uses batching (50 per batch) to avoid "URI too long" errors.

### POST /api/scheduling/sessions
Creates a new session with instructor assignments.

### PUT /api/scheduling/sessions
Updates session fields including headcount and instructor assignments.

**Payload:**
```json
{
  "id": "uuid",
  "day_of_week": "MONDAY",
  "start_time": "10:00",
  "end_time": "11:00",
  "class_id": "uuid",
  "location_id": "uuid",
  "instructor_ids": ["uuid1", "uuid2"],
  "headcount": 20
}
```

### DELETE /api/scheduling/sessions
**Query Param:** `id` - Session instructors cascade delete automatically.

---

## UI/UX Decisions

### Theming
- Uses CSS variables: `--brand-soft`, `--brand-strong`, `--cta`, etc.
- Edit row background: 0.5 tone darker using `bg-[var(--brand-strong)]/20`
- Default branch: "Eastside Family YMCA"

### Dropdowns
- All edit dropdowns use Popover components (not native select)
- Consistent styling with Branch/Schedule selectors
- Background: `bg-black/95 backdrop-blur-md` for visibility
- Selected items highlighted with CTA color

### Instructor Dropdown
- Multi-select with checkboxes
- Trigger shows actual nicknames (not "X selected")
- Falls back to first_name if nickname is null

### Search/Filter
- Radio buttons: DAY, CLASS, LOCATION, INSTRUCTOR (uppercase labels)
- Clear button (X) on search input
- "Contains" matching (searches anywhere in value)

### Sorting
- Custom day order: Saturday(0) to Friday(6)
- Secondary sort by start_time

---

## Remaining Phases

### Phase 3: Copy Previous Month
**Goal:** Allow managers to quickly create a new month by copying from previous.

**API:** `POST /api/scheduling/copy-month`
```json
{
  "source_schedule_id": "uuid",
  "target_month": "2025-09",
  "branch_id": "uuid"
}
```

**Logic:**
1. Create new schedule record with `cloned_from_id`
2. Copy all class_sessions, adjusting dates to target month
3. Copy session_instructors for each copied session

### Phase 4: Print Preview
**Goal:** Generate PDF matching Excel wall-poster format.

**Requirements:**
- Two-column layout by day
- Color coding by class type
- Session time, class name, location code, instructor nickname
- Branch header with logo
- Month/year title

**Technology:** `@react-pdf/renderer`

### Phase 5: Helper Tab
**Goal:** Step-by-step instructions for managers.

**Content:**
- How to select a schedule
- How to edit a session
- How to add/remove instructors
- How to copy from previous month
- How to print

---

## Known Issues and Considerations

### Resolved Issues
1. **UTF-8 Encoding:** Files must be saved with UTF-8 (no BOM). PowerShell heredocs can cause encoding issues.
2. **URI Too Long:** Fixed by batching instructor fetches (50 per batch).
3. **Instructor Nicknames:** Many instructors have NULL nicknames - falls back to first_name.

### Current Limitations
1. **Single Branch:** Currently filters by selected branch only. Multi-branch view not implemented.
2. **No Validation:** Minimal validation on time inputs (no overlap detection).
3. **No Undo:** Deleted sessions cannot be recovered.

### Performance Notes
- Sessions API uses composite index for efficient filtering
- Instructor data batched to prevent URI limits
- Reference data (classes, locations, instructors) fetched once on mount

---

## Quick Reference: Key Files to Edit

| Task | File(s) |
|------|---------|
| Add new column to grid | `sessions-tab.tsx` (table columns + edit row) |
| Change dropdown styling | `sessions-tab.tsx` (PopoverContent classes) |
| Add new API field | `api/scheduling/sessions/route.ts` (types + handlers) |
| Add new tab | `page.tsx` (tabs array + activeTab + content) |
| Change default branch | `page.tsx` (fetchBranches callback) |
| Modify sorting | `sessions-tab.tsx` (sortedSessions useMemo) |
| Modify filtering | `sessions-tab.tsx` (filteredSessions useMemo) |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-14 | Initial documentation - Phase 1 and 2 complete |
