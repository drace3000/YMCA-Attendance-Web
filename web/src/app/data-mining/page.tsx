"use client";

import { useEffect, useRef, useState } from "react";
import { useCallback } from "react";
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Mail,
  Printer,
  Save,
  Search,
  Sparkles,
  Table as TableIcon,
  Trash2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import type { QueryAPIResponse, ResultFormat } from "@/types/queries";
import { useThemeSettings } from "@/components/theme-settings-provider";
import { EmailExcelModal } from "@/components/email-excel-modal";

// Format numeric values to one decimal place
function formatValue(value: unknown): string {
  if (typeof value === "number") {
    // Round to nearest tenth if it has decimal places
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return String(value ?? "");
}

type SubmitState = "idle" | "loading" | "error" | "ready";

interface SavedQuery {
  id: string;
  branch_id: string;
  name: string;
  query_text: string;
  created_at: string;
}

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
  const { branch } = useThemeSettings();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<QueryAPIResponse | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [selectedSample, setSelectedSample] = useState<ResultFormat | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [queryName, setQueryName] = useState("");
  const [savingQuery, setSavingQuery] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedSavedQueryId, setSelectedSavedQueryId] = useState<string | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updatingQuery, setUpdatingQuery] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Load saved queries when branch changes
  const loadSavedQueries = useCallback(async () => {
    if (!branch?.id) return;
    
    try {
      const res = await fetch(`/api/saved-queries?branch_id=${branch.id}`);
      if (res.ok) {
        const data = await res.json();
        setSavedQueries(data);
      }
    } catch (err) {
      console.error("Failed to load saved queries:", err);
    }
  }, [branch?.id]);

  useEffect(() => {
    loadSavedQueries();
  }, [loadSavedQueries]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  // Excel export functions
  const generateExcelFilename = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const branchPart = branch.name ? branch.name.replace(/\s+/g, "_") : "DataMining";
    const reportTitle = (response?.success && response.query?.reportTitle?.replace(/\s+/g, "_")) || "Query_Results";
    return `${dateStr}.${timeStr}.${branchPart}_${reportTitle}.xlsx`;
  };

  const getExcelWorkbook = () => {
    if (!response?.success || !response.results?.data) return null;
    
    const rows = response.results.data;
    const title = response.query?.reportTitle || "Data Mining Results";
    const queryText = response.query?.queryText || "";
    
    // Create header rows
    const headerRows: Record<string, string | number>[] = [
      { col1: title },
      { col1: `Query: ${queryText}` },
      { col1: `Total Rows: ${rows.length}` },
      { col1: `Generated: ${new Date().toLocaleString()}` },
      { col1: `Branch: ${branch.name}` },
      {}, // Empty row before data
    ];

    // Get columns from data
    const columns = rows.length > 0 
      ? Array.from(rows.reduce((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()))
      : [];

    // Prepare data rows
    const dataRows = rows.map((row) => {
      const exportRow: Record<string, unknown> = {};
      columns.forEach((col) => {
        exportRow[col] = row[col] ?? "";
      });
      return exportRow;
    });

    // Create workbook
    const ws = XLSX.utils.json_to_sheet([...headerRows, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");

    // Auto-size columns
    const colWidths = columns.map(() => ({ wch: 20 }));
    ws["!cols"] = colWidths;

    return wb;
  };

  const handleExcelDownload = () => {
    const wb = getExcelWorkbook();
    if (!wb) return;
    const filename = generateExcelFilename();
    XLSX.writeFile(wb, filename);
  };

  const handleExcelPreview = () => {
    if (!response?.success || !response.results?.data) return;
    
    const rows = response.results.data;
    const title = response.query?.reportTitle || "Data Mining Results";
    const queryText = response.query?.queryText || "";
    
    const columns = rows.length > 0 
      ? Array.from(rows.reduce((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()))
      : [];

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { margin-bottom: 20px; }
          .header h1 { color: #333; margin: 0 0 10px 0; }
          .header .info { color: #666; font-size: 14px; margin-bottom: 5px; }
          .query { background-color: #f8f9fa; padding: 12px 15px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px; font-style: italic; color: #555; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #0d9488; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
          tr:hover { background-color: #ddd; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <div class="info">Branch: ${branch.name} | Rows: ${rows.length} | Generated: ${new Date().toLocaleString()}</div>
        </div>
        <div class="query">${queryText}</div>
        <table>
          <thead>
            <tr>${columns.map(h => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${columns.map(h => `<td>${formatValue(row[h])}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.write(html);
      previewWindow.document.close();
    }
  };

  const handleExcelPrint = () => {
    if (!response?.success || !response.results?.data) return;
    
    const rows = response.results.data;
    const title = response.query?.reportTitle || "Data Mining Results";
    const queryText = response.query?.queryText || "";
    
    const columns = rows.length > 0 
      ? Array.from(rows.reduce((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()))
      : [];

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { margin-bottom: 20px; }
          .header h1 { color: #333; margin: 0 0 10px 0; }
          .header .info { color: #666; font-size: 14px; margin-bottom: 5px; }
          .query { background-color: #f8f9fa; padding: 12px 15px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px; font-style: italic; color: #555; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #0d9488; color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tr:nth-child(even) { background-color: #f2f2f2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <div class="info">Branch: ${branch.name} | Rows: ${rows.length} | Generated: ${new Date().toLocaleString()}</div>
        </div>
        <div class="query">${queryText}</div>
        <table>
          <thead>
            <tr>${columns.map(h => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map(row => `<tr>${columns.map(h => `<td>${formatValue(row[h])}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const handleExcelEmail = () => {
    const wb = getExcelWorkbook();
    if (!wb) return;
    
    // Generate Excel file as array buffer
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    
    setExcelBlob(blob);
    setEmailModalOpen(true);
  };

  const handleSaveQuery = async () => {
    if (!branch?.id || !response?.success || !response.query?.queryText) return;
    
    const trimmedName = queryName.trim();
    if (!trimmedName) {
      setSaveError("Please enter a name for this query");
      return;
    }

    setSavingQuery(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/saved-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: branch.id,
          name: trimmedName,
          queryText: response.query.queryText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data.error || "Failed to save query");
        return;
      }

      // Add to local state and close modal
      setSavedQueries(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSaveModalOpen(false);
      setQueryName("");
    } catch (err) {
      setSaveError("Failed to save query");
    } finally {
      setSavingQuery(false);
    }
  };

  const handleUpdateQuery = async () => {
    if (!selectedSavedQueryId || !response?.success || !response.query?.queryText) return;

    setUpdatingQuery(true);

    try {
      const res = await fetch("/api/saved-queries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSavedQueryId,
          queryText: response.query.queryText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to update query:", data.error);
        return;
      }

      // Update in local state
      setSavedQueries(prev => prev.map(q => q.id === selectedSavedQueryId ? data : q));
      setUpdateModalOpen(false);
    } catch (err) {
      console.error("Failed to update query:", err);
    } finally {
      setUpdatingQuery(false);
    }
  };

  const handleDeleteQuery = async (id: string) => {
    try {
      const res = await fetch(`/api/saved-queries?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSavedQueries(prev => prev.filter(q => q.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete query:", err);
    }
  };

  const handleSelectSavedQuery = (queryText: string) => {
    setQuery(queryText);
    setStatus("idle");
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a question to get started.");
      setStatus("error");
      return;
    }
    if (!branch?.id) {
      setError("No branch selected. Please select a branch in Settings.");
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
        body: JSON.stringify({ query: trimmed, branchId: branch.id }),
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
                  setSelectedSavedQueryId(null);
                  if (status === "error") setStatus("idle");
                  if (error) setError(null);
                }}
              />
            </div>
            {/* Recent Saved Queries (last 10) */}
            {savedQueries.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500">
                  <Bookmark className="h-3.5 w-3.5" />
                  Recent:
                </span>
                {[...savedQueries]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 10)
                  .map((sq) => {
                    const isSelected = selectedSavedQueryId === sq.id;
                    return (
                      <button
                        key={sq.id}
                        type="button"
                        className={`btn-pill px-3 py-1 text-xs shadow-sm transition hover:-translate-y-px hover:shadow ${
                          isSelected
                            ? "border border-[var(--cta)] bg-[var(--cta)]/20 text-[var(--cta)] ring-1 ring-[var(--cta)]/50"
                            : "border border-yellow-600/40 bg-yellow-600/10 text-yellow-400 hover:bg-yellow-600/20"
                        }`}
                        onClick={() => {
                          setQuery(sq.query_text);
                          setSelectedSavedQueryId(sq.id);
                          setStatus("idle");
                          setError(null);
                        }}
                        title={sq.query_text}
                      >
                        {sq.name}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Saved Queries Dropdown */}
            {savedQueries.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium text-foreground">Saved Queries:</span>
                <div className="relative flex-1 max-w-md">
                  <select
                    className="w-full appearance-none rounded-lg border border-border bg-background/60 px-3 py-2 pr-10 text-sm text-foreground shadow-sm outline-none ring-1 ring-transparent transition focus:ring-[var(--cta)]/70"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSelectSavedQuery(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select a saved query...</option>
                    {savedQueries.map((sq) => (
                      <option key={sq.id} value={sq.query_text}>
                        {sq.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {/* Manage button to show delete options */}
                <div className="relative group">
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-background/60 p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    title="Manage saved queries"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {/* Dropdown for deleting queries */}
                  <div className="absolute right-0 top-full z-20 mt-1 hidden w-64 rounded-lg border border-border bg-card p-2 shadow-lg group-hover:block">
                    <p className="mb-2 px-2 text-xs font-semibold text-muted-foreground">Delete a saved query:</p>
                    {savedQueries.map((sq) => (
                      <button
                        key={sq.id}
                        type="button"
                        onClick={() => handleDeleteQuery(sq.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <span className="truncate">{sq.name}</span>
                        <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Branch:</span>
                <span className="rounded-md border border-border bg-background/60 px-3 py-2 text-foreground shadow-sm">
                  {branch.name}
                </span>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  AI response ready
                </span>
                <span className="text-xs text-muted-foreground">
                  {response.results.rowCount} rows | {response.results.executionTimeMs} ms
                </span>
              </div>
              <div className="flex items-center gap-2">
                {response.results.data.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExportModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-green-600/50 bg-green-600/10 px-3 py-1.5 text-xs font-medium text-green-500 transition hover:bg-green-600/20"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Excel
                  </button>
                )}
                {selectedSavedQueryId ? (
                  <button
                    type="button"
                    onClick={() => setUpdateModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-600/50 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition hover:bg-blue-600/20"
                  >
                    <Save className="h-4 w-4" />
                    Update Query
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setQueryName("");
                      setSaveError(null);
                      setSaveModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-yellow-600/50 bg-yellow-600/10 px-3 py-1.5 text-xs font-medium text-yellow-500 transition hover:bg-yellow-600/20"
                  >
                    <Save className="h-4 w-4" />
                    Save Query
                  </button>
                )}
              </div>
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

      {/* Export to Excel Modal */}
      {exportModalOpen && response?.success && response.results?.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setExportModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600/20">
                  <FileSpreadsheet className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Export to Excel</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Download query results</p>
                </div>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Export Info */}
            <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Branch:</span>
                  <span className="font-medium text-[var(--brand-ink)]">{branch.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Report:</span>
                  <span className="font-medium text-[var(--brand-ink)]">{response.query?.reportTitle || "Query Results"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Rows:</span>
                  <span className="font-medium text-[var(--brand-ink)]">{response.results.data.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Filename:</span>
                  <span className="font-medium text-[var(--brand-ink)] text-xs truncate max-w-[200px]" title={generateExcelFilename()}>
                    {generateExcelFilename()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => handleExcelPreview()}
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <Eye className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                Preview
              </button>
              
              <button
                onClick={() => { handleExcelDownload(); setExportModalOpen(false); }}
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <Download className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                Download Excel
              </button>
              
              <button
                onClick={() => handleExcelPrint()}
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <Printer className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                Print
              </button>
              
              <button
                onClick={() => { handleExcelEmail(); setExportModalOpen(false); }}
                className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <Mail className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                Email Excel
              </button>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-center text-xs text-[var(--brand-ink)]/70">
              Export includes all query result data
            </p>
          </div>
        </div>
      )}

      {/* Email Excel Modal */}
      {branch?.id && (
        <EmailExcelModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          excelBlob={excelBlob}
          defaultSubject={`${branch.name} - ${(response?.success && response.query?.reportTitle) || "Data Mining Results"}`}
          defaultMessage={`Please find attached the Data Mining query results.\n\nQuery: ${(response?.success && response.query?.queryText) || ""}\n\nTotal Rows: ${(response?.success && response.results?.data?.length) || 0}\n\nGenerated: ${new Date().toLocaleString()}`}
          defaultFileName={generateExcelFilename()}
          branchId={branch.id}
        />
      )}

      {/* Save Query Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSaveModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-600/20">
                  <Save className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Save Query</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Save for quick access later</p>
                </div>
              </div>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error */}
            {saveError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            {/* Query Preview */}
            <div className="mb-4 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
              <p className="text-xs font-semibold uppercase text-[var(--brand-ink)]/60 mb-2">Query to save:</p>
              <p className="text-sm text-[var(--brand-ink)] italic line-clamp-3">
                &quot;{(response?.success && response.query?.queryText) || ""}&quot;
              </p>
            </div>

            {/* Name Input */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-[var(--brand-ink)]">
                Query Name *
              </label>
              <input
                type="text"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
                placeholder="e.g., Weekly attendance leaders"
                maxLength={100}
                className="w-full rounded-xl border border-[var(--brand-strong)] bg-black/20 px-4 py-3 text-sm text-[var(--brand-ink)] placeholder:text-[var(--brand-ink)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--cta)]/50"
                autoFocus
              />
              <p className="mt-1 text-xs text-[var(--brand-ink)]/50">
                {queryName.length}/100 characters
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                disabled={savingQuery}
                className="flex-1 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuery}
                disabled={savingQuery || !queryName.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-3 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingQuery ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Query
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Query Confirmation Modal */}
      {updateModalOpen && selectedSavedQueryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setUpdateModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20">
                  <AlertTriangle className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Update Query</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Confirm overwrite</p>
                </div>
              </div>
              <button
                onClick={() => setUpdateModalOpen(false)}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Warning Message */}
            <div className="mb-6 rounded-xl border border-blue-600/30 bg-blue-600/10 p-4">
              <p className="text-sm text-[var(--brand-ink)]">
                Are you sure you want to overwrite the existing saved query{" "}
                <span className="font-semibold">
                  &quot;{savedQueries.find(q => q.id === selectedSavedQueryId)?.name}&quot;
                </span>
                {" "}with the current query text?
              </p>
              <p className="mt-3 text-xs text-[var(--brand-ink)]/70">
                This action cannot be undone.
              </p>
            </div>

            {/* New Query Preview */}
            <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
              <p className="text-xs font-semibold uppercase text-[var(--brand-ink)]/60 mb-2">New query text:</p>
              <p className="text-sm text-[var(--brand-ink)] italic line-clamp-3">
                &quot;{(response?.success && response.query?.queryText) || ""}&quot;
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUpdateModalOpen(false)}
                disabled={updatingQuery}
                className="flex-1 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateQuery}
                disabled={updatingQuery}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updatingQuery ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Yes, Update
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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
        <div className="text-3xl font-bold text-foreground">{formatValue(firstRow[firstKey])}</div>
        <div className="text-sm text-muted-foreground">{firstKey}</div>
      </div>
    );
  }

  if (format === "short_list") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4">
        {rows.map((row, idx) => {
          const keys = Object.keys(row);
          const formattedValues = keys.map(k => `${k}: ${formatValue(row[k])}`).join(", ");
          return (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground"
            >
              <span className="font-semibold">{formatValue(row[keys[0]])}</span>
              <span className="text-muted-foreground">{formattedValues}</span>
            </div>
          );
        })}
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
              <span>{formatValue(row[timeKey])}</span>
              <span className="font-semibold">{formatValue(row[valueKey])}</span>
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
                  {formatValue(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}










