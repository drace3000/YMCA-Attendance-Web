# Feature context: `feature-Implement-user-login`

This document captures the intent, scope, and key implementation details for the **User Login + Role-Based Access Control** work (and subsequent fixes) delivered on the `feature-Implement-user-login` branch.

## Goals (what this work delivers)

- **Real authentication** via Supabase Auth (no “accept any email/password” behavior).
- **Role-based access control**:
  - **Administrator** (AWD): can access all Alliances/Associations/Branches.
  - **Normal** (Branch Manager): restricted to their assigned Alliance → Association → Branch.
- **Branch manager provisioning** is driven by the **Recipients** table (branch-scoped assignment + login metadata).
- **First-time login** uses a **temporary password** and forces the user to set a new password.
- **Forgot password** uses **OTP-based reset** (send code → enter code + new password).
- **API route enforcement**: key APIs are protected with shared access-control logic.

## Where things live (files you’ll touch most)

- **Login UI**: `web/src/app/page.tsx`
- **Auth context**: `web/src/components/auth-provider.tsx`
- **Client Supabase helpers**: `web/src/lib/supabaseClient.ts`
- **Server access control helper**: `web/src/lib/requireRecipientAccess.ts`
- **Recipients admin UI**: `web/src/app/maintenance/recipients-tab.tsx`
- **Recipients API**: `web/src/app/api/maintenance/recipients/route.ts`
- **Email utilities**:
  - templates: `web/src/lib/email-templates.ts`
  - sender: `web/src/lib/email-sender.ts`
  - route: `web/src/app/api/email/welcome/route.ts`
- **Recipient access API**: `web/src/app/api/auth/recipient-access/route.ts`
- **Login context API**: `web/src/app/api/auth/login-context/route.ts`
- **Complete password setup API**: `web/src/app/api/auth/complete-password-setup/route.ts`

## Phases implemented (5–9) + corresponding tests

### Phase 5 — Login page changes + first-time login flow

- **UI**: `web/src/app/page.tsx`
  - Added a **Forgot Password?** link.
  - After Supabase sign-in, calls **`POST /api/auth/login-context`** to validate against `branch_schedule_recipients`.
  - If recipient is inactive or missing, shows an error and **signs out immediately**.
  - If `needs_password_setup=true`, forces a **Create Password** modal.
- **API**: `web/src/app/api/auth/login-context/route.ts`
  - Validates recipient by email, enforces `is_active`, returns role + hierarchy ids.
  - Updates `last_login_at` **only** if `needs_password_setup=false`.
- **Password completion API**: `web/src/app/api/auth/complete-password-setup/route.ts`
  - Sets `needs_password_setup=false` and updates `last_login_at`.
- **Tests**: `web/src/__tests__/auth/first-time-login.test.tsx`

### Phase 6 — Forgot Password modal (OTP reset)

- **UI**: `web/src/app/page.tsx` (Forgot Password modal)
- **Client helper**: `web/src/lib/password-reset-otp.ts`
  - Sends code via `signInWithOtp(email)` and verifies code via `verifyOtp(email, token)`.
- **Tests**: `web/src/__tests__/auth/forgot-password.test.tsx`

### Phase 7 — Branch access control hook

- **Hook**: `web/src/hooks/useBranchAccess.ts`
  - Uses **React Query** and `GET /api/auth/recipient-access` to load:
    - `recipient_type` (Administrator/Normal)
    - `branch_id`, `association_id`, `alliance_id`
  - Provides helpers like `isAdmin`, `isNormal`, and “can access” checks.
- **API**: `web/src/app/api/auth/recipient-access/route.ts`
- **Tests**: `web/src/__tests__/hooks/useBranchAccess.test.tsx`

### Phase 8 — Theme provider branch behavior

- **Provider**: `web/src/components/theme-settings-provider.tsx`
  - If user is **Normal**, branch context is forced to their assigned `branch_id` (and persisted selection is overridden).
  - Provider fetches branch name via `GET /api/branches/{branchId}` as needed.
- **Settings UI**: `web/src/app/settings/page.tsx` (hides branch switching for Normal users)
- **Tests**: `web/src/__tests__/components/theme-provider.test.tsx`

### Phase 9 — API route access control (server-side enforcement)

- **Shared helper**: `web/src/lib/requireRecipientAccess.ts`
  - Loads current user via Supabase cookies (`auth.getUser()`), then loads recipient context from `branch_schedule_recipients`.
  - Enforces `is_active` and returns role + branch hierarchy.
- **Routes**: integrated into relevant `/app/api/**/route.ts` handlers (Normal users are branch-scoped; Admin users are global).
- **Tests**: `web/src/__tests__/api/access-control.test.ts`

## Data model additions (Recipients table)

The `public.branch_schedule_recipients` table is now used as the **source of truth** for branch manager accounts:

- `auth_user_id` (links recipient row to Supabase Auth user)
- `is_active` (deactivated accounts cannot access the app)
- `needs_password_setup` (first login must change password)
- `last_login_at`
- **Unique email**: case-insensitive uniqueness on `lower(email)`

## Auth flow summary

### Normal login (Email + Password)

1. User signs in with Supabase Auth.
2. App calls `/api/auth/login-context` with the email.
3. If recipient is **inactive** or **missing**, the login is rejected (and the app signs out).
4. If recipient is active and `needs_password_setup=false`, `last_login_at` is updated.
5. Normal user context is used to set branch scope in UI and to enforce API access.

### First-time login (Temp Password → Forced Password Change)

1. Admin creates Branch Manager with a **temporary password**.
2. Recipient has `needs_password_setup=true`.
3. After sign-in, the app forces a non-dismissible **Create Password** modal.
4. App updates Supabase Auth password and marks `needs_password_setup=false`.

### Forgot Password (OTP reset)

1. User requests reset → app sends OTP.
2. User enters OTP + new password.
3. Supabase updates password.

## Important fixes added after initial implementation

### 1) “Any email/password works” (dev bypass removed by default)

Previously, a hard-coded `DEV_AUTH_BYPASS=true` could cause the UI to accept any credentials.

Now:
- Dev bypass is **OFF by default**.
- To enable bypass intentionally, set:
  - `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` in `web/.env.local`

Additionally, the login flow now **signs out** if the user passes Auth but fails the recipients check.

### 1a) Supabase env requirements (dev/test)

- **Required for real auth**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-side admin actions, e.g. creating/resetting auth users)
- **Tests**: the client helper `web/src/lib/supabaseClient.ts` is defensive so it won’t construct a real client when env vars are absent (common under Vitest), but production/dev runs should have correct env configured.

### 2) Phone mask + validation consistency (Recipients + API + Settings)

Phone formatting/validation has been aligned to **3-digit area codes**:

- Expected format: **`(123) 456-7890`** or **`(123) 456-7890 ext 12345`**

This was fixed across:
- Recipients UI validation + placeholder
- Recipients API validation + error message
- Settings page validation + placeholder

### 3) Recipients dropdown casing (Alliance/Association/Branch)

The Recipients cascade dropdowns now preserve the stored casing for names, with only the canonical YMCA tokens normalized:

- `ymca` → `YMCA`
- `ymcas` → `YMCAs`

## How to test locally (recommended quick checks)

### Standard scripts (from `web/package.json`)

From repo root:

- **Run the app**:
  - `cd web`
  - `npm run dev`
- **Run tests**:
  - `cd web`
  - `npm run test`
- **Build** (catch type/route issues):
  - `cd web`
  - `npm run build`
- **Lint**:
  - `cd web`
  - `npm run lint`

### Switch environments (writes `web/.env.local`)

- `cd web`
- `npm run env:local`
- `npm run env:staging`
- `npm run env:production`

### Login validation (no bypass)

- Try a random email/password → should **fail**.
- Try an Auth user email that is **not** in `branch_schedule_recipients` → should show an error and **sign out**.

### Branch Manager test user (temporary password)

If `needs_password_setup=true` for a recipient:
- Sign in → must be forced into **Create Password** modal.

## Provisioning / managing Branch Manager accounts (Recipients-driven)

This app treats `branch_schedule_recipients` as the **gate** for app access. Supabase Auth users alone are not sufficient.

### Create a new Branch Manager (recommended)

- Create the recipient via the Recipients UI (Maintenance → Recipients) or via API.
- The backend supports “create recipient + create auth user” in one call:
  - **`POST /api/maintenance/recipients`** with `temp_password`
  - Creates a Supabase Auth user (`supabaseAdmin.auth.admin.createUser`)
  - Inserts the recipient record with:
    - `auth_user_id` set
    - `is_active=true`
    - `needs_password_setup=true`
  - Sends a **Welcome email** (best-effort; user creation does not fail if email fails)

### Reset an existing Branch Manager to a temporary password (forces Create Password on next login)

- **`PATCH /api/maintenance/recipients/{id}/reset-password`** with:
  - `{ "temp_password": "TempPass123" }`
- Requires:
  - caller is authenticated and **not** a Normal user
  - recipient has `auth_user_id` linked
- Behavior:
  - updates Auth password via `supabaseAdmin.auth.admin.updateUserById(...)`
  - sets `needs_password_setup=true`
  - sends a “Password Reset” email (best-effort)

### Deactivate / activate accounts

- **`PATCH /api/maintenance/recipients/{id}/deactivate`**
- **`PATCH /api/maintenance/recipients/{id}/activate`**

Deactivated users are blocked:
- client-side (login-context returns 403)
- server-side (`requireRecipientAccess` returns 403)

### Phone validation

- In Maintenance → Recipients:
  - Enter `(585) 298-4539` → should **save successfully**.

## Troubleshooting checklist

### Symptom: “Any email/password works”

- Confirm `NEXT_PUBLIC_DEV_AUTH_BYPASS` is **not** set to `true` in `web/.env.local`.
- Confirm your recipient exists in `branch_schedule_recipients` and `is_active=true`.
- Confirm the login call to `POST /api/auth/login-context` is succeeding (it must return recipient context).

### Symptom: OTP / Forgot Password doesn’t email codes

- Ensure `NEXT_PUBLIC_DEV_AUTH_BYPASS` is **false** (OTP calls are bypassed when dev bypass is enabled).
- Ensure your Supabase project has email/OTP configured correctly.

### Symptom: Branch Manager can switch branches / see other branches

- Confirm the user’s recipient_type is `Normal`.
- Confirm `GET /api/auth/recipient-access` returns the expected `branch_id`.
- Confirm `ThemeSettingsProvider` is forcing branch to that id.

## Recent commits on this branch (for quick reference)

- `b344a9e` — preserve org name casing (YMCA/YMCAs) in Recipients dropdowns
- `11038e3` — accept 3-digit area code in phone validation (Recipients + Settings + API)
- `0516b9a` — disable dev auth bypass by default + enforce recipients check on login
- `f9e757c` — implement user login + branch access control (phases 7–9)

