import { useEffect, useState } from "react";
import { X, Eye, Download, Printer, Mail, FileSpreadsheet } from "lucide-react";
import { logError } from "@/lib/error-logger";
import {
  previewHierarchyPDF,
  downloadHierarchyPDF,
  printHierarchyPDF,
  downloadHierarchyExcel,
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
};

export function ReportModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [actionLoading, setActionLoading] = useState<"preview" | "download" | "print" | "excel" | "email" | null>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/maintenance/hierarchy-report");
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
  }, [open]);

  if (!open) return null;

  const isActionDisabled = loading || !data || actionLoading !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--brand)]/40 bg-[var(--brand-soft,#013F3A)]/90 shadow-2xl ring-1 ring-white/10 text-white">
        <div className="flex items-start justify-between border-b border-white/15 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              Export Org Hierarchy
            </div>
            <p className="mt-1 text-xs text-white/80">Create a printable PDF or Excel report</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/70 hover:bg-white/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {loading ? <div className="text-sm text-white/80">Loading hierarchy…</div> : null}
          {error ? <div className="rounded-lg border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-100">{error}</div> : null}
          {data ? (
            <>
              <div className="rounded-2xl border border-white/20 bg-white/5 p-4 text-sm">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs uppercase text-white/60">Alliances</div>
                    <div className="text-xl font-semibold">{data.alliances.length}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-white/60">Associations</div>
                    <div className="text-xl font-semibold">{data.associations.length}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-white/60">Branches</div>
                    <div className="text-xl font-semibold">{data.branches.length}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-white/80">
                  Includes active records from the full YMCA hierarchy. Filters and tiered layout match the Organization view.
                </div>
              </div>

              <div className="space-y-2">
                <ActionButton
                  icon={<Eye className="h-4 w-4" />}
                  label="Preview PDF"
                  loading={actionLoading === "preview"}
                  disabled={isActionDisabled}
                  onClick={async () => {
                    setActionLoading("preview");
                    try {
                      await previewHierarchyPDF(data as HierarchyReportData);
                    } catch (e) {
                      await logError(e as Error, "CLIENT_ERROR", {
                        module: "maintenance.organization.report",
                        action: "preview",
                        description: "PDF generation error",
                      });
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                />
                <ActionButton
                  icon={<Download className="h-4 w-4" />}
                  label="Download PDF"
                  loading={actionLoading === "download"}
                  disabled={isActionDisabled}
                  onClick={async () => {
                    setActionLoading("download");
                    try {
                      await downloadHierarchyPDF(data as HierarchyReportData);
                    } catch (e) {
                      await logError(e as Error, "CLIENT_ERROR", {
                        module: "maintenance.organization.report",
                        action: "download",
                        description: "PDF generation error",
                      });
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                />
                <ActionButton
                  icon={<Printer className="h-4 w-4" />}
                  label="Print"
                  loading={actionLoading === "print"}
                  disabled={isActionDisabled}
                  onClick={async () => {
                    setActionLoading("print");
                    try {
                      await printHierarchyPDF(data as HierarchyReportData);
                    } catch (e) {
                      await logError(e as Error, "CLIENT_ERROR", {
                        module: "maintenance.organization.report",
                        action: "print",
                        description: "PDF generation error",
                      });
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                />
                <ActionButton
                  icon={<Download className="h-4 w-4" />}
                  label="Download Excel"
                  loading={actionLoading === "excel"}
                  disabled={isActionDisabled}
                  onClick={async () => {
                    setActionLoading("excel");
                    try {
                      downloadHierarchyExcel(data as HierarchyReportData);
                    } catch (e) {
                      await logError(e as Error, "CLIENT_ERROR", {
                        module: "maintenance.organization.report",
                        action: "excel",
                        description: "Excel generation error",
                      });
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                />
                <ActionButton
                  icon={<Mail className="h-4 w-4" />}
                  label="Email Report"
                  loading={actionLoading === "email"}
                  disabled={true}
                  onClick={() => {
                    // Email functionality not implemented yet
                  }}
                />
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-3 text-xs text-white/85 max-h-56 overflow-auto space-y-2">
                {data.alliances.map((al) => (
                  <div key={al.id}>
                    <div className="font-semibold text-white">
                      {al.code} · {al.name}
                    </div>
                    <div className="ml-3 space-y-1">
                      {data.associations
                        .filter((as) => as.alliance_id === al.id)
                        .map((as) => (
                          <div key={as.id}>
                            <div className="font-semibold text-white/90">
                              {as.code} · {as.name}
                            </div>
                            <div className="ml-3 space-y-1">
                              {data.branches
                                .filter((b) => b.association_id === as.id)
                                .map((b) => (
                                  <div key={b.id} className="flex items-center gap-2 text-white/80">
                                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                      {b.short_code ?? b.code}
                                    </span>
                                    <span>{b.name}</span>
                                    <span className="text-[10px] uppercase">{b.state_code}</span>
                                    <span className="text-[10px]">{b.city}{b.zip ? ` ${b.zip}` : ""}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-center text-[11px] text-white/70">
                PDF generated in 8.5 × 11 in portrait format
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
};

function ActionButton({ icon, label, onClick, loading, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <LoaderStub /> : icon}
      {label}
    </button>
  );
}

function LoaderStub() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}
