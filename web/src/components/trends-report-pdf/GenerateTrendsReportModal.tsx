"use client";

import { useState } from "react";
import { X, FileText, Download, Printer, Eye, Loader2 } from "lucide-react";
import {
  downloadTrendsReportPDF,
  previewTrendsReportPDF,
  printTrendsReportPDF,
} from "@/lib/trends-report-pdf-utils";
import type { TrendsReportData } from "./TrendsReportPDFDocument";

interface GenerateTrendsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TrendsReportData;
  chartImages?: {
    trendingUp?: string;
    trendingDown?: string;
  };
}

type ActionType = "preview" | "download" | "print" | null;

export function GenerateTrendsReportModal({
  isOpen,
  onClose,
  data,
  chartImages,
}: GenerateTrendsReportModalProps) {
  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAction = async (action: ActionType) => {
    if (!action) return;

    setLoading(action);
    setError(null);

    try {
      switch (action) {
        case "preview":
          await previewTrendsReportPDF(data, chartImages);
          break;
        case "download":
          await downloadTrendsReportPDF(data, chartImages);
          break;
        case "print":
          await printTrendsReportPDF(data, chartImages);
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

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
              <FileText className="h-5 w-5 text-[var(--brand-ink)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                Export Trends Report
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
              <span className="text-[var(--brand-ink)]/70">Period:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {data.periodLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Year:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {data.year}
              </span>
            </div>
            {data.quarter && (
              <div className="flex justify-between">
                <span className="text-[var(--brand-ink)]/70">Quarter:</span>
                <span className="font-medium text-[var(--brand-ink)]">
                  Q{data.quarter}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--brand-ink)]/70">Date Range:</span>
              <span className="font-medium text-[var(--brand-ink)]">
                {data.periodStart} – {data.periodEnd}
              </span>
            </div>
          </div>

          {/* Content summary */}
          <div className="mt-3 border-t border-[var(--brand-strong)]/50 pt-3">
            <p className="mb-2 text-xs font-medium text-[var(--brand-ink)]/70">
              Included in PDF:
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[var(--brand-strong)]/40 px-2 py-0.5 text-xs text-[var(--brand-ink)]">
                Trending Up Chart
              </span>
              <span className="rounded-full bg-[var(--brand-strong)]/40 px-2 py-0.5 text-xs text-[var(--brand-ink)]">
                Trending Down Chart
              </span>
              <span className="rounded-full bg-[var(--brand-strong)]/40 px-2 py-0.5 text-xs text-[var(--brand-ink)]">
                Trend Tables
              </span>
            </div>
          </div>
        </div>

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
            disabled={loading !== null}
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
            disabled={loading !== null}
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
            disabled={loading !== null}
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

export default GenerateTrendsReportModal;





