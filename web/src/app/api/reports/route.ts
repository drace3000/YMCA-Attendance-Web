import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type ReportRow = {
  id: string;
  session_date: string;
  day_of_week?: string | null;
  headcount: number | null;
  // Supabase/PostgREST can type joined relations as arrays even for many-to-one.
  class:
    | { name: string | null; category?: string | null }
    | { name: string | null; category?: string | null }[]
    | null;
  location:
    | { name: string | null; code?: string | null }
    | { name: string | null; code?: string | null }[]
    | null;
};

type ReportsPayload = {
  monthTotals: {
    totalAttendance: number;
    overallAvg: number;
    sessionsWithHeadcount: number;
    locationAverages: { location: string; avg: number; sessions: number }[];
  };
  dayTotals: {
    perDay: { day: string; total: number; avg: number; sessions: number }[];
    total: number;
    overallAvg: number;
  };
  saturdayAverages: {
    locations: { location: string; avg: number; sessions: number }[];
    totalClassAvg: number;
  };
  sundayAverages: {
    locations: { location: string; avg: number; sessions: number }[];
    totalClassAvg: number;
  };
  monthClassTypeAverage: { name: string; avg: number }[];
  monthClassGroupAverage: { group: string; avg: number }[];
  weekTotals: { label: string; total: number }[];
};

function startOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function startOfNextMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

function startOfYear(year: number) {
  return new Date(Date.UTC(year, 0, 1));
}

function startOfNextYear(year: number) {
  return new Date(Date.UTC(year + 1, 0, 1));
}

function startOfQuarter(year: number, quarter: number) {
  const q = Math.min(4, Math.max(1, quarter));
  const month = (q - 1) * 3 + 1;
  return startOfMonth(year, month);
}

function startOfNextQuarter(year: number, quarter: number) {
  const q = Math.min(4, Math.max(1, quarter));
  const nextMonth = q * 3 + 1; // 4->13 -> next year
  if (nextMonth <= 12) return startOfMonth(year, nextMonth);
  return startOfYear(year + 1);
}

// ISO week (Monday start), UTC.
function startOfIsoWeek(year: number, week: number) {
  // ISO week 1 is the week with Jan 4th in it.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const week1Monday = new Date(jan4.getTime() - jan4Dow * 86400000);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? "2025");
  const month = searchParams.get("month") ?? "all";
  const quarter = searchParams.get("quarter") ?? "all";
  const week = searchParams.get("week") ?? "all";
  const day = (searchParams.get("day") ?? "all").toUpperCase();
  const instructor = searchParams.get("instructor") ?? "all";

  const supabase = createSupabaseServerClient();

  // Build date filters
  let gteDate = startOfYear(year);
  let ltDate = startOfNextYear(year);

  // Precedence: week > month > quarter > year
  if (quarter !== "all") {
    const q = Number(quarter);
    if (!Number.isFinite(q) || q < 1 || q > 4) {
      return NextResponse.json({ error: "Invalid quarter" }, { status: 400 });
    }
    gteDate = startOfQuarter(year, q);
    ltDate = startOfNextQuarter(year, q);
  }

  if (month !== "all") {
    const m = Number(month);
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
    gteDate = startOfMonth(year, m);
    ltDate = startOfNextMonth(year, m);
  }

  if (week !== "all") {
    const w = Number(week);
    if (!Number.isFinite(w) || w < 1 || w > 53) {
      return NextResponse.json({ error: "Invalid week" }, { status: 400 });
    }
    gteDate = startOfIsoWeek(year, w);
    ltDate = new Date(gteDate.getTime() + 7 * 86400000);
  }

  const baseQuery = supabase
    .from("class_sessions")
    .select(
      `
        id,
        session_date,
        day_of_week,
        headcount,
        class:class_id(name,category),
        location:location_id(name,code)
      `,
    )
    .gte("session_date", toIsoDate(gteDate))
    .lt("session_date", toIsoDate(ltDate));

  const instructorQuery = supabase
    .from("class_sessions")
    .select(
      `
        id,
        session_date,
        day_of_week,
        headcount,
        class:class_id(name,category),
        location:location_id(name,code),
        session_instructors!inner(instructor_id)
      `,
    )
    .gte("session_date", toIsoDate(gteDate))
    .lt("session_date", toIsoDate(ltDate))
    .eq("session_instructors.instructor_id", instructor);

  const { data, error } =
    instructor !== "all" ? await instructorQuery : await baseQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: ReportRow[] = (data ?? []) as unknown as ReportRow[];

  const filteredByDay =
    day === "ALL"
      ? rows
      : rows.filter((r) => {
          const dow = new Date(r.session_date + "T00:00:00Z").toLocaleDateString(
            "en-US",
            { weekday: "long", timeZone: "UTC" },
          );
          return dow.toUpperCase() === day;
        });

  const withHeadcount = filteredByDay.filter((r) => r.headcount !== null);
  const totalsSessionsWithHeadcount = withHeadcount.length;
  const avgHeadcount =
    totalsSessionsWithHeadcount === 0
      ? 0
      : withHeadcount.reduce((sum, r) => sum + (r.headcount ?? 0), 0) /
        totalsSessionsWithHeadcount;

  const totalAttendance = withHeadcount.reduce((sum, r) => sum + (r.headcount ?? 0), 0);

  const getDayKey = (r: ReportRow) => {
    if (r.day_of_week) return r.day_of_week.toUpperCase();
    const dow = new Date(r.session_date + "T00:00:00Z").toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });
    return dow.toUpperCase();
  };

  const dayOrder = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ];
  const dayBuckets = new Map<string, { total: number; sessions: number }>();
  for (const d of dayOrder) dayBuckets.set(d, { total: 0, sessions: 0 });
  for (const row of filteredByDay) {
    if (row.headcount == null) continue;
    const key = getDayKey(row);
    const bucket = dayBuckets.get(key) ?? { total: 0, sessions: 0 };
    bucket.total += row.headcount;
    bucket.sessions += 1;
    dayBuckets.set(key, bucket);
  }
  const perDay = dayOrder.map((d) => {
    const b = dayBuckets.get(d) ?? { total: 0, sessions: 0 };
    return {
      day: d,
      total: b.total,
      avg: b.sessions ? b.total / b.sessions : 0,
      sessions: b.sessions,
    };
  });

  // Location averages for month totals
  const locationBucketsAll = new Map<string, { total: number; sessions: number }>();
  for (const row of filteredByDay) {
    if (row.headcount == null) continue;
    const locName = Array.isArray(row.location) ? row.location[0]?.name : row.location?.name;
    const key = (locName ?? "Unknown").toString();
    const bucket = locationBucketsAll.get(key) ?? { total: 0, sessions: 0 };
    bucket.total += row.headcount;
    bucket.sessions += 1;
    locationBucketsAll.set(key, bucket);
  }
  const locationAverages = Array.from(locationBucketsAll.entries())
    .map(([location, b]) => ({
      location,
      avg: b.sessions ? b.total / b.sessions : 0,
      sessions: b.sessions,
    }))
    .sort((a, b) => a.location.localeCompare(b.location));

  const byDayLocationAverages = (targetDay: string) => {
    const buckets = new Map<string, { total: number; sessions: number }>();
    for (const row of filteredByDay) {
      if (row.headcount == null) continue;
      if (getDayKey(row) !== targetDay) continue;
      const locName = Array.isArray(row.location) ? row.location[0]?.name : row.location?.name;
      const key = (locName ?? "Unknown").toString();
      const bucket = buckets.get(key) ?? { total: 0, sessions: 0 };
      bucket.total += row.headcount;
      bucket.sessions += 1;
      buckets.set(key, bucket);
    }
    const locations = Array.from(buckets.entries())
      .map(([location, b]) => ({
        location,
        avg: b.sessions ? b.total / b.sessions : 0,
        sessions: b.sessions,
      }))
      .sort((a, b) => b.avg - a.avg || a.location.localeCompare(b.location));
    const totalSessions = locations.reduce((s, r) => s + r.sessions, 0);
    const total = locations.reduce((s, r) => s + r.avg * r.sessions, 0);
    const totalClassAvg = totalSessions ? total / totalSessions : 0;
    return { locations, totalClassAvg };
  };

  // Class type averages (by class name)
  const classBuckets = new Map<string, { total: number; sessions: number }>();
  for (const row of filteredByDay) {
    if (row.headcount == null) continue;
    const className = Array.isArray(row.class) ? row.class[0]?.name : row.class?.name;
    const key = (className ?? "Unknown").toString();
    const bucket = classBuckets.get(key) ?? { total: 0, sessions: 0 };
    bucket.total += row.headcount;
    bucket.sessions += 1;
    classBuckets.set(key, bucket);
  }
  const monthClassTypeAverage = Array.from(classBuckets.entries())
    .map(([name, b]) => ({ name, avg: b.sessions ? b.total / b.sessions : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Class group averages (by classes.category)
  const groupBuckets = new Map<string, { total: number; sessions: number }>();
  for (const row of filteredByDay) {
    if (row.headcount == null) continue;
    const cls = Array.isArray(row.class) ? row.class[0] : row.class;
    const category = (cls?.category ?? "Other").toString().trim() || "Other";
    const key = `All ${category}`;
    const bucket = groupBuckets.get(key) ?? { total: 0, sessions: 0 };
    bucket.total += row.headcount;
    bucket.sessions += 1;
    groupBuckets.set(key, bucket);
  }
  const monthClassGroupAverage = Array.from(groupBuckets.entries())
    .map(([group, b]) => ({ group, avg: b.sessions ? b.total / b.sessions : 0 }))
    .sort((a, b) => a.group.localeCompare(b.group));

  // Week totals: 7-day buckets starting from gteDate (Week One/Two/Three/...)
  const weekNames = ["One", "Two", "Three", "Four", "Five", "Six"];
  const weekTotals: { label: string; total: number }[] = [];
  const dayMs = 86400000;
  const rangeDays = Math.max(0, Math.ceil((ltDate.getTime() - gteDate.getTime()) / dayMs));
  const bucketCount = Math.min(6, Math.max(1, Math.ceil(rangeDays / 7)));
  for (let i = 0; i < bucketCount; i++) {
    const start = new Date(gteDate.getTime() + i * 7 * dayMs);
    const end = new Date(Math.min(ltDate.getTime(), start.getTime() + 7 * dayMs));
    const startIso = toIsoDate(start);
    const endIso = toIsoDate(end);
    const total = filteredByDay.reduce((sum, r) => {
      if (r.headcount == null) return sum;
      const d = r.session_date.slice(0, 10);
      if (d >= startIso && d < endIso) return sum + r.headcount;
      return sum;
    }, 0);
    const name = weekNames[i] ?? `${i + 1}`;
    weekTotals.push({ label: `Week ${name} Total`, total });
  }

  const sat = byDayLocationAverages("SATURDAY");
  const sun = byDayLocationAverages("SUNDAY");

  const payload: ReportsPayload = {
    monthTotals: {
      totalAttendance,
      overallAvg: Number(avgHeadcount.toFixed(2)),
      sessionsWithHeadcount: totalsSessionsWithHeadcount,
      locationAverages: locationAverages.map((r) => ({
        ...r,
        avg: Number(r.avg.toFixed(2)),
      })),
    },
    dayTotals: {
      perDay: perDay.map((r) => ({
        ...r,
        avg: Number(r.avg.toFixed(2)),
      })),
      total: totalAttendance,
      overallAvg: Number(avgHeadcount.toFixed(2)),
    },
    saturdayAverages: {
      locations: sat.locations.map((r) => ({
        ...r,
        avg: Number(r.avg.toFixed(2)),
      })),
      totalClassAvg: Number(sat.totalClassAvg.toFixed(2)),
    },
    sundayAverages: {
      locations: sun.locations.map((r) => ({
        ...r,
        avg: Number(r.avg.toFixed(2)),
      })),
      totalClassAvg: Number(sun.totalClassAvg.toFixed(2)),
    },
    monthClassTypeAverage: monthClassTypeAverage.map((r) => ({
      ...r,
      avg: Number(r.avg.toFixed(2)),
    })),
    monthClassGroupAverage: monthClassGroupAverage.map((r) => ({
      ...r,
      avg: Number(r.avg.toFixed(2)),
    })),
    weekTotals,
  };

  return NextResponse.json(payload);
}


