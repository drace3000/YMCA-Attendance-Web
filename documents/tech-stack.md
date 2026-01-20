# YMCA Attendance Web — Tech Stack

This repo contains a Next.js web application (in `web/`) backed by Supabase (schema/migrations in `supabase/`).

## Frontend (UI)

- **Framework**: Next.js **16.0.10** (App Router)
- **UI library**: React **19.2.1**
- **Language**: TypeScript
- **Styling**: Tailwind CSS (**v4** toolchain) + `tailwind-merge`, `tw-animate-css`
- **State (server state)**: TanStack React Query **v5**
- **Tables / grids**:
  - TanStack React Table **v8**
  - TanStack React Virtual **v3**
  - Ignite UI React grids (`igniteui-react*`)
- **UI primitives**: Radix UI Popover (`@radix-ui/react-popover`)
- **Forms + validation**: `react-hook-form` + `zod`
- **Drag & drop**: `@dnd-kit/*`
- **Charts**: `recharts`
- **Icons**: `lucide-react`

## Backend (server-side within Next.js)

- **API**: Next.js Route Handlers (`web/src/app/api/**`)
- **Runtime**: Node.js (host must support SSR + API routes)
- **Supabase SSR helpers**: `@supabase/ssr`

## Data + Auth

- **Database**: PostgreSQL (via Supabase)
- **Auth**: Supabase Auth
- **DB schema management**: SQL migrations in `supabase/migrations/*.sql`
- **Supabase clients**:
  - Browser client: `@supabase/supabase-js` using anon/publishable key
  - Server client: `@supabase/supabase-js` using **service role key** for admin operations (server-only)

## Reports / PDFs / Email

- **PDF generation**: `@react-pdf/renderer`
- **Email delivery**: Resend (`resend`)
- **Client-side export helper**: `html2canvas` (used for some export workflows)

## AI (optional feature set)

- **OpenAI**: `openai`
- **Provider selection**: code paths support selecting an AI provider via env (e.g., OpenAI / Anthropic) for data-mining style endpoints

## Testing + Quality

- **Unit/UI tests**: Vitest + Testing Library (`@testing-library/react`) + `jsdom`
- **Linting**: ESLint (`eslint-config-next`)

## Local development + tooling

- **Supabase local**: Supabase CLI (Docker-based local stack)
- **Scripts/tools**: root `scripts/` and `tools/` for backup/migration/import utilities

## Key environment variables (high-level)

- **Supabase (required)**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to browser)
- **Email (optional)**:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
- **AI (optional)**:
  - `OPENAI_API_KEY` (and/or other provider keys, depending on configuration)

