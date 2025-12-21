<!--
Single source of truth for the YMCA Attendance **Management Web App** tech stack.
Keep this file updated as decisions change.
-->

# YMCA Attendance — Management Web App Tech Stack

**Scope:** Manager/Regional web dashboard (scheduling, attendance review, KPIs, exports, notifications).  
**Related docs:**
- `documents/YMCA_Attendance_Scheduling_PRD.md` (web requirements + exports)
- `documents/supabase-database-documentation.md` (current schema/RLS/RPCs)
- `documents/app-documentation.md` (existing instructor mobile app; already built)

---

## Status

- **Decision status:** Proposed (ready to implement)
- **Hosting target:** Deploy web app on **Vercel**, keep domain/DNS on Hostinger (optional)
- **Backend:** Existing **Supabase** project (extend for manager/regional roles & policies)

---

## Why this stack

The PRD requires **role-based access**, **data-heavy tables**, **KPI dashboards**, and especially **PDF/Excel exports**.  
Using **Next.js** provides a safe place to run privileged server-side logic (exports, admin operations) without exposing secrets in the browser.

---

## Core stack (recommended)

### Frontend framework
- **Next.js (App Router) + TypeScript**
  - Built-in routing/layouts
  - Server route handlers for exports + privileged ops (when needed)

### UI / design system
- **Tailwind CSS**
- **shadcn/ui** (Radix UI primitives)

### State / data fetching
- **TanStack Query** (`@tanstack/react-query`)
  - Cache KPI datasets
  - Handle polling / refresh
  - (Optional) integrate Supabase realtime updates where appropriate

### Forms & validation
- **React Hook Form**
- **Zod** + `@hookform/resolvers`

---

## Data-heavy UI (recommended)

- **Tables**: `@tanstack/react-table`
- **Charts**: `recharts`
- **Dates**: `date-fns`

---

## Exports (PRD requirement)

- **Excel exports**: `xlsx`
- **PDF exports**: `@react-pdf/renderer`
  - Implemented via Next.js route handlers (server-side generation)

---

## Natural language querying (new feature)

**Goal:** Let **Branch Managers** ask questions in plain English (e.g., “What were total attendances for Eastside in Nov 2025?”) and get back **tables + charts** powered by Supabase.

**Access:** **Branch Managers only (initial release)**.
**Data scope:** **Manager’s branch only** (no cross-branch queries).

**Supported question types (MVP examples):**
- KPI questions (totals/averages/trends)
- Operational questions like **meeting availability**: “What locations are available today for a 30-minute meeting outside scheduled class times?”

### Recommended approach (safe by design)
- **NLQ service location:** Next.js route handler (server-side) at something like `/api/nlq`
- **Query model:** LLM produces a **structured “query plan”** (JSON), not raw SQL
- **Execution layer:** the server executes only:
  - **Whitelisted RPC functions** (preferred), and/or
  - **Whitelisted read-only views** (if needed)
- **Security:** resolve the manager’s `branch_id` server-side and enforce it in every query; ignore any branch identifiers suggested by the model. The executing Supabase client should use the user’s session (RLS-enforced) whenever possible; only use service-role for strictly necessary admin queries (and then apply explicit authorization checks).

### LLM provider (decision)
- **OpenAI** (via `openai` SDK)

### Supporting libraries
- **Schema validation:** `zod` (already in stack) to validate the LLM’s JSON output
- **(Optional) streaming UI:** use server streaming for long responses

---

## Backend / platform

### Supabase (existing)
- **Database**: Postgres
- **Auth**: Supabase Auth
- **Security**: RLS policies
- **Business logic**: Postgres RPC functions + (where needed) Edge Functions
- **Realtime**: optional subscriptions for dashboards/alerts

### Supabase client packages (web)
- `@supabase/supabase-js`
- `@supabase/ssr` (cookie/session helpers for Next.js)

---

## Hosting recommendation

### Best overall (recommended)
- **Vercel** for the Next.js web app
  - Fast CI/CD, previews, easy env var management, ideal Next.js runtime

### Domain
- **Hostinger** is fine for **domain/DNS** management
  - Point domain to Vercel (recommended)

### If you must host on Hostinger
- Use **Hostinger Cloud / VPS** with Node.js support.
- Avoid Hostinger shared hosting for SSR/route-handlers.

---

## Local setup (PowerShell) — scaffold + install

From repo root (`YMCA-Attendance-Web`):

```powershell
# Scaffold the web app into a subfolder so docs remain intact
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd web

# shadcn/ui
npx shadcn@latest init

# Supabase
npm i @supabase/supabase-js @supabase/ssr

# Data fetching
npm i @tanstack/react-query
npm i -D @tanstack/react-query-devtools

# Forms + validation
npm i react-hook-form zod @hookform/resolvers

# Tables + charts + dates
npm i @tanstack/react-table recharts date-fns

# Exports (Excel/PDF)
npm i xlsx @react-pdf/renderer

# Natural language querying (OpenAI)
npm i openai
```

---

## Environment variables

Create `web/.env.local`.

Note: this repo contains a template file at `web/env.local.template` (created during setup). Copy it to `.env.local` and fill in real values:

```powershell
cd web
Copy-Item .\\env.local.template .\\.env.local
notepad .\\.env.local
```

Then ensure it contains:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### LLM keys (server-only)
Add:

```bash
OPENAI_API_KEY=your_openai_key
```

### Server-only secrets (use only if needed)
If we implement privileged operations in Next.js (instead of pure RLS/RPC), add:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Rule:** never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

---

## Running locally (PowerShell)

```powershell
cd web
npm run dev
```

---

## Known dependency note

- **`xlsx`** currently reports a **high severity vulnerability with no fix available** via `npm audit`.
  - If you want to avoid this, we can switch Excel exports to a different library (e.g., `exceljs`) in the implementation.

---

## Expected backend work (to support the web app)

The current Supabase setup is optimized for the **instructor app** (instructor-scoped RLS + onboarding/login RPCs).  
For the management web app we will likely add:

- **Roles/claims**: manager + regional manager model (branch-scoped and multi-branch)
- **RLS policies**: manager/regional read/write rules for schedules, instructors, reports
- **RPCs**: KPI aggregations, schedule cloning/publishing, conflict detection, report datasets
- **Edge Functions (optional)**: email notifications and scheduled jobs

---

## Decision log / changelog

- **2025-12-12**: Initial recommended stack documented (Next.js + Tailwind + shadcn/ui + TanStack Query + RHF/Zod + Supabase + Vercel; PDF/Excel exports).


