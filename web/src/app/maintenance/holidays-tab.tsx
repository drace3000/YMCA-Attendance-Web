"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Edit2,
  Plus,
  Search,
  Trash2,
  X,
  ArrowDownToLine,
  FileText,
  Loader2,
} from "lucide-react";
import { useThemeSettings } from "@/components/theme-settings-provider";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";
import { TimePicker } from "@/components/ui/time-picker";
import { GenerateHolidayScheduleModal } from "@/components/holiday-schedule-pdf/GenerateHolidayScheduleModal";
import type { HolidayScheduleReportData, HolidayScheduleRow } from "@/components/holiday-schedule-pdf/HolidaySchedulePDFDocument";
import { toTitleCaseWithYmcaAndOf } from "@/lib/toTitleCaseWithYmcaAndOf";

type Holiday = {
  id: string;
  branch_id: string;
  holiday_date: string; // "YYYY-MM-DD"
  observed_date?: string | null; // "YYYY-MM-DD"
  name: string;
  notes: string | null;
  is_active: boolean;
  is_closed?: boolean;
  closed_start_time?: string | null; // "HH:mm"
  closed_end_time?: string | null; // "HH:mm"
  import_source?: string | null;
  created_at: string;
};

type FormData = {
  holiday_date: string;
  name: string;
  notes: string;
  is_closed: boolean;
  closed_start_time: string; // "" or "HH:mm"
  closed_end_time: string; // "" or "HH:mm"
};

type ImportStatus = {
  loading: boolean;
  error: string | null;
  latestYear: number | null;
  latestYearMissing: boolean;
  upToDate: boolean;
  availableYears: number[];
  missingYears: number[];
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((value ?? "").trim());
}

function isHm(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const hh = Number(v.slice(0, 2));
  const mm = Number(v.slice(3, 5));
  return (
    Number.isFinite(hh) &&
    Number.isFinite(mm) &&
    hh >= 0 &&
    hh <= 23 &&
    mm >= 0 &&
    mm <= 59
  );
}

function normalizeHm(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return v.slice(0, 5);
}

function formatIsoDateMmDdYyyy(value: string | null | undefined): string {
  const v = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const yyyy = v.slice(0, 4);
  const mm = v.slice(5, 7);
  const dd = v.slice(8, 10);
  return `${mm}/${dd}/${yyyy}`;
}

export function HolidaysTab() {
  const { branch } = useThemeSettings();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    loading: true,
    error: null,
    latestYear: null,
    latestYearMissing: false,
    upToDate: true,
    availableYears: [],
    missingYears: [],
  });

  const [branchTimeStart, setBranchTimeStart] = useState<string>("06:00");
  const [branchTimeEnd, setBranchTimeEnd] = useState<string>("23:00");
  const [branchAllianceName, setBranchAllianceName] = useState<string | null>(null);
  const [branchAssociationName, setBranchAssociationName] = useState<string | null>(null);
  const [branchDisplayName, setBranchDisplayName] = useState<string | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [importTooltipOpen, setImportTooltipOpen] = useState(false);
  const [printTooltipOpen, setPrintTooltipOpen] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [importModalStage, setImportModalStage] = useState<"confirm" | "progress" | "result">("confirm");
  const [importModalResult, setImportModalResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    holiday_date: "",
    name: "",
    notes: "",
    is_closed: false,
    closed_start_time: "",
    closed_end_time: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"narrow" | "find" | "smart">("narrow");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("include_inactive", "false");

      const res = await fetch(`/api/maintenance/holidays?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load holidays");
      setHolidays(Array.isArray(data) ? (data as Holiday[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    void loadHolidays();
  }, [loadHolidays]);

  const fetchImportStatus = useCallback(async () => {
    setImportStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      const res = await fetch(`/api/maintenance/holidays/import-us?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // In production, this route is intentionally disabled (404).
        // Keep the button visible but disabled.
        if (res.status === 404) {
          setImportStatus({
            loading: false,
            error: null,
            latestYear: null,
            latestYearMissing: false,
            upToDate: true,
            availableYears: [],
            missingYears: [],
          });
          return;
        }
        throw new Error(json?.error || "Failed to check import status");
      }

      setImportStatus({
        loading: false,
        error: null,
        latestYear: typeof json?.latestYear === "number" ? json.latestYear : null,
        latestYearMissing: json?.latestYearMissing === true,
        upToDate: json?.upToDate === true,
        availableYears: Array.isArray(json?.availableYears) ? (json.availableYears as number[]) : [],
        missingYears: Array.isArray(json?.missingYears) ? (json.missingYears as number[]) : [],
      });
    } catch (e) {
      setImportStatus({
        loading: false,
        error: e instanceof Error ? e.message : "Failed to check import status",
        latestYear: null,
        latestYearMissing: false,
        upToDate: true,
        availableYears: [],
        missingYears: [],
      });
    }
  }, [branch.id]);

  useEffect(() => {
    void fetchImportStatus();
  }, [fetchImportStatus]);

  // Load per-branch time range for picker limits (match Instructor Availability behavior).
  useEffect(() => {
    if (!branch?.id) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/branches/${branch.id}`, { signal: controller.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || controller.signal.aborted) return;
        const start = normalizeHm(String(json?.availability_time_start ?? "06:00"));
        const end = normalizeHm(String(json?.availability_time_end ?? "23:00"));
        setBranchTimeStart(isHm(start) ? start : "06:00");
        setBranchTimeEnd(isHm(end) ? end : "23:00");

        const allianceRaw = typeof json?.alliance_name === "string" ? json.alliance_name.trim() : "";
        const associationRaw = typeof json?.association_name === "string" ? json.association_name.trim() : "";
        const branchRaw = typeof json?.name === "string" ? json.name.trim() : "";
        setBranchAllianceName(toTitleCaseWithYmcaAndOf(allianceRaw));
        setBranchAssociationName(toTitleCaseWithYmcaAndOf(associationRaw));
        setBranchDisplayName(toTitleCaseWithYmcaAndOf(branchRaw) || branch.name || null);
      } catch {
        // ignore; keep defaults
      }
    };
    void load();
    return () => controller.abort();
  }, [branch?.id]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(new Date().getFullYear()));
    for (const y of importStatus.availableYears) {
      years.add(String(y));
    }
    for (const h of holidays) {
      const y = String(h.holiday_date ?? "").slice(0, 4);
      if (/^\d{4}$/.test(y)) years.add(y);
    }
    const list = Array.from(years).sort((a, b) => Number(a) - Number(b));
    return [{ value: "all", label: "All years" }, ...list.map((y) => ({ value: y, label: y }))];
  }, [holidays, importStatus.availableYears]);

  const filteredByYear = useMemo(() => {
    if (selectedYear === "all") return holidays;
    return holidays.filter((h) => String(h.holiday_date ?? "").startsWith(`${selectedYear}-`));
  }, [holidays, selectedYear]);

  const exportYear = selectedYear === "all" ? null : selectedYear;
  const exportRows: HolidayScheduleRow[] = useMemo(() => {
    const base = exportYear ? filteredByYear : [];
    const list = (base ?? []).filter((h) => h.is_active === true);
    return list.map((h) => ({
      holiday_date: String(h.holiday_date),
      observed_date: h.observed_date ? String(h.observed_date).slice(0, 10) : null,
      name: String(h.name),
      notes: h.notes ?? null,
      is_active: !!h.is_active,
      is_closed: !!h.is_closed,
      closed_start_time: h.closed_start_time ? normalizeHm(h.closed_start_time) : null,
      closed_end_time: h.closed_end_time ? normalizeHm(h.closed_end_time) : null,
    }));
  }, [exportYear, filteredByYear]);

  const exportData: HolidayScheduleReportData | null = useMemo(() => {
    if (!exportYear) return null;
    return {
      year: exportYear,
      generatedAtIso: new Date().toISOString(),
      allianceName: branchAllianceName ?? undefined,
      associationName: branchAssociationName ?? undefined,
      branchName: branchDisplayName ?? branch.name ?? undefined,
      holidays: exportRows,
    };
  }, [exportRows, exportYear, branchAllianceName, branchAssociationName, branchDisplayName, branch.name]);

  const openNewForm = () => {
    setEditingId(null);
    const defaultYear = selectedYear !== "all" ? selectedYear : String(new Date().getFullYear());
    setFormData({
      holiday_date: `${defaultYear}-01-01`,
      name: "",
      notes: "",
      is_closed: false,
      closed_start_time: "",
      closed_end_time: "",
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setFormData({
      holiday_date: holiday.holiday_date,
      name: holiday.name,
      notes: holiday.notes ?? "",
      is_closed: !!holiday.is_closed,
      closed_start_time: normalizeHm(holiday.closed_start_time ?? ""),
      closed_end_time: normalizeHm(holiday.closed_end_time ?? ""),
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!formData.holiday_date.trim() || !formData.name.trim()) {
      setFormError("Date and name are required");
      return;
    }

    if (!isIsoDate(formData.holiday_date.trim())) {
      setFormError("Invalid date format");
      return;
    }

    const closedStart = normalizeHm(formData.closed_start_time);
    const closedEnd = normalizeHm(formData.closed_end_time);
    const hasAnyClosedTime = !!closedStart || !!closedEnd;
    if (hasAnyClosedTime && (!isHm(closedStart) || !isHm(closedEnd))) {
      setFormError("Closed start and end time are required when using a time window");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? {
            id: editingId,
            branch_id: branch.id,
            holiday_date: formData.holiday_date.trim(),
            name: formData.name.trim(),
            notes: formData.notes.trim() || null,
            is_closed: formData.is_closed || (hasAnyClosedTime && isHm(closedStart) && isHm(closedEnd)),
            closed_start_time: hasAnyClosedTime ? closedStart : null,
            closed_end_time: hasAnyClosedTime ? closedEnd : null,
          }
        : {
            branch_id: branch.id,
            holiday_date: formData.holiday_date.trim(),
            name: formData.name.trim(),
            notes: formData.notes.trim() || null,
            is_closed: formData.is_closed || (hasAnyClosedTime && isHm(closedStart) && isHm(closedEnd)),
            closed_start_time: hasAnyClosedTime ? closedStart : null,
            closed_end_time: hasAnyClosedTime ? closedEnd : null,
          };

      const res = await fetch("/api/maintenance/holidays", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to save");

      closeForm();
      await loadHolidays();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const importUsFederalHolidays = useCallback(async () => {
    const res = await fetch("/api/maintenance/holidays/import-us", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch_id: branch.id }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to import holidays");

    // Update import status from response if present
    setImportStatus((s) => ({
      ...s,
      loading: false,
      error: null,
      latestYear: typeof json?.latestYear === "number" ? json.latestYear : s.latestYear,
      latestYearMissing: json?.upToDate === true ? false : s.latestYearMissing,
      upToDate: json?.upToDate === true,
      missingYears: Array.isArray(json?.missingYears) ? (json.missingYears as number[]) : s.missingYears,
    }));

    await loadHolidays();
    await fetchImportStatus();
    return json as { insertedCount?: number; alreadyImported?: boolean; missingYears?: number[]; upToDate?: boolean };
  }, [branch.id, fetchImportStatus, loadHolidays]);

  const openConfirmImport = useCallback(() => {
    if (importing) return;
    if (importStatus.loading) return;
    if (!importStatus.latestYearMissing) return;
    if (process.env.NODE_ENV === "production") return;
    setImportModalStage("confirm");
    setImportModalResult(null);
    setConfirmImportOpen(true);
  }, [importStatus.latestYearMissing, importStatus.loading, importing]);

  useEffect(() => {
    if (!confirmImportOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (importing || importModalStage === "progress") return;
      setConfirmImportOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmImportOpen, importModalStage, importing]);

  const handleDelete = async (holiday: Holiday) => {
    if (!confirm("Delete this holiday?")) return;
    try {
      const params = new URLSearchParams({ id: holiday.id });
      const res = await fetch(`/api/maintenance/holidays?${params.toString()}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to delete");
      await loadHolidays();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  // Search/filter logic (match Instructors behavior, but for holiday NAME only)
  const matchesSearch = useCallback((holiday: Holiday, term: string): boolean => {
    if (!term.trim()) return true;
    const t = term.toLowerCase();
    return holiday.name.toLowerCase().includes(t);
  }, []);

  const { displayedHolidays, firstMatchId } = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return { displayedHolidays: filteredByYear, firstMatchId: null as string | null };

    const firstMatch = filteredByYear.find((h) => matchesSearch(h, term));
    const id = firstMatch?.id ?? null;

    // "Find" keeps full list visible but highlights the first match.
    if (searchMode === "find") return { displayedHolidays: filteredByYear, firstMatchId: id };
    const filtered = filteredByYear.filter((h) => matchesSearch(h, term));
    return { displayedHolidays: filtered, firstMatchId: id };
  }, [filteredByYear, searchTerm, searchMode, matchesSearch]);

  useEffect(() => {
    if ((searchMode === "find" || searchMode === "smart") && firstMatchId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [firstMatchId, searchMode]);

  useEffect(() => {
    if (!firstMatchId) return;
    const el = document.getElementById(`holiday-row-${firstMatchId}`);
    if (el) highlightedRowRef.current = el as HTMLTableRowElement;
  }, [firstMatchId]);

  return (
    <div className="space-y-4">
      {confirmImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              if (importing || importModalStage === "progress") return;
              setConfirmImportOpen(false);
            }}
          />

          {/* Modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-us-holidays-title"
            aria-describedby="import-us-holidays-desc"
            className="relative z-10 w-full max-w-md rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-xl backdrop-blur-md"
          >
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-strong)]/30">
                  {importModalStage === "progress" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-yellow-400" />
                  ) : (
                    <ArrowDownToLine className="h-5 w-5 text-yellow-400" />
                  )}
                </div>
                <div>
                  <h2 id="import-us-holidays-title" className="text-lg font-semibold text-[var(--brand-ink)]">
                    Import US Holidays
                  </h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">
                    {importModalStage === "progress"
                      ? "Import in progress…"
                      : importModalStage === "result"
                        ? "Import result"
                        : "Add missing federal holidays to this branch"}
                  </p>
                </div>
              </div>

              {importModalStage !== "progress" && importModalStage !== "result" ? (
                <button
                  type="button"
                  onClick={() => setConfirmImportOpen(false)}
                  disabled={importing}
                  className="rounded-full p-1.5 text-[var(--brand-ink)]/70 transition hover:bg-[var(--brand-strong)] hover:text-white disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              ) : null}
            </div>

            <div id="import-us-holidays-desc" className="space-y-4 text-sm text-[var(--brand-ink)]">
              {importModalStage === "confirm" ? (
                <>
                  <div className="rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
                    <div className="space-y-2">
                      <p className="text-[var(--brand-ink)]/90">
                        This will import <span className="font-semibold">missing years only</span> from the bundled US
                        Federal holidays dataset into the current branch.
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-[var(--brand-ink)]/80">
                        <li>
                          <span className="font-semibold">Branch:</span> {branchDisplayName ?? branch.name}
                        </li>
                        <li>
                          <span className="font-semibold">Existing years will not be duplicated</span>
                        </li>
                        <li>
                          Imported holidays default to <span className="font-semibold">not closed</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {importStatus.missingYears.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--brand-ink)]/70">Missing years:</span>
                      {importStatus.missingYears.map((y) => (
                        <span
                          key={y}
                          className="rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs font-semibold text-foreground"
                        >
                          {y}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : importModalStage === "progress" ? (
                <div className="rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
                  <div className="flex items-start gap-3">
                    <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-yellow-400" />
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--brand-ink)]">Importing holidays…</p>
                      <p className="text-[var(--brand-ink)]/80">Please wait. This may take a few seconds.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-xl border p-4 ${
                    importModalResult?.ok
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-red-500/30 bg-red-500/10"
                  }`}
                >
                  <p className={`font-semibold ${importModalResult?.ok ? "text-emerald-200" : "text-red-200"}`}>
                    {importModalResult?.ok ? "Import complete" : "Import failed"}
                  </p>
                  <p className={`${importModalResult?.ok ? "text-emerald-100/80" : "text-red-100/80"}`}>
                    {importModalResult?.message ?? ""}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              {importModalStage === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmImportOpen(false)}
                    disabled={importing}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setImportModalStage("progress");
                      setImportModalResult(null);
                      setImporting(true);
                      setImportError(null);
                      try {
                        const json = await importUsFederalHolidays();
                        const insertedCount = typeof json?.insertedCount === "number" ? json.insertedCount : 0;
                        const msg =
                          insertedCount > 0
                            ? `Imported ${insertedCount} holiday entries for this branch.`
                            : "No new holiday years were imported for this branch.";
                        setImportModalResult({ ok: true, message: msg });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : "Failed to import holidays";
                        setImportError(msg);
                        setImportModalResult({ ok: false, message: msg });
                      } finally {
                        setImporting(false);
                        setImportModalStage("result");
                      }
                    }}
                    disabled={importing}
                    className="rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    OK
                  </button>
                </>
              ) : importModalStage === "result" ? (
                <button
                  type="button"
                  onClick={() => setConfirmImportOpen(false)}
                  className="rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90"
                >
                  OK
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Holidays</h2>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openNewForm}
              className="flex items-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add Holiday
            </button>

            {(() => {
              const isImportDisabled =
                importing ||
                importStatus.loading ||
                !importStatus.latestYearMissing ||
                process.env.NODE_ENV === "production";

              const importTooltipText =
                process.env.NODE_ENV === "production"
                  ? "Import is available in local development only"
                  : importStatus.loading
                    ? "Checking import status…"
                    : importStatus.latestYearMissing
                      ? "Import US Federal Holidays for this branch"
                      : "Up to date";

              return (
                <Popover open={!isImportDisabled && importTooltipOpen} onOpenChange={() => {}}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={openConfirmImport}
                      disabled={isImportDisabled}
                      onMouseEnter={() => !isImportDisabled && setImportTooltipOpen(true)}
                      onMouseLeave={() => setImportTooltipOpen(false)}
                      onFocus={() => !isImportDisabled && setImportTooltipOpen(true)}
                      onBlur={() => setImportTooltipOpen(false)}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-card/60 px-4 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ArrowDownToLine className="h-4 w-4 text-[var(--cta)]" />
                      {importing ? "Importing…" : "Import US Holidays"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="center"
                    sideOffset={8}
                    className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                  >
                    <PopoverArrow
                      width={12}
                      height={8}
                      className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                    />
                    {importTooltipText}
                  </PopoverContent>
                </Popover>
              );
            })()}

            {process.env.NODE_ENV !== "production" && importStatus.latestYearMissing && importStatus.latestYear ? (
              <span className="text-xs font-semibold text-[var(--cta)]">
                {importStatus.latestYear} is available for loading.
              </span>
            ) : null}

            {(() => {
              const isPrintDisabled = selectedYear === "all" || !exportData;
              const printTooltipText =
                selectedYear === "all" ? "Select a year to print" : `Print ${selectedYear} Holiday Schedule`;

              return (
                <Popover open={!isPrintDisabled && printTooltipOpen} onOpenChange={() => {}}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setExportOpen(true)}
                      disabled={isPrintDisabled}
                      onMouseEnter={() => !isPrintDisabled && setPrintTooltipOpen(true)}
                      onMouseLeave={() => setPrintTooltipOpen(false)}
                      onFocus={() => !isPrintDisabled && setPrintTooltipOpen(true)}
                      onBlur={() => setPrintTooltipOpen(false)}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-card/60 px-4 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FileText className="h-4 w-4 text-[var(--cta)]" />
                      Print {selectedYear === "all" ? "—" : selectedYear} Holiday Schedule
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="center"
                    sideOffset={8}
                    className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                  >
                    <PopoverArrow
                      width={12}
                      height={8}
                      className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                    />
                    {printTooltipText}
                  </PopoverContent>
                </Popover>
              );
            })()}

          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Closed holidays create <span className="font-semibold">warning-only</span> (MEDIUM) conflicts in the Smart Scheduler.
        </p>
      </div>

      {importError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {importError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Year */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Year:</span>
          <PopoverSelect
            value={selectedYear}
            options={yearOptions}
            onChange={(v) => setSelectedYear(v)}
            ariaLabel="Select year"
            className="min-w-[140px]"
            contentClassName="w-[160px]"
          />
        </div>

        {/* Search */}
        <div className="relative z-10 flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            suppressHydrationWarning
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            autoComplete="off"
            className="w-40 rounded-xl border border-white/15 bg-black/20 py-1.5 pl-9 pr-8 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchTerm("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 rounded p-0.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search mode */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Filter Options:</span>
          {[
            {
              id: "narrow" as const,
              label: "Narrow",
              description:
                "Narrows the list to show only holidays matching your search. Non-matching holidays are hidden.",
            },
            {
              id: "find" as const,
              label: "Find",
              description:
                "Finds and scrolls to matching holidays while keeping the full list visible. Matches are highlighted.",
            },
            {
              id: "smart" as const,
              label: "Smart",
              description:
                "Combines both: narrows the list to matches AND highlights the best match for quick identification.",
            },
          ].map((opt) => (
            <Popover key={opt.id} open={popoverOpen === opt.id} onOpenChange={() => {}}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchMode(opt.id);
                    setPopoverOpen(null);
                    searchInputRef.current?.focus();
                  }}
                  onMouseEnter={() => setPopoverOpen(opt.id)}
                  onMouseLeave={() => setPopoverOpen(null)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                    searchMode === opt.id
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : "bg-black/20 text-foreground/70 hover:bg-black/30 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={8}
                className="pointer-events-none w-56 rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                {opt.description}
              </PopoverContent>
            </Popover>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20">
        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Date</th>
                <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Observed On</th>
                <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Name</th>
                <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Closed</th>
                <th className="bg-[rgb(16,37,37)] px-4 py-2 text-left font-semibold">Notes</th>
                <th className="bg-[rgb(16,37,37)] px-4 py-2 text-right font-semibold w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : displayedHolidays.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No holidays found.
                  </td>
                </tr>
              ) : (
                displayedHolidays.map((h) => {
                  // Highlight first match (Find/Smart) like Instructors.
                  // - Find: keep list visible, highlight match
                  // - Smart: filtered list, highlight best match
                  const isHighlighted =
                    !!searchTerm.trim() &&
                    (searchMode === "find" || searchMode === "smart") &&
                    !!firstMatchId &&
                    h.id === firstMatchId;

                  return (
                    <tr
                      key={h.id}
                      id={`holiday-row-${h.id}`}
                      onClick={(e) => {
                        const target = e.target as HTMLElement | null;
                        if (!target) return;
                        // Prevent row-click when interacting with buttons/icons/inputs inside the row.
                        if (target.closest("button, a, input, textarea, select, [role='button']")) return;
                        openEditForm(h);
                      }}
                      className={`border-b border-white/5 ${
                        isHighlighted ? "bg-[var(--brand-strong)]/20" : ""
                      } cursor-pointer hover:bg-[var(--brand-strong)]/10`}
                    >
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {formatIsoDateMmDdYyyy(h.holiday_date) || h.holiday_date}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {h.observed_date ? formatIsoDateMmDdYyyy(h.observed_date) || h.observed_date : "—"}
                    </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span>{h.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {h.is_closed ? (
                          <span className="rounded-full bg-[var(--cta)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--cta)]">
                            {h.closed_start_time && h.closed_end_time
                              ? `Partial ${normalizeHm(h.closed_start_time)}–${normalizeHm(h.closed_end_time)}`
                              : "Closed"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not closed</span>
                        )}
                      </td>
                    <td className="px-4 py-2 text-muted-foreground">{h.notes ?? "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditForm(h)}
                          className="rounded p-1.5 text-blue-300 transition hover:bg-blue-500/20"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(h)}
                          className="rounded p-1.5 text-red-300 transition hover:bg-red-500/20"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-400/40 bg-orange-400/15">
                  <CalendarDays className="h-5 w-5 text-orange-400/90" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">
                    {editingId ? "Edit Holiday" : "Add Holiday"}
                  </h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Branch-scoped holiday warning</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Year</label>
                <PopoverSelect
                  value={
                    isIsoDate(formData.holiday_date) ? formData.holiday_date.slice(0, 4) : (selectedYear !== "all" ? selectedYear : String(new Date().getFullYear()))
                  }
                  options={yearOptions.filter((o) => o.value !== "all")}
                  onChange={(year) => {
                    setFormData((f) => {
                      const current = isIsoDate(f.holiday_date) ? f.holiday_date : `${year}-01-01`;
                      const next = `${year}${current.slice(4)}`;
                      return { ...f, holiday_date: next };
                    });
                  }}
                  ariaLabel="Select holiday year"
                  className="w-full"
                  contentClassName="w-[160px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Date</label>
                <input
                  type="date"
                  value={formData.holiday_date}
                  onChange={(e) => setFormData((f) => ({ ...f, holiday_date: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Christmas Day"
                  className="w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">Notes (optional)</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g., Branch closed"
                  className="w-full rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm ring-1 ring-white/5 focus:outline-none focus:ring-[var(--brand-strong)]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[var(--brand-ink)]">YMCA closed</label>
                {(() => {
                  const start = normalizeHm(formData.closed_start_time);
                  const end = normalizeHm(formData.closed_end_time);
                  const hasWindow = isHm(start) && isHm(end);
                  const checkboxDisabled = hasWindow;

                  return (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm text-[var(--brand-ink)]/90">
                        <input
                          type="checkbox"
                          checked={formData.is_closed || hasWindow}
                          disabled={checkboxDisabled}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setFormData((f) => ({
                              ...f,
                              is_closed: next,
                              // If unchecking, clear any time window to avoid conflicting state.
                              closed_start_time: next ? f.closed_start_time : "",
                              closed_end_time: next ? f.closed_end_time : "",
                            }));
                          }}
                          className="h-4 w-4 accent-[var(--cta)] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        YMCA closed on this day
                        {hasWindow ? (
                          <span className="text-xs text-muted-foreground">(Locked because a closed time window is set)</span>
                        ) : null}
                      </label>

                      {(formData.is_closed || hasWindow) && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">
                              Closed start time (optional)
                            </label>
                            <TimePicker
                              value={normalizeHm(formData.closed_start_time)}
                              onChange={(v) => {
                                setFormData((f) => ({
                                  ...f,
                                  is_closed: true,
                                  closed_start_time: v,
                                }));
                              }}
                              ariaLabel="Closed start time"
                              stepMinutes={15}
                              minTime={branchTimeStart}
                              maxTime={branchTimeEnd}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--brand-ink)]">
                              Closed end time (optional)
                            </label>
                            <TimePicker
                              value={normalizeHm(formData.closed_end_time)}
                              onChange={(v) => {
                                setFormData((f) => ({
                                  ...f,
                                  is_closed: true,
                                  closed_end_time: v,
                                }));
                              }}
                              ariaLabel="Closed end time"
                              stepMinutes={15}
                              minTime={branchTimeStart}
                              maxTime={branchTimeEnd}
                              className="w-full"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <button
                              type="button"
                              onClick={() => setFormData((f) => ({ ...f, closed_start_time: "", closed_end_time: "" }))}
                              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground/80 transition hover:bg-black/30"
                            >
                              Clear closed times
                            </button>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Set a time window for partial closures (e.g., closed in the morning, open in the afternoon).
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <GenerateHolidayScheduleModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        data={
          exportData ?? {
            year: String(new Date().getFullYear()),
            generatedAtIso: new Date().toISOString(),
            allianceName: branchAllianceName ?? undefined,
            associationName: branchAssociationName ?? undefined,
            branchName: branchDisplayName ?? branch.name ?? undefined,
            holidays: [],
          }
        }
        branchId={branch.id}
      />
    </div>
  );
}


