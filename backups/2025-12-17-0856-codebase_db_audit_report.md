# Codebase and Local Dev Supabase Audit Report

**Date:** December 15, 2025  
**Database:** Local Supabase Dev (127.0.0.1:54322)

---

## Executive Summary

The codebase and local dev Supabase database are **well-aligned**. All API route queries reference valid columns and tables. No critical schema mismatches were found. A few minor cleanup items and performance recommendations are noted below.

---

## 1. Schema Inventory

### Tables (10 total)
| Table | Row Count | Notes |
|-------|-----------|-------|
| branches | 14 | |
| classes | 46 | is_active soft delete |
| class_sessions | 4,635 | Main session data |
| instructor_branches | 0 | Multi-branch support (unused) |
| instructors | 77 | is_active soft delete |
| locations | 8 | is_active soft delete |
| Notifications | 0 | Mobile app notifications |
| schedules | 12 | Monthly schedule containers |
| session_instructors | 4,714 | Join table |
| todos | 0 | User todo list |

### Key Indexes (35 total)
- **Primary keys**: All tables have UUID primary keys
- **Unique constraints**: 
  - `classes.name`
  - `locations.code`
  - `branches.code`
  - `schedules.month_start`
  - `instructors(branch_id, nickname)` (partial, WHERE nickname IS NOT NULL)
  - `class_sessions(schedule_id, class_id, location_id, day_of_week, start_time, end_time, session_date)`
- **Performance indexes**: 
  - `class_sessions(schedule_id)`, `(location_id)`, `(branch_id)`, `(session_date)`, `(day_of_week, start_time)`
  - `instructors(branch_id)`, `(is_active)` partial
  - `classes(is_active)` partial
  - `locations(is_active)` partial

### Foreign Key Constraints (10 total)
All FK relationships are properly defined with appropriate ON DELETE actions:
- `class_sessions` → `classes`, `locations`, `schedules`, `branches`
- `session_instructors` → `class_sessions` (CASCADE), `instructors` (CASCADE)
- `instructor_branches` → `instructors`, `branches`
- `instructors` → `branches`
- `schedules` → `schedules` (self-ref for cloned_from_id)

### Check Constraints (3 total)
- `class_sessions_time_order`: end_time > start_time
- `instructors_pin_check`: pin IS NULL OR (pin >= 0 AND pin <= 9999)
- `schedules_status_check`: status IN ('draft', 'published')

---

## 2. API Route Audit

### Routes Reviewed (9 total)
| Route | Methods | Tables Queried | Status |
|-------|---------|----------------|--------|
| `/api/branches` | GET | branches | ✅ OK |
| `/api/instructors` | GET | instructors | ✅ OK |
| `/api/maintenance/classes` | GET,POST,PUT,PATCH | classes | ✅ OK |
| `/api/maintenance/instructors` | GET,POST,PUT,PATCH | instructors | ✅ OK |
| `/api/maintenance/locations` | GET,POST,PUT,PATCH | locations | ✅ OK |
| `/api/reports` | GET | class_sessions, classes, locations, session_instructors | ✅ OK |
| `/api/trends` | GET | class_sessions, classes | ✅ OK |
| `/api/scheduling/schedules` | GET | schedules | ✅ OK |
| `/api/scheduling/sessions` | GET,POST,PUT,DELETE | class_sessions, session_instructors, classes, locations, instructors | ✅ OK |

### Findings
- **All column references are valid** - no missing columns
- **Join patterns use indexed columns** - schedule_id, class_id, location_id all indexed
- **Supabase client** uses service role key (bypasses RLS) - appropriate for server routes

---

## 3. Data Integrity Check

| Check | Result |
|-------|--------|
| Orphan session_instructors (missing session) | 0 ✅ |
| Orphan session_instructors (missing instructor) | 0 ✅ |
| Orphan class_sessions (missing class) | 0 ✅ |
| Orphan class_sessions (missing location) | 0 ✅ |
| Orphan class_sessions (missing schedule) | 0 ✅ |
| class_sessions with null session_date | 0 ✅ |
| instructors with null raw_name | 0 ✅ |
| class_sessions with null headcount | 577 ⚠️ (expected - attendance not entered) |

### Issue Found: 4 Empty Instructor Records
```
id                                   | raw_name | nickname
--------------------------------------+----------+----------
1a8b5bc2-19aa-4f02-800f-a4992592aed3 |          |
a53b6fa2-6b23-4ac0-96b0-19c50e7341d1 |          |
1fd45067-86e9-48fc-a0ad-1fa91bdf9044 |          |
d6af1493-b783-440d-a9dd-6097cb4949c0 |          |
```
These have no linked sessions and should be deleted.

---

## 4. Index Review

### Current Coverage: Good
Most common query patterns are covered by existing indexes.

### Potential Additions (Low Priority)
1. **session_instructors(instructor_id)** - Currently only covered by composite PK. If you query by instructor_id alone frequently (e.g., "show all sessions for instructor X"), a dedicated index could help.

2. **class_sessions(class_id)** - Currently only covered by composite unique. If you query by class_id alone frequently, a dedicated index could help.

**Recommendation**: Monitor query performance; add these indexes only if needed.

---

## 5. RLS Policy Review

### Tables with RLS Enabled
| Table | RLS | Policies |
|-------|-----|----------|
| class_sessions | ✅ | instructor_can_read_own_sessions, instructor_can_update_own_sessions |
| instructors | ✅ | instructor_can_read_self, instructor_can_update_self |
| session_instructors | ✅ | instructor_can_read_session_links |
| todos | ✅ | Users can view/insert/update/delete own todos |

### Tables without RLS (open access)
- branches, classes, locations, schedules, Notifications, instructor_branches

### Auth Pattern Alignment
- **API routes use service role key** → RLS bypassed → appropriate for admin/server operations
- **Client-side access** (if any) would go through anon key → RLS enforced → instructors can only see their own data
- **This is correct architecture**

---

## 6. Environment Configuration

### Required Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
OPENAI_API_KEY=<your key>
```

### Issue: No `.env.local` file found in `web/` folder
- Template exists at `web/env.local.template`
- **Action Required**: Copy template to `.env.local` and fill in values from `supabase status`

### Config Alignment
- `supabase/config.toml` ports (54321, 54322, 54323) match expected local dev setup
- Code expects service role key for server routes - documented correctly

---

## 7. Recommendations

### Immediate Actions
1. **Create `web/.env.local`** from template with local Supabase keys
2. **Delete 4 empty instructor records**:
   ```sql
   DELETE FROM instructors WHERE raw_name = '' AND nickname = '';
   ```

### Optional Improvements
3. **Add constraint to prevent empty instructors**:
   ```sql
   ALTER TABLE instructors ADD CONSTRAINT instructors_raw_name_not_empty 
   CHECK (raw_name IS NOT NULL AND TRIM(raw_name) <> '');
   ```

4. **Add index for instructor session lookups** (if performance needed):
   ```sql
   CREATE INDEX idx_session_instructors_instructor ON session_instructors(instructor_id);
   ```

5. **Add index for class session lookups** (if performance needed):
   ```sql
   CREATE INDEX idx_class_sessions_class ON class_sessions(class_id);
   ```

---

## 8. Conclusion

The codebase and database are **production-ready** with minor cleanup needed:
- Schema fully supports all API operations
- Indexes cover primary query patterns
- RLS policies correctly configured for instructor self-service
- Service role used appropriately for admin API routes
- No orphaned foreign keys or constraint violations

**Overall Health: ✅ Good**








