"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, FileText, Eye, Printer, Download, Mail, Loader2 } from "lucide-react";

import { EmailPdfModal } from "@/components/email-pdf-modal";
import {
  downloadScheduleCloneExceptionReportPDF,
  generateScheduleCloneExceptionReportPDFBlob,
  previewScheduleCloneExceptionReportPDF,
  printScheduleCloneExceptionReportPDF,
} from "@/lib/schedule-clone-constraints-report-pdf-utils";

type ActionType = "load" | "preview" | "download" | "print" | "email" | null;

type ReportApiRow = {
  id: string;
  source_session_id: string | null;
  target_session_date: string | null;
  target_day_of_week: string | null;
  target_start_time: string | null;
  target_end_time: string | null;
  class: { id: string; name: string | null } | null;
  location: { id: string; code: string | null; name: string | null } | null;
  details: Record<string, unknown>;
};

type ReportApiGroup = {
  event_type: string;
  label: string;
  count: number;
  suggested_resolution: string;
  rows: ReportApiRow[];
};

type ReportApiResponse =
  | { ok: true; title: string; org_line: string; stats: { created_sessions: number; skipped_sessions: number; modified_sessions: number }; groups: ReportApiGroup[] }
  | { error: string };

export function GenerateCloneExceptionReportModal(props: {
  isOpen: boolean;
  onClose: () => void;
  branchId: string | null;
  programGroupId: string | null;
  targetScheduleId: string | null;
}): JSX.Element | null {
  const { isOpen, onClose, branchId, programGroupId, targetScheduleId } = props;

  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);

  const [reportTitle, setReportTitle] = useState<string | null>(null);
  const [orgLine, setOrgLine] = useState<string | null>(null);
  const [stats, setStats] = useState<{ created_sessions: number; skipped_sessions: number; modified_sessions: number } | null>(null);
  const [groups, setGroups] = useState<ReportApiGroup[]>([]);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const canLoad = !!branchId && !!programGroupId && !!targetScheduleId;
  const canGenerate = canLoad && !!reportTitle && !!orgLine && !!stats;

  const defaultFileName = useMemo(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const safeTitle = (reportTitle ?? "Clone_Exception_Report").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `${dateStr}.${timeStr}.${safeTitle}.pdf`;
  }, [reportTitle]);

  const defaultSubject = useMemo(() => {
    return reportTitle ?? "Schedule Exception Report";
  }, [reportTitle]);

  const defaultMessage = useMemo(() => {
    if (!reportTitle || !orgLine || !stats) {
      return "Please find attached the cloning schedule exception report.";
    }
    return [
      `${reportTitle}`,
      `${orgLine}`,
      "",
      `Created sessions: ${stats.created_sessions}`,
      `Skipped sessions: ${stats.skipped_sessions}`,
      `Modified sessions: ${stats.modified_sessions}`,
      "",
      "This report lists situations where constraints were in play during cloning and includes suggested resolutions.",
    ].join("\n");
  }, [reportTitle, orgLine, stats]);

  const loadReport = useCallback(async () => {
    if (!canLoad || !branchId || !programGroupId || !targetScheduleId) return;

    setLoading("load");
    setError(null);
    try {
      const url = `/api/scheduling/clone/constraints-report?branch_id=${encodeURIComponent(branchId)}&program_group_id=${encodeURIComponent(
        programGroupId,
      )}&target_schedule_id=${encodeURIComponent(targetScheduleId)}`;
      const res = await fetch(url);
      const json = (await res.json().catch(() => ({}))) as ReportApiResponse;
      if (!res.ok) throw new Error("error" in json ? json.error : "Failed to load report");
      if (!("ok" in json) || json.ok !== true) throw new Error("error" in json ? json.error : "Failed to load report");

      setReportTitle(json.title);
      setOrgLine(json.org_line);
      setStats(json.stats);
      setGroups(Array.isArray(json.groups) ? json.groups : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setReportTitle(null);
      setOrgLine(null);
      setStats(null);
      setGroups([]);
    } finally {
      setLoading(null);
    }
  }, [branchId, canLoad, programGroupId, targetScheduleId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadReport();
  }, [isOpen, loadReport]);

  const handleClose = () => {
    if (loading) return;
    setEmailModalOpen(false);
    setPdfBlob(null);
    onClose();
  };

  const handleAction = async (action: Exclude<ActionType, "load" | null>) => {
    if (!canGenerate || !reportTitle || !orgLine || !stats) return;
    if (!branchId) return;

    setLoading(action);
    setError(null);
    try {
      const args = { title: reportTitle, orgLine, stats, groups };
      if (action === "preview") await previewScheduleCloneExceptionReportPDF(args);
      if (action === "download") await downloadScheduleCloneExceptionReportPDF(args);
      if (action === "print") await printScheduleCloneExceptionReportPDF(args);
      if (action === "email") {
        const blob = await generateScheduleCloneExceptionReportPDFBlob(args);
        setPdfBlob(blob);
        setEmailModalOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
                <FileText className="h-5 w-5 text-[var(--brand-ink)]" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-[var(--brand-ink)]">Schedule Exception Report</h2>
                <p className="truncate text-sm text-[var(--brand-ink)]/70">{reportTitle ?? "Loading…"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={!!loading}
              className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white transition disabled:opacity-50"
              aria-label="Close exception report modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {loading === "load" && (
            <div className="mb-4 flex items-center gap-2 text-sm text-[var(--brand-ink)]/80">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading report…
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {orgLine && stats && (
            <div className="mb-5 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
              <div className="text-sm font-semibold text-[var(--brand-ink)]">{orgLine}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[var(--brand-ink)]/80">
                <div>
                  Created: <span className="font-semibold text-[var(--brand-ink)]">{stats.created_sessions}</span>
                </div>
                <div>
                  Skipped: <span className="font-semibold text-[var(--brand-ink)]">{stats.skipped_sessions}</span>
                </div>
                <div>
                  Modified: <span className="font-semibold text-[var(--brand-ink)]">{stats.modified_sessions}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => void handleAction("preview")}
              disabled={!canGenerate || !!loading}
              className="btn-pill flex w-full items-center justify-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview PDF
            </button>

            <button
              type="button"
              onClick={() => void handleAction("download")}
              disabled={!canGenerate || !!loading}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                {loading === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleAction("print")}
              disabled={!canGenerate || !!loading}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                {loading === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Print
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleAction("email")}
              disabled={!canGenerate || !!loading}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Email Report
              </span>
            </button>
          </div>
        </div>
      </div>

      {emailModalOpen && branchId && (
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
    </>
  );
}

