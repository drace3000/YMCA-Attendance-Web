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

### Login validation (no bypass)

- Try a random email/password → should **fail**.
- Try an Auth user email that is **not** in `branch_schedule_recipients` → should show an error and **sign out**.

### Branch Manager test user (temporary password)

If `needs_password_setup=true` for a recipient:
- Sign in → must be forced into **Create Password** modal.

### Phone validation

- In Maintenance → Recipients:
  - Enter `(585) 298-4539` → should **save successfully**.

## Recent commits on this branch (for quick reference)

- `b344a9e` — preserve org name casing (YMCA/YMCAs) in Recipients dropdowns
- `11038e3` — accept 3-digit area code in phone validation (Recipients + Settings + API)
- `0516b9a` — disable dev auth bypass by default + enforce recipients check on login
- `f9e757c` — implement user login + branch access control (phases 7–9)

