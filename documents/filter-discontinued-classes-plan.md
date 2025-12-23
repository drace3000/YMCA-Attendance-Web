# Filter Discontinued Classes from Trends

## Problem

The Trends page shows discontinued classes (e.g., Q1 shows RIDE STRONG with Jan/Feb data but no March), appearing misleadingly in "Trending Down."

## Business Rules

1. **Exclude discontinued classes**: Must have data in the **last month** of the period
2. **Include new classes**: Missing early months is OK
3. **Gaps are OK**: If data continues in later months, include it

## Examples by Period

### Q1 (Jan-Mar) - Must have March data
| Pattern | Result |
|---------|--------|
| Jan, Feb, Mar | Included |
| Feb, Mar | Included (new) |
| Jan, -, Mar | Included (gap OK) |
| Jan, Feb only | **Excluded** |
| Jan only | **Excluded** |

### Q2 (Apr-Jun) - Must have June data
| Pattern | Result |
|---------|--------|
| Apr, May, Jun | Included |
| May, Jun | Included (new) |
| Apr, -, Jun | Included (gap OK) |
| Apr, May only | **Excluded** |
| Apr only | **Excluded** |

### Q3 (Jul-Sep) - Must have September data
| Pattern | Result |
|---------|--------|
| Jul, Aug, Sep | Included |
| Aug, Sep | Included (new) |
| Jul, -, Sep | Included (gap OK) |
| Jul, Aug only | **Excluded** |
| Jul only | **Excluded** |

### Q4 (Oct-Dec) - Must have December data
| Pattern | Result |
|---------|--------|
| Oct, Nov, Dec | Included |
| Nov, Dec | Included (new) |
| Oct, -, Dec | Included (gap OK) |
| Oct, Nov only | **Excluded** |
| Oct only | **Excluded** |

### Full Year - Must have December data
| Pattern | Result |
|---------|--------|
| Jan-Dec complete | Included |
| Jan, -, Apr, ..., Dec | Included (gap OK) |
| Mar-Dec | Included (new) |
| Jan-Sep only | **Excluded** |
| Jan-Jun only | **Excluded** |

## Implementation

**File:** `web/src/app/api/trends/route.ts` (line ~231)

**Step 1:** Find the last month where ANY class has data:

```typescript
// Find the last month index where ANY class has data
// This is used to filter out discontinued classes
let lastMonthWithAnyData = -1;
for (const [, s] of byClass) {
  for (let i = numBuckets - 1; i >= 0; i--) {
    if ((s.monthSessions[i] ?? 0) > 0 && i > lastMonthWithAnyData) {
      lastMonthWithAnyData = i;
      break;
    }
  }
}
```

**Step 2:** Apply the filter based on last month with data:

```typescript
.filter(
  (s) =>
    s.totalSessions >= minSessions &&
    s.nonEmptyMonths >= minNonEmptyMonths &&
    // Exclude discontinued: must have data in the last month where any class has data
    (lastMonthWithAnyData < 0 || (s.monthSessions[lastMonthWithAnyData] ?? 0) > 0),
)
```

## How It Works

The filter dynamically finds the **last month where ANY class has data**, then requires all classes to have data in that month.

| Scenario | Last Month With Data | Classes Must Have |
|----------|---------------------|-------------------|
| Q1 with Jan-Mar data | March (index 2) | March data |
| Q2 with Apr-May data | May (index 1) | May data |
| Full Year with Jan-Mar data | March (index 2) | March data |
| Full Year with May-Nov data | November (index 10) | November data |

**Key Logic:**
- Find the latest month index where any class has sessions
- Require all displayed classes to have data in that month
- Classes that stopped before that month are considered "discontinued" and excluded

