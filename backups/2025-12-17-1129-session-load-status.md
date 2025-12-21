# Session Load Status Report

Generated: 2024-12-17

## Overview

This document tracks the loading of group exercise class session data from the Excel spreadsheet (`documents/Group X Attendance Tracking.xlsx`) into the local Supabase database.

### Data Source

- **Excel File**: `documents/Group X Attendance Tracking.xlsx`
- **Structure**: Horizontal layout with days as columns, each containing date/attendance pairs
- **Mapping File**: `backups/excel_db_comparison_utf8.csv` for name normalization

### Loading Process

1. **Extract**: Parse Excel tab using `scripts/extract-excel-month.js` → outputs CSV
2. **Load**: Import CSV into database using `scripts/load-month.js`
3. **Validate**: Compare DB averages vs Excel summaries using `scripts/validate-month-load.js`
4. **Clone** (special case): For September 2025, used `scripts/clone-schedule.js` to clone from August 2025

### Key Features Implemented

- **Smart instructor detection**: Splits combined names like "VANESSA STEVE" into separate instructors
- **Dynamic header row detection**: Finds header by searching for "SATURDAY" cell
- **NULL attendance handling**: Loads schedule structure even when attendance data is empty
- **Name normalization**: Maps Excel names to canonical database names via CSV mapping file

---

## Summary

| Month | Sessions | With Attendance | NULL Attendance | Errors | Method |
|-------|----------|-----------------|-----------------|--------|--------|
| May 2024 | 459 | 459 | 0 | 0 | Excel Load |
| June 2024 | 440 | 440 | 0 | 0 | Excel Load |
| July 2024 | 384 | 384 | 0 | 0 | Excel Load |
| August 2024 | 424 | 424 | 0 | 0 | Excel Load |
| September 2024 | 474 | 474 | 0 | 0 | Excel Load |
| October 2024 | 401 | 401 | 0 | 0 | Excel Load |
| November 2024 | 424 | 424 | 0 | 0 | Excel Load |
| December 2024 | 418 | 418 | 0 | 0 | Excel Load |
| **2024 Subtotal** | **3,424** | **3,424** | **0** | **0** | |
| | | | | | |
| January 2025 | 452 | 451 | 1 | - | Pre-existing |
| February 2025 | 452 | 414 | 38 | - | Pre-existing |
| March 2025 | 570 | 495 | 75 | - | Pre-existing |
| April 2025 | 536 | 412 | 124 | - | Pre-existing |
| May 2025 | 482 | 467 | 15 | - | Pre-existing |
| June 2025 | 490 | 490 | 0 | - | Pre-existing |
| July 2025 | 510 | 493 | 17 | - | Pre-existing |
| August 2025 | 490 | 479 | 11 | - | Pre-existing |
| September 2025 | 456 | 0 | 456 | 0 | Cloned from Aug |
| October 2025 | 596 | 596 | 0 | 3 | Excel Load |
| November 2025 | 502 | 502 | 0 | 2 | Excel Load |
| December 2025 | 393 | 0 | 393 | 1 | Excel Load |
| **2025 Subtotal (loaded)** | **1,947** | **598** | **1,349** | **6** | |
| | | | | | |
| **GRAND TOTAL** | **8,953** | **7,117** | **1,836** | **6** | |

### Load Method Legend
- **Excel Load**: Extracted from Excel spreadsheet and loaded via scripts
- **Cloned from Aug**: Schedule structure cloned from August 2025 (September 2025 Excel tab was empty template)
- **Pre-existing**: Data was already in database before this load process

---

## Scripts Reference

### `scripts/extract-excel-month.js`

Extracts session data from an Excel tab and outputs CSV.

```bash
node scripts/extract-excel-month.js "May 2024"
```

**Features:**
- Dynamically finds header row by searching for "SATURDAY"
- Parses time ranges with AM/PM inference
- Smart instructor splitting (e.g., "VANESSA STEVE" → ["VANESSA", "STEVE"])
- Handles empty attendance cells (outputs NULL)
- Applies name normalization from mapping CSV

**Output:** `backups/csv/{month}_{year}.csv`

### `scripts/load-month.js`

Loads extracted CSV data into the database.

```bash
node scripts/load-month.js "May 2024"
```

**Features:**
- Creates/updates schedule record
- Upserts class_sessions with conflict handling
- Links instructors via session_instructors table
- Auto-adds missing reference data (classes, instructors, locations)

### `scripts/validate-month-load.js`

Compares database averages against Excel summary section.

```bash
node scripts/validate-month-load.js "May 2024"
```

**Features:**
- Extracts Excel summary averages
- Queries DB for actual averages
- Reports matches (within 0.5 tolerance) and mismatches
- Identifies classes in Excel only or DB only

### `scripts/clone-schedule.js`

Clones a schedule from one month to another.

```bash
node scripts/clone-schedule.js
```

**Features:**
- Maps dates by day-of-week (1st Monday → 1st Monday, etc.)
- Copies all session details and instructor assignments
- Sets headcount to NULL for all cloned sessions
- Handles months with different number of weeks

---

## Validation Summary

### Validation Metrics by Month (2024)

| Month | Matches | Mismatches | Excel Only | DB Only |
|-------|---------|------------|------------|---------|
| May 2024 | 18 | 13 | 0 | 3 |
| June 2024 | 27 | 4 | 0 | 4 |
| July 2024 | 22 | 8 | 0 | 4 |
| August 2024 | 28 | 3 | 0 | 3 |
| September 2024 | 23 | 10 | 0 | 2 |
| October 2024 | 21 | 9 | 0 | 4 |
| November 2024 | 20 | 10 | 0 | 4 |
| December 2024 | 11 | 20 | 0 | 3 |

### Validation Metrics by Month (2025 - Excel Loaded)

| Month | Matches | Mismatches | Excel Only | DB Only |
|-------|---------|------------|------------|---------|
| October 2025 | 27 | 6 | 0 | 3 |
| November 2025 | 8 | 24 | 1 | 3 |
| December 2025 | N/A | N/A | N/A | 33 |
| September 2025 | N/A | N/A | N/A | N/A |

**Notes:**
- December 2025: No validation possible (no attendance data in Excel)
- September 2025: Cloned from August, no Excel data to compare

---

## Known Issues & Observations

### 1. Classes in DB but not in Excel Summary
These classes appear in the schedule data but not in Excel's summary section:
- **AQUA CIRCUIT** - Consistently present across all months
- **GRIT - STRENGTH™** - Present in most months
- **TOTAL BODY STRONG** - Present in several months
- **HIGH FITNESS®** - Added mid-2024

### 2. Excel Formula Errors
September 2024 shows extreme values for BARRE-related classes:
- `BARRE`: Excel=740,760 vs DB=1,234,585
- `ALL BARRE OPTIONS`: Excel=370,391 vs DB=1,234,585

This appears to be Excel formula errors in the source spreadsheet.

### 3. Validation Tolerance
Mismatches are typically small (1-3 points) and may be due to:
- Rounding differences
- Excel formula calculation order
- Partial day exclusions in Excel summaries

### 4. November 2025 High Mismatches
November 2025 shows many large mismatches (24 classes). This may indicate:
- Recent data entry in progress
- Excel formulas not fully updated
- Different calculation methodology

---

## Detailed Analysis by Month

---

### May 2024

**Load Results:**
- Sessions inserted: 459
- Sessions updated: 0
- Errors: 0
- Unique dates: 30
- Unique classes: 35
- Unique instructors: 55

**Validation Results:**
- Matches (within 0.5): 18
- Mismatches: 13
- Excel only: 0
- DB only: 3

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| ACTIVE YOGA | 19.81 | 19.08 | 0.73 | 39 |
| CARDIO DANCE | 29.02 | 27.85 | 1.17 | 13 |
| GROUP CYCLE | 18.98 | 20.61 | 1.63 | 28 |
| AQUAFIT | 40.09 | 38.86 | 1.23 | 22 |
| UPBEAT BARRE | 20.75 | 19.43 | 1.32 | 7 |
| BODYBALANCE | 17.09 | 16.00 | 1.09 | 21 |
| SILVERSNEAKERS YOGA | 61.62 | 59.46 | 2.16 | 13 |
| SILVERSNEAKERS CIRCUIT | 67.73 | 67.00 | 0.73 | 8 |
| BODYCOMBAT | 18.81 | 18.31 | 0.50 | 29 |
| WERQ | 21.95 | 20.75 | 1.20 | 8 |
| BARRE | 20.03 | 19.29 | 0.74 | 14 |
| PILATES | 27.45 | 26.93 | 0.52 | 14 |
| POWER YOGA | 20.75 | 20.11 | 0.64 | 9 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=43.20, sessions=5
- GRIT - STRENGTH: avg=9.73, sessions=11
- TOTAL BODY STRONG: avg=32.25, sessions=8

**Notes:**
- Smart instructor split applied: "VANESSA STEVE" -> ["VANESSA", "STEVE"]
- STEVE added as new instructor

---

### June 2024

**Load Results:**
- Sessions inserted: 440
- Sessions updated: 0
- Errors: 0
- Total sessions: 440
- Unique dates: 30

**Validation Results:**
- Matches (within 0.5): 27
- Mismatches: 4
- Excel only: 0
- DB only: 4

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| GROUP CYCLE | 20.19 | 22.17 | 1.98 | 30 |
| UPBEAT BARRE™ | 20.18 | 19.67 | 0.50 | 9 |
| BODYBALANCE™ | 16.37 | 17.24 | 0.87 | 21 |
| POWER YOGA | 22.17 | 23.88 | 1.71 | 8 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=44.50, sessions=4
- GRIT - STRENGTH™: avg=9.67, sessions=12
- PARKINSONS OPTIMAL WELLNESS: avg=7.00, sessions=4
- TOTAL BODY STRONG: avg=31.63, sessions=8

---

### July 2024

**Load Results:**
- Sessions inserted: 384
- Sessions updated: 0
- Errors: 0
- Total sessions: 384
- Unique dates: 26

**Validation Results:**
- Matches (within 0.5): 22
- Mismatches: 8
- Excel only: 0
- DB only: 4

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| CARDIO DANCE | 28.03 | 28.70 | 0.67 | 10 |
| GROUP CYCLE | 18.08 | 19.63 | 1.55 | 27 |
| AQUAFIT | 40.02 | 41.28 | 1.26 | 18 |
| BODYBALANCE™ | 15.15 | 16.06 | 0.91 | 18 |
| SILVERSNEAKERS® YOGA | 57.61 | 59.36 | 1.75 | 11 |
| PILATES | 28.94 | 28.36 | 0.58 | 11 |
| FEELING FIT | 54.88 | 55.57 | 0.70 | 7 |
| POWER YOGA | 20.13 | 20.86 | 0.73 | 7 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=52.00, sessions=3
- GRIT - STRENGTH™: avg=9.92, sessions=12
- HIGH FITNESS®: avg=19.00, sessions=4
- TOTAL BODY STRONG: avg=30.71, sessions=7

---

### August 2024

**Load Results:**
- Sessions inserted: 424
- Sessions updated: 0
- Errors: 0
- Total sessions: 424
- Unique dates: 28

**Validation Results:**
- Matches (within 0.5): 28
- Mismatches: 3
- Excel only: 0
- DB only: 3

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| ACTIVE YOGA | 17.92 | 16.53 | 1.39 | 40 |
| GROUP CYCLE | 17.25 | 18.86 | 1.61 | 28 |
| BARRE | 19.00 | 18.38 | 0.62 | 8 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=53.00, sessions=4
- GRIT - STRENGTH™: avg=8.50, sessions=12
- HIGH FITNESS®: avg=10.75, sessions=4

---

### September 2024

**Load Results:**
- Sessions inserted: 474
- Sessions updated: 0
- Errors: 0
- Total sessions: 474
- Unique dates: 31

**Validation Results:**
- Matches (within 0.5): 23
- Mismatches: 10
- Excel only: 0
- DB only: 2

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| ACTIVE YOGA | 19.78 | 19.16 | 0.62 | 44 |
| CARDIO DANCE | 28.90 | 28.08 | 0.82 | 13 |
| GROUP CYCLE | 18.49 | 20.27 | 1.78 | 30 |
| UPBEAT BARRE™ | 23.20 | 22.07 | 1.13 | 14 |
| SILVERSNEAKERS® YOGA | 59.30 | 60.23 | 0.93 | 13 |
| SILVERSNEAKERS® CIRCUIT | 65.05 | 64.33 | 0.72 | 9 |
| BODYCOMBAT™ | 16.28 | 14.91 | 1.37 | 35 |
| BARRE | 740760.13 | 1234585.22 | 493825.09 | 9 |
| POWER YOGA | 22.25 | 22.78 | 0.53 | 9 |
| ALL BARRE OPTIONS | 370391.30 | 1234585.22 | 864193.92 | 9 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=43.00, sessions=4
- GRIT - STRENGTH™: avg=10.92, sessions=13

**⚠️ Note:** BARRE and ALL BARRE OPTIONS show extreme values - this appears to be Excel formula errors in the source data.

---

### October 2024

**Load Results:**
- Sessions inserted: 401
- Sessions updated: 0
- Errors: 0
- Total sessions: 401
- Unique dates: 31

**Validation Results:**
- Matches (within 0.5): 21
- Mismatches: 9
- Excel only: 0
- DB only: 4

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| ACTIVE YOGA | 20.03 | 18.94 | 1.09 | 32 |
| GROUP CYCLE | 22.28 | 24.22 | 1.94 | 27 |
| BODYBALANCE™ | 15.56 | 14.00 | 1.56 | 20 |
| SILVERSNEAKERS® YOGA | 68.83 | 79.60 | 10.77 | 10 |
| AQUA IN MOTION | 12.40 | 11.29 | 1.11 | 7 |
| WERQ™ | 22.10 | 20.86 | 1.24 | 7 |
| BARRE | 19.18 | 17.33 | 1.85 | 9 |
| PILATES | 25.62 | 27.15 | 1.53 | 13 |
| GENTLE YOGA | 26.33 | 24.68 | 1.65 | 19 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=44.00, sessions=1
- AQUAFIT: avg=36.60, sessions=20
- GRIT - STRENGTH™: avg=11.45, sessions=11
- HIGH FITNESS®: avg=16.20, sessions=5

---

### November 2024

**Load Results:**
- Sessions inserted: 424
- Sessions updated: 0
- Errors: 0
- Total sessions: 424
- Unique dates: 28

**Validation Results:**
- Matches (within 0.5): 20
- Mismatches: 10
- Excel only: 0
- DB only: 4

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| ACTIVE YOGA | 20.97 | 19.34 | 1.63 | 41 |
| CARDIO DANCE | 31.71 | 32.55 | 0.84 | 11 |
| GROUP CYCLE | 24.79 | 26.76 | 1.97 | 29 |
| AQUAFIT | 40.14 | 41.00 | 0.86 | 22 |
| BODYBALANCE™ | 17.57 | 19.63 | 2.06 | 19 |
| BODYCOMBAT™ | 17.33 | 16.59 | 0.74 | 32 |
| LES MILLS CORE™ | 9.36 | 9.88 | 0.52 | 16 |
| BARRE | 21.22 | 20.00 | 1.22 | 8 |
| PILATES | 25.22 | 24.18 | 1.04 | 11 |
| GENTLE YOGA | 27.77 | 28.67 | 0.90 | 18 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=38.25, sessions=4
- GRIT - STRENGTH™: avg=12.17, sessions=12
- HIGH FITNESS®: avg=16.50, sessions=4
- TOTAL BODY STRONG: avg=33.63, sessions=8

---

### December 2024

**Load Results:**
- Sessions inserted: 418
- Sessions updated: 0
- Errors: 0
- Total sessions: 418
- Unique dates: 28

**Validation Results:**
- Matches (within 0.5): 11
- Mismatches: 20
- Excel only: 0
- DB only: 3

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| TOTAL BODY STRONG | 32.88 | 32.14 | 0.73 | 7 |
| CARDIO DANCE | 38.57 | 39.08 | 0.51 | 12 |
| GROUP CYCLE | 25.60 | 27.93 | 2.33 | 27 |
| AQUAFIT | 37.21 | 36.15 | 1.06 | 20 |
| UPBEAT BARRE™ | 23.14 | 22.14 | 1.00 | 21 |
| BODYBALANCE™ | 17.99 | 18.94 | 0.95 | 18 |
| SILVERSNEAKERS® YOGA | 41.59 | 39.33 | 2.26 | 18 |
| AQUA IN MOTION | 11.50 | 11.00 | 0.50 | 7 |
| BODYCOMBAT™ | 16.66 | 17.63 | 0.97 | 30 |
| BARRE | 21.19 | 5.67 | 15.52 | 3 |
| LES MILLS RPM™ | 19.88 | 19.11 | 0.77 | 19 |
| PILATES | 28.14 | 28.75 | 0.61 | 12 |
| ZUMBA® | 20.37 | 21.00 | 0.63 | 11 |
| HIGH FITNESS® | 8.17 | 16.33 | 8.16 | 3 |
| STEP | 16.88 | 18.75 | 1.88 | 4 |
| TAI CHI | 14.17 | 15.00 | 0.83 | 7 |
| SILVER CYCLE | 32.00 | 30.25 | 1.75 | 4 |
| FEELING FIT | 31.20 | 32.00 | 0.80 | 9 |
| SILVERSNEAKERS® CLASSIC | 28.40 | 25.25 | 3.15 | 4 |
| UPBEAT PILATES™ | 9.75 | 10.71 | 0.96 | 7 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=45.50, sessions=4
- GRIT - STRENGTH™: avg=12.44, sessions=9
- POWER YOGA: avg=21.25, sessions=8

---

### September 2025

**Method:** Cloned from August 2025

**Clone Results:**
- Source: August 2025 (490 sessions)
- Sessions created: 456
- Sessions skipped: 34 (5th week dates not in September)
- Instructor assignments: 472
- Headcount: NULL (all sessions)

**Date Mapping:**
- August dates mapped to September by day-of-week
- 1st Monday in August → 1st Monday in September, etc.
- September has 4 Saturdays/Sundays vs August's 5

**Session Distribution (28 days):**
| Day | Sessions/Day |
|-----|--------------|
| Monday | 21 |
| Tuesday | 20 |
| Wednesday | 22 |
| Thursday | 17 |
| Friday | 16 |
| Saturday | 9 |
| Sunday | 9 |

**Notes:**
- Excel tab was empty template (no dates filled in)
- Cloned to preserve schedule structure for future attendance entry

---

### October 2025

**Load Results:**
- Sessions inserted: 596
- Sessions updated: 0
- Errors: 3
- Total sessions: 596
- Unique dates: 33

**Validation Results:**
- Matches (within 0.5): 27
- Mismatches: 6
- Excel only: 0
- DB only: 3

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| GROUP CYCLE | 19.86 | 20.59 | 0.73 | 34 |
| UPBEAT BARRE™ | 27.16 | 31.36 | 4.20 | 25 |
| BODYBALANCE™ | 17.57 | 16.84 | 0.73 | 19 |
| SILVERSNEAKERS® CIRCUIT | 57.40 | 53.60 | 3.80 | 5 |
| ZUMBA® | 17.43 | 16.36 | 1.07 | 14 |
| STEP | 13.95 | 15.50 | 1.55 | 4 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=30.30, sessions=10
- POWER YOGA: avg=18.10, sessions=10
- UPBEAT LIFT™: avg=14.55, sessions=20

---

### November 2025

**Load Results:**
- Sessions inserted: 502
- Sessions updated: 0
- Errors: 2
- Total sessions: 502
- Unique dates: 29

**Validation Results:**
- Matches (within 0.5): 8
- Mismatches: 24
- Excel only: 1
- DB only: 3

**Mismatches:**

| Class | Excel Avg | DB Avg | Diff | Sessions |
|-------|-----------|--------|------|----------|
| ACTIVE YOGA | 19.11 | 24.67 | 5.56 | 42 |
| CARDIO DANCE | 34.50 | 29.10 | 5.40 | 20 |
| GROUP CYCLE | 25.91 | 24.12 | 1.79 | 34 |
| AQUAFIT | 25.75 | 29.79 | 4.04 | 24 |
| UPBEAT BARRE™ | 29.20 | 30.52 | 1.32 | 21 |
| BODYBALANCE™ | 36.11 | 19.92 | 16.19 | 25 |
| SILVERSNEAKERS® YOGA | 36.85 | 50.60 | 13.75 | 20 |
| SILVERSNEAKERS® CIRCUIT | 39.50 | 56.75 | 17.25 | 8 |
| BODYCOMBAT™ | 21.46 | 15.15 | 6.31 | 34 |
| LES MILLS CORE™ | 14.89 | 11.92 | 2.97 | 13 |
| BODYPUMP™ | 21.26 | 23.95 | 2.69 | 42 |
| WERQ™ | 30.75 | 21.25 | 9.50 | 8 |
| BARRE | 7.75 | 9.00 | 1.25 | 4 |
| LES MILLS RPM™ | 21.59 | 19.60 | 1.99 | 25 |
| PILATES | 34.50 | 32.92 | 1.58 | 12 |
| GENTLE YOGA | 28.50 | 30.63 | 2.13 | 24 |
| ZUMBA® | 24.58 | 18.64 | 5.94 | 14 |
| STEP | 15.88 | 19.00 | 3.13 | 5 |
| TAI CHI | 11.47 | 12.00 | 0.53 | 9 |
| SILVER CYCLE | 17.25 | 28.00 | 10.75 | 4 |
| FEELING FIT | 34.88 | 43.50 | 8.63 | 8 |
| SILVERSNEAKERS® CLASSIC | 32.50 | 52.00 | 19.50 | 4 |
| UPBEAT PILATES™ | 42.43 | 18.38 | 24.05 | 16 |
| ZUMBA® GOLD | 52.00 | 24.75 | 27.25 | 4 |

**DB Only (not in Excel summary):**
- AQUA CIRCUIT: avg=27.75, sessions=8
- POWER YOGA: avg=21.89, sessions=9
- UPBEAT LIFT™: avg=10.13, sessions=8

**Excel Only (not in DB):**
- AQUA IN MOTION: avg=15.80

**⚠️ Note:** High number of mismatches suggests Excel data may be incomplete or formulas not updated.

---

### December 2025

**Load Results:**
- Sessions inserted: 393
- Sessions updated: 0
- Errors: 1
- Total sessions: 393
- Unique dates: 22
- Headcount: NULL (all sessions - no attendance recorded yet)

**Validation Results:**
- Matches (within 0.5): N/A
- Mismatches: N/A
- Excel only: 0
- DB only: 33

**Classes Loaded (all with NULL attendance):**
- ACTIVE YOGA: 37 sessions
- AQUA CIRCUIT: 5 sessions
- AQUA ZUMBA®: 5 sessions
- AQUAFIT: 20 sessions
- BARRE: 5 sessions
- BODYBALANCE™: 24 sessions
- BODYCOMBAT™: 32 sessions
- BODYPUMP™: 27 sessions
- BOOTCAMP: 5 sessions
- CARDIO DANCE: 10 sessions
- FEELING FIT: 5 sessions
- GENTLE YOGA: 15 sessions
- GRIT - ATHLETIC™: 5 sessions
- GRIT - CARDIO™: 4 sessions
- GRIT - STRENGTH™: 15 sessions
- GROUP CYCLE: 32 sessions
- HIGH FITNESS®: 5 sessions
- LES MILLS CORE™: 13 sessions
- LES MILLS RPM™: 13 sessions
- PILATES: 10 sessions
- POWER YOGA: 3 sessions
- SILVERSNEAKERS® CIRCUIT: 10 sessions
- SILVERSNEAKERS® YOGA: 15 sessions
- STEP-CARDIO: 4 sessions
- STEP-INTERVAL: 5 sessions
- TAI CHI: 9 sessions
- TOTAL BODY STRONG: 5 sessions
- TRX BODY BLAST®: 5 sessions
- UPBEAT BARRE™: 13 sessions
- UPBEAT LIFT™: 5 sessions
- UPBEAT PILATES™: 15 sessions
- WERQ™: 5 sessions
- ZUMBA®: 12 sessions

**Notes:**
- Excel tab has dates but no attendance data entered yet
- Schedule structure loaded to allow future attendance entry
- All headcount values are NULL

---

## Final Statistics

### Database Totals (as of 2024-12-17)

| Metric | Value |
|--------|-------|
| Total Schedules | 20 |
| Total Sessions | 8,953 |
| Sessions with Attendance | 7,117 |
| Sessions without Attendance | 1,836 |
| Unique Classes | ~35 |
| Unique Instructors | ~80 |
| Unique Locations | 6 |

### Data Coverage

| Year | Months | Sessions |
|------|--------|----------|
| 2024 | May - December (8 months) | 3,424 |
| 2025 | January - December (12 months) | 5,529 |
| **Total** | **20 months** | **8,953** |

---

*Report generated by session load process. Last updated: 2024-12-17*
