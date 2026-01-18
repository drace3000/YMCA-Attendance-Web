# YMCA Class Schedule Conflict Detection System

## System Context

This specification defines conflict detection rules for a YMCA branch class scheduling system. The system manages group fitness class schedules on a monthly basis with CRUD operations performed by branch managers.

### Data Model

```typescript
interface ClassSession {
  id: string;                    // Unique session identifier
  dayOfWeek: string;             // Day of week label stored on the session (e.g., "MONDAY")
  date: string;                  // ISO date format "YYYY-MM-DD"
  startTime: string;             // 24-hour format "HH:mm"
  endTime: string;               // 24-hour format "HH:mm"
  className?: string;            // e.g., "GRIT-CARDIO™", "BODYPUMP™", "ZUMBA®"
  locationCode?: string | null;  // e.g., "SPC", "S", "MB", "C" (optional)
  locationId?: string | null;    // fallback identity when locationCode is not present
  instructorIds: string[];       // supports multi-instructor sessions
  branchId: string;              // Branch identifier
  scheduleMonth: string;         // "YYYY-MM" format
}
```

Notes:
- Time overlap is detected using: `(A.start < B.end) AND (B.start < A.end)` (minute precision).
- Location identity uses `locationCode` (uppercased) when present; otherwise falls back to `locationId`.
- A session can have multiple instructors. Any shared instructor between two overlapping sessions is a conflict.

---

## Conflict Types

### Type 1: Instructor Double-Booking Conflict

**Definition:** An instructor is scheduled to teach two or more classes that have overlapping time periods on the same date.

**Detection Rule:**
```
For any two sessions A and B:
CONFLICT exists when:
  - A.instructorId === B.instructorId
  - A.date === B.date
  - A.id !== B.id
  - Time ranges overlap: (A.startTime < B.endTime) AND (B.startTime < A.endTime)
```

**Severity:** HIGH (prevents scheduling - instructor cannot physically be in two places)

**Example Conflict:**
| Session | Date | Time | Instructor | Location |
|---------|------|------|------------|----------|
| A | 2025-12-06 | 08:00-09:00 | JENN W | Studio |
| B | 2025-12-06 | 08:30-09:30 | JENN W | Mind Body |

**User Notification:** "Instructor JENN W is already scheduled for [Class A] at [Location] from 08:00-09:00"

---

### Type 2: Location Double-Booking Conflict

**Definition:** Two or more classes are scheduled in the same location with overlapping time periods on the same date.

**Detection Rule:**
```
For any two sessions A and B:
CONFLICT exists when:
  - A.locationCode === B.locationCode
  - A.date === B.date
  - A.id !== B.id
  - Time ranges overlap: (A.startTime < B.endTime) AND (B.startTime < A.endTime)
```

**Severity:** HIGH (prevents scheduling - location cannot host two classes simultaneously)

**Example Conflict:**
| Session | Date | Time | Class | Location |
|---------|------|------|-------|----------|
| A | 2025-12-06 | 09:00-10:00 | GROUP CYCLE | Studio |
| B | 2025-12-06 | 09:15-10:00 | STEP-CARDIO | Studio |

**User Notification:** "Location [Studio] is already booked for [GROUP CYCLE] from 09:00-10:00"

---

### Type 3: Instructor Insufficient Transition Time (Warning)

**Definition:** An instructor has back-to-back classes at different locations without adequate transition time.

**Detection Rule:**
```
For any two sessions A and B where A ends before B starts:
WARNING exists when:
  - A.instructorId === B.instructorId
  - A.date === B.date
  - A.locationCode !== B.locationCode
  - Gap between sessions: (B.startTime - A.endTime) < MINIMUM_TRANSITION_MINUTES
  - Recommended MINIMUM_TRANSITION_MINUTES = 15
```

**Severity:** MEDIUM (warning - may be acceptable but flagged for review)

**Example Warning:**
| Session | Date | Time | Instructor | Location |
|---------|------|------|------------|----------|
| A | 2025-12-06 | 08:00-09:00 | BRENDA | Studio |
| B | 2025-12-06 | 09:05-10:00 | BRENDA | Sports Performance Center |

**User Notification:** "Warning: BRENDA has only 5 minutes between classes at different locations (Studio → Sports Performance Center)"

---

### Type 4: Location Insufficient Turnover Time (Warning)

**Definition:** A location has back-to-back classes without adequate setup/cleanup time between different class types.

**Detection Rule:**
```
For any two sessions A and B where A ends before B starts:
WARNING exists when:
  - A.locationCode === B.locationCode
  - A.date === B.date
  - A.className !== B.className (different class types may need equipment changes)
  - Gap between sessions: (B.startTime - A.endTime) < MINIMUM_TURNOVER_MINUTES
  - Recommended MINIMUM_TURNOVER_MINUTES = 15
```

**Severity:** LOW (informational - common practice but worth flagging)

**Example Warning:**
| Session | Date | Time | Class | Location |
|---------|------|------|-------|----------|
| A | 2025-12-06 | 09:00-10:00 | BODYPUMP™ | Studio |
| B | 2025-12-06 | 10:00-11:00 | ZUMBA® | Studio |

**User Notification:** "Note: No turnover time between BODYPUMP™ and ZUMBA® in Studio (equipment change may be needed)"

---

### Type 5: Instructor Maximum Daily Hours Exceeded (Warning)

**Definition:** An instructor is scheduled for more than a configurable maximum number of teaching hours in a single day.

**Detection Rule:**
```
For each instructor on each date:
WARNING exists when:
  - SUM of all (session.endTime - session.startTime) for instructor on date > MAX_DAILY_HOURS
  - Recommended MAX_DAILY_HOURS = 6
```

**Severity:** MEDIUM (warning - labor/fatigue consideration)

**User Notification:** "Warning: MIKEY is scheduled for [X] hours on [date], exceeding the [Y] hour daily maximum"

---

### Type 6: Instructor Unavailability Conflict

**Definition (implemented):** Instructor availability is enforced as a **month-scoped allow-list** when availability entries exist.

**Detection Rule:**
```
Requires additional data model:
interface InstructorAvailability {
  instructorId: string;
  scheduleMonth: string;       // "YYYY-MM"
  dayOfWeek: string;           // "MONDAY", "TUESDAY", etc.
  availableStart: string;      // "HH:mm"
  availableEnd: string;        // "HH:mm"
}

Enforcement semantics:
  - If an instructor has NO availability entries for the scheduleMonth: assume available (no enforcement).
  - If an instructor has ANY availability entries for the scheduleMonth:
      - For a given dayOfWeek, if there are NO availability windows: instructor is NOT available (HIGH).
      - If windows exist: the session must be fully contained within at least one window.
```

**Severity:** HIGH (when availability enforcement applies and the session is not allowed)

**User Notification:**
- "Instructor is not available on [DAY] for [YYYY-MM] (no availability windows defined for this day)."
- or "Instructor is not available during [START–END] (allowed: [WINDOWS])."

---

## Additional Validations (Implemented in Current Conflict Engine)

These are additional conflict/validation outputs currently produced by the engine.

### INVALID_TIME_FORMAT (HIGH)
- **Definition**: A session has a time not in `HH:mm` format.
- **Example**: `8:00` instead of `08:00`.

### INVALID_TIME_RANGE (HIGH)
- **Definition**: `endTime <= startTime` (zero/negative duration). Cross-midnight sessions are not allowed.

### DAY_OF_WEEK_MISMATCH (HIGH)
- **Definition**: The `dayOfWeek` stored on the session does not match the weekday derived from `date` (UTC).

### OUTSIDE_SCHEDULE_MONTH (HIGH)
- **Definition**: When `scheduleMonth` is supplied to the engine, any `date` not in that month is flagged.

### HOLIDAY (HIGH or LOW)
- **HIGH (blocking)**: The branch is marked **closed** on that date (full-day or partial-day closure window) and the session overlaps the closed window.
- **LOW (info)**: The date is a holiday, but the branch is not closed; show informational note (“this date is …”).

---

## Conflict Detection Database Schema

### Conflict Log Table

```sql
CREATE TABLE schedule_conflicts (
  conflict_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           VARCHAR(50) NOT NULL,
  schedule_month      VARCHAR(7) NOT NULL,          -- "YYYY-MM"
  conflict_type       VARCHAR(50) NOT NULL,         -- See enum below
  severity            VARCHAR(10) NOT NULL,         -- "HIGH", "MEDIUM", "LOW"
  session_a_id        UUID NOT NULL,
  session_b_id        UUID,                         -- NULL for single-session conflicts (Type 5, 6)
  conflict_date       DATE NOT NULL,
  description         TEXT NOT NULL,
  detected_at         TIMESTAMP DEFAULT NOW(),
  resolved_at         TIMESTAMP,
  resolved_by         VARCHAR(100),
  resolution_action   VARCHAR(50),                  -- "MODIFIED", "DELETED", "OVERRIDDEN", "IGNORED"
  override_reason     TEXT,                         -- Required if resolution is "OVERRIDDEN"
  
  FOREIGN KEY (session_a_id) REFERENCES class_sessions(id),
  FOREIGN KEY (session_b_id) REFERENCES class_sessions(id)
);

-- Conflict type enumeration
CREATE TYPE conflict_type_enum AS ENUM (
  'INSTRUCTOR_DOUBLE_BOOKING',
  'LOCATION_DOUBLE_BOOKING',
  'INSTRUCTOR_TRANSITION_TIME',
  'LOCATION_TURNOVER_TIME',
  'INSTRUCTOR_MAX_HOURS',
  'INSTRUCTOR_OUTSIDE_AVAILABILITY',
  'INVALID_TIME_FORMAT',
  'INVALID_TIME_RANGE',
  'DAY_OF_WEEK_MISMATCH',
  'OUTSIDE_SCHEDULE_MONTH',
  'HOLIDAY'
);

-- Indexes for efficient querying
CREATE INDEX idx_conflicts_branch_month ON schedule_conflicts(branch_id, schedule_month);
CREATE INDEX idx_conflicts_unresolved ON schedule_conflicts(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_conflicts_severity ON schedule_conflicts(severity) WHERE resolved_at IS NULL;
```

---

## Conflict Summary View

```sql
CREATE VIEW conflict_summary AS
SELECT 
  branch_id,
  schedule_month,
  conflict_type,
  severity,
  COUNT(*) as conflict_count,
  COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_count
FROM schedule_conflicts
GROUP BY branch_id, schedule_month, conflict_type, severity;
```

---

## API Endpoints for Conflict Detection

### 1. Validate Single Session (Real-time during CRUD)

```typescript
// Implemented as server-side gates on create/update:
POST /api/scheduling/sessions   // returns 409 + conflicts[] when HIGH conflicts exist
PUT  /api/scheduling/sessions   // returns 409 + conflicts[] when HIGH conflicts exist
```

### 2. Validate Entire Schedule (Verify)

```typescript
POST /api/scheduling/conflicts
Response: { summary, conflicts }
```

### 3. Publish Gate

```typescript
POST /api/scheduling/publish
Response: 409 if HIGH conflicts exist (includes summary + conflicts)
```

---

## TypeScript Implementation Reference

```typescript
// Time overlap detection utility
function timeRangesOverlap(
  start1: string, 
  end1: string, 
  start2: string, 
  end2: string
): boolean {
  const toMinutes = (time: string): number => {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  };
  
  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);
  
  return s1 < e2 && s2 < e1;
}

// Gap calculation utility
function getGapMinutes(endTime: string, startTime: string): number {
  const toMinutes = (time: string): number => {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  };
  return toMinutes(startTime) - toMinutes(endTime);
}

// Main conflict detection function
interface ConflictResult {
  type: ConflictType;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  sessionA: ClassSession;
  sessionB?: ClassSession;
  message: string;
}

function detectConflicts(
  sessions: ClassSession[],
  config: ConflictConfig
): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  
  // Group sessions by date for efficient processing
  const sessionsByDate = groupBy(sessions, 'date');
  
  for (const [date, dateSessions] of Object.entries(sessionsByDate)) {
    // Check each pair of sessions on the same date
    for (let i = 0; i < dateSessions.length; i++) {
      for (let j = i + 1; j < dateSessions.length; j++) {
        const a = dateSessions[i];
        const b = dateSessions[j];
        
        // Type 1: Instructor Double-Booking
        if (a.instructorId === b.instructorId) {
          if (timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
            conflicts.push({
              type: 'INSTRUCTOR_DOUBLE_BOOKING',
              severity: 'HIGH',
              sessionA: a,
              sessionB: b,
              message: `Instructor ${a.instructorName} is double-booked: ` +
                       `${a.className} (${a.startTime}-${a.endTime}) and ` +
                       `${b.className} (${b.startTime}-${b.endTime})`
            });
          }
        }
        
        // Type 2: Location Double-Booking
        if (a.locationCode === b.locationCode) {
          if (timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
            conflicts.push({
              type: 'LOCATION_DOUBLE_BOOKING',
              severity: 'HIGH',
              sessionA: a,
              sessionB: b,
              message: `Location ${a.locationName} is double-booked: ` +
                       `${a.className} (${a.startTime}-${a.endTime}) and ` +
                       `${b.className} (${b.startTime}-${b.endTime})`
            });
          }
        }
        
        // Type 3: Instructor Transition Time (when not overlapping)
        if (a.instructorId === b.instructorId && a.locationCode !== b.locationCode) {
          const [earlier, later] = a.endTime <= b.startTime ? [a, b] : [b, a];
          const gap = getGapMinutes(earlier.endTime, later.startTime);
          
          if (gap > 0 && gap < config.minInstructorTransitionMinutes) {
            conflicts.push({
              type: 'INSTRUCTOR_TRANSITION_TIME',
              severity: 'MEDIUM',
              sessionA: earlier,
              sessionB: later,
              message: `Instructor ${a.instructorName} has only ${gap} minutes ` +
                       `to transition from ${earlier.locationName} to ${later.locationName}`
            });
          }
        }
        
        // Type 4: Location Turnover Time
        if (a.locationCode === b.locationCode && a.className !== b.className) {
          const [earlier, later] = a.endTime <= b.startTime ? [a, b] : [b, a];
          const gap = getGapMinutes(earlier.endTime, later.startTime);
          
          if (gap >= 0 && gap < config.minLocationTurnoverMinutes) {
            conflicts.push({
              type: 'LOCATION_TURNOVER_TIME',
              severity: 'LOW',
              sessionA: earlier,
              sessionB: later,
              message: `Only ${gap} minutes turnover in ${a.locationName} ` +
                       `between ${earlier.className} and ${later.className}`
            });
          }
        }
      }
    }
    
    // Type 5: Instructor Daily Hours Check
    const instructorHours = new Map<string, number>();
    for (const session of dateSessions) {
      const duration = getGapMinutes(session.startTime, session.endTime) * -1;
      const current = instructorHours.get(session.instructorId) || 0;
      instructorHours.set(session.instructorId, current + duration);
    }
    
    for (const [instructorId, totalMinutes] of instructorHours) {
      if (totalMinutes > config.maxDailyInstructorMinutes) {
        const instructor = dateSessions.find(s => s.instructorId === instructorId);
        conflicts.push({
          type: 'INSTRUCTOR_MAX_HOURS',
          severity: 'MEDIUM',
          sessionA: instructor!,
          message: `Instructor ${instructor!.instructorName} scheduled for ` +
                   `${(totalMinutes / 60).toFixed(1)} hours on ${date} ` +
                   `(max: ${config.maxDailyInstructorMinutes / 60} hours)`
        });
      }
    }
  }
  
  return conflicts;
}

// Configuration interface
interface ConflictConfig {
  minInstructorTransitionMinutes: number;  // Default: 15
  minLocationTurnoverMinutes: number;      // Default: 15
  maxDailyInstructorMinutes: number;       // Default: 360 (6 hours)
  enableTransitionWarnings: boolean;       // Default: true
  enableTurnoverWarnings: boolean;         // Default: true
  enableMaxHoursWarnings: boolean;         // Default: true
}
```

---

## UI Integration Requirements

### Real-time Validation During Edit

When a user modifies any field (date, time, instructor, location), immediately:

1. Run conflict detection against the modified session
2. Display inline validation messages:
   - **HIGH severity**: Red border, prevent save, show error message
   - **MEDIUM severity**: Orange border, allow save with confirmation, show warning
   - **LOW severity**: Yellow indicator, allow save, show informational tooltip

### Conflict Dashboard Component

Display a summary panel showing:
- Total unresolved HIGH conflicts (blocking issues)
- Total MEDIUM warnings
- Total LOW notices
- Quick filters by conflict type
- Click-through to affected sessions with "Jump to Edit" action

### Visual Indicators in Schedule Grid

- 🔴 Red highlight on rows with HIGH conflicts
- 🟠 Orange highlight on rows with MEDIUM warnings  
- 🟡 Yellow highlight on rows with LOW notices
- Hover tooltip showing conflict details
- Click to expand and show all conflicts for that session

---

## Conflict Resolution Workflow

1. **Block and Notify**: HIGH severity conflicts prevent saving until resolved
2. **Warn and Confirm**: MEDIUM warnings require explicit acknowledgment
3. **Inform and Continue**: LOW notices are shown but don't interrupt workflow
4. **Override with Reason**: Branch managers can override warnings with documented reason
5. **Audit Trail**: All conflicts, resolutions, and overrides are logged

---

## Testing Scenarios

### Scenario 1: Instructor Double-Booking
```
Input:
  Session A: 2025-12-06, 08:00-09:00, BODYPUMP, Studio, JENN W
  Session B: 2025-12-06, 08:30-09:30, YOGA, Mind Body, JENN W
Expected: HIGH conflict - Instructor double-booking detected
```

### Scenario 2: Location Conflict
```
Input:
  Session A: 2025-12-06, 10:00-11:00, ZUMBA, Studio, NANETTE
  Session B: 2025-12-06, 10:15-11:15, STEP-CARDIO, Studio, FRIEDA
Expected: HIGH conflict - Location double-booking detected
```

### Scenario 3: Valid Back-to-Back (Same Location, Same Instructor)
```
Input:
  Session A: 2025-12-06, 08:00-09:00, BODYPUMP, Studio, JENN W
  Session B: 2025-12-06, 09:00-10:00, BODYCOMBAT, Studio, JENN W
Expected: LOW warning only - No turnover time (equipment change needed)
```

### Scenario 4: Tight Transition Warning
```
Input:
  Session A: 2025-12-06, 08:00-09:00, GRIT-CARDIO, SPC, MIKEY
  Session B: 2025-12-06, 09:10-10:10, BODYPUMP, Studio, MIKEY
Expected: MEDIUM warning - Only 10 minutes transition between different locations
```

### Scenario 5: No Conflict (Adequate Gap)
```
Input:
  Session A: 2025-12-06, 08:00-09:00, YOGA, Mind Body, JULIE
  Session B: 2025-12-06, 09:30-10:30, TAI CHI, Studio, JULIE
Expected: No conflicts - 30 minute gap is sufficient
```
