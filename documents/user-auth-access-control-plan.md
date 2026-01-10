# User Authentication and Role-Based Access Control Plan

**Created:** January 9, 2026  
**Status:** Planning  
**Author:** AWD Development Team

---

## Overview

Implement a role-based authentication system where AWD Admins manage branch managers through the Recipients table, with Supabase Auth for secure authentication, temporary password for first-time login with forced password change, OTP-based password reset, and branch-level data isolation for Normal users.

## User Roles

| Role | Description | Data Access |
|------|-------------|-------------|
| **Administrator** | AWD vendor staff | Full access to ALL Alliances, Associations, and Branches |
| **Normal** | Branch Manager | Restricted to their assigned Alliance → Association → Branch only |

### Access Control Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA ACCESS HIERARCHY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ADMINISTRATOR (AWD Staff)              NORMAL (Branch Manager)            │
│   ─────────────────────────              ──────────────────────             │
│                                                                             │
│   Can view/edit ALL:                     Can ONLY view/edit:                │
│   ├── All Alliances                      └── Their assigned Alliance        │
│   │   ├── All Associations                   └── Their assigned Association │
│   │   │   ├── All Branches                       └── Their assigned Branch  │
│   │   │   │   ├── All Schedules                      ├── Schedules          │
│   │   │   │   ├── All Attendance                     ├── Attendance         │
│   │   │   │   ├── All Reports                        ├── Reports            │
│   │   │   │   └── All Settings                       └── Settings           │
│                                                                             │
│   Can switch between any branch          Cannot switch branches             │
│   via branch selector dropdown           (branch selector hidden)           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Authentication Flows

### Authentication Method Summary

| Scenario | Method |
|----------|--------|
| Normal Login | Email + Password |
| First-Time Login | Email + Temp Password → Auto-detect → Forced password change |
| Forgot Password | OTP verification → Reset password |

---

## Flow Diagrams

### Admin Creates Branch Manager

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ADMIN CREATES BRANCH MANAGER                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Admin              App              Database         Supabase Auth        │
│     │                 │                  │                  │               │
│     │── Opens Recipients tab ──>│        │                  │               │
│     │                 │                  │                  │               │
│     │── Selects Alliance ──────>│        │                  │               │
│     │── Selects Association ───>│        │                  │               │
│     │── Selects Branch ────────>│        │                  │               │
│     │                 │                  │                  │               │
│     │── Enters email, name, ───>│        │                  │               │
│     │   phone, type=Normal      │        │                  │               │
│     │                 │                  │                  │               │
│     │── Enters temp password ──>│        │                  │               │
│     │   (provided by AWD)       │        │                  │               │
│     │                 │                  │                  │               │
│     │── Clicks "Create User" ──>│        │                  │               │
│     │                 │                  │                  │               │
│     │                 │── Creates Auth user ────────────────>│              │
│     │                 │   (email + temp password)            │              │
│     │                 │<───────── Returns auth_user_id ─────│               │
│     │                 │                  │                  │               │
│     │                 │── INSERT recipient ─>│              │               │
│     │                 │   (auth_user_id,     │              │               │
│     │                 │    needs_password_   │              │               │
│     │                 │    setup=true)       │              │               │
│     │                 │                  │                  │               │
│     │                 │                  │                  │               │
│     │                 │   ┌─────────────────────────────┐   │               │
│     │                 │   │  SEND WELCOME EMAIL         │   │               │
│     │                 │   │  To: new branch manager     │   │               │
│     │                 │   │  - Account created notice   │   │               │
│     │                 │   │  - Alliance assignment      │   │               │
│     │                 │   │  - Association assignment   │   │               │
│     │                 │   │  - Branch assignment        │   │               │
│     │                 │   │  - Temp password included   │   │               │
│     │                 │   │  - Login instructions       │   │               │
│     │                 │   └─────────────────────────────┘   │               │
│     │                 │                  │                  │               │
│     │<── "User created. ────────│        │                  │               │
│     │    Welcome email sent."   │        │                  │               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Welcome Email Contents:**
- Subject: "Welcome to YMCA Attendance & Scheduling"
- Body includes:
  - Greeting with user's name
  - Full organizational assignment:
    - Alliance (e.g., "Alliance of New York State YMCAs")
    - Association (e.g., "YMCA of Greater Rochester")
    - Branch (e.g., "Bay View Family YMCA")
  - Temporary password
  - Login URL
  - Instructions: "On your first login, you will be prompted to create a new password"
  - AWD support contact info

### First-Time Login (Temp Password → Forced Password Change)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              FIRST-TIME LOGIN (AUTO-DETECT + PASSWORD CHANGE)               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Manager            App              Supabase Auth        Database         │
│     │                 │                    │                  │             │
│     │── Opens login page ─────>│           │                  │             │
│     │                 │                    │                  │             │
│     │── Enters email ─────────>│           │                  │             │
│     │── Enters temp password ─>│           │                  │             │
│     │   (provided by AWD)      │           │                  │             │
│     │                 │                    │                  │             │
│     │── Clicks "Sign In" ─────>│           │                  │             │
│     │                 │                    │                  │             │
│     │                 │── signInWithPassword ────>│           │             │
│     │                 │   (email, tempPassword)   │           │             │
│     │                 │<── Session created ───────│           │             │
│     │                 │                    │                  │             │
│     │                 │── SELECT recipient by email ────────>│             │
│     │                 │<── needs_password_setup = true ───────│             │
│     │                 │                    │                  │             │
│     │                 │   [FIRST LOGIN DETECTED]             │             │
│     │                 │                    │                  │             │
│     │<── "Please create a ─────│           │                  │             │
│     │    new password"         │           │                  │             │
│     │    (modal appears)       │           │                  │             │
│     │                 │                    │                  │             │
│     │── Enters new password ──>│           │                  │             │
│     │   (twice)                │           │                  │             │
│     │                 │                    │                  │             │
│     │                 │── updateUser({ password }) ─>│        │             │
│     │                 │                    │                  │             │
│     │                 │── UPDATE needs_password_setup=false ─>│             │
│     │                 │                    │                  │             │
│     │<── Redirects to dashboard ─│         │                  │             │
│     │    (branch-scoped)         │         │                  │             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Normal Login (Email + Password)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      NORMAL LOGIN (EMAIL + PASSWORD)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Manager            App              Supabase Auth        Database         │
│     │                 │                    │                  │             │
│     │── Enters email ─────────>│           │                  │             │
│     │── Enters password ──────>│           │                  │             │
│     │                 │                    │                  │             │
│     │                 │── signInWithPassword ────>│           │             │
│     │                 │   (email, password)       │           │             │
│     │                 │                    │                  │             │
│     │                 │<── Session created ───────│           │             │
│     │                 │                    │                  │             │
│     │                 │── SELECT recipient by email ────────>│             │
│     │                 │<── Returns branch_id, recipient_type ─│             │
│     │                 │                    │                  │             │
│     │                 │ [Stores branch context               │             │
│     │                 │  in auth provider]                   │             │
│     │                 │                    │                  │             │
│     │                 │ [Derives Alliance/Association        │             │
│     │                 │  from branch]                        │             │
│     │                 │                    │                  │             │
│     │<── Redirects to dashboard ─│         │                  │             │
│     │    (branch-scoped)         │         │                  │             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Forgot Password (OTP Reset)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FORGOT PASSWORD (OTP RESET)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User               App                        Supabase Auth               │
│     │                 │                              │                      │
│     │── Clicks "Forgot ───────>│                     │                      │
│     │   Password?"             │                     │                      │
│     │                 │                              │                      │
│     │<── Modal opens with ─────│                     │                      │
│     │    email input           │                     │                      │
│     │                 │                              │                      │
│     │── Enters email ─────────>│                     │                      │
│     │── Clicks "Send Reset ───>│                     │                      │
│     │   Code"                  │                     │                      │
│     │                 │                              │                      │
│     │                 │── resetPasswordForEmail(email) ─────>│              │
│     │                 │   with OTP option                    │              │
│     │                 │                              │                      │
│     │<═══════════════════ Sends 6-digit OTP to email ═══════>│              │
│     │                 │                              │                      │
│     │<── Modal shows OTP ──────│                     │                      │
│     │    input + new password  │                     │                      │
│     │    fields                │                     │                      │
│     │                 │                              │                      │
│     │── Enters OTP code ──────>│                     │                      │
│     │── Enters new password ──>│                     │                      │
│     │   (twice)                │                     │                      │
│     │                 │                              │                      │
│     │                 │── verifyOtp(email, code, ────────────>│             │
│     │                 │   type='recovery')                   │              │
│     │                 │<── OTP verified ─────────────────────│              │
│     │                 │                              │                      │
│     │                 │── updateUser({ password }) ──────────>│             │
│     │                 │                              │                      │
│     │<── "Password updated, ───│                     │                      │
│     │    please sign in"       │                     │                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database Schema Changes

**Use Case:** As a developer, I need to extend the database schema to support user authentication linking and status tracking.

**Migration file:** `supabase/migrations/YYYYMMDDHHMMSS_add_user_auth_fields.sql`

Add columns to `branch_schedule_recipients`:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `auth_user_id` | uuid | null | Links to Supabase Auth user |
| `is_active` | boolean | true | Enable/disable account |
| `needs_password_setup` | boolean | true | True until first password set |
| `last_login_at` | timestamptz | null | Track last successful login |

**Indexes:**
- `idx_recipients_auth_user_id` on `auth_user_id`
- `idx_recipients_email_unique` unique on `email` (if not exists)

**RLS Policies:**
- Admin can read/write all recipients
- Normal users can only read their own record

**Acceptance Criteria:**
- [ ] Migration runs successfully without errors
- [ ] All four new columns exist in `branch_schedule_recipients` table
- [ ] `auth_user_id` column accepts UUID values and allows null
- [ ] `is_active` defaults to `true` for new records
- [ ] `needs_password_setup` defaults to `true` for new records
- [ ] Index on `auth_user_id` is created
- [ ] Unique constraint on `email` prevents duplicate emails
- [ ] RLS policies allow Admin to CRUD all recipients
- [ ] RLS policies restrict Normal users to read-only on their own record
- [ ] Existing recipient records are not affected (backward compatible)
- [ ] Phase 1 schema is validated by automated integration test: `web/src/__tests__/db/phase1-schema.test.ts` (opt-in via `RUN_DB_TESTS=1`)

---

### Phase 2: Supabase Admin Client Setup

**Use Case:** As a developer, I need a server-side Supabase client with elevated privileges to create and manage user accounts.

**File:** `web/src/lib/supabaseAdmin.ts`

Create server-side admin client using Service Role key for:
- Creating auth users without password
- Managing user accounts

```typescript
// Server-side only - never expose to client
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-side only
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

**Acceptance Criteria:**
- [ ] `supabaseAdmin.ts` file is created in `web/src/lib/`
- [ ] Admin client uses `SUPABASE_SERVICE_ROLE_KEY` environment variable
- [ ] Admin client is only importable from server-side code (API routes)
- [ ] Admin client does NOT appear in client-side bundle (verify via build)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is added to `.env.local.template`
- [ ] Admin client can successfully create users via `auth.admin.createUser()`
- [ ] Admin client can successfully update users via `auth.admin.updateUserById()`

---

### Phase 3: Recipients API Enhancement

**Use Case:** As an Admin, I need to create branch manager accounts with temporary passwords so they can access the system.

**File:** `web/src/app/api/maintenance/recipients/route.ts`

**POST handler changes:**
1. Validate Admin is making request
2. If `recipient_type === 'Normal'`:
   - Accept `temp_password` from request body (set by AWD Admin)
   - Create Supabase Auth user WITH password: 
     ```typescript
     supabaseAdmin.auth.admin.createUser({ 
       email, 
       password: temp_password,
       email_confirm: true  // Skip email verification
     })
     ```
   - Store returned `auth_user_id` in recipients table
   - Set `needs_password_setup = true`
   - **Send welcome email** to new branch manager (see Phase 3b)
3. Return success with user status (do NOT return password in response)

**New endpoints:**
- `PATCH /api/maintenance/recipients/[id]/reset-password` - Admin resets user's password to new temp password + sends notification email
- `PATCH /api/maintenance/recipients/[id]/deactivate` - Set `is_active = false`

**Acceptance Criteria:**
- [ ] POST request with `recipient_type: 'Normal'` requires `temp_password` field
- [ ] POST request with `recipient_type: 'Normal'` requires `branch_id` field
- [ ] Supabase Auth user is created with provided email and temp password
- [ ] `auth_user_id` from Supabase is stored in recipient record
- [ ] `needs_password_setup` is set to `true` for new Normal users
- [ ] Welcome email is triggered after successful user creation
- [ ] API response does NOT include the temp password
- [ ] API returns 400 if required fields are missing
- [ ] API returns 409 if email already exists
- [ ] Only Admin users can create new recipients (401/403 otherwise)
- [ ] Reset password endpoint updates Supabase Auth password
- [ ] Reset password endpoint sets `needs_password_setup = true`
- [ ] Reset password endpoint sends notification email
- [ ] Deactivate endpoint sets `is_active = false`
- [ ] Deactivated users cannot authenticate via Supabase
- [ ] Phase 3 API behavior is validated by automated tests: `web/src/__tests__/api/recipients.test.ts`

---

### Phase 3b: Welcome Email Service

**Use Case:** As a new Branch Manager, I need to receive a welcome email with my login credentials and instructions so I can access the system.

**File:** `web/src/app/api/email/welcome/route.ts` (new)

**Email service setup:**
- Use existing email infrastructure (Resend, SendGrid, or Supabase email)
- Create HTML email template for welcome message

**Welcome Email Template:**
```
Subject: Welcome to YMCA Attendance & Scheduling

Hi [First Name],

Your account has been created for the YMCA Attendance & Scheduling system.

Your Assignment:
  Alliance:    [Alliance Name]
  Association: [Association Name]
  Branch:      [Branch Name]

Your temporary password: [Temp Password]

To get started:
1. Go to [App URL]
2. Enter your email and temporary password
3. You will be prompted to create a new password

If you have any questions, please contact AWD Support at [support email].

Welcome aboard!
The AWD Team
```

**Password Reset Email Template:**
```
Subject: Your YMCA Attendance Password Has Been Reset

Hi [First Name],

Your password has been reset by an administrator.

Your new temporary password: [New Temp Password]

Please log in and create a new password at your earliest convenience.

[App URL]

If you did not request this reset, please contact AWD Support immediately.

The AWD Team
```

**Acceptance Criteria:**
- [ ] Welcome email API endpoint is created and functional
- [ ] Email is sent within 30 seconds of user creation
- [ ] Email subject is "Welcome to YMCA Attendance & Scheduling"
- [ ] Email contains recipient's first name in greeting
- [ ] Email contains correct Alliance name
- [ ] Email contains correct Association name
- [ ] Email contains correct Branch name
- [ ] Email contains the temporary password
- [ ] Email contains correct login URL for the environment
- [ ] Email contains AWD support contact information
- [ ] Email sends successfully to valid email addresses
- [ ] Email failures are logged but do not block user creation
- [ ] Password reset email template is implemented
- [ ] Password reset email contains new temp password
- [ ] Email templates render correctly in major email clients (Gmail, Outlook)
- [ ] Phase 3b email service is validated by automated tests: `web/src/__tests__/api/welcome-email.test.ts`

---

### Phase 4: Admin UI - Recipients Tab Enhancement

**Use Case:** As an Admin, I need a UI to create and manage branch manager accounts with proper organizational assignment.

**File:** `web/src/app/maintenance/recipients-tab.tsx`

**Changes:**
1. Add Alliance → Association → Branch cascade dropdowns
2. When `recipient_type = 'Normal'`, require branch selection
3. Add "Temporary Password" field for new users (Admin enters or generates)
4. Show user status indicators:
   - 🟡 "Pending Password Change" - `needs_password_setup = true`
   - 🟢 "Active" - `is_active = true && needs_password_setup = false`
   - 🔴 "Inactive" - `is_active = false`
5. Add "Reset Password" button - generates new temp password for user
6. Add "Deactivate" / "Reactivate" toggle
7. Show "Last Login" timestamp for active users

**Acceptance Criteria:**
- [ ] Alliance dropdown loads all alliances
- [ ] Association dropdown filters based on selected Alliance
- [ ] Branch dropdown filters based on selected Association
- [ ] Branch selection is required when `recipient_type` is "Normal"
- [ ] Temporary password field is visible for new Normal users
- [ ] Temporary password field has minimum 8 character validation
- [ ] "Generate Password" button creates random secure password
- [ ] User status shows yellow indicator for "Pending Password Change"
- [ ] User status shows green indicator for "Active"
- [ ] User status shows red indicator for "Inactive"
- [ ] "Reset Password" button is visible for existing Normal users
- [ ] "Reset Password" shows confirmation dialog before resetting
- [ ] "Deactivate" toggle is visible for active users
- [ ] "Reactivate" toggle is visible for inactive users
- [ ] "Last Login" timestamp is displayed for users who have logged in
- [ ] "Never logged in" is displayed for users with null `last_login_at`
- [ ] Form validation prevents submission with missing required fields
- [ ] Success toast appears after user creation
- [ ] Error toast appears if user creation fails
- [ ] Phase 4 UI behavior is validated by automated tests: `web/src/__tests__/components/recipients-tab.test.tsx`

---

### Phase 5: Login Page Changes

**Use Case:** As a Branch Manager logging in for the first time, I need to be prompted to change my temporary password before accessing the dashboard.

**File:** `web/src/app/page.tsx`

**Sign In Tab additions:**
1. Add "Forgot Password?" link below password field

**Post-login logic (handles first-time detection automatically):**
1. User enters email + password (temp or permanent) and clicks Sign In
2. Supabase authenticates → session created
3. Look up user in `branch_schedule_recipients` by email
4. **Check `needs_password_setup` flag:**
   - If `true` → Show "Create New Password" modal
     - User enters new password (twice)
     - Validate password requirements (min 8 chars, letters + numbers)
     - Call `updateUser({ password })`
     - Update `needs_password_setup = false` in database
   - If `false` → Continue to dashboard
5. **Check `recipient_type`:**
   - If `'Normal'` → Store `branch_id` in auth context, derive Alliance/Association
   - If `'Administrator'` → Allow full access to all branches
6. Update `last_login_at` timestamp
7. Redirect to dashboard

**Create New Password Modal:**
- Title: "Welcome! Please create your password"
- Fields: New Password, Confirm Password
- Validation: 8+ characters, letters and numbers
- Cannot be dismissed without setting password
- After success: "Password created successfully!" → Continue to dashboard

**Acceptance Criteria:**
- [ ] "Forgot Password?" link is visible below password field
- [ ] User can log in with email + temporary password
- [ ] After successful auth, system checks `needs_password_setup` flag
- [ ] If `needs_password_setup = true`, password change modal appears
- [ ] Password change modal cannot be dismissed (no X button, no backdrop click)
- [ ] Password change modal requires password entry in both fields
- [ ] Password validation requires minimum 8 characters
- [ ] Password validation requires at least one letter and one number
- [ ] Password fields must match before submission
- [ ] "Show password" toggle works for both password fields
- [ ] After password change, user is redirected to dashboard
- [ ] `needs_password_setup` is set to `false` in database after password change
- [ ] Subsequent logins skip password change modal
- [ ] `last_login_at` is updated on successful login
- [ ] Normal user's branch context is stored in auth provider
- [ ] Admin user has full access after login
- [ ] Invalid credentials show appropriate error message
- [ ] Inactive user account shows "Account deactivated" error
- [ ] Phase 5 login behavior is validated by automated tests: `web/src/__tests__/auth/first-time-login.test.tsx`

---

### Phase 6: Forgot Password Modal

**Use Case:** As a user who has forgotten my password, I need to reset it using a verification code sent to my email.

**File:** `web/src/app/page.tsx` (new modal component)

**Flow:**
1. User clicks "Forgot Password?"
2. Modal opens with email input
3. User enters email, clicks "Send Reset Code"
4. System calls `resetPasswordForEmail(email)` with OTP option
5. Modal shows OTP input + new password fields
6. User enters OTP + new password (twice)
7. System verifies OTP and updates password
8. Modal shows success, user can sign in

**Acceptance Criteria:**
- [ ] "Forgot Password?" link opens forgot password modal
- [ ] Modal displays email input field
- [ ] "Send Reset Code" button is disabled until valid email is entered
- [ ] Clicking "Send Reset Code" triggers OTP email via Supabase
- [ ] Loading indicator shows while OTP is being sent
- [ ] Success message confirms OTP was sent to email
- [ ] Modal transitions to show 6-digit OTP input fields
- [ ] OTP input fields auto-advance on digit entry
- [ ] OTP input supports paste of full 6-digit code
- [ ] New password fields appear alongside OTP input
- [ ] Password validation requires minimum 8 characters
- [ ] Password validation requires at least one letter and one number
- [ ] Both password fields must match
- [ ] "Reset Password" button validates OTP with Supabase
- [ ] Invalid OTP shows clear error message
- [ ] Expired OTP shows "Code expired, request new code" message
- [ ] "Resend Code" link is available after 60 seconds
- [ ] Successful password reset shows success message
- [ ] User is returned to login form after successful reset
- [ ] Modal can be closed via X button or backdrop click (before OTP sent)
- [ ] Email not found shows appropriate error (without revealing if email exists)
- [ ] Phase 6 forgot password behavior is validated by automated tests: `web/src/__tests__/auth/forgot-password.test.tsx`

---

### Phase 7: Branch Access Control Hook

**Use Case:** As a developer, I need a reusable hook to check user permissions and filter data based on their assigned branch hierarchy.

**File:** `web/src/hooks/useBranchAccess.ts`

```typescript
interface UserAccess {
  isAdmin: boolean
  isNormal: boolean
  // User's assigned hierarchy (derived from branch)
  allianceId: string | null
  associationId: string | null
  branchId: string | null
  // Access check helpers
  canAccessAlliance: (targetAllianceId: string) => boolean
  canAccessAssociation: (targetAssociationId: string) => boolean
  canAccessBranch: (targetBranchId: string) => boolean
}

export function useBranchAccess(): UserAccess {
  const { user } = useAuth()
  const [recipientData, setRecipientData] = useState<RecipientData | null>(null)
  
  // Fetch recipient data on mount (includes branch -> association -> alliance chain)
  useEffect(() => {
    if (user?.email) {
      fetchRecipientByEmail(user.email).then(setRecipientData)
    }
  }, [user?.email])
  
  const isAdmin = recipientData?.recipient_type === 'Administrator'
  
  return {
    isAdmin,
    isNormal: recipientData?.recipient_type === 'Normal',
    
    // User's assigned hierarchy
    allianceId: recipientData?.alliance_id ?? null,
    associationId: recipientData?.association_id ?? null,
    branchId: recipientData?.branch_id ?? null,
    
    // Admin can access everything, Normal users restricted to their chain
    canAccessAlliance: (targetAllianceId: string) => {
      if (isAdmin) return true
      return recipientData?.alliance_id === targetAllianceId
    },
    canAccessAssociation: (targetAssociationId: string) => {
      if (isAdmin) return true
      return recipientData?.association_id === targetAssociationId
    },
    canAccessBranch: (targetBranchId: string) => {
      if (isAdmin) return true
      return recipientData?.branch_id === targetBranchId
    },
  }
}
```

**Usage in components:**
```typescript
const { isAdmin, branchId, canAccessBranch } = useBranchAccess()

// Filter data for Normal users
const filteredSchedules = isAdmin 
  ? allSchedules 
  : allSchedules.filter(s => canAccessBranch(s.branch_id))
```

**Acceptance Criteria:**
- [ ] `useBranchAccess` hook is created in `web/src/hooks/`
- [ ] Hook returns `isAdmin: true` for Administrator users
- [ ] Hook returns `isNormal: true` for Normal users
- [ ] Hook returns correct `allianceId` for logged-in user
- [ ] Hook returns correct `associationId` for logged-in user
- [ ] Hook returns correct `branchId` for logged-in user
- [ ] `canAccessAlliance()` returns `true` for Admin users regardless of input
- [ ] `canAccessAlliance()` returns `true` for Normal users only for their alliance
- [ ] `canAccessAssociation()` returns `true` for Admin users regardless of input
- [ ] `canAccessAssociation()` returns `true` for Normal users only for their association
- [ ] `canAccessBranch()` returns `true` for Admin users regardless of input
- [ ] `canAccessBranch()` returns `true` for Normal users only for their branch
- [ ] Hook handles loading state gracefully (returns safe defaults)
- [ ] Hook handles unauthenticated users (returns nulls/false)
- [ ] Hook re-fetches data when user changes
- [ ] Phase 7 hook behavior is validated by automated tests: `web/src/__tests__/hooks/useBranchAccess.test.ts`

---

### Phase 8: Theme Provider Update

**Use Case:** As a Normal user, I should automatically see my assigned branch context without the ability to switch branches.

**File:** `web/src/components/theme-settings-provider.tsx`

**Changes:**
1. Import `useBranchAccess` hook
2. For Normal users:
   - Auto-select their assigned branch on load
   - Hide or disable branch switcher dropdown
   - Show "Your Branch: [Branch Name]" instead
3. For Admin users:
   - Keep full branch switcher functionality

**Acceptance Criteria:**
- [ ] Theme provider imports and uses `useBranchAccess` hook
- [ ] Normal user's branch is auto-selected on login
- [ ] Normal user sees "Your Branch: [Branch Name]" label
- [ ] Branch switcher dropdown is hidden for Normal users
- [ ] Branch switcher dropdown is visible for Admin users
- [ ] Admin can switch between any branch via dropdown
- [ ] Alliance/Association context is derived from branch for Normal users
- [ ] Alliance/Association names are displayed in header for context
- [ ] Branch context persists across page navigation
- [ ] Branch context is cleared on logout
- [ ] Loading state is handled while fetching user branch data
- [ ] Phase 8 provider behavior is validated by automated tests: `web/src/__tests__/components/theme-provider.test.tsx`

---

### Phase 9: API Route Access Control

**Use Case:** As a security measure, API routes must enforce branch-level access control to prevent unauthorized data access.

**Files:** All API routes that return branch-specific data

**Pattern:**
```typescript
export async function GET(req: Request) {
  const supabase = createSupabaseServerClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  
  // Look up recipient to get full hierarchy access
  const { data: recipient } = await supabase
    .from('branch_schedule_recipients')
    .select(`
      recipient_type, 
      branch_id,
      branch:branches(
        id,
        association_id,
        association:ymca_associations(
          id,
          alliance_id
        )
      )
    `)
    .eq('email', user.email)
    .single()
  
  // Build query with hierarchy filter for Normal users
  let query = supabase.from('some_table').select('*')
  
  if (recipient?.recipient_type === 'Normal') {
    // Normal user: restrict to their Alliance → Association → Branch chain
    const branchId = recipient.branch_id
    if (branchId) {
      query = query.eq('branch_id', branchId)
    } else {
      // No branch assigned - return empty
      return NextResponse.json([])
    }
  }
  // Admin users get unfiltered results (all alliances, associations, branches)
  
  const { data, error } = await query
  return NextResponse.json(data)
}
```

**Security Note:** Always enforce access control on the SERVER side. Client-side filtering is for UX only - the API must reject unauthorized requests.

**Acceptance Criteria:**
- [ ] All branch-specific API routes check user authentication
- [ ] Unauthenticated requests return 401 Unauthorized
- [ ] API routes look up user's `recipient_type` and `branch_id`
- [ ] Normal user requests are filtered to their assigned branch only
- [ ] Normal user cannot access data from other branches via API
- [ ] Normal user attempting to access other branch data returns empty/403
- [ ] Admin user requests return unfiltered data (all branches)
- [ ] Branch filter is applied server-side, not just client-side
- [ ] API routes log unauthorized access attempts
- [ ] Schedules API enforces branch access control
- [ ] Attendance API enforces branch access control
- [ ] Reports API enforces branch access control
- [ ] Classes API enforces branch access control
- [ ] Instructors API enforces branch access control
- [ ] Recipients API allows Admin full access, Normal read-only self
- [ ] Performance is acceptable (branch lookup doesn't significantly slow requests)
- [ ] Phase 9 API access control is validated by automated tests: `web/src/__tests__/api/access-control.test.ts`

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `supabase/migrations/xxx_add_user_auth_fields.sql` | New migration for schema changes |
| `web/src/lib/supabaseAdmin.ts` | New file - admin client |
| `web/src/app/api/maintenance/recipients/route.ts` | Auth user creation with temp password + trigger email |
| `web/src/app/api/email/welcome/route.ts` | New file - welcome email endpoint |
| `web/src/lib/email-templates.ts` | New file - email templates (welcome, password reset) |
| `web/src/app/page.tsx` | Auto-detect first login, password change modal, forgot password |
| `web/src/components/auth-provider.tsx` | Store recipient_type and branch_id |
| `web/src/components/theme-settings-provider.tsx` | Auto-select branch for Normal users |
| `web/src/hooks/useBranchAccess.ts` | New hook for access control |
| Various API routes | Add branch filtering |

---

## Security Considerations

1. **Service Role Key Protection**
   - Only use in server-side code (`supabaseAdmin.ts`)
   - Never expose in client bundles
   - Store in `.env.local` (not committed)

2. **RLS Policies**
   - All tables should have RLS enabled
   - Policies should check `auth.uid()` against `auth_user_id`
   - Admin access via separate policy checking recipient_type

3. **API Route Validation**
   - Always verify user authentication
   - Always check branch access before returning data
   - Log unauthorized access attempts

4. **Password Requirements**
   - Minimum 8 characters
   - Require mix of letters and numbers
   - Enforce via client-side validation and Supabase settings

---

## Automated Testing

### Test Framework & Tools

- **Vitest** - Test runner (**add + configure** in `web/` as part of implementation)
- **Testing Library** - React component testing (**add** in `web/`)
- **jsdom** - DOM environment for component tests (**add** in `web/`)
- **MSW (Mock Service Worker)** - API mocking (**optional**, add if needed)
- **Supabase mocks** - Mock Supabase client responses (`vi.fn()`)
- **pg** - Postgres client for DB schema integration tests (**add** in `web/`)

### Tooling Setup (Prerequisite)

**Use Case:** As a developer, I need a consistent test toolchain so automated tests can run locally and in CI.

**Implementation Notes:**
- Add dev dependencies in `web/package.json`:
  - `vitest`, `@vitest/ui` (optional), `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
  - `msw` (optional)
  - `pg` and `@types/pg` (for DB schema tests)
- Add scripts in `web/package.json`:
  - `test`: run unit/component tests
  - `test:watch`: watch mode
  - `test:coverage`: coverage
- Add `vitest.config.ts` configured for React + jsdom.

**Acceptance Criteria:**
- [ ] `npm run test` runs successfully in `web/`
- [ ] `npm run test:watch` runs tests in watch mode
- [ ] `npm run test:coverage` generates a coverage report
- [ ] `@testing-library/jest-dom` matchers work in component tests
- [ ] DB tests are **opt-in** and do not run unless explicitly enabled (see Phase 1 tests)

### Test File Structure

```
web/src/
├── __tests__/
│   ├── db/
│   │   └── phase1-schema.test.ts          # Phase 1 DB schema integration tests (opt-in)
│   ├── auth/
│   │   ├── first-time-login.test.tsx      # Phase 5 tests
│   │   ├── forgot-password.test.tsx       # Phase 6 tests
│   │   └── login-flow.test.tsx            # Normal login tests
│   ├── hooks/
│   │   └── useBranchAccess.test.ts        # Phase 7 tests
│   ├── api/
│   │   ├── recipients.test.ts             # Phase 3 tests
│   │   ├── welcome-email.test.ts          # Phase 3b tests
│   │   └── access-control.test.ts         # Phase 9 tests
│   └── components/
│       ├── recipients-tab.test.tsx        # Phase 4 tests
│       └── theme-provider.test.tsx        # Phase 8 tests
│
└── __tests__/utils/test-utils.tsx         # Shared render helpers + mocks
```

### Phase 1: Database Schema Integration Tests (Opt-in)

**Goal:** Automatically verify Phase 1 migration effects (columns, defaults, indexes/constraints) against the local Docker Supabase Postgres.

**Safety:** These tests are **disabled by default**. They only run when `RUN_DB_TESTS=1`.

**Environment Variables (testing only):**
- `RUN_DB_TESTS=1` (enables DB tests)
- `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres` (optional override; matches `supabase status`)

```typescript
// web/src/__tests__/db/phase1-schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Client } from "pg"

const dbUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres"

const runDbTests = process.env.RUN_DB_TESTS === "1"

describe(runDbTests ? "Phase 1 - DB schema" : "Phase 1 - DB schema (skipped)", () => {
  const client = new Client({ connectionString: dbUrl })

  beforeAll(async () => {
    if (!runDbTests) return
    await client.connect()
  })

  afterAll(async () => {
    if (!runDbTests) return
    await client.end()
  })

  it(runDbTests ? "has required columns + defaults" : "skipped", async () => {
    if (!runDbTests) return

    const { rows } = await client.query<{
      column_name: string
      column_default: string | null
      is_nullable: "YES" | "NO"
    }>(`
      select column_name, column_default, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'branch_schedule_recipients'
        and column_name in ('auth_user_id','is_active','needs_password_setup','last_login_at')
      order by column_name asc
    `)

    const byName = new Map(rows.map((r) => [r.column_name, r]))

    expect(byName.has("auth_user_id")).toBe(true)
    expect(byName.has("is_active")).toBe(true)
    expect(byName.has("needs_password_setup")).toBe(true)
    expect(byName.has("last_login_at")).toBe(true)

    // Defaults can vary in formatting (e.g., true / (true) / ((true)))
    expect(byName.get("is_active")?.column_default?.toLowerCase()).toContain("true")
    expect(byName.get("needs_password_setup")?.column_default?.toLowerCase()).toContain("true")
  })

  it(runDbTests ? "has auth_user_id index" : "skipped", async () => {
    if (!runDbTests) return

    const { rows } = await client.query<{ indexname: string }>(`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'branch_schedule_recipients'
        and indexname = 'idx_recipients_auth_user_id'
    `)

    expect(rows.length).toBe(1)
  })
})
```

**Acceptance Criteria:**
- [ ] DB schema test file exists: `web/src/__tests__/db/phase1-schema.test.ts`
- [ ] Running without `RUN_DB_TESTS=1` skips DB tests (does not fail)
- [ ] Running with `RUN_DB_TESTS=1` validates Phase 1 schema changes
- [ ] Test checks required columns exist
- [ ] Test checks defaults for `is_active` and `needs_password_setup` are `true`
- [ ] Test checks `idx_recipients_auth_user_id` exists

### Phase 3: Recipients API Tests

```typescript
// web/src/__tests__/api/recipients.test.ts
describe('Recipients API - User Creation', () => {
  describe('POST /api/maintenance/recipients', () => {
    it('creates Supabase Auth user with temp password for Normal recipient', async () => {
      // Arrange: Mock admin session, prepare payload
      // Act: POST request with email, temp_password, branch_id
      // Assert: auth_user_id is returned, needs_password_setup = true
    })

    it('returns 400 if temp_password missing for Normal recipient', async () => {
      // Assert: API returns validation error
    })

    it('returns 400 if branch_id missing for Normal recipient', async () => {
      // Assert: API returns validation error
    })

    it('returns 409 if email already exists', async () => {
      // Assert: API returns conflict error
    })

    it('returns 401/403 if non-Admin tries to create recipient', async () => {
      // Assert: API rejects unauthorized request
    })

    it('triggers welcome email after successful creation', async () => {
      // Assert: Email service called with correct params
    })

    it('does NOT include temp_password in response', async () => {
      // Assert: Response body has no password field
    })
  })

  describe('PATCH /api/maintenance/recipients/[id]/reset-password', () => {
    it('updates Supabase Auth password', async () => {})
    it('sets needs_password_setup = true', async () => {})
    it('triggers password reset email', async () => {})
  })

  describe('PATCH /api/maintenance/recipients/[id]/deactivate', () => {
    it('sets is_active = false', async () => {})
  })
})
```

### Phase 5: First-Time Login Tests

```typescript
// web/src/__tests__/auth/first-time-login.test.tsx
describe('First-Time Login Flow', () => {
  it('shows password change modal when needs_password_setup is true', async () => {
    // Arrange: Mock user with needs_password_setup = true
    // Act: Render login page, simulate successful auth
    // Assert: Password change modal is visible
  })

  it('prevents modal dismissal without setting password', async () => {
    // Arrange: Password change modal is open
    // Act: Click outside modal, press Escape
    // Assert: Modal remains open
  })

  it('validates password minimum 8 characters', async () => {
    // Act: Enter 7 char password
    // Assert: Validation error shown
  })

  it('validates password contains letters and numbers', async () => {
    // Act: Enter password with only letters
    // Assert: Validation error shown
  })

  it('requires password confirmation to match', async () => {
    // Act: Enter mismatched passwords
    // Assert: Validation error shown
  })

  it('updates Supabase password on valid submission', async () => {
    // Act: Enter valid matching passwords, submit
    // Assert: updateUser called with new password
  })

  it('sets needs_password_setup to false after password change', async () => {
    // Assert: Database updated
  })

  it('redirects to dashboard after successful password change', async () => {
    // Assert: Navigation to dashboard triggered
  })

  it('skips modal on subsequent logins (needs_password_setup = false)', async () => {
    // Arrange: Mock user with needs_password_setup = false
    // Assert: No modal, direct to dashboard
  })
})
```

### Phase 6: Forgot Password Tests

```typescript
// web/src/__tests__/auth/forgot-password.test.tsx
describe('Forgot Password Flow', () => {
  it('opens modal when clicking Forgot Password link', async () => {
    // Assert: Modal is visible
  })

  it('disables Send Reset Code until valid email entered', async () => {
    // Assert: Button is disabled for invalid email
  })

  it('sends OTP to email via Supabase', async () => {
    // Assert: resetPasswordForEmail called
  })

  it('shows OTP input fields after sending code', async () => {
    // Assert: 6-digit input fields visible
  })

  it('auto-advances OTP input on digit entry', async () => {
    // Act: Type digit in first field
    // Assert: Focus moves to second field
  })

  it('supports pasting full 6-digit code', async () => {
    // Act: Paste "123456"
    // Assert: All fields populated
  })

  it('shows error for invalid OTP', async () => {
    // Arrange: Mock Supabase to reject OTP
    // Assert: Error message displayed
  })

  it('shows error for expired OTP', async () => {
    // Assert: "Code expired" message with resend option
  })

  it('enables Resend Code after 60 seconds', async () => {
    // Assert: Resend link appears after timer
  })

  it('updates password after valid OTP', async () => {
    // Assert: updateUser called, success message shown
  })
})
```

### Phase 7: Branch Access Hook Tests

```typescript
// web/src/__tests__/hooks/useBranchAccess.test.ts
describe('useBranchAccess Hook', () => {
  describe('Admin User', () => {
    it('returns isAdmin = true', () => {})
    it('canAccessAlliance returns true for any alliance', () => {})
    it('canAccessAssociation returns true for any association', () => {})
    it('canAccessBranch returns true for any branch', () => {})
  })

  describe('Normal User', () => {
    it('returns isNormal = true', () => {})
    it('returns correct allianceId from user data', () => {})
    it('returns correct associationId from user data', () => {})
    it('returns correct branchId from user data', () => {})
    it('canAccessAlliance returns true only for assigned alliance', () => {})
    it('canAccessAlliance returns false for other alliances', () => {})
    it('canAccessAssociation returns true only for assigned association', () => {})
    it('canAccessAssociation returns false for other associations', () => {})
    it('canAccessBranch returns true only for assigned branch', () => {})
    it('canAccessBranch returns false for other branches', () => {})
  })

  describe('Unauthenticated User', () => {
    it('returns null for all IDs', () => {})
    it('returns false for all access checks', () => {})
  })
})
```

### Phase 9: API Access Control Tests

```typescript
// web/src/__tests__/api/access-control.test.ts
describe('API Access Control', () => {
  describe('Normal User Requests', () => {
    it('schedules API returns only user branch data', async () => {
      // Arrange: Mock Normal user with branch_id = 'branch-1'
      // Act: GET /api/schedules
      // Assert: All returned schedules have branch_id = 'branch-1'
    })

    it('attendance API returns only user branch data', async () => {})
    it('reports API scoped to user branch', async () => {})
    
    it('returns empty array if user has no branch assigned', async () => {
      // Arrange: Normal user with branch_id = null
      // Assert: Empty array returned
    })

    it('returns 403 when trying to access other branch data', async () => {
      // Act: GET /api/schedules?branch_id=other-branch
      // Assert: 403 or empty result
    })
  })

  describe('Admin User Requests', () => {
    it('schedules API returns all branches', async () => {})
    it('attendance API returns all branches', async () => {})
    it('can filter by any branch_id', async () => {})
  })

  describe('Unauthenticated Requests', () => {
    it('returns 401 for all protected endpoints', async () => {})
  })
})
```

### Test Utilities & Mocks

```typescript
// web/src/__tests__/utils/test-utils.tsx
import { render } from '@testing-library/react'

// Wrapper with all providers
export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <AuthProvider>
      <ThemeSettingsProvider>
        {ui}
      </ThemeSettingsProvider>
    </AuthProvider>
  )
}

// Mock Supabase client
export const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    updateUser: vi.fn(),
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
}

// Mock user factory
export function createMockUser(overrides = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    recipient_type: 'Normal',
    branch_id: 'branch-1',
    association_id: 'assoc-1',
    alliance_id: 'alliance-1',
    needs_password_setup: false,
    is_active: true,
    ...overrides,
  }
}
```

### Running Tests

**PowerShell (Windows):**

```powershell
# Run all tests
npm run test

# Run tests for specific phase
npm run test -- -t "First-Time Login"
npm run test -- -t "Forgot Password"
npm run test -- -t "useBranchAccess"

# Run DB schema integration tests (Phase 1) - opt-in
$env:RUN_DB_TESTS = "1"
npm run test -- -t "Phase 1 - DB schema"

# Optional: override DB URL (default targets Supabase local DB port 54322)
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
npm run test -- -t "Phase 1 - DB schema"

# Run with coverage
npm run test:coverage

# Watch mode during development
npm run test:watch
```

**Bash (macOS/Linux):**

```bash
# Run all tests
npm run test

# Run tests for specific phase
npm run test -- -t "First-Time Login"
npm run test -- -t "Forgot Password"
npm run test -- -t "useBranchAccess"

# Run DB schema integration tests (Phase 1) - opt-in
RUN_DB_TESTS=1 npm run test -- -t "Phase 1 - DB schema"

# Optional: override DB URL (default targets Supabase local DB port 54322)
RUN_DB_TESTS=1 TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" npm run test -- -t "Phase 1 - DB schema"

# Run with coverage
npm run test:coverage

# Watch mode during development
npm run test:watch
```

### Test Coverage Requirements

| Phase | Minimum Coverage |
|-------|-----------------|
| Phase 1 (DB schema integration) | N/A (integration test) |
| Phase 3 (Recipients API) | 90% |
| Phase 5 (First-Time Login) | 85% |
| Phase 6 (Forgot Password) | 85% |
| Phase 7 (useBranchAccess) | 95% |
| Phase 9 (API Access Control) | 90% |

---

## Manual Testing Checklist

**User Creation:**
- [ ] Admin can create Normal user with branch assignment and temp password
- [ ] Welcome email is sent to new branch manager with correct details
- [ ] Email contains correct Alliance, Association, Branch names
- [ ] Email contains temp password and login URL

**First-Time Login:**
- [ ] New user can log in with email + temp password
- [ ] System auto-detects first login and shows password change modal
- [ ] User cannot dismiss password change modal without setting new password
- [ ] Password validation enforces 8+ chars, letters + numbers
- [ ] After password change, `needs_password_setup` is set to false
- [ ] Subsequent logins go directly to dashboard (no password change prompt)

**Access Control:**
- [ ] Normal user only sees data for their Alliance → Association → Branch
- [ ] Normal user cannot access data from other alliances
- [ ] Normal user cannot access data from other associations
- [ ] Normal user cannot access data from other branches
- [ ] Admin user can see ALL alliances, associations, and branches
- [ ] Admin user can switch between any branch via dropdown
- [ ] Branch switcher is hidden for Normal users
- [ ] Alliance/Association/Branch context is auto-set for Normal users on login

**Password Management:**
- [ ] Forgot password flow works with OTP
- [ ] Admin can reset user's password to new temp value
- [ ] Password reset email is sent to user with new temp password

**Account Status:**
- [ ] Deactivated user cannot log in
- [ ] `last_login_at` is updated on each successful login

---

## Implementation Order

Each phase includes implementation + automated tests. Tests are created alongside code.

**Execution Rules:**
- **No phase is complete until its tests pass.**
- **Only complete one phase at a time. Proceed to the next phase only after explicit user approval.**

| Order | Phase | Implementation | Tests |
|-------|-------|----------------|-------|
| 1 | **Phase 1** | Database migration | `phase1-schema.test.ts` (opt-in) + manual verification |
| 2 | **Phase 2** | Admin client setup | Manual verification |
| 3 | **Phase 3** | Recipients API enhancement | `recipients.test.ts` |
| 4 | **Phase 3b** | Welcome email service | `welcome-email.test.ts` |
| 5 | **Phase 4** | Admin UI - Recipients tab | `recipients-tab.test.tsx` |
| 6 | **Phase 5** | Login page changes | `first-time-login.test.tsx` |
| 7 | **Phase 6** | Forgot password modal | `forgot-password.test.tsx` |
| 8 | **Phase 7** | Branch access hook | `useBranchAccess.test.ts` |
| 9 | **Phase 8** | Theme provider updates | `theme-provider.test.tsx` |
| 10 | **Phase 9** | API route access control | `access-control.test.ts` |

**Workflow per phase:**
1. Implement feature code
2. Write automated tests
3. Run tests to verify acceptance criteria
4. Mark criteria as ✅ passed
5. Manual testing for criteria that can't be automated
6. Move to next phase

---

## Environment Variables Required

```bash
# Already present
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# New - add to .env.local
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only, never expose to client

# Testing only (optional)
# Enables Phase 1 DB schema integration tests
RUN_DB_TESTS=1
# Optional override (defaults to local Supabase DB)
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
```
