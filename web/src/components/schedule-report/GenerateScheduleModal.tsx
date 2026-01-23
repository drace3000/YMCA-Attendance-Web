"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  alliance_name?: string | null;
  association_name?: string | null;
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
  allianceName?: string;
  associationName?: string;
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
  allianceName,
  associationName,
}: GenerateScheduleModalProps) {
  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const excelWorkbookRef = useRef<XLSX.WorkBook | null>(null);

  // Deduplicate sessions for reporting by time, class name, and location code
  const uniqueSessions = useMemo(() => {
    const seen = new Set<string>();
    const result: Session[] = [];

    for (const s of sessions) {
      // Create a unique key from time, class name, and location code
      const key = [
        s.start_time ?? "",
        s.end_time ?? "",
        s.class?.name ?? "",
        s.location?.code ?? "",
      ].join("|");
      
      if (!seen.has(key)) {
        seen.add(key);
        result.push(s);
      }
    }
    return result;
  }, [sessions]);

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

  const canGenerate =
    !!branch &&
    !!schedule &&
    sessions.length > 0 &&
    sessions.every((s) => s.branch_id === branch.id && s.schedule_id === schedule.id);

  const formatLocation = useCallback((loc: Session["location"]): string => {
    if (!loc) return "-";
    const code = (loc.code || "").trim();
    const name = (loc.name || "").trim();
    if (!code && !name) return "-";
    if (!name) return code;
    return `${code} - ${name}`;
  }, []);

  const formatInstructors = useCallback((instructors: Session["instructors"]): string => {
    if (!instructors || instructors.length === 0) return "-";
    return instructors
      .map((i) => (i.nickname || `${i.first_name} ${i.last_name}`.trim()).trim())
      .filter(Boolean)
      .join("/");
  }, []);

  const branchForReport = useMemo(() => {
    if (!branch) return null;
    return {
      ...branch,
      alliance_name: allianceName ?? branch.alliance_name ?? null,
      association_name: associationName ?? branch.association_name ?? null,
    };
  }, [branch, allianceName, associationName]);

  const excelFilename = useMemo(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const branchPart = branch?.name ? branch.name.replace(/\s+/g, "_") : "Schedule";
    const schedulePart = schedule?.name ? schedule.name.replace(/\s+/g, "_") : "";
    return `${dateStr}.${timeStr}.${branchPart}_Schedule${schedulePart ? "_" + schedulePart : ""}.xlsx`;
  }, [branch?.name, schedule?.name]);

  const criteriaWithOrg = useMemo(() => {
    const lines = [...criteria];
    if (allianceName || associationName) {
      // Keep the schedule type line (criteria[0]) first; insert org immediately after.
      const insertAt = Math.min(1, lines.length);
      lines.splice(
        insertAt,
        0,
        `Alliance: ${allianceName ?? "Unknown"}`,
        `Association: ${associationName ?? "Unknown"}`,
      );
    }
    return lines;
  }, [criteria, allianceName, associationName]);

  const scheduleTypeForDisplay = useMemo(() => {
    const raw = criteria[0]?.trim();
    if (!raw) return null;
    // e.g. "✓ FULL SCHEDULE" -> "FULL SCHEDULE"
    // e.g. "⚠ PARTIAL SCHEDULE (Filtered)" -> "PARTIAL SCHEDULE (Filtered)"
    return raw.replace(/^[^A-Za-z0-9]+/, "").trim();
  }, [criteria]);

  const buildExcelWorkbook = (): XLSX.WorkBook => {
    // Calculate unique instructors
    const uniqueInstructorIds = new Set<string>();
    uniqueSessions.forEach((s) => s.instructors.forEach((i) => uniqueInstructorIds.add(i.id)));

    const title = `${branch?.name || "Schedule"} - ${schedule?.name || "Export"}`;

    const headerRows: Record<string, string | number>[] = [
      { Day: title, Headcount: "DATA CONTEXT:" },
      { Day: `Total Sessions: ${uniqueSessions.length}`, Headcount: criteriaWithOrg[0] || "" },
      { Day: `Total Unique Instructors: ${uniqueInstructorIds.size}`, Headcount: criteriaWithOrg[1] || "" },
      { Day: `Generated: ${new Date().toLocaleString()}`, Headcount: criteriaWithOrg[2] || "" },
    ];

    for (let i = 3; i < criteriaWithOrg.length; i++) {
      headerRows.push({ Day: "", Headcount: criteriaWithOrg[i] });
    }
    headerRows.push({});

    const exportData = uniqueSessions.map((s) => ({
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
    const rows = uniqueSessions.map((s) => ({
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
  }, [uniqueSessions, formatLocation, formatInstructors]);

  const handleAction = async (action: ActionType) => {
    if (!branchForReport || !schedule || !action) return;
    if (!canGenerate) return;
    
    setLoading(action);
    setError(null);
    
    try {
      switch (action) {
        case "preview":
          await previewSchedulePDF(branchForReport, schedule, uniqueSessions, programGroup, criteriaWithOrg);
          break;
        case "download":
          await downloadSchedulePDF(branchForReport, schedule, uniqueSessions, programGroup, criteriaWithOrg);
          break;
        case "print":
          await printSchedulePDF(branchForReport, schedule, uniqueSessions, programGroup, criteriaWithOrg);
          break;
      }
    } catch (err) {
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
      setExcelError(err instanceof Error ? err.message : "Failed to download Excel file");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
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
          <div className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
            {scheduleTypeForDisplay && (
              <>
                <span className="text-[var(--brand-ink)]/70">Type:</span>
                <span className="font-medium text-[var(--brand-ink)] break-words">
                  {scheduleTypeForDisplay}
                </span>
              </>
            )}
            {(allianceName || associationName) && (
              <>
                <span className="text-[var(--brand-ink)]/70">Alliance:</span>
                <span className="font-medium text-[var(--brand-ink)] break-words">
                  {allianceName ?? "—"}
                </span>
                <span className="text-[var(--brand-ink)]/70">Association:</span>
                <span className="font-medium text-[var(--brand-ink)] break-words">
                  {associationName ?? "—"}
                </span>
              </>
            )}

            <span className="text-[var(--brand-ink)]/70">Branch:</span>
            <span className="font-medium text-[var(--brand-ink)] break-words">
              {branch?.name || "Not selected"}
            </span>

            <span className="text-[var(--brand-ink)]/70">Group:</span>
            <span className="font-medium text-[var(--brand-ink)] break-words">
              {programGroup ? `${programGroup.name} (${programGroup.code})` : "Not selected"}
            </span>

            <span className="text-[var(--brand-ink)]/70">Schedule:</span>
            <span className="font-medium text-[var(--brand-ink)] break-words">
              {schedule ? formatMonthYear(schedule.month_start) : "Not selected"}
            </span>

            <span className="text-[var(--brand-ink)]/70">Sessions:</span>
            <span className="font-medium text-[var(--brand-ink)]">
              {sessions.length} classes
            </span>
          </div>
        </div>

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
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {excelLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Preview Excel
          </button>

          <button
            onClick={() => handleAction("preview")}
            disabled={!canGenerate || loading !== null}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Eye className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Preview PDF
          </button>
          
          <button
            onClick={() => handleAction("download")}
            disabled={!canGenerate || loading !== null}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Download className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Download PDF
          </button>
          
          <button
            onClick={() => handleAction("print")}
            disabled={!canGenerate || loading !== null}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "print" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Printer className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
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
                Rows: <span className="font-semibold text-[var(--brand-ink)]">{uniqueSessions.length}</span>
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