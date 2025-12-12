# YMCA Attendance Database Documentation

**Project:** YMCA Attendance Tracker  
**Supabase Project ID:** `pgsqtbblahihqesnvwxd`  
**Last Updated:** Based on current codebase analysis

---

## Table of Contents

1. [Core Tables](#core-tables)
2. [Join Tables](#join-tables)
3. [Relationships](#relationships)
4. [Row Level Security (RLS)](#row-level-security-rls)
5. [RPC Functions](#rpc-functions)
6. [Indexes](#indexes)
7. [Constraints](#constraints)
8. [Data Flow](#data-flow)

---

## Core Tables

### `branches`

Organizational branch locations. Branch codes are slugified from names (e.g., `Schottland Family YMCA` → `schottland_family_ymca`).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `code` | `text` | NO | - | Unique slugified branch code |
| `name` | `text` | NO | - | Branch display name |
| `address` | `text` | YES | - | Street address |
| `city` | `text` | YES | - | City |
| `state` | `text` | YES | - | State |
| `zip` | `text` | YES | - | ZIP code |
| `phone` | `text` | YES | - | Phone number |
| `description` | `text` | YES | - | Branch description |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `code`

**Indexes:**
- Primary key index on `id`
- Unique index on `code`

---

### `schedules`

Defines schedule periods (e.g., "September 2025"). Each schedule represents a monthly period.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `name` | `text` | NO | - | Schedule name (e.g., "September 2025") |
| `month_start` | `date` | NO | - | First day of the schedule month |
| `status` | `text` | YES | - | Status: `draft` or `published` |
| `published_at` | `timestamptz` | YES | - | Publication timestamp |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `month_start` (implied from documentation)

**Current Schedule:**
- September 2025: `a5af3ce8-9729-4073-b399-ee02e3268330`

---

### `classes`

Catalog of class types offered.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `name` | `text` | NO | - | Class name (e.g., "Power Yoga", "Spin") |
| `description` | `text` | YES | - | Class description |
| `category` | `text` | YES | - | Class category |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `name` (implied from upsert logic)

---

### `locations`

Physical or virtual locations where classes are held.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `code` | `text` | NO | - | Location code (e.g., "Studio", "MB") |
| `name` | `text` | NO | - | Location name |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |

**Constraints:**
- Primary key: `id`
- Unique: `code`

---

### `instructors`

People who teach classes. Links to Supabase Auth users via `auth_user_id` for authentication and RLS.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `branch_id` | `uuid` | YES | - | Foreign key to `branches.id` |
| `raw_name` | `text` | NO | - | Original display name from source data |
| `first_name` | `text` | YES | - | First name |
| `last_name` | `text` | YES | - | Last name |
| `nickname` | `text` | YES | - | Schedule nickname (unique per branch) |
| `pin` | `numeric(4)` | YES | - | 4-digit PIN (if applicable) |
| `auth_user_id` | `uuid` | YES | - | Foreign key to `auth.users.id` (unique) |
| `last_login_at` | `timestamptz` | YES | - | Last login timestamp |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |

**Constraints:**
- Primary key: `id`
- Foreign key: `branch_id` → `branches.id` (ON UPDATE CASCADE, ON DELETE SET NULL)
- Unique: `auth_user_id` (where not null)
- Unique: `(branch_id, nickname)` (where nickname is not null)

**Indexes:**
- Primary key index on `id`
- Index on `branch_id`
- Unique index on `auth_user_id` (where not null)
- Unique index on `(branch_id, nickname)` (where nickname is not null)

**Notes:**
- `raw_name` holds the original source display name
- `nickname` is branch-scoped for uniqueness
- `auth_user_id` links to Supabase Auth for RLS policies

---

### `instructor_branches`

Many-to-many relationship allowing instructors to be associated with multiple branches. Used for instructors who teach at multiple locations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `instructor_id` | `uuid` | NO | - | Foreign key to `instructors.id` |
| `branch_id` | `uuid` | NO | - | Foreign key to `branches.id` |
| `is_primary` | `boolean` | YES | `false` | Indicates if this is the instructor's primary branch |

**Constraints:**
- Primary key: `(instructor_id, branch_id)` (implied from usage)
- Foreign key: `instructor_id` → `instructors.id`
- Foreign key: `branch_id` → `branches.id`

**Usage:**
- Queried in `app/attendance.tsx` to get all branches an instructor is associated with
- Used to determine which branch to default to when displaying attendance

---

## Join Tables

### `class_sessions`

Instances of classes in a given schedule. Represents when/where/what classes occur. Includes headcount and approval tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `schedule_id` | `uuid` | NO | - | Foreign key to `schedules.id` |
| `class_id` | `uuid` | NO | - | Foreign key to `classes.id` |
| `location_id` | `uuid` | NO | - | Foreign key to `locations.id` |
| `day_of_week` | `text` | NO | - | Day name (e.g., "Monday", "Tuesday") |
| `start_time` | `time` | NO | - | Class start time |
| `end_time` | `time` | NO | - | Class end time |
| `original_time_text` | `text` | YES | - | Original time string from source data (for audit) |
| `effective_month` | `date` | YES | `2025-09-01` | Effective month for this session |
| `headcount` | `integer` | YES | - | Attendance headcount submitted by instructor |
| `headcount_submitted_at` | `timestamptz` | YES | - | First submission timestamp |
| `headcount_updated_at` | `timestamptz` | YES | - | Last update timestamp |
| `manager_approved` | `boolean` | YES | `false` | Manager approval status (not yet enforced) |
| `manager_approved_at` | `timestamptz` | YES | - | Manager approval timestamp (not yet enforced) |
| `created_at` | `timestamptz` | YES | `now()` | Creation timestamp |

**Constraints:**
- Primary key: `id`
- Foreign key: `schedule_id` → `schedules.id`
- Foreign key: `class_id` → `classes.id`
- Foreign key: `location_id` → `locations.id`

**RLS:**
- Enabled with policies for instructor read/update access

**Current Data:**
- 124 rows for September 2025 schedule

**Notes:**
- Headcount fields are actively used for instructor submissions
- Approval fields (`manager_approved`, `manager_approved_at`) are present but not enforced in current workflow
- `effective_month` defaults to `2025-09-01` but can be overridden

---

### `session_instructors`

Many-to-many relationship linking instructors to class sessions. Allows multiple instructors per session.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `session_id` | `uuid` | NO | - | Foreign key to `class_sessions.id` |
| `instructor_id` | `uuid` | NO | - | Foreign key to `instructors.id` |

**Constraints:**
- Primary key: `(session_id, instructor_id)` (implied from usage)
- Foreign key: `session_id` → `class_sessions.id`
- Foreign key: `instructor_id` → `instructors.id`

**RLS:**
- Enabled with policies for instructor read access

**Current Data:**
- 129 links for September 2025 schedule

**Notes:**
- Supports multiple instructors per session (e.g., "JENN W/ ROBERT")
- Inherits schedule context via the session's `schedule_id`

---

## Relationships

### Entity Relationship Diagram

```
branches (1) ──< (M) instructors
branches (1) ──< (M) instructor_branches >── (M) instructors
schedules (1) ──< (M) class_sessions
classes (1) ──< (M) class_sessions
locations (1) ──< (M) class_sessions
class_sessions (1) ──< (M) session_instructors >── (M) instructors
auth.users (1) ──< (1) instructors (via auth_user_id)
```

### Detailed Relationships

1. **branches → instructors** (1:M)
   - One branch can have many instructors
   - Foreign key: `instructors.branch_id` → `branches.id`
   - Cascade: ON UPDATE CASCADE, ON DELETE SET NULL

2. **branches ↔ instructors** (M:M via `instructor_branches`)
   - Instructors can teach at multiple branches
   - Junction table: `instructor_branches`
   - Includes `is_primary` flag

3. **schedules → class_sessions** (1:M)
   - One schedule contains many class sessions
   - Foreign key: `class_sessions.schedule_id` → `schedules.id`

4. **classes → class_sessions** (1:M)
   - One class type can have many sessions
   - Foreign key: `class_sessions.class_id` → `classes.id`

5. **locations → class_sessions** (1:M)
   - One location can host many sessions
   - Foreign key: `class_sessions.location_id` → `locations.id`

6. **class_sessions ↔ instructors** (M:M via `session_instructors`)
   - Multiple instructors can teach the same session
   - Junction table: `session_instructors`
   - Links: `session_instructors.session_id` → `class_sessions.id`
   - Links: `session_instructors.instructor_id` → `instructors.id`

7. **auth.users → instructors** (1:1 via `auth_user_id`)
   - One auth user maps to one instructor
   - Foreign key: `instructors.auth_user_id` → `auth.users.id`
   - Unique constraint ensures one-to-one relationship

---

## Row Level Security (RLS)

RLS is enabled on the following tables to ensure instructors can only access their own data.

### `class_sessions`

**Policy: `instructor_can_read_own_sessions`**
- **Type:** SELECT
- **Condition:** Instructor can read sessions where they are linked via `session_instructors` and their `auth_user_id` matches the authenticated user

**Policy: `instructor_can_update_own_sessions`**
- **Type:** UPDATE
- **Condition:** Instructor can update sessions where they are linked via `session_instructors` and their `auth_user_id` matches the authenticated user

### `session_instructors`

**Policy: `instructor_can_read_session_links`**
- **Type:** SELECT
- **Condition:** Instructor can read session links where their `auth_user_id` matches the authenticated user

### `instructors`

**Policy: `instructor_can_read_self`**
- **Type:** SELECT
- **Condition:** Instructor can read their own record where `auth_user_id` matches authenticated user

**Policy: `instructor_can_update_self`**
- **Type:** UPDATE
- **Condition:** Instructor can update their own record where `auth_user_id` matches authenticated user

---

## RPC Functions

### `check_email_exists(p_email text)`

Checks if an email address already exists in `auth.users`.

**Parameters:**
- `p_email` (text): Email address to check (case-insensitive)

**Returns:** `boolean` - `true` if email exists, `false` otherwise

**Security:** `SECURITY DEFINER`, executable by `anon` and `authenticated`

**Usage:** Called during onboarding to prevent duplicate email registrations

**Location:** `supabase/functions/check_email_exists.sql`

---

### `nickname_exists(p_branch_id uuid, p_nickname text)`

Checks if a nickname exists for a given branch.

**Parameters:**
- `p_branch_id` (uuid): Branch ID
- `p_nickname` (text): Nickname to check

**Returns:** `boolean` - `true` if nickname exists in branch, `false` otherwise

**Security:** `SECURITY DEFINER`, executable by `anon` and `authenticated`

**Usage:** Called during login/onboarding to verify nickname availability

**Location:** `scripts/create-nickname-exists.js`

---

### `email_in_branch(p_email text, p_branch_id uuid)`

Checks if an email is associated with an instructor in a specific branch.

**Parameters:**
- `p_email` (text): Email address
- `p_branch_id` (uuid): Branch ID

**Returns:** `boolean` - `true` if email exists for an instructor in the branch

**Security:** `SECURITY DEFINER`, executable by `anon` and `authenticated`

**Usage:** Called during login to verify email belongs to branch

**Location:** Referenced in `app/auth/login.tsx`

---

### `nickname_login_email(p_branch_id uuid, p_nickname text)`

Retrieves the email address associated with a nickname in a branch for login purposes.

**Parameters:**
- `p_branch_id` (uuid): Branch ID
- `p_nickname` (text): Instructor nickname

**Returns:** `text` - Email address if found, `null` otherwise

**Security:** `SECURITY DEFINER`, executable by `anon` and `authenticated`

**Usage:** Called during nickname-based login to resolve nickname to email before `signInWithPassword`

**Location:** Referenced in `app/auth/login.tsx`

---

### `claim_instructor(p_branch_id uuid, p_nickname text, p_first_name text, p_last_name text)`

Claims or creates an instructor record and links it to the authenticated user.

**Parameters:**
- `p_branch_id` (uuid): Branch ID
- `p_nickname` (text): Instructor nickname
- `p_first_name` (text, optional): First name
- `p_last_name` (text, optional): Last name

**Returns:** `uuid` - Instructor ID

**Security:** `SECURITY DEFINER`, executable by `authenticated` only

**Logic:**
1. Checks if instructor with `(branch_id, nickname)` exists
2. If not exists: Creates new instructor record with `auth_user_id` set to current user
3. If exists: Updates existing record with `auth_user_id` if not already set, or raises error if claimed by another user
4. Updates `first_name`, `last_name`, `raw_name` if provided

**Usage:** Called during onboarding after email verification to link instructor to auth user

**Location:** `documents/supabase-auth-user-mapping.sql`

---

### `update_last_login()`

Updates the `last_login_at` timestamp for the current instructor.

**Parameters:** None (uses `auth.uid()` internally)

**Returns:** `void`

**Security:** `SECURITY DEFINER`, executable by `authenticated`

**Usage:** Called after successful login to track last login time

**Location:** Referenced in `app/auth/onboarding.tsx`, `app/oauth-callback.tsx`

---

## Indexes

### Explicit Indexes

1. **`instructors_branch_id_idx`**
   - Table: `instructors`
   - Column: `branch_id`
   - Purpose: Speed up branch-scoped queries

2. **`instructors_auth_user_id_unique`**
   - Table: `instructors`
   - Column: `auth_user_id`
   - Type: Unique partial index (where `auth_user_id IS NOT NULL`)
   - Purpose: Ensure one-to-one mapping with auth users

3. **`instructors_branch_nickname_unique`**
   - Table: `instructors`
   - Columns: `(branch_id, nickname)`
   - Type: Unique partial index (where `nickname IS NOT NULL`)
   - Purpose: Enforce branch-scoped nickname uniqueness

### Implicit Indexes

- Primary key indexes on all tables (`id` columns)
- Unique constraint indexes (`branches.code`, `locations.code`, etc.)
- Foreign key indexes (may be created automatically by PostgreSQL)

---

## Constraints

### Primary Keys

- `branches.id`
- `schedules.id`
- `classes.id`
- `locations.id`
- `instructors.id`
- `class_sessions.id`
- `session_instructors` (composite: `session_id`, `instructor_id`)
- `instructor_branches` (composite: `instructor_id`, `branch_id`)

### Unique Constraints

- `branches.code`
- `locations.code`
- `instructors.auth_user_id` (where not null)
- `instructors(branch_id, nickname)` (where nickname is not null)

### Foreign Key Constraints

- `instructors.branch_id` → `branches.id` (ON UPDATE CASCADE, ON DELETE SET NULL)
- `instructors.auth_user_id` → `auth.users.id`
- `class_sessions.schedule_id` → `schedules.id`
- `class_sessions.class_id` → `classes.id`
- `class_sessions.location_id` → `locations.id`
- `session_instructors.session_id` → `class_sessions.id`
- `session_instructors.instructor_id` → `instructors.id`
- `instructor_branches.instructor_id` → `instructors.id`
- `instructor_branches.branch_id` → `branches.id`

---

## Data Flow

### Authentication Flow

1. **Onboarding:**
   - User enters email → `check_email_exists()` validates uniqueness
   - User enters nickname + branch → `nickname_exists()` checks availability
   - Email OTP verification
   - `claim_instructor()` creates/links instructor record
   - `update_last_login()` records login time

2. **Login (Email):**
   - User enters email → `email_in_branch()` verifies branch association
   - `signInWithPassword()` authenticates
   - `update_last_login()` records login time

3. **Login (Nickname):**
   - User enters nickname + branch → `nickname_exists()` verifies existence
   - `nickname_login_email()` resolves nickname to email
   - `signInWithPassword()` authenticates with resolved email
   - `update_last_login()` records login time

### Attendance Flow

1. **Fetch Sessions:**
   - Query `session_instructors` filtered by `instructor_id`
   - Join `class_sessions` with `classes` and `locations`
   - Filter by `schedule_id`, `effective_month`, optionally `day_of_week`
   - RLS ensures instructor only sees their own sessions

2. **Submit Headcount:**
   - Update `class_sessions.headcount`
   - Set `headcount_submitted_at` (first time) or `headcount_updated_at` (subsequent)
   - RLS ensures instructor can only update their own sessions

### Branch Management

- Instructors can be associated with multiple branches via `instructor_branches`
- `is_primary` flag indicates primary branch
- Used in attendance screen to filter/display sessions by branch

---

## Current Data Status

- **Schedules:** 1 (September 2025: `a5af3ce8-9729-4073-b399-ee02e3268330`)
- **Class Sessions:** 124 rows for September 2025
- **Session-Instructor Links:** 129 links
- **Branches:** Multiple (imported from Monroe County YMCA CSV)
- **Classes:** Multiple (imported from GroupX schedule CSV)
- **Locations:** Multiple (imported from GroupX schedule CSV)
- **Instructors:** Multiple (linked to auth users via `auth_user_id`)

---

## Migration History

1. **Initial Schema:** Core tables (`schedules`, `classes`, `locations`, `instructors`, `class_sessions`, `session_instructors`)
2. **Branch Migration:** Added `branches` table and `branch_id` to `instructors` (`supabase-branches-nickname-migration.sql`)
3. **Headcount Migration:** Added headcount and approval fields to `class_sessions` (`supabase-headcount-migration.sql`)
4. **Auth Mapping:** Added `auth_user_id` and RLS policies (`supabase-auth-user-mapping.sql`)
5. **Instructor Branches:** Added `instructor_branches` table for multi-branch support
6. **Email Check:** Added `check_email_exists` RPC function

---

## Notes

- Approval workflow (`manager_approved`, `manager_approved_at`) is present but not yet enforced
- Branch codes are slugified from names (lowercase, underscores for non-alphanumerics)
- Nicknames are case-insensitive in queries but stored as provided
- Time parsing handles various formats and normalizes to `HH:MM:SS`
- Multi-instructor sessions are supported via `session_instructors` junction table
- RLS policies ensure data isolation between instructors
- All timestamps use `timestamptz` for timezone-aware storage

