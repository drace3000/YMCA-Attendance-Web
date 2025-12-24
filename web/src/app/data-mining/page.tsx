"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import type { QueryAPIResponse, ResultFormat } from "@/types/queries";

type SubmitState = "idle" | "loading" | "error" | "ready";
type Branch = { id: string; name: string; theme_color?: string | null };

const exampleQueries = [
  "Which classes had the highest attendance last week?",
  "Show attendance by branch for the past 4 weeks.",
  "List sessions that are near capacity today.",
  "What was the average attendance for yoga on Saturdays last month?",
];

const sampleSuccess: QueryAPIResponse = {
  success: true,
  query: {
    id: "sample-123",
    queryText: "Which classes had the highest attendance last week?",
    generatedSql:
      "select class_name, instructor, avg(attendance) as avg_attendance from class_attendance where branch_id = :branch_id and attended_on >= current_date - interval '7 days' group by class_name, instructor order by avg_attendance desc limit 5;",
    explanation:
      "These are the top 5 classes for the past 7 days, sorted by average attendance per class and instructor.",
    resultFormat: "table",
    reportTitle: "Attendance Leaders",
  },
  results: {
    data: [
      { class_name: "Power Yoga", instructor: "Alex Kim", avg_attendance: 32 },
      { class_name: "Cycle 45", instructor: "Jordan Lee", avg_attendance: 29 },
      { class_name: "Pilates Core", instructor: "Morgan Diaz", avg_attendance: 25 },
      { class_name: "Bootcamp", instructor: "Taylor Chen", avg_attendance: 24 },
      { class_name: "Zumba", instructor: "Avery Patel", avg_attendance: 22 },
    ],
    rowCount: 5,
    executionTimeMs: 120,
  },
  summary: "Top attended classes last 7 days with average headcount per instructor.",
};

const sampleShortList: QueryAPIResponse = {
  success: true,
  query: {
    id: "sample-short",
    queryText: "Which instructors taught the most sessions last week?",
    generatedSql:
      "select instructor, count(*) as sessions from sessions where branch_id = :branch_id and start_time >= current_date - interval '7 days' group by instructor order by sessions desc limit 5;",
    explanation: "Shows instructors ranked by number of sessions taught in the last 7 days.",
    resultFormat: "short_list",
    reportTitle: "Instructor Workload Summary",
  },
  results: {
    data: [
      { instructor: "Alex Kim", sessions: 12 },
      { instructor: "Jordan Lee", sessions: 10 },
      { instructor: "Taylor Chen", sessions: 9 },
      { instructor: "Avery Patel", sessions: 8 },
      { instructor: "Casey Morgan", sessions: 7 },
    ],
    rowCount: 5,
    executionTimeMs: 90,
  },
  summary: "Top instructors by session count over the past week.",
};

const sampleSingleValue: QueryAPIResponse = {
  success: true,
  query: {
    id: "sample-single",
    queryText: "How many unique members attended any class last month?",
    generatedSql:
      "select count(distinct member_id) as unique_members from attendance where branch_id = :branch_id and attended_on >= date_trunc('month', current_date - interval '1 month') and attended_on < date_trunc('month', current_date);",
    explanation: "Counts distinct members who attended at least one class last month.",
    resultFormat: "single_value",
    reportTitle: "Monthly Unique Attendance",
  },
  results: {
    data: [{ unique_members: 842 }],
    rowCount: 1,
    executionTimeMs: 75,
  },
  summary: "Distinct members with attendance in the prior calendar month.",
};

const sampleTimeSeries: QueryAPIResponse = {
  success: true,
  query: {
    id: "sample-ts",
    queryText: "Show attendance trend for yoga over the past 4 weeks.",
    generatedSql:
      "select date_trunc('week', attended_on) as week_start, sum(attendance) as total from class_attendance where branch_id = :branch_id and class_type = 'Yoga' and attended_on >= current_date - interval '28 days' group by week_start order by week_start;",
    explanation: "Weekly attendance totals for yoga classes in the last 4 weeks.",
    resultFormat: "time_series",
    reportTitle: "Yoga Attendance Trend",
  },
  results: {
    data: [
      { week_start: "2025-11-24", total: 210 },
      { week_start: "2025-12-01", total: 244 },
      { week_start: "2025-12-08", total: 263 },
      { week_start: "2025-12-15", total: 251 },
    ],
    rowCount: 4,
    executionTimeMs: 85,
  },
  summary: "Weekly yoga attendance totals for the most recent 4 weeks.",
};

function pickSample(format: ResultFormat): QueryAPIResponse {
  if (format === "single_value") return sampleSingleValue;
  if (format === "short_list") return sampleShortList;
  if (format === "time_series") return sampleTimeSeries;
  return sampleSuccess;
}

export default function DataMiningPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<QueryAPIResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [selectedSample, setSelectedSample] = useState<ResultFormat | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Fetch branches for selection
    fetch("/api/branches")
      .then((res) => res.json())
      .then((data: Branch[]) => {
        setBranches(data);
        if (data.length && !branchId) setBranchId(data[0].id);
      })
      .catch(() => {});

    return () => controllerRef.current?.abort();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a question to get started.");
      setStatus("error");
      return;
    }
    if (!branchId) {
      setError("Select a branch before running the query.");
      setStatus("error");
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setError(null);
    setStatus("loading");
    setResponse(null);
    setSelectedSample(null);

    try {
      const res = await fetch("/api/data-mining", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, branchId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const message =
          res.status === 404
            ? "API not available yet. Try sample response."
            : `Request failed (${res.status})`;
        throw new Error(message);
      }

      const payload = (await res.json()) as QueryAPIResponse;
      if (!payload.success) {
        throw new Error(payload.error || "AI could not process this question.");
      }

      setResponse(payload);
      setStatus("ready");
      setShowSql(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof Error ? e.message : "Request failed.";
      setError(message);
      setStatus("error");
    }
  };

  const handleSample = (format: ResultFormat) => {
    controllerRef.current?.abort();
    setError(null);
    setStatus("ready");
    setResponse(pickSample(format));
    setShowSql(false);
    setSelectedSample(format);
  };

  const showPlaceholder = status === "idle" && !response;
  const isLoading = status === "loading";
  const hasError = status === "error" && !!error;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="rounded-2xl border border-border bg-card/80 p-6 shadow-sm backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Data Mining
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Natural Language Queries
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)]/30 px-3 py-1 text-xs font-semibold text-[var(--brand-strong)]">
            <Sparkles className="h-4 w-4" />
            Phase 1C
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Ask plain language questions about attendance, instructors, and schedules. Responses call
          the Data Mining API when available; you can also preview sample responses.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <form className="flex flex-col gap-4 p-6" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <span className="inline-flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Enter a question
            </span>
            <div className="relative">
              <textarea
                className="min-h-[120px] w-full resize-none rounded-xl border border-border bg-background/60 px-4 py-3 text-base text-foreground shadow-inner outline-none ring-1 ring-transparent transition focus:ring-[var(--cta)]/70"
                placeholder="Example: Which classes had the highest attendance last week?"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (status === "error") setStatus("idle");
                  if (error) setError(null);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {exampleQueries.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="btn-pill border border-border bg-muted/60 px-3 py-1 text-xs text-foreground shadow-sm transition hover:-translate-y-px hover:shadow"
                  onClick={() => {
                    setQuery(example);
                    setStatus("idle");
                    setError(null);
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Branch:</span>
                <select
                  className="min-w-[180px] rounded-md border border-border bg-background/60 px-3 py-2 text-foreground shadow-sm outline-none ring-1 ring-transparent transition focus:ring-[var(--cta)]/70"
                  value={branchId ?? ""}
                  onChange={(e) => {
                    setBranchId(e.target.value || null);
                    if (status === "error") setStatus("idle");
                    if (error) setError(null);
                  }}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  {!branches.length ? <option value="">Loading branches...</option> : null}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span>Choose sample:</span>
                <SampleChip label="Table" active={selectedSample === "table"} onClick={() => handleSample("table")} />
                <SampleChip label="Short list" active={selectedSample === "short_list"} onClick={() => handleSample("short_list")} />
                <SampleChip label="Single value" active={selectedSample === "single_value"} onClick={() => handleSample("single_value")} />
                <SampleChip label="Time series" active={selectedSample === "time_series"} onClick={() => handleSample("time_series")} />
              </div>
            </div>
            <button
              type="submit"
              className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-px active:scale-[0.98]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending to AI...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Ask AI
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Results
        </div>

        {hasError ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <span>{error}</span>
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing your question and preparing response...
          </div>
        ) : null}

          {response && response.success ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                AI response ready
              </span>
              <span className="text-xs text-muted-foreground">
                {response.results.rowCount} rows | {response.results.executionTimeMs} ms
              </span>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold text-foreground">AI Summary</p>
              <p className="mt-1 text-muted-foreground">{response.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Explanation: {response.query.explanation}
              </p>
            </div>

            <ResultRenderer format={response.query.resultFormat} rows={response.results.data} />

            <div className="rounded-xl border border-border bg-background/50">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40"
                onClick={() => setShowSql((s) => !s)}
              >
                <span className="inline-flex items-center gap-2">
                  <TableIcon className="h-4 w-4" />
                  SQL Preview
                </span>
                {showSql ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showSql ? (
                <pre className="overflow-auto border-t border-border bg-black/40 px-4 py-3 text-xs text-muted-foreground">
{response.query.generatedSql}
                </pre>
              ) : null}
            </div>
          </div>
        ) : null}

        {showPlaceholder && !response ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 px-4 py-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No AI response yet.</p>
            <p className="mt-1">
              Submit a question or tap one of the sample response chips to preview how results will
              render by format.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SampleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`btn-pill border px-3 py-1 text-xs shadow-sm transition hover:-translate-y-px hover:shadow ${
        active
          ? "border-[var(--cta)] bg-[var(--cta)]/20 text-[var(--cta)] ring-1 ring-[var(--cta)]/50"
          : "border-border bg-muted/50 text-foreground"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ResultRenderer({
  format,
  rows,
}: {
  format: ResultFormat;
  rows: Record<string, unknown>[];
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        No rows returned.
      </div>
    );
  }

  if (format === "single_value") {
    const firstRow = rows[0];
    const firstKey = Object.keys(firstRow)[0];
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-5">
        <span className="rounded-full bg-[var(--brand-soft)]/40 px-3 py-1 text-xs font-semibold text-[var(--brand-strong)]">
          Single value
        </span>
        <div className="text-3xl font-bold text-foreground">{String(firstRow[firstKey])}</div>
        <div className="text-sm text-muted-foreground">{firstKey}</div>
      </div>
    );
  }

  if (format === "short_list") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground"
          >
            <span className="font-semibold">{String(row[Object.keys(row)[0]])}</span>
            <span className="text-muted-foreground">{JSON.stringify(row)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (format === "time_series") {
    const timeKey = Object.keys(rows[0]).find((k) => k.toLowerCase().includes("date") || k.includes("week")) || Object.keys(rows[0])[0];
    const valueKey = Object.keys(rows[0]).find((k) => k !== timeKey) || timeKey;
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Time series
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground"
            >
              <span>{String(row[timeKey])}</span>
              <span className="font-semibold">{String(row[valueKey])}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // table, aggregation, yes_no default to table layout for now
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );

  return (
    <div className="report-scroll overflow-auto rounded-xl border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-4 py-2 text-left font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-muted/50">
              {columns.map((c) => (
                <td key={c} className="px-4 py-2 text-foreground">
                  {String(row[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}








