"use client";

import { useState } from "react";
import { X, FileText, Download, Printer, Eye, Loader2 } from "lucide-react";
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

interface GenerateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  branch: Branch | null;
  schedule: Schedule | null;
  sessions: Session[];
}

type ActionType = "preview" | "download" | "print" | null;

export function GenerateScheduleModal({
  isOpen,
  onClose,
  branch,
  schedule,
  sessions,
}: GenerateScheduleModalProps) {
  const [loading, setLoading] = useState<ActionType>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const canGenerate = branch && schedule && sessions.length > 0;

  const handleAction = async (action: ActionType) => {
    if (!branch || !schedule || !action) return;
    
    setLoading(action);
    setError(null);
    
    try {
      switch (action) {
        case "preview":
          await previewSchedulePDF(branch, schedule, sessions);
          break;
        case "download":
          await downloadSchedulePDF(branch, schedule, sessions);
          break;
        case "print":
          await printSchedulePDF(branch, schedule, sessions);
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

        {/* Action Buttons */}
        <div className="space-y-3">
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-3 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}

export default GenerateScheduleModal;