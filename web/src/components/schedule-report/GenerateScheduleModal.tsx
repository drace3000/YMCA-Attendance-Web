"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, FileText, Download, Printer, Eye, Loader2, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import {
  downloadSchedulePDF,
  previewSchedulePDF,
  printSchedulePDF,
} from "@/lib/schedule-pdf-utils";
import type { Session } from "@/app/scheduling/sessions-tab";

interface Branch {
  id: string;
  name: string;
  website_url?: string;
  theme_color?: string;
  branch_manager_name?: string;
}

interface Schedule {
  id: string;
  name: string;
  month_start: string;
}

interface ProgramGroup {
  id: string;
  code: string;
  name: string;
}

interface GenerateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  branch: Branch | null;
  programGroup: ProgramGroup | null;
  schedule: Schedule | null;
  sessions: Session[];
  criteria?: string[];
}

type ActionType = "preview" | "download" | "print" | null;

export function GenerateScheduleModal({
  isOpen,
  onClose,
  branch,
  programGroup,
  schedule,
  sessions,
  criteria = [],
}: GenerateScheduleModalProps) {
  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const excelWorkbookRef = useRef<XLSX.WorkBook | null>(null);

  // Apply wait cursor to body during PDF generation
  useEffect(() => {
    if (loading || excelLoading) {
      document.body.style.cursor = "wait";
    } else {
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, [loading, excelLoading]);

  if (!isOpen) return null;

  const canGenerate =
    !!branch &&
    !!schedule &&
    sessions.length > 0 &&
    sessions.every((s) => s.branch_id === branch.id && s.schedule_id === schedule.id);

  const formatLocation = (loc: Session["location"]): string => {
    if (!loc) return "-";
    const code = (loc.code || "").trim();
    const name = (loc.name || "").trim();
    if (!code && !name) return "-";
    if (!name) return code;
    return `${code} - ${name}`;
  };

  const formatInstructors = (instructors: Session["instructors"]): string => {
    if (!instructors || instructors.length === 0) return "-";
    return instructors
      .map((i) => (i.nickname || `${i.first_name} ${i.last_name}`.trim()).trim())
      .filter(Boolean)
      .join("/");
  };

  const excelFilename = useMemo(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const branchPart = branch?.name ? branch.name.replace(/\s+/g, "_") : "Schedule";
    const schedulePart = schedule?.name ? schedule.name.replace(/\s+/g, "_") : "";
    return `${dateStr}.${timeStr}.${branchPart}_Schedule${schedulePart ? "_" + schedulePart : ""}.xlsx`;
  }, [branch?.name, schedule?.name]);

  const buildExcelWorkbook = (): XLSX.WorkBook => {
    // Calculate unique instructors
    const uniqueInstructorIds = new Set<string>();
    sessions.forEach((s) => s.instructors.forEach((i) => uniqueInstructorIds.add(i.id)));

    const title = `${branch?.name || "Schedule"} - ${schedule?.name || "Export"}`;

    const headerRows: Record<string, string | number>[] = [
      { Day: title, Headcount: "DATA CONTEXT:" },
      { Day: `Total Sessions: ${sessions.length}`, Headcount: criteria[0] || "" },
      { Day: `Total Unique Instructors: ${uniqueInstructorIds.size}`, Headcount: criteria[1] || "" },
      { Day: `Generated: ${new Date().toLocaleString()}`, Headcount: criteria[2] || "" },
    ];

    for (let i = 3; i < criteria.length; i++) {
      headerRows.push({ Day: "", Headcount: criteria[i] });
    }
    headerRows.push({});

    const exportData = sessions.map((s) => ({
      Day: s.day_of_week,
      Date: s.session_date,
      Start: s.start_time.slice(0, 5),
      End: s.end_time.slice(0, 5),
      Class: s.class?.name || "-",
      Location: formatLocation(s.location),
      "Instructor(s)": formatInstructors(s.instructors),
      Headcount: s.headcount ?? "-",
    }));

    const exportDataWithHeader = [...headerRows, ...exportData];

    const ws = XLSX.utils.json_to_sheet(exportDataWithHeader);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");

    // Column sizing
    ws["!cols"] = [
      { wch: 14 }, // Day
      { wch: 12 }, // Date
      { wch: 8 },  // Start
      { wch: 8 },  // End
      { wch: 22 }, // Class
      { wch: 25 }, // Location
      { wch: 26 }, // Instructor(s)
      { wch: 50 }, // Headcount/context
    ];

    return wb;
  };

  const excelPreviewRows = useMemo(() => {
    const headers = ["Day", "Date", "Start", "End", "Class", "Location", "Instructor(s)", "Headcount"] as const;
    const rows = sessions.map((s) => ({
      Day: s.day_of_week,
      Date: s.session_date,
      Start: s.start_time.slice(0, 5),
      End: s.end_time.slice(0, 5),
      Class: s.class?.name || "-",
      Location: formatLocation(s.location),
      "Instructor(s)": formatInstructors(s.instructors),
      Headcount: String(s.headcount ?? "-"),
    }));
    return { headers, rows };
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (action: ActionType) => {
    if (!branch || !schedule || !action) return;
    if (!canGenerate) return;
    
    setLoading(action);
    setError(null);
    
    try {
      switch (action) {
        case "preview":
          await previewSchedulePDF(branch, schedule, sessions, programGroup, criteria);
          break;
        case "download":
          await downloadSchedulePDF(branch, schedule, sessions, programGroup, criteria);
          break;
        case "print":
          await printSchedulePDF(branch, schedule, sessions, programGroup, criteria);
          break;
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setLoading(null);
    }
  };

  const formatMonthYear = (monthStart: string): string => {
    const date = new Date(monthStart + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const handleExcelPreview = async (): Promise<void> => {
    if (!canGenerate) return;
    setExcelLoading(true);
    setExcelError(null);
    try {
      const wb = buildExcelWorkbook();
      excelWorkbookRef.current = wb;
      setExcelPreviewOpen(true);
    } catch (err) {
      console.error("Excel preview error:", err);
      setExcelError(err instanceof Error ? err.message : "Failed to generate Excel preview");
    } finally {
      setExcelLoading(false);
    }
  };

  const handleExcelDownload = (): void => {
    if (!canGenerate) return;
    try {
      const wb = excelWorkbookRef.current ?? buildExcelWorkbook();
      XLSX.writeFile(wb, excelFilename);
    } catch (err) {
      console.error("Excel download error:", err);
      setExcelError(err instanceof Error ? err.message : "Failed to download Excel file");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cta)]/20">
              <FileText className="h-5 w-5 text-[var(--cta)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Generate Schedule</h2>
              <p className="text-sm text-[var(--brand-ink)]/70">Create a printable PDF</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Schedule Info */}
        <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Branch:</span>
              <span className="font-medium text-[var(--brand-ink)]">{branch?.name || "Not selected"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Group:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {programGroup ? `${programGroup.name} (${programGroup.code})` : "Not selected"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Schedule:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {schedule ? formatMonthYear(schedule.month_start) : "Not selected"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Sessions:</span>
              <span className="font-medium text-[var(--brand-ink)]">{sessions.length} classes</span>
            </div>
          </div>
        </div>

        {/* Grid Context */}
        {criteria.length > 0 && (
          <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]/80">
              Grid Context
            </div>
            <div className="mt-2 space-y-1 text-xs text-[var(--brand-ink)]/85">
              {criteria.slice(0, 8).map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
            {criteria.length > 8 && (
              <div className="mt-2 text-[11px] text-[var(--brand-ink)]/60">
                (Showing first 8 context lines)
              </div>
            )}
          </div>
        )}

        {/* Warning if no sessions */}
        {sessions.length === 0 && (
          <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            No sessions found for this schedule. Please select a schedule with classes.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {excelError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {excelError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => void handleExcelPreview()}
            disabled={!canGenerate || loading !== null || excelLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {excelLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Preview Excel
          </button>

          <button
            onClick={() => handleAction("preview")}
            disabled={!canGenerate || loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview PDF
          </button>
          
          <button
            onClick={() => handleAction("download")}
            disabled={!canGenerate || loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </button>
          
          <button
            onClick={() => handleAction("print")}
            disabled={!canGenerate || loading !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "print" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print
          </button>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-center text-xs text-[var(--brand-ink)]/70">
          PDF will be generated in landscape format for wall posting
        </p>
      </div>

      {/* Excel Preview Overlay */}
      {excelPreviewOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setExcelPreviewOpen(false)}
          />
          <div className="relative z-10 w-full max-w-5xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.97)] p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Excel Preview</h2>
                <p className="text-sm text-[var(--brand-ink)]/70">
                  Preview of the spreadsheet. Use Download to save the Excel file.
                </p>
              </div>
              <button
                onClick={() => setExcelPreviewOpen(false)}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[var(--brand-ink)]/80">
                Rows: <span className="font-semibold text-[var(--brand-ink)]">{sessions.length}</span>
              </div>
              <button
                type="button"
                onClick={handleExcelDownload}
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-2 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <Download className="h-4 w-4" />
                Download Excel
              </button>
            </div>

            {criteria.length > 0 && (
              <div className="mb-4 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/10 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]/80">
                  Grid Context
                </div>
                <div className="mt-2 space-y-1 text-xs text-[var(--brand-ink)]/85">
                  {criteria.slice(0, 10).map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[60vh] overflow-auto rounded-xl border border-[var(--brand-strong)] bg-black/10">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-[var(--brand-strong)]/60 text-[var(--brand-ink)]">
                  <tr>
                    {excelPreviewRows.headers.map((h) => (
                      <th key={h} className="border-b border-[var(--brand-strong)] px-3 py-2 text-left text-xs font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[var(--brand-ink)]">
                  {excelPreviewRows.rows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white/5" : "bg-transparent"}>
                      {excelPreviewRows.headers.map((h) => (
                        <td key={h} className="border-b border-white/5 px-3 py-2 text-xs">
                          {String(row[h] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PDF Generation Loading Overlay */}
      {(loading || excelLoading) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-wait">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-8 shadow-2xl">
            {/* SMIL-animated SVG spinner - runs on separate thread, won't freeze during PDF generation */}
            <svg className="h-12 w-12" viewBox="0 0 50 50">
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="#facc15"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="31.4 31.4"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 25 25"
                  to="360 25 25"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </circle>
            </svg>
            <div className="text-center">
              <p className="text-lg font-semibold text-[var(--brand-ink)]">
                Creating document...
              </p>
              <p className="mt-1 text-sm text-[var(--brand-ink)]/70">
                This may take a few seconds
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GenerateScheduleModal;