# One-Page Product Boilerplate Prompt

You are a product marketing writer. Create a **one‑page product boilerplate** for the product described below. Keep it concise, client‑friendly, and non‑technical unless explicitly requested.

## Output Requirements
- Length: **400–650 words max**
- Format: **Markdown**, with clear section headings
- Tone: **Professional, confident, and human** (no hype)
- Include **benefits first**, then features
- Use bullets where appropriate
- End with a **short CTA**

## Product Inputs

- **Product name:** YMCA EZAttendance
- **Target audience (roles + org type):** Branch Managers, Program Directors, and Fitness Coordinators at YMCA locations; Association and Alliance administrators who oversee multiple branches
- **Primary problem it solves:** Manual attendance tracking for group fitness classes is time-consuming, error-prone, and makes it difficult to identify trends, optimize schedules, and report outcomes to stakeholders
- **Top 5–7 key features:**
  1. **Smart Scheduler** – Visual session grid for managing monthly class schedules with inline editing, conflict detection, clone-to-next-month, and one-click publish with automatic instructor email notifications
  2. **Attendance Reports** – Filterable dashboards showing totals by day, week, month, location, class type, and instructor with PDF export
  3. **Trends Analysis** – Identifies top 5 classes trending up or down based on attendance slope over time, with visual line charts
  4. **Natural Language Data Mining** – Ask plain-English questions about attendance, instructors, and schedules; AI generates SQL and returns results with Excel export
  5. **Maintenance Console** – Centralized management of instructors, classes, locations, holidays, program groups, and organization hierarchy
  6. **Mobile Instructor App** – Companion React Native app where instructors log in and submit headcounts directly from their phones
  7. **Role-Based Access** – Branch-level isolation ensures managers only see their own data; Administrators can view across associations and alliances

- **Top 3 outcomes / business value:**
  1. **Save time** – Automate schedule creation (clone previous months), reduce manual data entry, and eliminate paper sign-in sheets
  2. **Make data-driven decisions** – Surface attendance trends and location performance to optimize class offerings and instructor assignments
  3. **Improve communication** – Publish schedules and automatically email personalized PDFs to instructors; request and track schedule-change feedback

- **Proof points (metrics, customer results, adoption, etc.):**
  - Designed in partnership with Eastside Family YMCA (Greater Rochester, NY)
  - Supports multi-branch, multi-association, and multi-alliance hierarchies out of the box
  - Real-time conflict detection prevents double-booking instructors or locations

- **Differentiators vs. alternatives:**
  - Purpose-built for YMCA group fitness workflows (not a generic scheduling tool)
  - AI-powered natural language querying—no SQL knowledge required
  - Integrated mobile headcount submission for instructors
  - Automatic PDF schedule generation with YMCA branding and color themes

- **Deployment model (web/mobile/cloud/on‑prem):**
  - Web app (Next.js) for managers; React Native mobile app for instructors
  - Cloud-hosted on Supabase (PostgreSQL + Auth + Storage)
  - No on-premise infrastructure required

- **Security / compliance notes (if any):**
  - Row-Level Security (RLS) enforces branch-scoped data isolation
  - Email + password or OTP-based authentication via Supabase Auth
  - HTTPS/TLS encryption in transit

- **Pricing / packaging (if you want mentioned):**
  - (Omit or customize per deployment)

- **Primary call‑to‑action:**
  - Schedule a demo to see how EZAttendance can streamline your branch's group fitness operations

## Required Sections (in this order)
1. **Product Summary** (2–3 sentences)
2. **Who It's For**
3. **Core Value / Outcomes** (bullets)
4. **Key Features** (bullets)
5. **How It Works** (3–5 steps, short)
6. **Differentiators**
7. **Proof / Evidence** (if provided)
8. **CTA**

## Guardrails
- Do **not** mention internal implementation details unless explicitly provided.
- Avoid long paragraphs; keep each section short.
- If a section input is missing, write a neutral placeholder line.
- Don't include tables.
- Avoid jargon and acronyms unless defined.

## Example Tone Guide
- "Designed for…"
- "Gives managers the ability to…"
- "Reduces time spent on…"
- "Highlights where attendance is trending…"

---

Now generate the one‑page boilerplate using the inputs above.
