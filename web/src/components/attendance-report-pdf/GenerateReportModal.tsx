"use client";

import { useState, useEffect } from "react";
import { X, FileText, Download, Printer, Eye, Loader2, Mail } from "lucide-react";
import {
  downloadAttendanceReportPDF,
  previewAttendanceReportPDF,
  printAttendanceReportPDF,
  generateAttendanceReportPDFBlob,
} from "@/lib/attendance-report-pdf-utils";
import type { ReportData, FilterInfo, ReportSection } from "./AttendanceReportPDFDocument";
import { EmailPdfModal } from "@/components/email-pdf-modal";

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  saturdayAverages: "Saturday Averages",
  dayTotals: "Day Totals / Day Average",
  sundayAverages: "Sunday Averages",
  monthTotals: "Month Totals",
  monthClassTypeAverage: "Month Class Type Average",
  monthClassGroupAverage: "Month Class Group Average",
  weekTotals: "Week Totals",
};

interface GenerateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ReportData;
  filters: FilterInfo;
  selectedSections: ReportSection[];
  branchId?: string;
  allianceName?: string;
  associationName?: string;
  branchName?: string;
}

type ActionType = "preview" | "download" | "print" | "email" | null;

function formatFilterSummary(filters: FilterInfo): string {
  const parts: string[] = [filters.year];

  if (filters.month !== "all") {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const monthNum = parseInt(filters.month, 10);
    parts.push(monthNames[monthNum - 1] || filters.month);
  } else if (filters.quarter !== "all") {
    parts.push(`Q${filters.quarter}`);
  }

  if (filters.week !== "all") {
    parts.push(`Week ${filters.week}`);
  }

  if (filters.day !== "all") {
    const dayName = filters.day.charAt(0) + filters.day.slice(1).toLowerCase();
    parts.push(dayName);
  }

  return parts.join(" • ");
}

export function GenerateReportModal({
  isOpen,
  onClose,
  data,
  filters,
  selectedSections,
  branchId,
  allianceName,
  associationName,
  branchName,
}: GenerateReportModalProps) {
  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  // Apply wait cursor to body during PDF generation
  useEffect(() => {
    if (loading) {
      document.body.style.cursor = "wait";
    } else {
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, [loading]);

  if (!isOpen) return null;

  const canGenerate = selectedSections.length > 0;

  // Generate filename
  const today = new Date().toISOString().slice(0, 10);
  const fileNameParts = ["Attendance_Report", filters.year];
  if (filters.month !== "all") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthNum = parseInt(filters.month, 10);
    fileNameParts.push(monthNames[monthNum - 1] || filters.month);
  } else if (filters.quarter !== "all") {
    fileNameParts.push(`Q${filters.quarter}`);
  }
  const defaultFileName = `${today}-${fileNameParts.join("_")}.pdf`;

  // Default email content
  const filterSummary = formatFilterSummary(filters);
  const defaultSubject = `Attendance Report - ${filterSummary}`;
  const defaultMessage = `Please find attached the Attendance Report for ${filterSummary}.

This report includes attendance totals, averages by location, and class performance metrics.

Sections included:
${selectedSections.map(s => `• ${REPORT_SECTION_LABELS[s]}`).join("\n")}`;

  const handleAction = async (action: ActionType) => {
    if (!action || selectedSections.length === 0) return;

    setLoading(action);
    setError(null);

    try {
      const context = {
        allianceName,
        associationName,
        branchName,
      };
      switch (action) {
        case "preview":
          await previewAttendanceReportPDF(data, filters, selectedSections, context);
          break;
        case "download":
          await downloadAttendanceReportPDF(data, filters, selectedSections, context);
          break;
        case "print":
          await printAttendanceReportPDF(data, filters, selectedSections, context);
          break;
        case "email":
          const blob = await generateAttendanceReportPDFBlob(
            data,
            filters,
            selectedSections,
            context
          );
          setPdfBlob(blob);
          setEmailModalOpen(true);
          break;
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Smart Scheduler styling */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
              <FileText className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                Export Attendance Insights Report
              </h2>
              <p className="text-sm text-[var(--brand-ink)]/70">
                Create a printable PDF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Report Info */}
        <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
          <div className="space-y-2 text-sm">
            {(allianceName || associationName || branchName) && (
              <div className="space-y-1 border-b border-[var(--brand-strong)]/50 pb-3">
                <div className="grid grid-cols-[110px_1fr] gap-x-3">
                  <span className="text-[var(--brand-ink)]/70">Alliance:</span>
                  <span className="font-medium text-[var(--brand-ink)] break-words">
                    {allianceName ?? "—"}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-x-3">
                  <span className="text-[var(--brand-ink)]/70">Association:</span>
                  <span className="font-medium text-[var(--brand-ink)] break-words">
                    {associationName ?? "—"}
                  </span>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-x-3">
                  <span className="text-[var(--brand-ink)]/70">Branch:</span>
                  <span className="font-medium text-[var(--brand-ink)] break-words">
                    {branchName ?? "—"}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-[110px_1fr] gap-x-3">
              <span className="text-[var(--brand-ink)]/70">Filters:</span>
              <span className="font-medium text-[var(--brand-ink)] break-words">
                {formatFilterSummary(filters)}
              </span>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-x-3">
              <span className="text-[var(--brand-ink)]/70">Reports:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {selectedSections.length} selected
              </span>
            </div>
          </div>

          {/* Selected reports list */}
          {selectedSections.length > 0 && (
            <div className="mt-3 border-t border-[var(--brand-strong)]/50 pt-3">
              <p className="mb-2 text-xs font-medium text-[var(--brand-ink)]/70">
                Included in PDF:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedSections.map((section) => (
                  <span
                    key={section}
                    className="rounded-full bg-[var(--brand-strong)]/40 px-2 py-0.5 text-xs text-[var(--brand-ink)]"
                  >
                    {REPORT_SECTION_LABELS[section]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Warning if no sections selected */}
        {selectedSections.length === 0 && (
          <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            No reports selected. Please check at least one report to include in the PDF.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handleAction("preview")}
            disabled={!canGenerate || loading !== null}
            className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "print" ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <Printer className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
            )}
            Print
          </button>

          {/* Email PDF Button */}
          {branchId && (
            <button
              onClick={() => handleAction("email")}
              disabled={!canGenerate || loading !== null}
              className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "email" ? (
                <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
              ) : (
                <Mail className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
              )}
              Email PDF
            </button>
          )}
        </div>

        {/* Footer note */}
        <p className="mt-4 text-center text-xs text-[var(--brand-ink)]/70">
          PDF will be generated in 8.5 × 11 inch portrait format
        </p>
      </div>

      {/* Email Modal */}
      {branchId && (
        <EmailPdfModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          pdfBlob={pdfBlob}
          defaultSubject={defaultSubject}
          defaultMessage={defaultMessage}
          defaultFileName={defaultFileName}
          branchId={branchId}
        />
      )}

      {/* PDF Generation Loading Overlay */}
      {loading && (
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
                Creating PDF...
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

export default GenerateReportModal;









