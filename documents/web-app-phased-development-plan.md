<!--
Phased delivery plan for the YMCA Attendance Management Web App.
Keep this updated as scope changes.
-->

# YMCA Attendance — Web App Phased Development Plan

**Source requirements:** `documents/YMCA_Attendance_Scheduling_PRD.md`  
**Current backend:** `documents/supabase-database-documentation.md` (instructor-focused RLS/RPCs)  
**NLQ spec:** `documents/natural-language-querying.md` (Branch manager only, branch-scoped, OpenAI)

---

## Guiding principles

- **Ship incrementally**: prioritize end-to-end usable slices.
- **RLS-first**: prefer RLS + RPC so the client can safely read allowed data; use server-only secrets only when necessary.
- **Auditability**: for KPIs/exports/NLQ, always return a table dataset that can be inspected.
- **Branch-scoped security**: branch manager sees **their branch only**.

---

## Phase 0 — Foundation (1–3 days)

### Deliverables
- Web app bootstrapped (`web/`) and deployable
- Auth + session handling wired for web
- Role model defined for Branch Manager (branch-scoped)
- Base navigation shell + protected routes

### Tasks
- **App shell**
  - Layout, navigation, and basic page structure
  - Design tokens aligned with the existing mobile brand where appropriate
- **Auth**
  - Supabase auth in Next.js (`@supabase/ssr`)
  - Route protection (redirect unauthenticated users)
- **Authorization model**
  - Decide where manager “role + branch_id” lives:
    - option: `profiles` table (recommended)
    - option: dedicated `managers` table
  - Enforce branch scope at the query layer

---

## Phase 1 — Attendance Operations (1–2 weeks)

### Goal
Give Branch Managers immediate operational value: **review attendance logs** with filters and basic KPIs.

### Deliverables
- Attendance log screen:
  - Filter by date range, instructor, class type, location
  - Export dataset (CSV as quick win; Excel later)
- Basic KPI cards:
  - Monthly totals
  - Average attendance per class
  - Daily trend (simple chart)

### Backend work (likely)
- Add manager-facing read access (RLS policies or manager RPCs)
- Create RPCs for KPI datasets (fast, consistent, testable)

---

## Phase 2 — Reporting & Exports (1–2 weeks)

### Goal
Match PRD reporting expectations: “monthly summary, class type averages, instructor summaries…”

### Deliverables
- Export center:
  - Monthly summary export
  - Class type averages export
  - Instructor summary export
- PDF report generation:
  - Server-side PDF generation route
  - Branded report template (tables + charts)

### Technical notes
- Consider replacing `xlsx` dependency (audit issue) if required for security policy.

---

## Phase 3 — Scheduling Management (2–4 weeks)

### Goal
Enable managers to **create/maintain schedules** and publish them reliably.

### Deliverables
- Schedule CRUD:
  - Create/edit schedule periods (monthly)
  - Manage class sessions (date/time/location/instructor)
  - Recurrence support (at minimum: weekly patterns)
- Publish workflow:
  - Validate schedule
  - Publish schedule (locks or versions it)

### Nice-to-have (if consistent with schema)
- Schedule clone to new month
- Conflict detection (room / instructor conflicts) + resolution UI

---

## Phase 4 — NLQ (Natural Language Querying) (1–2 weeks, after Phase 1)

### Goal
Branch manager can ask questions like:
- “Total attendance this month”
- “Average attendance per class type”
- “What locations are available today for a 30 minute meeting outside scheduled class times?”

### Deliverables
- NLQ UI panel
- `/api/nlq` endpoint (server-side)
- Zod-validated JSON “query plan”
- Whitelisted RPC executor
- Refusal behavior for out-of-scope questions (cross-branch, write actions, etc.)

---

## Phase 5 — Notifications & Advanced Analytics (later)

- Email notifications (Edge Functions)
- In-app notifications enhancements
- Regional dashboards (multi-branch)
- Forecasting (future PRD)













