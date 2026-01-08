"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Building2, Calendar, HelpCircle, RotateCcw, ChevronDown, Printer, Layers3, X } from "lucide-react";
import { GenerateScheduleModal } from "@/components/schedule-report";
import { logError } from "@/lib/error-logger";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SessionsTab, Session } from "./sessions-tab";

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshPopoverOpen, setRefreshPopoverOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [scheduleDropdownOpen, setScheduleDropdownOpen] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [programGroups, setProgramGroups] = useState<ProgramGroup[]>([]);
  const [selectedProgramGroupId, setSelectedProgramGroupId] = useState<string>("");
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sessionsForPrint, setSessionsForPrint] = useState<Session[]>([]);
  const [gridSessions, setGridSessions] = useState<Session[]>([]);
  const [gridCriteria, setGridCriteria] = useState<string[]>([]);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>("");
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [branchOrgLabel, setBranchOrgLabel] = useState<string>("");
  const [branchAllianceName, setBranchAllianceName] = useState<string>("");
  const [branchAssociationName, setBranchAssociationName] = useState<string>("");

  const toTitleCase = (value: string | null | undefined): string | null => {
    if (!value) return null;
    return value
      .split(" ")
      .filter(Boolean)
      .map((word) => {
        const upper = word.toUpperCase();
        // Preserve YMCA acronym (and plural with lowercase s)
        if (upper === "YMCA") return "YMCA";
        if (upper === "YMCAS") return "YMCAs";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  };

  const selectedProgramGroup = programGroups.find((g) => g.id === selectedProgramGroupId);

  // Fetch branches
  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/branches");
      if (res.ok) {
        const data = await res.json();
        // API returns array directly, not { branches: [...] }
        const branchList = Array.isArray(data) ? data : (data.branches || []);
        setBranches(branchList);
        // Default to "Eastside Family YMCA" if available, otherwise first branch
        if (branchList.length > 0 && !selectedBranchId) {
          const eastside = branchList.find((b: Branch) => b.name === "Eastside Family YMCA");
          setSelectedBranchId(eastside?.id || branchList[0].id);
        }
      }
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      await logError(
        err instanceof Error ? err : new Error(String(err)),
        "API_ERROR",
        { page: "scheduling", action: "fetchBranches" }
      );
    }
  }, [selectedBranchId]);

  // Fetch enabled program groups for selected branch
  const fetchProgramGroups = useCallback(async () => {
    if (!selectedBranchId) return;
    setLoadingGroups(true);
    try {
      const res = await fetch(`/api/branches/${selectedBranchId}/program-groups`);
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
        { page: "scheduling", action: "fetchProgramGroups", branchId: selectedBranchId }
      );
      setProgramGroups([]);
      setSelectedProgramGroupId("");
    } finally {
      setLoadingGroups(false);
    }
  }, [selectedBranchId]);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranchId) params.set("branch_id", selectedBranchId);
      if (selectedProgramGroupId) params.set("program_group_id", selectedProgramGroupId);
      const res = await fetch(`/api/scheduling/schedules?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
        // Default to first schedule if none selected
        if (data.schedules?.length > 0 && !selectedScheduleId) {
          setSelectedScheduleId(data.schedules[0].id);
        }
      }
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      await logError(
        err instanceof Error ? err : new Error(String(err)),
        "API_ERROR",
        { page: "scheduling", action: "fetchSchedules", branchId: selectedBranchId, params: { programGroupId: selectedProgramGroupId } }
      );
    } finally {
      setLoadingSchedules(false);
    }
  }, [selectedScheduleId, selectedBranchId, selectedProgramGroupId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Fetch Alliance + Association for the selected branch
  useEffect(() => {
    if (!selectedBranchId) {
      setBranchOrgLabel("");
      setBranchAllianceName("");
      setBranchAssociationName("");
      return;
    }

    const loadOrg = async () => {
      try {
        const res = await fetch(`/api/branches/${selectedBranchId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load branch org info");

        const alliance =
          toTitleCase(data.alliance_name) || (data.alliance_code ? String(data.alliance_code).toUpperCase() : null);
        const association =
          toTitleCase(data.association_name) || (data.association_code ? String(data.association_code).toUpperCase() : null);

        if (alliance || association) {
          setBranchOrgLabel(`${alliance ?? "Alliance"} - ${association ?? "Association"}`);
        } else {
          setBranchOrgLabel("");
        }
        setBranchAllianceName(alliance ?? "");
        setBranchAssociationName(association ?? "");
      } catch (err) {
        await logError(
          err instanceof Error ? err : new Error(String(err)),
          "API_ERROR",
          { page: "scheduling", action: "fetchBranchOrg", branchId: selectedBranchId, criticality: "Low" }
        );
        setBranchOrgLabel("");
        setBranchAllianceName("");
        setBranchAssociationName("");
      }
    };

    void loadOrg();
  }, [selectedBranchId]);

  useEffect(() => {
    void fetchProgramGroups();
    // Reset schedule selection when branch changes
    setSelectedScheduleId("");
  }, [fetchProgramGroups, selectedBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

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
  }, [selectedBranchId, selectedScheduleId, selectedProgramGroupId]);

  // Always load sessions for print/reporting (even if grid tab isn't active)
  useEffect(() => {
    const load = async () => {
      if (!selectedBranchId || !selectedScheduleId) return;
      try {
        const url =
          "/api/scheduling/sessions?schedule_id=" +
          selectedScheduleId +
          "&branch_id=" +
          selectedBranchId;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch sessions for print");
        const data = await res.json();
        const loaded = data.sessions || [];
        setSessionsForPrint(loaded);
      } catch (err) {
        await logError(
          err instanceof Error ? err : new Error(String(err)),
          "API_ERROR",
          { page: "scheduling", action: "fetchSessionsForPrint", branchId: selectedBranchId, params: { scheduleId: selectedScheduleId } }
        );
        setSessionsForPrint([]);
      }
    };
    void load();
  }, [selectedBranchId, selectedScheduleId, refreshKey]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Smart Scheduler</h1>
          {/* Print Schedule Button */}
          <button
            onClick={() => setGenerateModalOpen(true)}
            disabled={!selectedBranch || !selectedSchedule}
            className="btn-pill flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print Schedule
          </button>
          {/* Refresh Button */}
          <Popover open={!isRefreshDisabled && refreshPopoverOpen} onOpenChange={() => {}}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={handleRefresh}
                onMouseEnter={() => !isRefreshDisabled && setRefreshPopoverOpen(true)}
                onMouseLeave={() => setRefreshPopoverOpen(false)}
                disabled={isRefreshDisabled}
                aria-label="Refresh data"
                className={`btn-pill inline-flex h-8 w-8 items-center justify-center shadow-sm ring-1 ring-black/10 transition ${
                  isRefreshDisabled
                    ? "cursor-not-allowed bg-gray-400/50 text-gray-500"
                    : "bg-[var(--cta)] text-[var(--cta-foreground)] hover:-translate-y-0.5 hover:shadow-md active:translate-y-px active:scale-[0.98]"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="pointer-events-none w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
            >
              <PopoverArrow
                width={12}
                height={8}
                className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
              />
              {getRefreshMessage()}
            </PopoverContent>
          </Popover>
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
        {branchOrgLabel && (
          <p className="text-sm text-muted-foreground">{branchOrgLabel}</p>
        )}
      </div>

      {/* Schedule and Branch Selectors */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Branch Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Branch:</label>
          <Popover open={branchDropdownOpen} onOpenChange={setBranchDropdownOpen}>
            <PopoverTrigger asChild>
              <button
                className="btn-pill flex min-w-[220px] items-center justify-between gap-2 border border-white/10 bg-card/60 px-4 py-2 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10"
              >
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {selectedBranch?.name || "Select a branch"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="w-[280px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
            >
              <div className="max-h-[300px] overflow-y-auto">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => {
                      setSelectedBranchId(branch.id);
                      setBranchDropdownOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                      branch.id === selectedBranchId
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-[var(--brand-ink)] hover:bg-[var(--brand-strong)] hover:text-white"
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                    <span>{branch.name}</span>
                  </button>
                ))}
                {branches.length === 0 && (
                  <div className="px-3 py-2 text-sm text-[var(--brand-ink)]/70">
                    No branches found
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

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
          branchId={selectedBranchId}
          programGroupId={selectedProgramGroupId}
          refreshKey={refreshKey}
          onSessionsLoaded={setSessionsForPrint}
          onGridChange={(payload) => {
            setGridSessions(payload.sessions);
            setGridCriteria(payload.criteria);
          }}
          filterDate={selectedDate}
          filterDay={selectedDay}
          filterWeekStart={selectedWeekStart}
          scheduleMonthYear={scheduleMonthYear}
          branchName={selectedBranch?.name}
          scheduleName={selectedSchedule?.name}
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

      {/* Helper Popup */}
      {helperOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
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
                  <li>- Branch: choose a YMCA branch.</li>
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