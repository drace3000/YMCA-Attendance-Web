import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type TrendRow = {
  session_date: string;
  headcount: number | null;
  class:
    | { id?: string | null; name: string | null }
    | { id?: string | null; name: string | null }[]
    | null;
};

type TrendsPayload = {
  year: number;
  months: { index: number; label: string; isoMonth: string }[];
  topUp: {
    classId: string;
    className: string;
    monthlyAvg: number[];
    monthSessions: number[];
    slope: number;
    delta: number;
    totalSessions: number;
  }[];
  topDown: {
    classId: string;
    className: string;
    monthlyAvg: number[];
    monthSessions: number[];
    slope: number;
    delta: number;
    totalSessions: number;
  }[];
  computedAt: string;
  meta: {
    periodStart: string;
    periodEnd: string;
    rowsInPeriod: number;
    rowsInYear?: number;
    firstDateInYear?: string | null;
    lastDateInYear?: string | null;
  };
};

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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

function isMonthIndexValid(m: number) {
  return Number.isFinite(m) && m >= 0 && m <= 7;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? "2025");

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
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

  // Jan 1 (inclusive) -> Sep 1 (exclusive) to cover Jan..Aug.
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 8, 1));

  const months: TrendsPayload["months"] = [
    { index: 0, label: "Jan", isoMonth: "01" },
    { index: 1, label: "Feb", isoMonth: "02" },
    { index: 2, label: "Mar", isoMonth: "03" },
    { index: 3, label: "Apr", isoMonth: "04" },
    { index: 4, label: "May", isoMonth: "05" },
    { index: 5, label: "Jun", isoMonth: "06" },
    { index: 6, label: "Jul", isoMonth: "07" },
    { index: 7, label: "Aug", isoMonth: "08" },
  ];

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: TrendRow[] = (data ?? []) as unknown as TrendRow[];
  const rowsInPeriod = rows.length;

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
    if (!isMonthIndexValid(monthIndex)) continue;

    let existing = byClass.get(classId);
    if (!existing) {
      existing = {
        className,
        monthTotals: Array.from({ length: 8 }, () => 0),
        monthSessions: Array.from({ length: 8 }, () => 0),
        totalSessions: 0,
        nonEmptyMonths: 0,
      };
      byClass.set(classId, existing);
    }

    // Track non-empty months (only once)
    if (existing.monthSessions[monthIndex] === 0) {
      existing.nonEmptyMonths += 1;
    }

    existing.monthTotals[monthIndex] += r.headcount;
    existing.monthSessions[monthIndex] += 1;
    existing.totalSessions += 1;

  }

  const series = Array.from(byClass.entries())
    .map(([classId, s]) => {
      const monthlyAvg = s.monthTotals.map((total, idx) => {
        const sessions = s.monthSessions[idx] ?? 0;
        return sessions ? total / sessions : 0;
      });
      const slope = linearRegressionSlope(monthlyAvg);
      const delta = (monthlyAvg[7] ?? 0) - (monthlyAvg[0] ?? 0);
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
    // Filter out sparse / discontinuous classes so "Jan → Aug" trend is meaningful.
    // - Needs at least a few sessions overall
    // - Must have data in BOTH Jan and Aug
    .filter(
      (s) =>
        s.totalSessions >= 6 &&
        s.nonEmptyMonths >= 3 &&
        (s.monthSessions[0] ?? 0) > 0 &&
        (s.monthSessions[7] ?? 0) > 0,
    );

  const stripNonEmptyMonths = (
    item: (typeof series)[number],
  ): Omit<(typeof series)[number], "nonEmptyMonths"> => {
    const copy = { ...item } as (typeof series)[number] & Record<string, unknown>;
    delete copy.nonEmptyMonths;
    return copy;
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
    months,
    topUp,
    topDown,
    computedAt: new Date().toISOString(),
    meta: {
      periodStart: toIsoDate(start),
      periodEnd: toIsoDate(end),
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

    const firstDateInYear = (firstRes.data?.[0] as { session_date?: string } | undefined)
      ?.session_date
      ? String((firstRes.data?.[0] as { session_date?: string }).session_date).slice(0, 10)
      : null;
    const lastDateInYear = (lastRes.data?.[0] as { session_date?: string } | undefined)
      ?.session_date
      ? String((lastRes.data?.[0] as { session_date?: string }).session_date).slice(0, 10)
      : null;

    payload.meta.rowsInYear = countRes.count ?? 0;
    payload.meta.firstDateInYear = firstDateInYear;
    payload.meta.lastDateInYear = lastDateInYear;
  }

  return NextResponse.json(payload);
}


