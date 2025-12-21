# Excel Formula Issues Report

**Document Created:** December 15, 2025  
**Source File:** `documents/Group X Attendance Tracking.xlsx`  
**Sheet Analyzed:** August 2025  

## Summary

During database validation, **three categories of issues** were found in the Excel spreadsheet:

1. **Day-of-Week Mismatch** - Column headers (SATURDAY, SUNDAY, etc.) are one day ahead of the actual calendar dates
2. **Weekly Totals Don't Reconcile** - Sum of weekly totals (11,263) doesn't match "All Classes" total (11,786)
3. **Class Average Formula Errors** - 5 classes have incorrect averages in the report

The **database correctly loaded all 10,979 headcount points** from the actual cell values. All discrepancies are in the Excel formulas and structure, not the loaded data.

---

## Classes with Formula Errors

### 1. AQUAFIT
| Metric | Value |
|--------|-------|
| **Actual cell values** | 74, 72, 54, 63, 21, 21, 21, 28, 57, 45, 59, 55, 31, 24, 24, 24, 19, 35, 30, 30 |
| **Session count** | 20 |
| **Correct average** | **39.4** |
| **Excel report shows** | 44 |
| **Error** | +4.6 (report is too high) |

**Locations:** Monday 9:30 (EP), Tuesday 8:35 (EP), Wednesday 9:30 (EP), Thursday 8:35 (EP), Thursday 9:30 (EP)

---

### 2. AQUA IN MOTION
| Metric | Value |
|--------|-------|
| **Actual cell values** | 15, 13, 14, 15 |
| **Session count** | 4 |
| **Correct average** | **14.3** |
| **Excel report shows** | 7 |
| **Error** | -7.3 (report is too low) |

**Location:** Monday 8:15-9:00am (EP) - Instructor: SAM

---

### 3. BARRE
| Metric | Value |
|--------|-------|
| **Actual cell values** | 13, 13, 12, 9 |
| **Session count** | 4 |
| **Correct average** | **11.8** |
| **Excel report shows** | 6 |
| **Error** | -5.8 (report is too low) |

**Location:** Wednesday 6:30-7:15pm (S) - Instructor: HEATHER R.

---

### 4. HIGH FITNESS®
| Metric | Value |
|--------|-------|
| **Actual cell values** | 20, 12, 18, 18 |
| **Session count** | 4 |
| **Correct average** | **17.0** |
| **Excel report shows** | 8 |
| **Error** | -9.0 (report is too low) |

**Location:** Wednesday 8:00-8:45am (MB) - Instructor: GIL G.

---

### 5. ZUMBA®
| Metric | Value |
|--------|-------|
| **Actual cell values** | 15, 15, 15, 15, 20, 25, 19, 26, 20, 21, 21 |
| **Session count** | 11 (3 sessions had no data) |
| **Correct average** | **19.3** |
| **Excel report shows** | 22 |
| **Error** | +2.7 (report is too high) |

**Locations:**
- Saturday 10:15-11:15am (S) - Instructor: NANETTE
- Sunday 11:30-12:30pm (S) - Instructor: MARI/SHELLEY
- Tuesday 6:45-7:45pm (MB) - Instructor: NANETTE (only 1 of 4 weeks had data)

---

## Critical Issue: Day-of-Week Column Mismatch

The Excel column headers do not match the actual calendar days of the dates in those columns. **All day headers are one day ahead of the actual dates:**

| Excel Column Header | Actual Day of Dates | Example Dates |
|---------------------|---------------------|---------------|
| SATURDAY | **Friday** | 8/1, 8/8, 8/15, 8/22, 8/29 |
| SUNDAY | **Saturday** | 8/2, 8/9, 8/16, 8/23, 8/30 |
| MONDAY | **Sunday** | 8/3, 8/10, 8/17, 8/24 |
| TUESDAY | **Monday** | 8/4, 8/11, 8/18, 8/25 |
| WEDNESDAY | **Tuesday** | 8/5, 8/12, 8/19, 8/26 |
| THURSDAY | **Wednesday** | 8/6, 8/13, 8/20, 8/27 |
| FRIDAY | **Thursday** | 7/31, 8/7, 8/14, 8/21, 8/28 |

**Impact:** Classes are labeled as occurring on incorrect days (e.g., a class labeled "Saturday 8am" actually occurs on Friday).

---

## Weekly Totals Discrepancy

| Week | DB Total | Excel Total | Difference |
|------|----------|-------------|------------|
| Week One | 2,247 | 2,640 | -393 |
| Week Two | 2,570 | 2,434 | +136 |
| Week Three | 2,587 | 2,448 | +139 |
| Week Four | 2,562 | 2,406 | +156 |
| Week Five | 1,013 | 1,335 | -322 |
| **Grand Total** | **10,979** | **11,263** | **-284** |

### Internal Excel Inconsistency

| Metric | Value |
|--------|-------|
| Sum of Weekly Totals | 11,263 |
| "All Classes" Report Total | 11,786 |
| **Internal Difference** | **523** |

The weekly totals in Excel don't sum to the "All Classes" total, indicating formula errors in one or both calculations.

---

## Additional Issue: "All Classes" Total

| Metric | Value |
|--------|-------|
| **Sum of all date columns** | 10,979 |
| **Sum of "Total" columns** | 11,786 |
| **Excel report shows** | 11,786 |
| **Difference** | +807 |

The Excel "All Classes" total uses the "Total" column values rather than the sum of individual date cells. The "Total" column formulas appear to include data beyond the visible date range, resulting in a higher sum.

---

## Recommended Actions

### High Priority
1. **Fix day-of-week column headers** - All headers are one day ahead of the actual calendar dates
2. **Reconcile weekly totals** - Sum of weekly totals (11,263) doesn't match "All Classes" (11,786)

### Medium Priority
3. **Review class average formulas** for the 5 classes with errors (AQUAFIT, AQUA IN MOTION, BARRE, HIGH FITNESS®, ZUMBA®)
4. **Verify AVERAGEIF formulas** are correctly referencing the class name cells and corresponding value ranges

### Low Priority
5. **Check for hidden rows/columns** that might be excluded from calculations
6. **Validate "Total" column formulas** to ensure they only sum visible date columns

---

## Classes with Correct Formulas (Verified)

The following classes match exactly or within ±1 (rounding):

| Class | DB Avg | Excel Avg | Status |
|-------|--------|-----------|--------|
| GRIT - Strength | 9 | 9 | ✓ Exact |
| Total Body Strong | 32 | 32 | ✓ Exact |
| Active Yoga | 20 | 19 | ✓ ±1 |
| Cardio Dance | 34 | 33 | ✓ ±1 |
| Group Cycle | 16 | 16 | ✓ Exact |
| Upbeat Barre | 24 | 24 | ✓ Exact |
| BodyBalance | 16 | 16 | ✓ Exact |
| SS Yoga | 53 | 54 | ✓ ±1 |
| SS Circuit | 65 | 65 | ✓ Exact |
| BodyCombat | 13 | 12 | ✓ ±1 |
| LM Core | 10 | 10 | ✓ Exact |
| Body Pump | 21 | 21 | ✓ Exact |
| WERQ | 28 | 27 | ✓ ±1 |
| GRIT Cardio | 9 | 9 | ✓ Exact |
| RPM | 12 | 12 | ✓ Exact |
| Aqua Zumba | 18 | 18 | ✓ Exact |
| Pilates | 32 | 30 | ✓ ±2 |
| Gentle Yoga | 33 | 32 | ✓ ±1 |
| Grit Athletic | 8 | 8 | ✓ Exact |
| TRX Body Blast | 20 | 20 | ✓ Exact |
| Step | 14-17 | 15 | ✓ ±1 |
| Tai Chi | 7 | 7 | ✓ Exact |
| Silver Cycle | 28 | 28 | ✓ Exact |
| Feeling Fit | 50 | 49 | ✓ ±1 |
| Silversneak Classic | 44 | 44 | ✓ Exact |
| Upbeat Pilates | 16 | 16 | ✓ Exact |
| Bootcamp | 10 | 10 | ✓ Exact |

---

## Database Validation Status

✅ **All attendance data correctly loaded from Excel to database**  
✅ **479 session-date occurrences with headcount data**  
✅ **Total headcount: 10,979 (matches sum of Excel date columns)**






