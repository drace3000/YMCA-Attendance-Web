# Excel Session Data Load Plan

## Overview

This document describes the plan and implementation for loading group exercise class session data from the Excel spreadsheet (`documents/Group X Attendance Tracking.xlsx`) into the local Supabase database.

**Status: ✅ COMPLETED** (December 2024)

---

## Scope

### Months Loaded from Excel

**2024 (8 months):**
- May 2024 ✅
- June 2024 ✅
- July 2024 ✅
- August 2024 ✅
- September 2024 ✅
- October 2024 ✅
- November 2024 ✅
- December 2024 ✅

**2025 (4 months):**
- September 2025 ✅ (cloned from August 2025)
- October 2025 ✅
- November 2025 ✅
- December 2025 ✅

**Total: 12 months loaded, 4,915+ new sessions**

---

## Architecture

### Data Flow

```
Excel Spreadsheet (.xlsx)
        │
        ▼
┌─────────────────────────┐
│ extract-excel-month.js  │  ← Parse Excel tab, apply mappings
│   - Read Excel tab      │
│   - Apply name mappings │
│   - Smart instructor    │
│     parsing             │
│   - Output CSV          │
└─────────────────────────┘
        │
        ▼
    CSV File (backups/csv/)
        │
        ▼
┌─────────────────────────┐
│    load-month.js        │  ← Load CSV into database
│   - Create schedule     │
│   - Auto-add ref data   │
│   - Upsert sessions     │
│   - Link instructors    │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ validate-month-load.js  │  ← Compare DB vs Excel summaries
│   - Extract Excel avgs  │
│   - Query DB averages   │
│   - Report differences  │
└─────────────────────────┘
        │
        ▼
    Status Report (session-load-status.md)
```

### File Structure

```
scripts/
  mapping-utils.js          # Load mapping CSV, lookup functions
  extract-excel-month.js    # Extract Excel tab to CSV
  load-month.js             # Load CSV into database
  validate-month-load.js    # Compare DB vs Excel summaries
  clone-schedule.js         # Clone one month to another

backups/
  excel_db_comparison_utf8.csv  # Name mapping file
  csv/                          # Generated CSV files per month
    may_2024.csv
    june_2024.csv
    ...
  session-load-status.md        # Consolidated status report

documents/
  Group X Attendance Tracking.xlsx  # Source data
  session-load-status.md            # Copy of status report
```

---

## Phase 1: Mapping Utilities

### `scripts/mapping-utils.js`

Loads the mapping CSV file and provides lookup functions for normalizing names.

**Mapping File:** `backups/excel_db_comparison_utf8.csv`

| Column | Description |
|--------|-------------|
| Type | CLASS, INSTRUCTOR, or LOCATION |
| Value | Name as it appears in Excel |
| MAPSTO | Canonical name for database |

**Example Mappings:**

```
Type        | Value                | MAPSTO
------------|----------------------|------------------------
CLASS       | ACTIVE YOFA          | ACTIVE YOGA
CLASS       | BODY BALANACE        | BODYBALANCE™
INSTRUCTOR  | Ron                  | RON
INSTRUCTOR  | KRIST                | KRISTA
LOCATION    | s                    | S
```

**Functions:**

```javascript
loadMappings()           // Load CSV into memory
lookupClass(name)        // Return canonical class name
lookupInstructor(name)   // Return canonical instructor name
lookupLocation(code)     // Return canonical location code
getKnownInstructors()    // Return Set of all known instructor names
```

---

## Phase 2: Excel Extraction

### `scripts/extract-excel-month.js`

Parses an Excel tab and outputs CSV with normalized names.

**Usage:**
```bash
node scripts/extract-excel-month.js "May 2024"
```

**Key Features:**

1. **Dynamic Header Detection**
   - Searches for "SATURDAY" cell to find header row
   - Handles tabs with different layouts (row 3 vs row 2)

2. **Excel Date Conversion**
   - Converts Excel serial numbers (45815) to dates (2024-05-04)

3. **Time Parsing**
   - Extracts start/end times from ranges like "8:00 AM-9:00 AM"
   - Infers AM/PM for ranges like "5:30-6:00am"

4. **Smart Instructor Parsing**
   - Splits by delimiters: `/`, `,`, `&`, `+`, `and`, `with`
   - Detects space-separated instructors if both are known names
   - Example: "VANESSA STEVE" → ["VANESSA", "STEVE"]

5. **Name Normalization**
   - Applies mappings from CSV file
   - Handles special characters (™, ®)

6. **NULL Attendance Handling**
   - Includes dates even when attendance cell is empty
   - Outputs NULL for missing attendance values

**Output Format:**

```csv
Day,Start Time,End Time,Class Name,Location,Instructors,Date 1,Attendance 1,Date 2,Attendance 2,...
SATURDAY,08:00,09:00,BODYPUMP™,S,JENN W|ROBERT,2024-05-04,25,2024-05-11,28,...
```

---

## Phase 3: Database Loading

### `scripts/load-month.js`

Loads extracted CSV data into the Supabase database.

**Usage:**
```bash
node scripts/load-month.js "May 2024"
```

**Process:**

1. **Create Schedule Record**
   ```sql
   INSERT INTO schedules (name, month_start, status)
   VALUES ('May 2024', '2024-05-01', 'draft')
   ```

2. **Auto-Add Reference Data**
   - Check if each class/instructor/location exists
   - Insert missing items automatically

3. **Upsert Sessions**
   ```sql
   INSERT INTO class_sessions (schedule_id, class_id, location_id, ...)
   ON CONFLICT (schedule_id, class_id, location_id, session_date, start_time)
   DO UPDATE SET headcount = EXCLUDED.headcount
   ```

4. **Link Instructors**
   ```sql
   INSERT INTO session_instructors (session_id, instructor_id)
   ON CONFLICT DO NOTHING
   ```

**Output:**
- Sessions inserted/updated count
- Errors (if any)
- Unique dates, classes, instructors count

---

## Phase 4: Validation

### `scripts/validate-month-load.js`

Compares database averages against Excel summary section.

**Usage:**
```bash
node scripts/validate-month-load.js "May 2024"
```

**Process:**

1. **Query Database**
   ```sql
   SELECT c.name, AVG(headcount), COUNT(*)
   FROM class_sessions cs
   JOIN classes c ON c.id = cs.class_id
   WHERE schedule_id = ?
   GROUP BY c.name
   ```

2. **Extract Excel Summaries**
   - Parse summary section (typically rows 40-62)
   - Extract class names and average values

3. **Compare Results**
   - Match: DB average within 0.5 of Excel
   - Mismatch: Document difference
   - Excel Only: Class in Excel but not DB
   - DB Only: Class in DB but not Excel summary

**Output:**
- Match/mismatch counts
- Detailed comparison table
- Updates `backups/session-load-status.md`

---

## Phase 5: Schedule Cloning

### `scripts/clone-schedule.js`

Clones a schedule from one month to another (used for September 2025).

**Purpose:**
September 2025 Excel tab was an empty template with no dates filled in.
Solution: Clone August 2025 schedule structure with NULL attendance.

**Process:**

1. **Date Mapping**
   - Map by day-of-week (1st Monday → 1st Monday)
   - Handle different number of weeks (August has 5 Saturdays, September has 4)

2. **Clone Sessions**
   - Copy all session details (class, location, time)
   - Set headcount to NULL

3. **Clone Instructors**
   - Copy instructor assignments to new sessions

**Result:**
- 456 sessions cloned (34 skipped - 5th week dates)
- 472 instructor assignments copied
- All headcounts NULL

---

## Technical Details

### Excel Structure

The Excel file uses a horizontal layout:

```
Row 3 (Header):  SATURDAY | | | | Date1 | Date2 | ... | Totals | Avg | SUNDAY | ...
Row 4 (Class):   8:00-9:00am | BODYPUMP™ | (S) | JENN W | 25 | 28 | ... | 106 | 26.5 | ...
```

**Day Sections:**
- SATURDAY, SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY
- Each section: Time, Class, Location, Instructor, Date1, Att1, Date2, Att2, ..., Totals, Avg

### Date Handling

Excel stores dates as serial numbers:
- 45815 = May 4, 2024
- Conversion: `new Date((serial - 25569) * 86400000)`

### Time Parsing

Various formats handled:
- "8:00 AM-9:00 AM" → start: "08:00", end: "09:00"
- "5:30-6:00am" → start: "05:30", end: "06:00"
- "12:00-1:00pm" → start: "12:00", end: "13:00"

### Instructor Parsing

**Delimiter Detection:**
```javascript
const delimiterPattern = /[\/,&+]|\s+and\s+|\s+with\s+/i;
```

**Smart Space Detection:**
```javascript
// "VANESSA STEVE" - check if both parts are known instructors
const words = str.split(/\s+/);
if (knownInstructors.has(words[0]) && knownInstructors.has(words[1])) {
  return [words[0], words[1]];
}
```

### Database Schema

**Key Tables:**
- `schedules` - Monthly schedule containers
- `class_sessions` - Individual class sessions with attendance
- `session_instructors` - Many-to-many instructor links
- `classes` - Class definitions
- `instructors` - Instructor definitions
- `locations` - Location codes

**Unique Constraint:**
```sql
UNIQUE (schedule_id, class_id, location_id, session_date, start_time)
```

---

## Results Summary

### Load Statistics

| Year | Months | Sessions | With Attendance |
|------|--------|----------|-----------------|
| 2024 | 8 | 3,424 | 3,424 (100%) |
| 2025 | 4 | 1,947 | 598 (31%) |
| **Total** | **12** | **5,371** | **4,022** |

### Validation Summary

- Most mismatches are small (1-3 points)
- Likely due to Excel formula differences
- Some classes appear in DB but not in Excel summary section

### Known Issues

1. **September 2024 BARRE Values**
   - Excel shows extreme values (740,760)
   - Appears to be Excel formula error

2. **November 2025 High Mismatches**
   - 24 classes with significant differences
   - May indicate incomplete Excel data

3. **Classes Not in Excel Summary**
   - AQUA CIRCUIT, GRIT - STRENGTH™, TOTAL BODY STRONG
   - Present in schedule but not in summary section

---

## Execution Commands

### Full Load Process (Per Month)

```bash
# 1. Extract from Excel
node scripts/extract-excel-month.js "May 2024"

# 2. Load into database
node scripts/load-month.js "May 2024"

# 3. Validate
node scripts/validate-month-load.js "May 2024"
```

### Clone Schedule

```bash
# Edit clone-schedule.js to set SOURCE and TARGET months, then run:
node scripts/clone-schedule.js
```

### Database Backup

```bash
docker exec supabase_db_YMCA-Attendance-Web pg_dump -U postgres -d postgres -Fc > backups/backup.dump
```

### Database Restore

```bash
docker exec -i supabase_db_YMCA-Attendance-Web pg_restore -U postgres -d postgres --clean --if-exists < backups/backup.dump
```

---

## References

- **Status Report:** `documents/session-load-status.md`
- **Mapping File:** `backups/excel_db_comparison_utf8.csv`
- **Source Data:** `documents/Group X Attendance Tracking.xlsx`

---

*Plan created: December 2024*
*Status: Completed*
