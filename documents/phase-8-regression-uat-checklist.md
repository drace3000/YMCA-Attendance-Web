# Phase 8 — Full Regression + UAT Checklist (Smart Scheduler Enhancements)

This checklist is the **final gate** before release. Do **not** proceed if any step fails.

## Scope covered

- Maintenance: search inputs, clear (“X”) button, Scheduling Availability pill behavior, role-based column visibility
- Smart Scheduler: conflict detection (client + server), verify flow, add/edit blocking on HIGH, unavailability, holidays
- Feature 1: clone “most recent schedule → next month” with headcount gate + audit
- Feature 3: publish gate (no HIGH conflicts) + email-on-publish with attached schedule PDF
- Automated tests + production build

## Preconditions

- Local app builds and tests successfully.
- Local Supabase is running (for manual UAT steps that require database data).
- A Branch manager account exists and can log in.
- At least one instructor has:
  - a valid instructor record assigned to the branch
  - `auth_user_id` linked to a `branch_schedule_recipients` record with a valid `email`

## Automated regression (required)

Run these from `web/`:

1. `npm test`
   - **Expected**: exit code 0, all tests pass.
2. `npm run build`
   - **Expected**: exit code 0, production build succeeds.

Record results:
- Test run timestamp:
- Build run timestamp:

## Manual UAT — Maintenance

### 1) Instructors: search input + clear button

1. Navigate to **Maintenance → Instructors**
2. Click into **Search**
3. Type a partial name/nickname
   - **Expected**: typing works; list filters/finds according to selected mode
4. Click the **X** in the search box
   - **Expected**: search clears and input remains focused

### 2) Admin Scheduling Availability pills persist on refresh

1. Log in as **Admin**
2. Navigate to **Maintenance → Instructors**
   - **Expected**: Scheduling Availability pills render (when instructor has availability branches)
3. Refresh browser (hard refresh not required)
   - **Expected**: pills still render after refresh

### 3) Non-admin hides Scheduling Availability column

1. Log in as **Branch user** (non-admin)
2. Navigate to **Maintenance → Instructors**
   - **Expected**: the table column **Scheduling Availability** is hidden (header + cells)

### 4) Classes + Locations search clear button

1. Navigate to **Maintenance → Classes**
2. Type into Search, then click **X**
   - **Expected**: clears search
3. Navigate to **Maintenance → Locations**
4. Type into Search, then click **X**
   - **Expected**: clears search

### 5) Holidays CRUD (branch-scoped)

1. Navigate to **Maintenance → Holidays**
2. Click **Add Holiday**
3. Create an active holiday inside the current schedule month (e.g., `YYYY-MM-15`)
   - **Expected**: appears in list with Active = Yes
4. Deactivate the holiday
   - **Expected**: Active toggles to No; if “Show inactive” is off, it disappears
5. Edit the holiday name/notes
   - **Expected**: updates persist after refresh
6. Delete the holiday (confirm prompt)
   - **Expected**: removed

## Manual UAT — Smart Scheduler (conflicts, clone, publish)

### 6) Verify Conflicts blocks on HIGH and lists conflicts

1. Navigate to **Smart Scheduler**
2. Select Branch/Group/Schedule
3. Click **Verify Conflicts**
   - **Expected**: modal opens and shows summary + list
4. Create a known **HIGH** conflict:
   - Example: two sessions same date, same location, overlapping times
5. Click **Verify Conflicts** again
   - **Expected**: HIGH count > 0; conflict list includes LOCATION_DOUBLE_BOOKING (or similar)

### 7) Create/Edit session is blocked by HIGH conflicts

1. In Smart Scheduler, click **Add Session**
2. Enter session data that causes a HIGH conflict
   - **Expected**: UI blocks save/create and displays conflict(s)
3. Edit an existing session to create a HIGH conflict
   - **Expected**: save is blocked

### 8) Instructor Unavailability enforcement (HIGH)

1. Ensure unavailability rules exist for an instructor for a date/time window
2. Create/edit a session that overlaps that window for that instructor
   - **Expected**: conflict type `INSTRUCTOR_UNAVAILABLE` appears and blocks save/create

### 9) Holiday warning (MEDIUM only)

1. Create an active Holiday for a date in the selected schedule month
2. Ensure there is at least one session on that date
3. Verify conflicts
   - **Expected**: `HOLIDAY` shows as MEDIUM warning; does **not** block save/create

### 10) Clone Next Month preflight + clone

1. In Smart Scheduler, click **Clone Next Month**
2. Confirm preflight shows:
   - source schedule = **most recent schedule** (not necessarily currently selected)
   - target month start
   - missing headcount count
3. If missing headcounts > 0:
   - **Expected**: Clone is disabled until “Override” checked
   - Click “Show sessions missing headcount”
     - **Expected**: table renders list of missing sessions
4. If safe, click **Clone**
   - **Expected**: new draft schedule created; dropdown selection changes to the new schedule; sessions appear

### 11) Publish gate + email-on-publish

1. Ensure schedule has **0 HIGH** conflicts (Verify Conflicts should show HIGH=0)
2. Click **Publish**
3. Click **Publish Now**
   - **Expected**:
     - schedule status becomes `published` (and is labeled accordingly in dropdown if shown)
     - email sending occurs (in test env this may be mocked; in real env check logs / Resend)
     - modal shows success and number of recipients attempted

Negative case:
1. Create a HIGH conflict in the schedule
2. Try Publish
   - **Expected**: Publish is blocked with a conflict list and HIGH summary > 0

## Final sign-off

- Regression complete: ✅ / ❌
- UAT complete: ✅ / ❌
- Signed by (name):
- Date/time:

