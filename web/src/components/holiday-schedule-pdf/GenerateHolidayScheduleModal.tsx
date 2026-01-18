"use client";

import { useEffect, useMemo, useState } from "react";
import { X, FileText, Download, Printer, Eye, Loader2, Mail } from "lucide-react";

import type { HolidayScheduleReportData } from "@/components/holiday-schedule-pdf/HolidaySchedulePDFDocument";
import {
  downloadHolidaySchedulePDF,
  generateHolidaySchedulePDFBlob,
  previewHolidaySchedulePDF,
  printHolidaySchedulePDF,
} from "@/lib/holiday-schedule-pdf-utils";
import { EmailPdfModal } from "@/components/email-pdf-modal";
import { toTitleCaseWithYmcaAndOf } from "@/lib/toTitleCaseWithYmcaAndOf";

type ActionType = "preview" | "download" | "print" | "email" | null;

export function GenerateHolidayScheduleModal({
  isOpen,
  onClose,
  data,
  branchId,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: HolidayScheduleReportData;
  branchId: string;
}) {
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

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const defaultFileName = useMemo(() => {
    const branchPart = data.branchName ? data.branchName.replace(/\s+/g, "_") : "YMCA";
    return `${today}-${branchPart}_Holiday_Schedule_${data.year}.pdf`;
  }, [data.branchName, data.year, today]);

  const defaultSubject = useMemo(() => {
    return `Holiday Schedule - ${data.year}`;
  }, [data.year]);

  const defaultMessage = useMemo(() => {
    const orgLines = [
      data.allianceName ? `Alliance: ${data.allianceName}` : null,
      data.associationName ? `Association: ${data.associationName}` : null,
      data.branchName ? `Branch: ${data.branchName}` : null,
    ].filter(Boolean);

    return `Please find attached the Holiday Schedule for ${data.year}.

${orgLines.join("\n")}`.trim();
  }, [data.allianceName, data.associationName, data.branchName, data.year]);

  const canGenerate = useMemo(() => {
    return !!branchId && /^\d{4}$/.test(String(data.year ?? "").trim());
  }, [branchId, data.year]);

  const handleAction = async (action: ActionType) => {
    if (!action) return;
    if (!canGenerate) return;

    setLoading(action);
    setError(null);

    try {
      switch (action) {
        case "preview":
          await previewHolidaySchedulePDF(data);
          break;
        case "download":
          await downloadHolidaySchedulePDF(data);
          break;
        case "print":
          await printHolidaySchedulePDF(data);
          break;
        case "email": {
          const blob = await generateHolidaySchedulePDFBlob(data);
          setPdfBlob(blob);
          setEmailModalOpen(true);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setLoading(null);
    }
  };

  if (!isOpen) return null;

  const isDisabled = !canGenerate || loading !== null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal - match established export modal styling */}
        <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
                <FileText className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                  Export Holiday Schedule
                </h2>
                <p className="text-sm text-[var(--brand-ink)]/70">
                  Create a printable PDF
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading !== null}
              className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white transition disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Info */}
          <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
            <div className="space-y-2 text-sm">
              {(data.allianceName || data.associationName || data.branchName) && (
                <div className="space-y-1 border-b border-[var(--brand-strong)]/50 pb-3">
                  <div className="grid grid-cols-[110px_1fr] gap-x-3">
                    <span className="text-[var(--brand-ink)]/70">Alliance:</span>
                    <span className="font-medium text-[var(--brand-ink)] break-words">
                      {toTitleCaseWithYmcaAndOf(data.allianceName) ?? data.allianceName ?? "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-x-3">
                    <span className="text-[var(--brand-ink)]/70">Association:</span>
                    <span className="font-medium text-[var(--brand-ink)] break-words">
                      {toTitleCaseWithYmcaAndOf(data.associationName) ?? data.associationName ?? "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-x-3">
                    <span className="text-[var(--brand-ink)]/70">Branch:</span>
                    <span className="font-medium text-[var(--brand-ink)] break-words">
                      {toTitleCaseWithYmcaAndOf(data.branchName) ?? data.branchName ?? "—"}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[110px_1fr] gap-x-3">
                <span className="text-[var(--brand-ink)]/70">Year:</span>
                <span className="font-medium text-[var(--brand-ink)]">
                  {data.year}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-x-3">
                <span className="text-[var(--brand-ink)]/70">Holidays:</span>
                <span className="font-medium text-[var(--brand-ink)]">
                  {data.holidays?.length ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleAction("preview")}
              disabled={isDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview PDF
            </button>

            <button
              type="button"
              onClick={() => void handleAction("download")}
              disabled={isDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </button>

            <button
              type="button"
              onClick={() => void handleAction("print")}
              disabled={isDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print
            </button>

            <button
              type="button"
              onClick={() => void handleAction("email")}
              disabled={isDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Email Report
            </button>
          </div>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] px-4 py-3 text-sm text-[var(--brand-ink)] shadow-xl">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </div>
            </div>
          )}
        </div>
      </div>

      <EmailPdfModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        pdfBlob={pdfBlob}
        defaultSubject={defaultSubject}
        defaultMessage={defaultMessage}
        defaultFileName={defaultFileName}
        branchId={branchId}
      />
    </>
  );
}


