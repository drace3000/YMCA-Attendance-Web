---
name: reschedule-email-feedback-v3
overview: "Finalize the Reschedule feedback loop: mobile-friendly email format, instructor token page with checkbox submit, branch manager email notification on submit, and Reschedule popup highlights showing instructor selections and email send/feedback timestamps."
todos:
  - id: db-new-tables-rls
    content: Add new migrations for reschedule request + email logs + submit notification logs with RLS policies.
    status: pending
  - id: api-send-email
    content: Create API route to generate token, persist request, resolve recipient (fallback to don.race@outlook.com), send mobile-friendly email, and log send metadata.
    status: pending
    dependencies:
      - db-new-tables-rls
  - id: page-feedback-mobile
    content: Implement instructor token feedback page (mobile-friendly), checkbox list + Select All, submit storing selections + responded_at.
    status: pending
    dependencies:
      - api-send-email
  - id: api-notify-manager
    content: On instructor submit, send email notification to branch manager recipients and log notification metadata.
    status: pending
    dependencies:
      - page-feedback-mobile
  - id: ui-show-instructor-selections
    content: Update Reschedule Preview to show email sent status + feedback received status + row-level instructor selections; add “Select instructor choices”.
    status: pending
    dependencies:
      - api-notify-manager
  - id: ux-backdrop-checkboxes
    content: Apply previously requested backdrop alignment and checkbox placement/header text changes in Reschedule Preview (Availability to Reschedule; unchecked default).
    status: pending
  - id: tests-scheduler-only
    content: Add/update scheduler-only tests for new API routes + Reschedule Preview UI indicators and selection UX.
    status: pending
    dependencies:
      - ui-show-instructor-selections
---

# Reschedule Preview: Instructor Email Feedback Loop (Mobile-Friendly + Notifications)

## Goals

- Branch manager can email instructor a **mobile-friendly** reschedule feedback request.
- Instructor can open link on desktop/mobile **without authentication** (token-based).
- Instructor selects proposed reschedules (checkboxes + Select All) and submits.
- Branch manager:
- receives an **email notification** when instructor submits,
- sees **exact row-level selections** inside Reschedule Preview,
- retains separate manager-side selection for final decisions.

## Execution rule (test-gated steps)

- Do **not** proceed to the next step until **all tests listed in the current step’s Test plan are passing**.
- If any test fails, fix issues and **re-run only the current step’s tests** until green.
- During incremental work, **only create/update and run tests related to Smart Scheduler**.
- The **final step** is a **full regression** (`npm test`) and must pass before we consider the work complete.

## UX decisions (confirmed)

- Feedback link is **token-based**, no login required.
- Token expires after **48 hours** (enforced by `expires_at`) and the email explicitly states the expiry.
- If instructor email cannot be resolved, send to **`don.race@outlook.com`** (testing).
- Email tracking is **per-branch**.
- Reschedule popup should keep **Edit Session visually normal** behind it.
- Manager selection checkboxes are in the **“Availability to Reschedule”** column and are **unchecked on open**.

## Implementation Steps

### Step 1 — Data model (requests + logs + responses)

- Add new Supabase migration(s) to create:
- `public.schedule_reschedule_requests`
- `id uuid pk`
- `branch_id uuid`
- `schedule_id uuid`
- `instructor_id uuid`
- `request_token text unique`
- `request_payload jsonb` (snapshot of current/proposed rows)
- `created_at timestamptz default now()`
- `expires_at timestamptz not null` (default: `created_at + interval '48 hours'`)
- `responded_at timestamptz null`
- `response_selected_session_ids uuid[]` (or jsonb list)
- `response_comment text null`
- `public.schedule_reschedule_email_log` (manager-to-instructor)
- `id uuid pk`
- `branch_id uuid`
- `schedule_id uuid`
- `instructor_id uuid`
- `sent_at timestamptz default now()`
- `from_email text`
- `to_email text`
- `subject text`
- `message_id text null`
- `public.schedule_reschedule_submit_notify_log` (instructor-to-manager)
- `id uuid pk`
- `branch_id uuid`
- `schedule_id uuid`
- `instructor_id uuid`
- `notified_at timestamptz default now()`
- `to_email text`
- `subject text`
- `message_id text null`

- Enable RLS and policies to allow authenticated branch users to read/write their branch rows.

**Acceptance criteria**

- We can create a request token and store payload.
- Requests have `expires_at` set to 48 hours after creation.
- We can store instructor selections and responded_at.
- We can store outbound email logs.

**Test plan (scheduler-only)**

- Add API tests for create/send and submit flows.

### Step 2 — Email send flow (manager → instructor) with “Open in browser” format

- In Reschedule Preview, add an **Email** button that opens the standard email modal UX (based on `EmailPdfModal` patterns).
- Email body includes:
- A prominent **“Open in browser”** button-style link.
- The **raw URL** printed below for copy/paste.
- Short instructions for mobile.
- A clear note: **“This link expires in 48 hours.”** (optionally include the exact expiration date/time).

- Recipient resolution:
- Preferred: map instructor via existing `auth_user_id -> branch_schedule_recipients.email` (same concept as publish).
- Fallback: `don.race@outlook.com`.

- On send success:
- Insert `schedule_reschedule_email_log`.
- Update Reschedule Preview header: **Email sent {timestamp}**.

**Acceptance criteria**

- Email is readable/clickable on mobile clients.
- Header shows “Not yet sent” vs “Sent …”.

**Test plan (scheduler-only)**

- Update `src/__tests__/components/sessions-tab-conflicts-ui.test.tsx` to validate email button presence and header status updates using mocked fetch.

### Step 3 — Instructor Feedback page (token link)

- Add `/scheduling/reschedule-feedback?t=<token>` page.
- Mobile-friendly UI:
- Single-column layout on small screens.
- Large tap targets.
- Checkbox list + Select All.
- Submit confirmation screen.

- On submit:
- If `now > expires_at`, show an **expired link** message and block submit.
- Persist `responded_at` and `response_selected_session_ids`.

**Acceptance criteria**

- Instructor can submit from mobile browser without login.

**Test plan (scheduler-only)**

- Add API tests:
- token load + submit stores selections (valid token)
- token load returns “expired” when `now > expires_at`
- submit is rejected when `now > expires_at`

### Step 4 — Branch manager notification (instructor submit → manager email)

- When instructor submits:
- Send an email notification to branch manager recipient(s) (likely `ymca_branches.branch_manager_email`, optionally CC schedule recipients).
- Include summary: instructor name, schedule context, count selected, and a link back to the app.
- Log to `schedule_reschedule_submit_notify_log`.

**Acceptance criteria**

- Branch manager receives notification email promptly after instructor submits.

**Test plan (scheduler-only)**

- API test validates “submit triggers notification send + log insert”.

### Step 5 — Reschedule Preview displays instructor-selected rows

- Reschedule Preview fetches status:
- last manager-to-instructor send info
- `responded_at`
- `response_selected_session_ids`

- Visually mark rows selected by instructor:
- badge/indicator “Instructor selected” on those rows.
- Keep manager selection separate:
- Manager checkboxes **unchecked on open**.
- Provide **“Select instructor choices”** action to copy instructor selections into manager selection.

**Acceptance criteria**

- Branch manager sees exactly which rows instructor selected.
- Manager can still choose final selections.

**Test plan (scheduler-only)**

- Extend `sessions-tab-conflicts-ui.test.tsx` to mock status with instructor selections and assert indicators + copy action.

## Test policy (incremental Smart Scheduler only; final regression last)

- During Steps 1–5, run only Smart Scheduler–related tests:
- UI: `npm test -- src/__tests__/components/sessions-tab-conflicts-ui.test.tsx`
- API (new): `npm test -- src/__tests__/api/scheduling-reschedule-feedback*.test.ts`

### Final Step — Full regression test (required)

- Run: `npm test`

Acceptance criteria

- All tests pass with 0 failures.