"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, FileText, FileSpreadsheet, Printer, Download, Eye, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

import type { Session } from "@/app/scheduling/sessions-tab";
import type { ScheduleConflict } from "@/lib/scheduling/conflict-engine";
import {
  buildConflictsChecklistGroups,
  type ConflictChecklistGroup,
} from "@/lib/schedule-conflicts-checklist-utils";
import {
  downloadScheduleConflictsChecklistPDF,
  previewScheduleConflictsChecklistPDF,
  printScheduleConflictsChecklistPDF,
} from "@/lib/schedule-conflicts-report-pdf-utils";

export function PrintScheduleConflictsReportModal({
  isOpen,
  onClose,
  sessionsInScope,
  conflictsInScope,
  contextLabel,
  branchName,
  reportPeriod,
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionsInScope: Session[];
  conflictsInScope: ScheduleConflict[];
  contextLabel?: string;
  branchName?: string;
  reportPeriod?: string;
}) {
  const [pdfLoading, setPdfLoading] = useState<"preview" | "download" | "print" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const excelWorkbookRef = useRef<XLSX.WorkBook | null>(null);

  const groups: ConflictChecklistGroup[] = useMemo(() => {
    return buildConflictsChecklistGroups({ conflicts: conflictsInScope, sessions: sessionsInScope });
  }, [conflictsInScope, sessionsInScope]);

  const summary = useMemo(() => {
    const s = { high: 0, medium: 0, low: 0, total: 0 };
    for (const c of conflictsInScope) {
      s.total += 1;
      if (c.severity === "HIGH") s.high += 1;
      if (c.severity === "MEDIUM") s.medium += 1;
      if (c.severity === "LOW") s.low += 1;
    }
    return s;
  }, [conflictsInScope]);

  // Apply wait cursor to body during generation
  useEffect(() => {
    if (pdfLoading || excelLoading) {
      document.body.style.cursor = "wait";
    } else {
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, [pdfLoading, excelLoading]);

  const canGenerate = sessionsInScope.length > 0 && conflictsInScope.length > 0 && groups.length > 0;

  const excelFilename = useMemo(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    return `${dateStr}.${timeStr}.Schedule_Conflicts_Checklist.xlsx`;
  }, []);

  const buildExcelWorkbook = (): XLSX.WorkBook => {
    const title = "Schedule Conflicts Checklist";

    const headerRows: Record<string, string | number>[] = [
      { Resolved: title, Conflict: "DATA CONTEXT:" },
      { Resolved: `Total Conflicts: ${conflictsInScope.length}`, Conflict: contextLabel ?? "" },
      { Resolved: `Sessions in scope: ${sessionsInScope.length}`, Conflict: "" },
      { Resolved: `Generated: ${new Date().toLocaleString()}`, Conflict: "" },
      {},
    ];

    const rows: Record<string, string>[] = [];

    for (const g of groups) {
      rows.push({
        Resolved: "",
        Severity: g.severity === "MEDIUM" ? "MED" : g.severity,
        Date: "",
        Conflict: `${g.severity === "MEDIUM" ? "MED" : g.severity} CONFLICTS`,
        "Session A": "",
        "Session B": "",
      });

      for (const r of g.rows) {
        rows.push({
          Resolved: r.resolved,
          Severity: r.severity === "MEDIUM" ? "MED" : r.severity,
          Date: r.date,
          Conflict: r.conflict,
          "Session A": r.sessionA,
          "Session B": r.sessionB === "—" ? "" : r.sessionB,
        });
      }

      rows.push({ Resolved: "", Severity: "", Date: "", Conflict: "", "Session A": "", "Session B": "" });
    }

    const exportData = [...headerRows, ...rows];
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conflicts");

    ws["!cols"] = [
      { wch: 10 }, // Resolved
      { wch: 8 }, // Severity
      { wch: 12 }, // Date
      { wch: 70 }, // Conflict
      { wch: 34 }, // Session A
      { wch: 34 }, // Session B
    ];

    return wb;
  };

  const excelPreviewRows = useMemo(() => {
    const headers = ["Resolved", "Severity", "Date", "Conflict", "Session A", "Session B"] as const;
    const flat: Array<Record<(typeof headers)[number], string>> = [];
    for (const g of groups) {
      flat.push({
        Resolved: "",
        Severity: g.severity === "MEDIUM" ? "MED" : g.severity,
        Date: "",
        Conflict: `${g.severity === "MEDIUM" ? "MED" : g.severity} CONFLICTS`,
        "Session A": "",
        "Session B": "",
      });
      for (const r of g.rows) {
        flat.push({
          Resolved: r.resolved,
          Severity: r.severity === "MEDIUM" ? "MED" : r.severity,
          Date: r.date,
          Conflict: r.conflict,
          "Session A": r.sessionA,
          "Session B": r.sessionB === "—" ? "" : r.sessionB,
        });
      }
      flat.push({ Resolved: "", Severity: "", Date: "", Conflict: "", "Session A": "", "Session B": "" });
    }
    return { headers, rows: flat.slice(0, 200) };
  }, [groups]);

  const handleExcelPreview = async (): Promise<void> => {
    if (!canGenerate) return;
    setExcelLoading(true);
    setExcelError(null);
    try {
      const wb = buildExcelWorkbook();
      excelWorkbookRef.current = wb;
      setExcelPreviewOpen(true);
    } catch (err) {
      console.error("Conflicts Excel preview error:", err);
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
      console.error("Conflicts Excel download error:", err);
      setExcelError(err instanceof Error ? err.message : "Failed to download Excel file");
    }
  };

  const handlePdfAction = async (action: "preview" | "download" | "print"): Promise<void> => {
    if (!canGenerate) return;
    setPdfLoading(action);
    setPdfError(null);
    try {
      const args = { title: "Schedule Conflicts Checklist", contextLabel, branchName, reportPeriod, groups };
      if (action === "preview") await previewScheduleConflictsChecklistPDF(args);
      if (action === "download") await downloadScheduleConflictsChecklistPDF(args);
      if (action === "print") await printScheduleConflictsChecklistPDF(args);
    } catch (err) {
      console.error("Conflicts PDF generation error:", err);
      setPdfError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setPdfLoading(null);
    }
  };

  // Hooks first (modal safety)
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Print Schedule Conflicts</h2>
            <p className="mt-1 text-sm text-[var(--brand-ink)]/70">
              {contextLabel ? <span className="font-semibold">{contextLabel}</span> : null}
              {contextLabel ? " — " : null}
              {summary.total} conflict{summary.total === 1 ? "" : "s"} across{" "}
              {sessionsInScope.length} session{sessionsInScope.length === 1 ? "" : "s"}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--brand-ink)]/80">
              <span className="rounded-full border border-white/12 bg-black/15 px-2 py-0.5">
                HIGH: <span className="font-semibold text-red-300">{summary.high}</span>
              </span>
              <span className="rounded-full border border-white/12 bg-black/15 px-2 py-0.5">
                MED: <span className="font-semibold text-yellow-300">{summary.medium}</span>
              </span>
              <span className="rounded-full border border-white/12 bg-black/15 px-2 py-0.5">
                LOW: <span className="font-semibold text-emerald-300">{summary.low}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--brand-ink)]/80 transition hover:bg-white/10 hover:text-[var(--brand-ink)]"
            aria-label="Close print conflicts modal"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {conflictsInScope.length === 0 && (
          <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            No conflicts found for the current selection.
          </div>
        )}

        {pdfError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {pdfError}
          </div>
        )}
        {excelError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {excelError}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handlePdfAction("preview")}
            disabled={!canGenerate || pdfLoading !== null || excelLoading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfLoading === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Eye className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Preview PDF
          </button>

          <button
            type="button"
            onClick={() => void handleExcelPreview()}
            disabled={!canGenerate || pdfLoading !== null || excelLoading}
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
            type="button"
            onClick={() => void handlePdfAction("download")}
            disabled={!canGenerate || pdfLoading !== null || excelLoading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfLoading === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Download className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Download PDF
          </button>

          <button
            type="button"
            onClick={() => void handlePdfAction("print")}
            disabled={!canGenerate || pdfLoading !== null || excelLoading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfLoading === "print" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Printer className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Print
          </button>
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
                    Preview of the conflicts checklist. Use Download to save the Excel file.
                  </p>
                </div>
                <button
                  onClick={() => setExcelPreviewOpen(false)}
                  className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                  aria-label="Close Excel preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-[var(--brand-ink)]/80">
                  Conflicts:{" "}
                  <span className="font-semibold text-[var(--brand-ink)]">{conflictsInScope.length}</span>
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
                        <th
                          key={h}
                          className="border-b border-[var(--brand-strong)] px-3 py-2 text-left text-xs font-semibold"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-[var(--brand-ink)]">
                    {excelPreviewRows.rows.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white/5" : "bg-transparent"}>
                        {excelPreviewRows.headers.map((h) => (
                          <td key={h} className="border-b border-white/5 px-3 py-2 text-xs align-top">
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

        {/* PDF/Excel Loading Overlay */}
        {(pdfLoading || excelLoading) && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-wait">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-8 shadow-2xl">
              <Loader2 className="h-10 w-10 animate-spin text-yellow-400" />
              <div className="text-sm font-semibold text-[var(--brand-ink)]">
                {excelLoading ? "Preparing Excel..." : "Preparing PDF..."}
              </div>
              <div className="text-xs text-[var(--brand-ink)]/70">
                This can take a few seconds for large schedules.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


