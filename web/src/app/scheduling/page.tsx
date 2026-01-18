"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Copy,
  HelpCircle,
  Loader2,
  RotateCcw,
  ChevronDown,
  Printer,
  Layers3,
  X,
} from "lucide-react";
import { GenerateScheduleModal } from "@/components/schedule-report";
import { logError } from "@/lib/error-logger";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SessionsTab, Session } from "./sessions-tab";
import { useThemeSettings } from "@/components/theme-settings-provider";

function normalizeHm(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const m = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return fallback;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

type Schedule = {
  id: string;
  name: string;
  month_start: string;
  status: string;
};

type Branch = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website_url?: string;
  schedule_email_from?: string;
  schedule_email_reply_to?: string;
  theme_color?: string;
  branch_manager_name?: string;
  branch_manager_email?: string;
  branch_manager_phone?: string;
  availability_time_start?: string | null;
  availability_time_end?: string | null;
};

type ProgramGroup = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_enabled: boolean;
};

export default function SchedulingPage() {
  const { branch } = useThemeSettings();

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshPopoverOpen, setRefreshPopoverOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [scheduleDropdownOpen, setScheduleDropdownOpen] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [programGroups, setProgramGroups] = useState<ProgramGroup[]>([]);
  const [selectedProgramGroupId, setSelectedProgramGroupId] = useState<string>("");
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sessionsForPrint, setSessionsForPrint] = useState<Session[]>([]);
  const [gridSessions, setGridSessions] = useState<Session[]>([]);
  const [gridCriteria, setGridCriteria] = useState<string[]>([]);
  const [gridConflictSummary, setGridConflictSummary] = useState<{ high: number; medium: number; low: number; total: number } | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [branchAllianceName, setBranchAllianceName] = useState<string>("");
  const [branchAssociationName, setBranchAssociationName] = useState<string>("");
  const [availabilityTimeStart, setAvailabilityTimeStart] = useState<string>("06:00");
  const [availabilityTimeEnd, setAvailabilityTimeEnd] = useState<string>("23:00");

  // Phase 6: Clone most recent schedule → next month
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [clonePreflight, setClonePreflight] = useState<any>(null);
  const [cloneOverride, setCloneOverride] = useState(false);
  const [cloneShowMissing, setCloneShowMissing] = useState(false);
  const [cloneSaving, setCloneSaving] = useState(false);
  const [cloneResult, setCloneResult] = useState<any>(null);

  // Phase 7: Verify → Publish + Email
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishPreflightLoading, setPublishPreflightLoading] = useState(false);
  const [publishPreflightError, setPublishPreflightError] = useState<string | null>(null);
  const [publishPreflightSummary, setPublishPreflightSummary] = useState<any>(null);
  const [publishPreflightConflicts, setPublishPreflightConflicts] = useState<any[] | null>(null);
  const [publishMediumConfirmOpen, setPublishMediumConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishConflicts, setPublishConflicts] = useState<any[] | null>(null);
  const [publishSummary, setPublishSummary] = useState<any>(null);
  const [publishResult, setPublishResult] = useState<any>(null);

  const toTitleCaseWithYmcaAndOf = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const lowerWords = new Set(["of"]);
    return value
      .split(" ")
      .filter(Boolean)
      .map((word, idx) => {
        const upper = word.toUpperCase();
        // Preserve YMCA acronym (and plural with lowercase s)
        if (upper === "YMCA") return "YMCA";
        if (upper === "YMCAS") return "YMCAs";
        const lower = word.toLowerCase();
        if (idx !== 0 && lowerWords.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  };

  const selectedProgramGroup = programGroups.find((g) => g.id === selectedProgramGroupId);

  // Fetch enabled program groups for selected branch
  const fetchProgramGroups = useCallback(async () => {
    if (!branch?.id) return;
    setLoadingGroups(true);
    try {
      const res = await fetch(`/api/branches/${branch.id}/program-groups`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load program groups");
      const allGroups: ProgramGroup[] = Array.isArray(data.groups) ? data.groups : [];
      const enabledGroups = allGroups.filter((g) => g.is_enabled);
      setProgramGroups(enabledGroups);

      // Default to GroupX if enabled, otherwise first enabled group
      if (enabledGroups.length > 0) {
        const groupX = enabledGroups.find((g) => g.code === "GroupX");
        const defaultId = groupX?.id ?? enabledGroups[0].id;
        setSelectedProgramGroupId((prev) => (prev && enabledGroups.some((g) => g.id === prev) ? prev : defaultId));
      } else {
        setSelectedProgramGroupId("");
      }
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      await logError(
        err instanceof Error ? err : new Error(String(err)),
        "API_ERROR",
        { page: "scheduling", action: "fetchProgramGroups", branchId: branch.id }
      );
      setProgramGroups([]);
      setSelectedProgramGroupId("");
    } finally {
      setLoadingGroups(false);
    }
  }, [branch.id]);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const params = new URLSearchParams();
      if (branch?.id) params.set("branch_id", branch.id);
      if (selectedProgramGroupId) params.set("program_group_id", selectedProgramGroupId);
      const res = await fetch(`/api/scheduling/schedules?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
        // Default to first schedule if none selected (or if current selection is no longer valid)
        if (Array.isArray(data.schedules)) {
          setSelectedScheduleId((prev) => {
            if (data.schedules.length === 0) return "";
            if (!prev) return data.schedules[0].id;
            const stillValid = data.schedules.some((s: Schedule) => s.id === prev);
            return stillValid ? prev : data.schedules[0].id;
          });
        } else {
          setSelectedScheduleId("");
        }
      }
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      await logError(
        err instanceof Error ? err : new Error(String(err)),
        "API_ERROR",
        { page: "scheduling", action: "fetchSchedules", branchId: branch.id, params: { programGroupId: selectedProgramGroupId } }
      );
    } finally {
      setLoadingSchedules(false);
    }
  }, [branch.id, selectedProgramGroupId]);

  // Fetch Alliance + Association for the selected branch
  useEffect(() => {
    if (!branch?.id) {
      setBranchAllianceName("");
      setBranchAssociationName("");
      setAvailabilityTimeStart("06:00");
      setAvailabilityTimeEnd("23:00");
      return;
    }

    const loadOrg = async () => {
      try {
        const res = await fetch(`/api/branches/${branch.id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load branch org info");

        const alliance =
          toTitleCaseWithYmcaAndOf(data.alliance_name) || (data.alliance_code ? String(data.alliance_code).toUpperCase() : null);
        const association =
          toTitleCaseWithYmcaAndOf(data.association_name) || (data.association_code ? String(data.association_code).toUpperCase() : null);

        setBranchAllianceName(alliance ?? "");
        setBranchAssociationName(association ?? "");
        setAvailabilityTimeStart(normalizeHm(data.availability_time_start, "06:00"));
        setAvailabilityTimeEnd(normalizeHm(data.availability_time_end, "23:00"));
      } catch (err) {
        await logError(
          err instanceof Error ? err : new Error(String(err)),
          "API_ERROR",
          { page: "scheduling", action: "fetchBranchOrg", branchId: branch.id, criticality: "Low" }
        );
        setBranchAllianceName("");
        setBranchAssociationName("");
        setAvailabilityTimeStart("06:00");
        setAvailabilityTimeEnd("23:00");
      }
    };

    void loadOrg();
  }, [branch.id]);

  useEffect(() => {
    void fetchProgramGroups();
    // Reset schedule selection when branch changes
    setSelectedScheduleId("");
  }, [fetchProgramGroups]);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setRefreshPopoverOpen(false);
  };

  const getRefreshMessage = () => {
    return "Reload sessions from the database";
  };

  const isRefreshDisabled = false;

  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId);
  const selectedBranch = branch as unknown as Branch;

  // Compute unique dates from sessions (sorted ascending)
  const uniqueDates = useMemo(() => {
    const dates = [...new Set(sessionsForPrint.map((s) => s.session_date))];
    return dates.sort((a, b) => a.localeCompare(b));
  }, [sessionsForPrint]);

  const dayOptions = useMemo(() => {
    return [
      { value: "SATURDAY", label: "SAT" },
      { value: "SUNDAY", label: "SUN" },
      { value: "MONDAY", label: "MON" },
      { value: "TUESDAY", label: "TUE" },
      { value: "WEDNESDAY", label: "WED" },
      { value: "THURSDAY", label: "THU" },
      { value: "FRIDAY", label: "FRI" },
    ] as const;
  }, []);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDay) return "";
    return dayOptions.find((d) => d.value === selectedDay)?.label ?? selectedDay;
  }, [dayOptions, selectedDay]);

  // Get schedule month/year for week filtering
  const scheduleMonthYear = useMemo(() => {
    if (!selectedSchedule?.month_start) return null;
    const [year, month] = selectedSchedule.month_start.split("-").map(Number);
    return { year, month };
  }, [selectedSchedule]);

  // Compute week start options (Saturday of each week that has sessions in the schedule month)
  const weekStarts = useMemo(() => {
    if (!scheduleMonthYear) return [];
    const { year, month } = scheduleMonthYear;
    
    // Helper to get the Saturday (week start) for a given date
    const getWeekStartSaturday = (dateStr: string): string => {
      const date = new Date(dateStr + "T00:00:00");
      const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      // Days to subtract to get to Saturday (Sat=0, Sun=1, Mon=2, ..., Fri=6)
      const daysToSubtract = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
      const saturday = new Date(date);
      saturday.setDate(date.getDate() - daysToSubtract);
      return saturday.toISOString().split("T")[0];
    };

    // Filter sessions to only those in the schedule month, then get their week starts
    const weekStartSet = new Set<string>();
    for (const session of sessionsForPrint) {
      const [sYear, sMonth] = session.session_date.split("-").map(Number);
      // Only include sessions within the schedule month
      if (sYear === year && sMonth === month) {
        weekStartSet.add(getWeekStartSaturday(session.session_date));
      }
    }
    
    return [...weekStartSet].sort((a, b) => a.localeCompare(b));
  }, [sessionsForPrint, scheduleMonthYear]);

  // Compute formatted week range label (SAT mm/dd/yyyy to FRI mm/dd/yyyy)
  const weekRangeLabel = useMemo(() => {
    if (!selectedWeekStart) return null;
    const satDate = new Date(selectedWeekStart + "T00:00:00");
    const friDate = new Date(satDate);
    friDate.setDate(satDate.getDate() + 6);
    
    const formatDate = (d: Date) => {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    };
    
    return `SAT ${formatDate(satDate)} to FRI ${formatDate(friDate)}`;
  }, [selectedWeekStart]);

  // Reset date and week filter when branch or schedule changes
  useEffect(() => {
    setSelectedDate("");
    setSelectedWeekStart("");
    // Clear print sessions so print actions are disabled until current selection loads
    setSessionsForPrint([]);
  }, [branch.id, selectedScheduleId, selectedProgramGroupId]);

  // Sessions for reporting/printing are sourced from `SessionsTab` via `onSessionsLoaded`,
  // to avoid double-fetching `/api/scheduling/sessions` (which can be expensive locally).

  const fetchClonePreflight = useCallback(async () => {
    if (!branch?.id || !selectedProgramGroupId) return;
    setCloneLoading(true);
    setCloneError(null);
    setClonePreflight(null);
    setCloneResult(null);
    try {
      const res = await fetch("/api/scheduling/clone/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branch.id, program_group_id: selectedProgramGroupId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load clone preflight");
      setClonePreflight(json);
    } catch (err) {
      await logError(err instanceof Error ? err : new Error(String(err)), "API_ERROR", {
        page: "scheduling",
        action: "clonePreflight",
        branchId: branch.id,
        params: { programGroupId: selectedProgramGroupId },
      });
      setCloneError(err instanceof Error ? err.message : "Failed to load clone preflight");
    } finally {
      setCloneLoading(false);
    }
  }, [branch.id, selectedProgramGroupId]);

  const openClone = async () => {
    setCloneOverride(false);
    setCloneShowMissing(false);
    setCloneError(null);
    setCloneResult(null);
    setCloneOpen(true);
    await fetchClonePreflight();
  };

  const closeClone = () => {
    setCloneOpen(false);
    setCloneOverride(false);
    setCloneShowMissing(false);
    setCloneError(null);
    setClonePreflight(null);
    setCloneResult(null);
    setCloneSaving(false);
  };

  const handleClone = async () => {
    if (!branch?.id || !selectedProgramGroupId) return;
    setCloneSaving(true);
    setCloneError(null);
    setCloneResult(null);
    try {
      const res = await fetch("/api/scheduling/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branch.id,
          program_group_id: selectedProgramGroupId,
          override_missing_headcounts: cloneOverride,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to clone schedule");
      setCloneResult(json);

      const newId = json?.target_schedule?.id as string | undefined;
      if (newId) {
        setSelectedScheduleId(newId);
        // Refresh schedules list + sessions so UI reflects the new month immediately.
        await fetchSchedules();
        handleRefresh();
      }
    } catch (err) {
      await logError(err instanceof Error ? err : new Error(String(err)), "API_ERROR", {
        page: "scheduling",
        action: "cloneSchedule",
        branchId: branch.id,
        params: { programGroupId: selectedProgramGroupId, override_missing_headcounts: cloneOverride },
      });
      setCloneError(err instanceof Error ? err.message : "Failed to clone schedule");
    } finally {
      setCloneSaving(false);
    }
  };

  const runPublishPreflight = useCallback(async () => {
    if (!branch?.id || !selectedScheduleId) return;
    setPublishPreflightLoading(true);
    setPublishPreflightError(null);
    setPublishPreflightSummary(null);
    setPublishPreflightConflicts(null);
    try {
      const res = await fetch("/api/scheduling/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branch.id, schedule_id: selectedScheduleId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to verify conflicts");
      setPublishPreflightSummary(json?.summary ?? null);
      setPublishPreflightConflicts(Array.isArray(json?.conflicts) ? json.conflicts : []);
    } catch (err) {
      await logError(err instanceof Error ? err : new Error(String(err)), "API_ERROR", {
        page: "scheduling",
        action: "publishPreflightVerify",
        branchId: branch.id,
        params: { scheduleId: selectedScheduleId },
      });
      setPublishPreflightError(err instanceof Error ? err.message : "Failed to verify conflicts");
    } finally {
      setPublishPreflightLoading(false);
    }
  }, [branch?.id, selectedScheduleId]);

  const openPublish = () => {
    setPublishError(null);
    setPublishConflicts(null);
    setPublishSummary(null);
    setPublishResult(null);
    setPublishPreflightError(null);
    setPublishPreflightSummary(null);
    setPublishPreflightConflicts(null);
    setPublishMediumConfirmOpen(false);
    setPublishOpen(true);
    void runPublishPreflight();
  };

  const closePublish = () => {
    setPublishOpen(false);
    setPublishLoading(false);
    setPublishError(null);
    setPublishConflicts(null);
    setPublishSummary(null);
    setPublishResult(null);
    setPublishPreflightLoading(false);
    setPublishPreflightError(null);
    setPublishPreflightSummary(null);
    setPublishPreflightConflicts(null);
    setPublishMediumConfirmOpen(false);
  };

  const handlePublish = async () => {
    if (!branch?.id || !selectedScheduleId) return;
    setPublishLoading(true);
    setPublishError(null);
    setPublishConflicts(null);
    setPublishSummary(null);
    setPublishResult(null);
    try {
      const res = await fetch("/api/scheduling/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branch.id, schedule_id: selectedScheduleId }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setPublishError(json?.error || "Cannot publish");
        setPublishSummary(json?.summary ?? null);
        setPublishConflicts(Array.isArray(json?.conflicts) ? json.conflicts : null);
        return;
      }

      if (!res.ok) throw new Error(json?.error || "Failed to publish schedule");

      setPublishResult(json);
      await fetchSchedules();
      handleRefresh();
    } catch (err) {
      await logError(err instanceof Error ? err : new Error(String(err)), "API_ERROR", {
        page: "scheduling",
        action: "publishSchedule",
        branchId: branch.id,
        params: { scheduleId: selectedScheduleId },
      });
      setPublishError(err instanceof Error ? err.message : "Failed to publish schedule");
    } finally {
      setPublishLoading(false);
    }
  };

  const hasPreflightHigh = (publishPreflightSummary?.high ?? 0) > 0;
  const hasPreflightMedium = (publishPreflightSummary?.medium ?? 0) > 0;
  const hasGridHighConflicts = (gridConflictSummary?.high ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 pt-2.5">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Smart Scheduler</h1>
          {/* Print Schedule Button */}
          <button
            onClick={() => setGenerateModalOpen(true)}
            disabled={!branch?.id || !selectedSchedule}
            className="btn-pill flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print Schedule
          </button>
          {/* Clone Next Month Button */}
          <button
            type="button"
            onClick={() => void openClone()}
            disabled={!branch?.id || !selectedProgramGroupId || hasGridHighConflicts}
            className="btn-pill flex items-center gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            title="Clone the most recent schedule for this Branch/Group into the next month"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            Clone Next Month
          </button>
          {/* Publish Button */}
          <button
            type="button"
            onClick={openPublish}
            disabled={!branch?.id || !selectedScheduleId || hasGridHighConflicts}
            className="btn-pill flex items-center gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            title="Verify the full schedule for conflicts, then publish and email instructors"
          >
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Publish
          </button>
          {/* Helper Button (Popup) */}
          <button
            type="button"
            onClick={() => setHelperOpen(true)}
            className="btn-pill inline-flex h-8 w-8 items-center justify-center bg-card/60 text-foreground shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/20"
            aria-label="Open Smart Scheduler help"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage class schedules, sessions, and generate printable schedules
        </p>
      </div>

      {/* Schedule and Branch Selectors */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Group Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Group:</label>
          <Popover open={groupDropdownOpen} onOpenChange={setGroupDropdownOpen}>
            <PopoverTrigger asChild>
              <button
                className="btn-pill flex min-w-[200px] items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                disabled={loadingGroups || programGroups.length === 0}
              >
                <span className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-muted-foreground" />
                  {loadingGroups
                    ? "Loading..."
                    : selectedProgramGroup?.code || "Select a group"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[260px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
            >
              <div className="max-h-[300px] overflow-y-auto">
                {programGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setSelectedProgramGroupId(g.id);
                      setSelectedScheduleId("");
                      setGroupDropdownOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                      g.id === selectedProgramGroupId
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Layers3 className="h-4 w-4" />
                        <span className="font-semibold">{g.name}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px]">
                          {g.code}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs opacity-90">{g.description}</div>
                    </div>
                  </button>
                ))}
                {programGroups.length === 0 && (
                  <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">
                    No groups enabled for this branch. Enable groups in Settings.
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Schedule Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Schedule:</label>
          <Popover open={scheduleDropdownOpen} onOpenChange={setScheduleDropdownOpen}>
            <PopoverTrigger asChild>
              <button
                className="btn-pill flex min-w-[200px] items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                disabled={loadingSchedules || !selectedProgramGroupId}
              >
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {loadingSchedules
                    ? "Loading..."
                    : selectedSchedule?.name || "Select a schedule"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[250px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
            >
              <div className="max-h-[300px] overflow-y-auto">
                {schedules.map((schedule) => {
                  // Determine if this month is current, past, or future
                  // Parse date as local to avoid timezone issues (month_start is "YYYY-MM-DD")
                  const [year, month] = schedule.month_start.split("-").map(Number);
                  const now = new Date();
                  const currentYear = now.getFullYear();
                  const currentMonth = now.getMonth() + 1; // JS months are 0-indexed
                  const isCurrentMonth = year === currentYear && month === currentMonth;
                  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth);
                  const label = isCurrentMonth ? "active" : isPastMonth ? "final" : "upcoming";
                  const labelStyles = isCurrentMonth
                    ? "bg-blue-600 text-white"
                    : isPastMonth
                    ? "bg-gray-600 text-white"
                    : "bg-green-600 text-white";
                  
                  return (
                    <button
                      key={schedule.id}
                      onClick={() => {
                        setSelectedScheduleId(schedule.id);
                        setScheduleDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                        schedule.id === selectedScheduleId
                          ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                          : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                      }`}
                    >
                      <span>{schedule.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${labelStyles}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
                {schedules.length === 0 && !loadingSchedules && (
                  <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">
                    No schedules found
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Week Start Filter Selector */}
        <div className="relative flex items-center gap-2">
          <label className="text-sm font-medium">Week Start:</label>
          <Popover open={weekDropdownOpen} onOpenChange={setWeekDropdownOpen}>
            <PopoverTrigger asChild>
              <button
                className="btn-pill flex min-w-[160px] items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                disabled={weekStarts.length === 0}
              >
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {selectedWeekStart || "All Weeks"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[180px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
            >
              <div className="max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedWeekStart("");
                    setWeekDropdownOpen(false);
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedWeekStart === ""
                      ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                      : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                  }`}
                >
                  All Weeks
                </button>
                {weekStarts.map((weekStart) => (
                  <button
                    key={weekStart}
                    onClick={() => {
                      setSelectedWeekStart(weekStart);
                      setWeekDropdownOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                      weekStart === selectedWeekStart
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                    }`}
                  >
                    {weekStart}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {weekRangeLabel && (
            <span className="absolute -bottom-5 left-0 right-0 text-center text-xs text-muted-foreground">{weekRangeLabel}</span>
          )}
        </div>

        {/* Date Filter Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Date:</label>
          <Popover open={dateDropdownOpen} onOpenChange={setDateDropdownOpen}>
            <PopoverTrigger asChild>
              <button
                className="btn-pill flex min-w-[160px] items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
                disabled={uniqueDates.length === 0}
              >
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {selectedDate || "All Dates"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[180px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
            >
              <div className="max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedDate("");
                    setDateDropdownOpen(false);
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedDate === ""
                      ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                      : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                  }`}
                >
                  All Dates
                </button>
                {uniqueDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => {
                      setSelectedDate(date);
                      setDateDropdownOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                      date === selectedDate
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                    }`}
                  >
                    {date}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Day Filter Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Day:</label>
          <Popover open={dayDropdownOpen} onOpenChange={setDayDropdownOpen}>
            <PopoverTrigger asChild>
              <button
                className="btn-pill flex min-w-[140px] items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
              >
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {selectedDayLabel || "All Days"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[160px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
            >
              <div className="max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedDay("");
                    setDayDropdownOpen(false);
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                    selectedDay === ""
                      ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                      : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                  }`}
                >
                  All Days
                </button>
                {dayOptions.map((day) => (
                  <button
                    key={day.value}
                    onClick={() => {
                      setSelectedDay(day.value);
                      setDayDropdownOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                      day.value === selectedDay
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

      </div>

      {/* Sessions Grid */}
      <div className="rounded-2xl border border-white/10 bg-card/40 p-6 shadow-lg ring-1 ring-white/5 backdrop-blur-sm">
        <SessionsTab
          scheduleId={selectedScheduleId}
          branchId={branch.id}
          programGroupId={selectedProgramGroupId}
          refreshKey={refreshKey}
          onSessionsLoaded={setSessionsForPrint}
          onGridChange={(payload) => {
            setGridSessions(payload.sessions);
            setGridCriteria(payload.criteria);
            setGridConflictSummary(payload.conflictSummary);
          }}
          filterDate={selectedDate}
          filterDay={selectedDay}
          filterWeekStart={selectedWeekStart}
          scheduleMonthYear={scheduleMonthYear}
          branchName={selectedBranch?.name}
          scheduleName={selectedSchedule?.name}
          availabilityTimeStart={availabilityTimeStart}
          availabilityTimeEnd={availabilityTimeEnd}
        />
      </div>

      {/* Generate Schedule Modal */}
      <GenerateScheduleModal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        branch={selectedBranch || null}
        programGroup={selectedProgramGroup || null}
        schedule={selectedSchedule || null}
        sessions={gridSessions}
        criteria={gridCriteria}
        allianceName={branchAllianceName || undefined}
        associationName={branchAssociationName || undefined}
      />

      {/* Clone Modal */}
      {cloneOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeClone} />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Clone Next Month</h2>
                <p className="text-sm text-[var(--brand-ink)]/70">
                  This clones the <span className="font-semibold">most recent</span> schedule for the selected Branch/Group (not the month currently selected in the dropdown).
                </p>
              </div>
              <button
                type="button"
                onClick={closeClone}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                aria-label="Close clone modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {(cloneLoading || cloneSaving) && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground/80">
                <Loader2 className="h-4 w-4 animate-spin" />
                {cloneSaving ? "Cloning schedule..." : "Loading preflight..."}
              </div>
            )}

            {cloneError && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Error: {cloneError}
              </div>
            )}

            {clonePreflight && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/15 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]/80">
                      Source (most recent)
                    </div>
                    <div className="mt-1 text-sm text-[var(--brand-ink)]">
                      <span className="font-semibold">{clonePreflight.source_schedule?.name ?? "—"}</span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--brand-ink)]/70">
                      Month start: <span className="font-mono">{clonePreflight.source_schedule?.month_start ?? "—"}</span>
                      {" · "}
                      Status: <span className="font-mono">{clonePreflight.source_schedule?.status ?? "—"}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/15 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]/80">
                      Target (next month)
                    </div>
                    <div className="mt-1 text-sm text-[var(--brand-ink)]">
                      Month start:{" "}
                      <span className="font-mono font-semibold">
                        {clonePreflight.target_month_start ?? "—"}
                      </span>
                    </div>
                    {clonePreflight.target_exists && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4" />
                        <div className="min-w-0">
                          A schedule already exists for this month.
                          <div className="mt-1">
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() => {
                                const existingId = clonePreflight.existing_target_schedule?.id;
                                if (existingId) setSelectedScheduleId(existingId);
                                closeClone();
                              }}
                            >
                              Open existing schedule
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Headcount gate */}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">
                        Headcount completeness (source schedule)
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Missing headcounts prevent cloning unless you explicitly override.
                      </div>
                    </div>

                    <div className="text-sm text-foreground/90">
                      Missing:{" "}
                      <span className="font-semibold">
                        {clonePreflight.headcount?.missing_count ?? 0}
                      </span>
                      {" / "}
                      {clonePreflight.headcount?.total_sessions ?? 0}
                    </div>
                  </div>

                  {(clonePreflight.headcount?.missing_count ?? 0) > 0 && (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={cloneOverride}
                          onChange={(e) => setCloneOverride(e.target.checked)}
                          className="h-4 w-4 accent-[var(--cta)]"
                        />
                        Override and clone anyway
                      </label>

                      <button
                        type="button"
                        onClick={() => setCloneShowMissing((v) => !v)}
                        className="text-sm underline underline-offset-2 text-foreground/80 hover:text-foreground"
                      >
                        {cloneShowMissing ? "Hide" : "Show"} sessions missing headcount
                      </button>

                      {cloneShowMissing && (
                        <div className="mt-2 max-h-[220px] overflow-auto rounded-xl border border-white/10">
                          <table className="w-full text-xs">
                            <thead className="bg-black/30 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Date</th>
                                <th className="px-3 py-2 text-left font-medium">Day</th>
                                <th className="px-3 py-2 text-left font-medium">Time</th>
                                <th className="px-3 py-2 text-left font-medium">Class</th>
                                <th className="px-3 py-2 text-left font-medium">Loc</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(clonePreflight.headcount?.missing_sessions ?? []).map((s: any) => (
                                <tr key={s.id} className="border-t border-white/5">
                                  <td className="px-3 py-2 font-mono">{s.session_date}</td>
                                  <td className="px-3 py-2">{s.day_of_week}</td>
                                  <td className="px-3 py-2 font-mono">
                                    {s.start_time}–{s.end_time}
                                  </td>
                                  <td className="px-3 py-2">{s.class_name ?? "—"}</td>
                                  <td className="px-3 py-2">{s.location_code ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {cloneResult?.summary && (
                  <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100">
                    <div className="font-semibold">Clone completed.</div>
                    <div className="mt-1 text-xs text-green-100/90">
                      Created {cloneResult.summary.created_sessions} sessions. Skipped{" "}
                      {cloneResult.summary.skipped_missing_occurrence} (no matching weekday occurrence). Dedup skipped{" "}
                      {cloneResult.summary.deduped_skipped}.
                    </div>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeClone}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void fetchClonePreflight()}
                    disabled={cloneLoading || cloneSaving}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Refresh Preflight
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClone()}
                    disabled={
                      cloneLoading ||
                      cloneSaving ||
                      !!clonePreflight.target_exists ||
                      ((clonePreflight.headcount?.missing_count ?? 0) > 0 && !cloneOverride)
                    }
                    className="btn-pill flex items-center justify-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cloneSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Clone
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {publishOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePublish} />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Publish Schedule</h2>
                <p className="text-sm text-[var(--brand-ink)]/70">
                  Publishes the schedule and emails the PDF to instructors who have a valid login/email on file.
                  Publishing is blocked if the schedule has any <span className="font-semibold">HIGH</span> conflicts.
                  If there are <span className="font-semibold">MEDIUM</span> conflicts, you must confirm to proceed.
                </p>
              </div>
              <button
                type="button"
                onClick={closePublish}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                aria-label="Close publish modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/15 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]/80">Target</div>
              <div className="mt-1 text-sm text-[var(--brand-ink)]">
                <span className="font-semibold">{selectedSchedule?.name ?? "—"}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--brand-ink)]/70">
                Schedule ID: <span className="font-mono">{selectedScheduleId || "—"}</span>
              </div>
            </div>

            {publishPreflightLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground/80">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying conflicts...
              </div>
            )}

            {publishPreflightError && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Error: {publishPreflightError}
              </div>
            )}

            {publishPreflightSummary && (
              <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground/80">
                Conflicts summary:{" "}
                <span className="font-semibold text-red-300">{publishPreflightSummary.high ?? 0} HIGH</span>,{" "}
                <span className="font-semibold text-yellow-300">{publishPreflightSummary.medium ?? 0} MEDIUM</span>,{" "}
                <span className="font-semibold">{publishPreflightSummary.low ?? 0} LOW</span>
              </div>
            )}

            {publishPreflightConflicts && publishPreflightConflicts.length > 0 && (
              <div className="mb-4 max-h-[240px] overflow-auto rounded-xl border border-white/10 bg-black/20">
                <table className="w-full text-xs">
                  <thead className="bg-black/30 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Severity</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishPreflightConflicts.map((c, idx) => (
                      <tr key={idx} className="border-t border-white/5">
                        <td className={`px-3 py-2 font-semibold ${c.severity === "HIGH" ? "text-red-300" : c.severity === "MEDIUM" ? "text-yellow-300" : "text-foreground/80"}`}>
                          {c.severity}
                        </td>
                        <td className="px-3 py-2 font-mono text-foreground/80">{c.type}</td>
                        <td className="px-3 py-2 text-foreground/80">{c.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {publishLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground/80">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying conflicts, generating PDF, and sending emails...
              </div>
            )}

            {publishError && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                Error: {publishError}
              </div>
            )}

            {publishSummary && (
              <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground/80">
                Conflicts summary:{" "}
                <span className="font-semibold text-red-300">{publishSummary.high ?? 0} HIGH</span>,{" "}
                <span className="font-semibold text-yellow-300">{publishSummary.medium ?? 0} MEDIUM</span>,{" "}
                <span className="font-semibold">{publishSummary.low ?? 0} LOW</span>
              </div>
            )}

            {publishConflicts && publishConflicts.length > 0 && (
              <div className="mb-4 max-h-[240px] overflow-auto rounded-xl border border-white/10 bg-black/20">
                <table className="w-full text-xs">
                  <thead className="bg-black/30 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Severity</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishConflicts.map((c, idx) => (
                      <tr key={idx} className="border-t border-white/5">
                        <td className={`px-3 py-2 font-semibold ${c.severity === "HIGH" ? "text-red-300" : c.severity === "MEDIUM" ? "text-yellow-300" : "text-foreground/80"}`}>
                          {c.severity}
                        </td>
                        <td className="px-3 py-2 font-mono text-foreground/80">{c.type}</td>
                        <td className="px-3 py-2 text-foreground/80">{c.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {publishResult?.success && (
              <div className="mb-4 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-100">
                <div className="font-semibold">Published successfully.</div>
                <div className="mt-1 text-xs text-green-100/90">
                  Emails attempted: {publishResult.email?.attempted ?? 0}.{" "}
                  {Array.isArray(publishResult.warnings) && publishResult.warnings.length > 0
                    ? `Warning: ${publishResult.warnings.join(" ")}`
                    : ""}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closePublish}
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (publishLoading || publishPreflightLoading) return;
                  if (hasPreflightHigh) return;
                  if (hasPreflightMedium && !publishMediumConfirmOpen) {
                    setPublishMediumConfirmOpen(true);
                    return;
                  }
                  void handlePublish();
                }}
                disabled={publishLoading || publishPreflightLoading || !selectedScheduleId || hasPreflightHigh}
                className="btn-pill flex items-center justify-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishLoading || publishPreflightLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Publish Now
              </button>
            </div>

            {/* MEDIUM confirm inline */}
            {publishMediumConfirmOpen && (
              <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                <div className="font-semibold">MEDIUM conflicts detected.</div>
                <div className="mt-1 text-xs text-yellow-100/90">
                  Click <span className="font-semibold">Confirm Publish</span> to proceed anyway, or Close to cancel.
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPublishMediumConfirmOpen(false)}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-foreground transition hover:bg-black/30"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={publishLoading || publishPreflightLoading || hasPreflightHigh}
                    className="btn-pill flex items-center justify-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirm Publish
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Helper Popup */}
      {helperOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setHelperOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Smart Scheduler — Helper</h2>
                <p className="text-sm text-[var(--brand-ink)]/70">
                  How to select Branch/Group/Schedule, edit sessions, and generate schedules.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHelperOpen(false)}
                className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
                aria-label="Close helper"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-ink)]/90">1) Select your data</h3>
                <ul className="mt-3 space-y-2 text-sm text-[var(--brand-ink)]/90">
                  <li>- Group: defaults to <span className="font-semibold">GroupX</span> when enabled.</li>
                  <li>- Schedule: month schedule for the selected branch + group.</li>
                </ul>
                <p className="mt-3 text-xs text-[var(--brand-ink)]/70">
                  Missing group? Enable in Settings → Program Groups. Create groups in Maintenance → Groups.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-ink)]/90">2) Find sessions</h3>
                <ul className="mt-3 space-y-2 text-sm text-[var(--brand-ink)]/90">
                  <li>- Use Search and Filter Options (Narrow / Find / Smart).</li>
                  <li>- Filter by Day / Class / Location / Instructor.</li>
                  <li>- Use Week Start and Date selectors to narrow results.</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-ink)]/90">3) Edit sessions</h3>
                <ul className="mt-3 space-y-2 text-sm text-[var(--brand-ink)]/90">
                  <li>- Click the pencil icon to edit a row.</li>
                  <li>- Update time, class, location, instructors, headcount.</li>
                  <li>- Save (check) or cancel (X).</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-ink)]/90">4) Export / Print</h3>
                <ul className="mt-3 space-y-2 text-sm text-[var(--brand-ink)]/90">
                  <li>- Export to Excel exports sessions for the current selection.</li>
                  <li>- Print Schedule opens Preview/Download/Print.</li>
                </ul>
                <p className="mt-3 text-xs text-[var(--brand-ink)]/70">
                  Print actions are disabled until sessions for the current selection are loaded.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}