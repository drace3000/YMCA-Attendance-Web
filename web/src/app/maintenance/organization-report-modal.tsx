"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Eye, Download, Printer, Mail, FileText, Loader2, FileSpreadsheet } from "lucide-react";
import { logError } from "@/lib/error-logger";
import { EmailPdfModal } from "@/components/email-pdf-modal";
import * as XLSX from "xlsx";
import {
  previewHierarchyPDF,
  printHierarchyPDF,
  buildHierarchyExcelWorkbook,
  generateHierarchyPDFBlob,
  type HierarchyReportData,
} from "@/lib/hierarchy-report-utils";

type ReportData = {
  alliances: Array<{
    id: string;
    code: string;
    name: string;
    alliance_type: "state" | "regional";
    headquarters_state_code: string | null;
    is_active: boolean;
  }>;
  associations: Array<{
    id: string;
    code: string;
    name: string;
    short_name: string | null;
    alliance_id: string | null;
    state_code: string;
    region: string | null;
    is_active: boolean;
  }>;
  branches: Array<{
    id: string;
    code: string;
    short_code: string | null;
    name: string;
    short_name: string | null;
    association_id: string;
    address: string | null;
    city: string | null;
    state_code: string | null;
    zip: string | null;
    phone: string | null;
    is_active: boolean;
    is_main_branch: boolean;
  }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  selectedAllianceId: string | null;
  selectedAssociationId: string | null;
  includeInactive?: boolean;
  recipientBranchId: string | null;
};

type ActionType = "preview" | "print" | "email" | null;

function formatNameWithYMCA(name: string): string {
  return name
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ymca") return "YMCA";
      if (lower === "ymcas") return "YMCAs";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function ReportModal({
  open,
  onClose,
  selectedAllianceId,
  selectedAssociationId,
  includeInactive = false,
  recipientBranchId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [actionLoading, setActionLoading] = useState<ActionType>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const excelWorkbookRef = useRef<XLSX.WorkBook | null>(null);

  // Apply wait cursor to body during generation
  useEffect(() => {
    if (actionLoading || excelLoading) {
      document.body.style.cursor = "wait";
    } else {
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, [actionLoading, excelLoading]);

  useEffect(() => {
    if (!open) return;
    if (!selectedAssociationId || !selectedAllianceId) {
      setData(null);
      setError("Please select an Alliance and an Association first.");
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("alliance_id", selectedAllianceId);
        params.set("association_id", selectedAssociationId);
        if (includeInactive) params.set("include_inactive", "true");

        const res = await fetch(`/api/maintenance/hierarchy-report?${params}`);
        if (!res.ok) {
          const details = await res.json().catch(() => ({}));
          throw new Error(details.error ?? "Failed to load hierarchy report data");
        }
        const json = (await res.json()) as ReportData;
        setData(json);
      } catch (e) {
        const errCode = await logError(e as Error, "API_ERROR", {
          module: "maintenance.organization.report",
          action: "fetch",
          criticality: "Medium",
        });
        setError(`Failed to load data (${errCode})`);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, selectedAllianceId, selectedAssociationId, includeInactive]);

  // Recipients are stored per *app branch* (branch_schedule_recipients.branch_id),
  // not per YMCA hierarchy branch (ymca_branches.id).
  const emailBranchId = recipientBranchId;

  const isActionDisabled =
    loading ||
    !data ||
    actionLoading !== null ||
    !selectedAllianceId ||
    !selectedAssociationId;

  const excelFilename = useMemo(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const allianceCode = data?.alliances?.[0]?.code ? data.alliances[0].code.toUpperCase() : "ALLIANCE";
    const assocCode = data?.associations?.[0]?.code ? data.associations[0].code.toUpperCase() : "ASSOCIATION";
    return `${dateStr}.${timeStr}.Org_Hierarchy_${allianceCode}_${assocCode}.xlsx`;
  }, [data?.alliances, data?.associations]);

  const excelPreviewRows = useMemo(() => {
    const headers = ["Name", "Code", "Address", "City", "State", "ZIP", "Phone"] as const;
    const rows =
      (data?.branches ?? [])
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }))
        .map((b) => ({
          Name: b.name ?? "",
          Code: (b.short_code ?? b.code ?? "").toUpperCase(),
          Address: b.address ?? "",
          City: b.city ?? "",
          State: (b.state_code ?? "").toUpperCase(),
          ZIP: b.zip ?? "",
          Phone: b.phone ?? "",
        })) ?? [];

    return { headers, rows };
  }, [data?.branches]);

  const selectedOrgLabel = useMemo(() => {
    const allianceName = data?.alliances?.[0]?.name;
    const associationName = data?.associations?.[0]?.name;
    if (!allianceName || !associationName) return null;
    return `${formatNameWithYMCA(allianceName)} - ${formatNameWithYMCA(associationName)}`;
  }, [data?.alliances, data?.associations]);

  const handleExcelPreview = async (): Promise<void> => {
    if (!data) return;
    setExcelLoading(true);
    setExcelError(null);
    try {
      const wb = buildHierarchyExcelWorkbook(data as HierarchyReportData);
      excelWorkbookRef.current = wb;
      setExcelPreviewOpen(true);
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : "Failed to generate Excel preview");
    } finally {
      setExcelLoading(false);
    }
  };

  const handleExcelDownload = (): void => {
    if (!data) return;
    try {
      const wb = excelWorkbookRef.current ?? buildHierarchyExcelWorkbook(data as HierarchyReportData);
      XLSX.writeFile(wb, excelFilename);
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : "Failed to download Excel file");
    }
  };

  const handleAction = async (action: ActionType) => {
    if (!action || !data) return;

    setActionLoading(action);
    setError(null);

    try {
      switch (action) {
        case "preview":
          await previewHierarchyPDF(data as HierarchyReportData);
          break;
        case "print":
          await printHierarchyPDF(data as HierarchyReportData);
          break;
        case "email":
          if (!emailBranchId) {
            setError("No application branch selected for recipient lookup.");
            break;
          }
          // Generate blob for email + open the same EmailPdfModal used by Attendance Insights
          const blob = await generateHierarchyPDFBlob(data as HierarchyReportData);
          setPdfBlob(blob);
          setEmailModalOpen(true);
          break;
      }
    } catch (e) {
      await logError(e as Error, "CLIENT_ERROR", {
        module: "maintenance.organization.report",
        action: action,
        description: `${action} generation error`,
      });
      setError(`Failed to ${action} report`);
    } finally {
      setActionLoading(null);
    }
  };

  // IMPORTANT: Do not return early before hooks (useMemo/useEffect) are called,
  // otherwise React will detect a hook order change when open toggles.
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Matching Export Attendance Insights styling */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
              <FileText className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                Export Org Hierarchy
              </h2>
              <p className="text-sm text-[var(--brand-ink)]/70">
                Create a printable PDF or Excel report
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

        {/* Loading state */}
        {loading && (
          <div className="mb-6 text-sm text-[var(--brand-ink)]/70">Loading hierarchy…</div>
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

        {data && (
          <>
            {/* Report Info */}
            <div className="mb-6 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xs uppercase text-[var(--brand-ink)]/70">Alliances</div>
                  <div className="text-xl font-semibold text-[var(--brand-ink)]">{data.alliances.length}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-[var(--brand-ink)]/70">Associations</div>
                  <div className="text-xl font-semibold text-[var(--brand-ink)]">{data.associations.length}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-[var(--brand-ink)]/70">Branches</div>
                  <div className="text-xl font-semibold text-[var(--brand-ink)]">{data.branches.length}</div>
                </div>
              </div>
              <div className="mt-3 border-t border-[var(--brand-strong)]/50 pt-3 text-xs text-[var(--brand-ink)]/70">
              Includes active records for the selected{" "}
              {selectedOrgLabel ? (
                <span className="font-semibold text-black">
                  {selectedOrgLabel}
                </span>
              ) : (
                "Alliance / Association"
              )}{" "}
              and associated branches
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => handleAction("preview")}
                disabled={isActionDisabled}
                className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === "preview" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                ) : (
                  <Eye className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                )}
                Preview PDF
              </button>

              <button
                onClick={() => void handleExcelPreview()}
                disabled={isActionDisabled || excelLoading}
                className="group flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {excelLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                )}
                Preview Excel
              </button>

              <button
                onClick={() => handleAction("print")}
                disabled={isActionDisabled}
                className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === "print" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                ) : (
                  <Printer className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                )}
                Print
              </button>

              <button
                onClick={() => handleAction("email")}
                disabled={isActionDisabled || !emailBranchId}
                className="group flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === "email" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                ) : (
                  <Mail className="h-4 w-4 text-yellow-400 transition-transform group-hover:scale-125" />
                )}
                Email Report
              </button>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-center text-xs text-[var(--brand-ink)]/70">
              PDF will be generated in 8.5 × 11 inch portrait format
            </p>
          </>
        )}
      </div>

      {/* Excel Preview Overlay (matches Generate Schedule modal look/feel) */}
      {excelPreviewOpen && data ? (
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
                Rows: <span className="font-semibold text-[var(--brand-ink)]">{data.branches.length}</span>
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
      ) : null}

      {/* PDF Generation Loading Overlay */}
      {(actionLoading || excelLoading) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-wait">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-8 shadow-2xl">
            {/* SMIL-animated SVG spinner */}
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
                {excelLoading ? "Creating Excel..." : "Creating PDF..."}
              </p>
              <p className="mt-1 text-sm text-[var(--brand-ink)]/70">
                This may take a few seconds
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal (same behavior as Attendance Insights modal) */}
      {data && emailBranchId ? (
        <EmailPdfModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          pdfBlob={pdfBlob}
          defaultSubject={`Organization Hierarchy Report - ${data.alliances[0] ? formatNameWithYMCA(data.alliances[0].name) : ""} - ${
            data.associations[0] ? formatNameWithYMCA(data.associations[0].name) : ""
          }`}
          defaultMessage={`Please find attached the Organization Hierarchy report for:\n\n${
            data.alliances[0] ? formatNameWithYMCA(data.alliances[0].name) : ""
          }\n${
            data.associations[0] ? `${data.associations[0].code} - ${formatNameWithYMCA(data.associations[0].name)}` : ""
          }\n\nThis report includes the association's branches and contact information.`}
          defaultFileName={`${new Date().toISOString().slice(0, 10)}-Org_Hierarchy-${
            data.alliances[0]?.code ?? "ALLIANCE"
          }-${data.associations[0]?.code ?? "ASSOCIATION"}.pdf`}
          branchId={emailBranchId}
        />
      ) : null}
    </div>
  );
}
