"use client";

import { useState } from "react";
import { X, FileText, Download, Printer, Eye, Loader2 } from "lucide-react";
import {
  downloadAttendanceReportPDF,
  previewAttendanceReportPDF,
  printAttendanceReportPDF,
} from "@/lib/attendance-report-pdf-utils";
import type { ReportData, FilterInfo, ReportSection } from "./AttendanceReportPDFDocument";

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
}

type ActionType = "preview" | "download" | "print" | null;

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
}: GenerateReportModalProps) {
  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const canGenerate = selectedSections.length > 0;

  const handleAction = async (action: ActionType) => {
    if (!action || selectedSections.length === 0) return;

    setLoading(action);
    setError(null);

    try {
      switch (action) {
        case "preview":
          await previewAttendanceReportPDF(data, filters, selectedSections);
          break;
        case "download":
          await downloadAttendanceReportPDF(data, filters, selectedSections);
          break;
        case "print":
          await printAttendanceReportPDF(data, filters, selectedSections);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
              <FileText className="h-5 w-5 text-[var(--brand-ink)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                Export Report
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
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Filters:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {formatFilterSummary(filters)}
              </span>
            </div>
            <div className="flex justify-between">
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
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--cta)] px-4 py-3 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
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
          PDF will be generated in 8.5 × 11 inch portrait format
        </p>
      </div>
    </div>
  );
}

export default GenerateReportModal;



