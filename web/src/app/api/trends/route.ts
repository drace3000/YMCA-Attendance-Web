import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type TrendRow = {
  session_date: string;
  headcount: number | null;
  class:
    | { id?: string | null; name: string | null }
    | { id?: string | null; name: string | null }[]
    | null;
};

type TrendSeriesItem = {
  classId: string;
  className: string;
  monthlyAvg: number[];
  monthSessions: number[];
  slope: number;
  delta: number;
  totalSessions: number;
};

type TrendsPayload = {
  year: number;
  quarter?: number;
  month?: number;
  months: { index: number; label: string; isoMonth: string }[];
  topUp: TrendSeriesItem[];
  topDown: TrendSeriesItem[];
  computedAt: string;
  meta: {
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    rowsInPeriod: number;
    rowsInYear?: number;
    firstDateInYear?: string | null;
    lastDateInYear?: string | null;
  };
};

const ALL_MONTHS = [
  { index: 0, label: "Jan", isoMonth: "01" },
  { index: 1, label: "Feb", isoMonth: "02" },
  { index: 2, label: "Mar", isoMonth: "03" },
  { index: 3, label: "Apr", isoMonth: "04" },
  { index: 4, label: "May", isoMonth: "05" },
  { index: 5, label: "Jun", isoMonth: "06" },
  { index: 6, label: "Jul", isoMonth: "07" },
  { index: 7, label: "Aug", isoMonth: "08" },
  { index: 8, label: "Sep", isoMonth: "09" },
  { index: 9, label: "Oct", isoMonth: "10" },
  { index: 10, label: "Nov", isoMonth: "11" },
  { index: 11, label: "Dec", isoMonth: "12" },
];

const QUARTER_MONTHS: Record<number, number[]> = {
  1: [0, 1, 2],   // Q1: Jan, Feb, Mar
  2: [3, 4, 5],   // Q2: Apr, May, Jun
  3: [6, 7, 8],   // Q3: Jul, Aug, Sep
  4: [9, 10, 11], // Q4: Oct, Nov, Dec
};

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Format date as MM-DD-YYYY for display
function toUsDate(d: Date) {
  const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const [y, m, day] = iso.split("-");
  return `${m}-${day}-${y}`;
}

// Convert ISO date string (YYYY-MM-DD) to US format (MM-DD-YYYY)
function isoToUsDate(isoDate: string) {
  const [y, m, day] = isoDate.split("-");
  return `${m}-${day}-${y}`;
}

// Get the last day of a period (subtract 1 day from exclusive end date)
function lastDayOfPeriod(exclusiveEnd: Date) {
  return new Date(exclusiveEnd.getTime() - 86400000); // subtract 1 day in ms
}

function linearRegressionSlope(y: number[]) {
  // x = 0..n-1
  const n = y.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const yy = y[i] ?? 0;
    sumX += x;
    sumY += yy;
    sumXX += x * x;
    sumXY += x * yy;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? "2025");
  const quarterParam = searchParams.get("quarter");
  const monthParam = searchParams.get("month");

  const quarter = quarterParam ? Number(quarterParam) : undefined;
  const month = monthParam ? Number(monthParam) : undefined;

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  if (quarter !== undefined && (quarter < 1 || quarter > 4)) {
    return NextResponse.json({ error: "Invalid quarter (must be 1-4)" }, { status: 400 });
  }

  if (month !== undefined && (month < 1 || month > 12)) {
    return NextResponse.json({ error: "Invalid month (must be 1-12)" }, { status: 400 });
  }

  // This endpoint aggregates across all sessions and is expected to bypass RLS.
  // If you don't configure the service role key, PostgREST will likely return 0 rows.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Server not configured: missing SUPABASE_SERVICE_ROLE_KEY. Copy web/env.local.template to web/.env.local, set SUPABASE_SERVICE_ROLE_KEY, then restart the dev server.",
      },
      { status: 500 },
    );
  }

  // Determine date range and months based on filters
  let start: Date;
  let end: Date;
  let months: TrendsPayload["months"];
  let periodLabel: string;
  let validMonthIndices: number[];

  if (month !== undefined) {
    // Single month selected - show weeks within that month
    const monthIndex = month - 1; // 0-based
    start = new Date(Date.UTC(year, monthIndex, 1));
    end = new Date(Date.UTC(year, monthIndex + 1, 1)); // First day of next month
    months = [ALL_MONTHS[monthIndex]];
    periodLabel = `${ALL_MONTHS[monthIndex].label} ${year}`;
    validMonthIndices = [monthIndex];
  } else if (quarter !== undefined) {
    // Quarter selected
    const quarterMonths = QUARTER_MONTHS[quarter];
    const startMonth = quarterMonths[0];
    const endMonth = quarterMonths[2];
    start = new Date(Date.UTC(year, startMonth, 1));
    end = new Date(Date.UTC(year, endMonth + 1, 1)); // First day after quarter
    months = quarterMonths.map((m) => ALL_MONTHS[m]);
    periodLabel = `Q${quarter} ${year} (${ALL_MONTHS[startMonth].label}–${ALL_MONTHS[endMonth].label})`;
    validMonthIndices = quarterMonths;
  } else {
    // Full year - Jan to Dec
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year + 1, 0, 1)); // Jan 1 of next year
    months = ALL_MONTHS;
    periodLabel = `${year} (Jan–Dec)`;
    validMonthIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }

  const supabase = createSupabaseServerClient();
  
  let countQuery = supabase
    .from("class_sessions")
    .select("*", { count: "exact", head: true })
    .gte("session_date", toIsoDate(start))
    .lt("session_date", toIsoDate(end));

  if (required.access?.recipient_type === "Branch") {
    countQuery = countQuery.eq("branch_id", required.access.branch_id);
  }

  const { count: totalCount } = await countQuery;
  
  // Fetch in pages to bypass 1000 row cap
  const batchSize = 1000;
  const total = totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(total / batchSize));
  const allRows: TrendRow[] = [];
  
  for (let page = 0; page < pages; page++) {
    const from = page * batchSize;
    const to = Math.min(from + batchSize - 1, total === 0 ? batchSize - 1 : total - 1);
    
    let pageQuery = supabase
      .from("class_sessions")
      .select(
        `
          session_date,
          headcount,
          class:class_id(id,name)
        `,
      )
      .gte("session_date", toIsoDate(start))
      .lt("session_date", toIsoDate(end));

    if (required.access?.recipient_type === "Branch") {
      pageQuery = pageQuery.eq("branch_id", required.access.branch_id);
    }

    const { data: pageData, error: pageError } = await pageQuery.range(from, to);
    
    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }
    
    const pageRows: TrendRow[] = (pageData ?? []) as unknown as TrendRow[];
    allRows.push(...pageRows);
    
  }
  
  const rows: TrendRow[] = allRows;
  const rowsInPeriod = rows.length;
  
  // Number of buckets = number of months we're tracking
  const numBuckets = validMonthIndices.length;

  const byClass = new Map<
    string,
    {
      className: string;
      monthTotals: number[];
      monthSessions: number[];
      totalSessions: number;
      nonEmptyMonths: number;
    }
  >();

  for (const r of rows) {
    if (r.headcount == null) continue;
    const cls = Array.isArray(r.class) ? r.class[0] : r.class;
    const classId = (cls?.id ?? "").toString();
    if (!classId) continue;
    const className = (cls?.name ?? "Unknown").toString();

    const d = new Date(r.session_date.slice(0, 10) + "T00:00:00Z");
    const monthIndex = d.getUTCMonth(); // Jan=0

    // Map the absolute month index to our bucket index
    const bucketIndex = validMonthIndices.indexOf(monthIndex);
    if (bucketIndex === -1) continue;

    let existing = byClass.get(classId);
    if (!existing) {
      existing = {
        className,
        monthTotals: Array.from({ length: numBuckets }, () => 0),
        monthSessions: Array.from({ length: numBuckets }, () => 0),
        totalSessions: 0,
        nonEmptyMonths: 0,
      };
      byClass.set(classId, existing);
    }

    // Track non-empty months (only once)
    if (existing.monthSessions[bucketIndex] === 0) {
      existing.nonEmptyMonths += 1;
    }

    existing.monthTotals[bucketIndex] += r.headcount;
    existing.monthSessions[bucketIndex] += 1;
    existing.totalSessions += 1;
  }

  // Dynamic filter thresholds based on period length
  // More relaxed criteria: just need some sessions and at least 2 data points for trend
  const minSessions = numBuckets >= 6 ? 4 : numBuckets >= 3 ? 2 : 1;
  const minNonEmptyMonths = numBuckets >= 2 ? 2 : 1;

  // Find the last month index where ANY class has data
  // This is used to filter out discontinued classes (classes that stopped before the last month with data)
  // Determine the last month with "meaningful" data across ALL classes
  // We consider a month meaningful if total sessions with headcount >= threshold
  const monthTotalSessions: number[] = Array.from({ length: numBuckets }, () => 0);
  for (const [, s] of byClass) {
    for (let i = 0; i < numBuckets; i++) {
      monthTotalSessions[i] += s.monthSessions[i] ?? 0;
    }
  }
  const lastMonthSessionThreshold = 5; // configurable threshold
  let lastMonthWithAnyData = -1;
  for (let i = numBuckets - 1; i >= 0; i--) {
    if (monthTotalSessions[i] >= lastMonthSessionThreshold) {
      lastMonthWithAnyData = i;
      break;
    }
  }

  const series = Array.from(byClass.entries())
    .map(([classId, s]) => {
      const monthlyAvg = s.monthTotals.map((total, idx) => {
        const sessions = s.monthSessions[idx] ?? 0;
        return sessions ? total / sessions : 0;
      });
      
      // Find first and last non-empty buckets
      let firstNonEmptyIdx = 0;
      let lastNonEmptyIdx = numBuckets - 1;
      for (let i = 0; i < numBuckets; i++) {
        if ((s.monthSessions[i] ?? 0) > 0) {
          firstNonEmptyIdx = i;
          break;
        }
      }
      for (let i = numBuckets - 1; i >= 0; i--) {
        if ((s.monthSessions[i] ?? 0) > 0) {
          lastNonEmptyIdx = i;
          break;
        }
      }
      
      // Only calculate slope on months that have actual data (exclude zeros)
      // Extract only the data points that have sessions for accurate trend calculation
      const dataPointsForSlope: number[] = [];
      for (let i = 0; i < numBuckets; i++) {
        if ((s.monthSessions[i] ?? 0) > 0) {
          dataPointsForSlope.push(monthlyAvg[i]);
        }
      }
      const slope = linearRegressionSlope(dataPointsForSlope);
      
      const delta = (monthlyAvg[lastNonEmptyIdx] ?? 0) - (monthlyAvg[firstNonEmptyIdx] ?? 0);
      return {
        classId,
        className: s.className,
        monthlyAvg: monthlyAvg.map((v) => Number(v.toFixed(2))),
        monthSessions: s.monthSessions,
        slope: Number(slope.toFixed(4)),
        delta: Number(delta.toFixed(2)),
        totalSessions: s.totalSessions,
        nonEmptyMonths: s.nonEmptyMonths,
      };
    })
    // Only filter by minimum sessions and requiring at least 2 months of data for meaningful trends
    // Also exclude discontinued classes (must have data in the last month where ANY class has data)
    .filter(
      (s) =>
        s.totalSessions >= minSessions &&
        s.nonEmptyMonths >= minNonEmptyMonths &&
        // Exclude discontinued: must have data in the last month where any class has data
        (lastMonthWithAnyData < 0 || (s.monthSessions[lastMonthWithAnyData] ?? 0) > 0),
    );

  const stripNonEmptyMonths = (
    item: (typeof series)[number],
  ): TrendSeriesItem => {
    return {
      classId: item.classId,
      className: item.className,
      monthlyAvg: item.monthlyAvg,
      monthSessions: item.monthSessions,
      slope: item.slope,
      delta: item.delta,
      totalSessions: item.totalSessions,
    };
  };

  const topUp = [...series]
    .sort((a, b) => b.slope - a.slope || b.delta - a.delta)
    .slice(0, 5)
    .map(stripNonEmptyMonths);

  const topDown = [...series]
    .sort((a, b) => a.slope - b.slope || a.delta - b.delta)
    .slice(0, 5)
    .map(stripNonEmptyMonths);

  const payload: TrendsPayload = {
    year,
    quarter,
    month,
    months,
    topUp,
    topDown,
    computedAt: new Date().toISOString(),
    meta: {
      periodStart: toUsDate(start),
      periodEnd: toUsDate(lastDayOfPeriod(end)),
      periodLabel,
      rowsInPeriod,
    },
  };

  // If we have no data for Jan–Aug, include a quick year-range hint so the UI can explain why.
  if (rowsInPeriod === 0) {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));

    const countRes = await supabase
      .from("class_sessions")
      .select("id", { count: "exact", head: true })
      .gte("session_date", toIsoDate(yearStart))
      .lt("session_date", toIsoDate(nextYearStart));

    const firstRes = await supabase
      .from("class_sessions")
      .select("session_date")
      .gte("session_date", toIsoDate(yearStart))
      .lt("session_date", toIsoDate(nextYearStart))
      .order("session_date", { ascending: true })
      .limit(1);

    const lastRes = await supabase
      .from("class_sessions")
      .select("session_date")
      .gte("session_date", toIsoDate(yearStart))
      .lt("session_date", toIsoDate(nextYearStart))
      .order("session_date", { ascending: false })
      .limit(1);

    const firstDateRaw = (firstRes.data?.[0] as { session_date?: string } | undefined)
      ?.session_date
      ? String((firstRes.data?.[0] as { session_date?: string }).session_date).slice(0, 10)
      : null;
    const lastDateRaw = (lastRes.data?.[0] as { session_date?: string } | undefined)
      ?.session_date
      ? String((lastRes.data?.[0] as { session_date?: string }).session_date).slice(0, 10)
      : null;
    const firstDateInYear = firstDateRaw ? isoToUsDate(firstDateRaw) : null;
    const lastDateInYear = lastDateRaw ? isoToUsDate(lastDateRaw) : null;

    payload.meta.rowsInYear = countRes.count ?? 0;
    payload.meta.firstDateInYear = firstDateInYear;
    payload.meta.lastDateInYear = lastDateInYear;
  }

  return NextResponse.json(payload);
}


