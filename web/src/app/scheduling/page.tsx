"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Calendar, FileText, HelpCircle, RotateCcw, Table, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SessionsTab } from "./sessions-tab";

type TabId = "grid" | "print" | "helper";

type Tab = {
  id: TabId;
  label: string;
  icon: React.ReactNode;
};

type Schedule = {
  id: string;
  name: string;
  month_start: string;
  status: string;
};

type Branch = {
  id: string;
  name: string;
};

const tabs: Tab[] = [
  { id: "print", label: "Print Preview", icon: <FileText className="h-4 w-4" /> },
  { id: "helper", label: "Helper", icon: <HelpCircle className="h-4 w-4" /> },
];

export default function SchedulingPage() {
  const [activeTab, setActiveTab] = useState<TabId>("grid");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshPopoverOpen, setRefreshPopoverOpen] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [scheduleDropdownOpen, setScheduleDropdownOpen] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

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
      console.error("Error fetching branches:", err);
    }
  }, [selectedBranchId]);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const res = await fetch("/api/scheduling/schedules");
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
        // Default to first schedule if none selected
        if (data.schedules?.length > 0 && !selectedScheduleId) {
          setSelectedScheduleId(data.schedules[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching schedules:", err);
    } finally {
      setLoadingSchedules(false);
    }
  }, [selectedScheduleId]);

  useEffect(() => {
    fetchBranches();
    fetchSchedules();
  }, [fetchBranches, fetchSchedules]);

  const handleRefresh = () => {
    if (activeTab !== "helper") {
      setRefreshKey((k) => k + 1);
      setRefreshPopoverOpen(false);
    }
  };

  const getRefreshMessage = () => {
    switch (activeTab) {
      case "grid":
        return "Reload sessions from the database";
      case "print":
        return "Regenerate print preview";
      default:
        return "";
    }
  };

  const isRefreshDisabled = activeTab === "helper";

  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId);
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
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
        </div>
        <p className="text-sm text-muted-foreground">
          Manage class schedules, sessions, and generate printable schedules
        </p>
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
              className="w-[280px] rounded-xl border border-white/10 bg-card p-1 shadow-xl"
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
                        : "hover:bg-white/10"
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                    <span>{branch.name}</span>
                  </button>
                ))}
                {branches.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No branches found
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
                disabled={loadingSchedules}
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
              className="w-[250px] rounded-xl border border-white/10 bg-card p-1 shadow-xl"
            >
              <div className="max-h-[300px] overflow-y-auto">
                {schedules.map((schedule) => (
                  <button
                    key={schedule.id}
                    onClick={() => {
                      setSelectedScheduleId(schedule.id);
                      setScheduleDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                      schedule.id === selectedScheduleId
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "hover:bg-white/10"
                    }`}
                  >
                    <span>{schedule.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        schedule.status === "published"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {schedule.status}
                    </span>
                  </button>
                ))}
                {schedules.length === 0 && !loadingSchedules && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No schedules found
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Sessions Grid (always shown) */}
      <div className="rounded-2xl border border-white/10 bg-card/40 p-6 shadow-lg ring-1 ring-white/5 backdrop-blur-sm">
        {activeTab === "grid" && (
          <SessionsTab
            scheduleId={selectedScheduleId}
            branchId={selectedBranchId}
            refreshKey={refreshKey}
          />
        )}

        {activeTab === "print" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground/50" />
            <div>
              <h2 className="text-xl font-semibold">Print Preview</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                PDF generation matching the Excel wall-poster format will be implemented in Phase 4.
              </p>
            </div>
          </div>
        )}

        {activeTab === "helper" && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <HelpCircle className="h-16 w-16 text-muted-foreground/50" />
            <div>
              <h2 className="text-xl font-semibold">Helper Guide</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Step-by-step instructions for managers will be implemented in Phase 5.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation for Print/Helper */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("grid")}
          className={`btn-pill flex items-center gap-2 px-4 py-2 text-sm font-medium shadow-sm ring-1 transition active:translate-y-px active:scale-[0.98] ${
            activeTab === "grid"
              ? "bg-[var(--cta)] text-[var(--cta-foreground)] ring-black/10"
              : "bg-card/60 text-foreground ring-white/10 hover:bg-card hover:ring-white/20"
          }`}
        >
          <Table className="h-4 w-4" />
          Schedule Grid
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`btn-pill flex items-center gap-2 px-4 py-2 text-sm font-medium shadow-sm ring-1 transition active:translate-y-px active:scale-[0.98] ${
              activeTab === tab.id
                ? "bg-[var(--cta)] text-[var(--cta-foreground)] ring-black/10"
                : "bg-card/60 text-foreground ring-white/10 hover:bg-card hover:ring-white/20"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}