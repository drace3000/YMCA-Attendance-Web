"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Loader2, Trash2, Edit2, Check, X, Search, ChevronDown, Users, ArrowUpDown, ArrowUp, ArrowDown, Filter, Download, FileSpreadsheet, Eye, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { logError, getUserErrorMessage } from "@/lib/error-logger";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type Session = {
  id: string;
  branch_id: string;
  schedule_id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  headcount: number | null;
  class: { id: string; name: string } | null;
  location: { id: string; code: string; name: string } | null;
  instructors: { id: string; nickname: string; first_name: string; last_name: string }[];
};

type ClassOption = { id: string; name: string };
type LocationOption = { id: string; code: string; name: string };
type InstructorOption = { id: string; nickname: string; first_name: string; last_name: string };

type SessionsTabProps = {
  scheduleId: string;
  branchId: string;
  refreshKey: number;
  onSessionsLoaded?: (sessions: Session[]) => void;
  filterDate?: string;
  filterWeekStart?: string;
  scheduleMonthYear?: { year: number; month: number } | null;
  branchName?: string;
  scheduleName?: string;
};

type EditFormData = {
  day_of_week: string;
  start_time: string;
  end_time: string;
  class_id: string;
  location_id: string;
  instructor_ids: string[];
  headcount: number | null;
};

const DAY_OPTIONS = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const DAY_ORDER: Record<string, number> = {
  SATURDAY: 0, SUNDAY: 1, MONDAY: 2, TUESDAY: 3, WEDNESDAY: 4, THURSDAY: 5, FRIDAY: 6,
};

type FilterField = "day" | "class" | "location" | "instructor";
type SearchMode = "narrow" | "find" | "smart";
type SortColumn = "class" | "location" | "instructor";
type SortDirection = "asc" | "desc";

export function SessionsTab({ scheduleId, branchId, refreshKey, onSessionsLoaded, filterDate, filterWeekStart, scheduleMonthYear, branchName, scheduleName }: SessionsTabProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    day_of_week: "", start_time: "", end_time: "", class_id: "", location_id: "", instructor_ids: [], headcount: null,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterField, setFilterField] = useState<FilterField>("class");
  const [searchMode, setSearchMode] = useState<SearchMode>("find");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  // Sorting and filtering state
  const [sortOrder, setSortOrder] = useState<{ column: SortColumn; direction: SortDirection }[]>([]);
  const [classFilter, setClassFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [instructorFilter, setInstructorFilter] = useState<string[]>([]);
  const [classFilterOpen, setClassFilterOpen] = useState(false);
  const [locationFilterOpen, setLocationFilterOpen] = useState(false);
  const [instructorFilterOpen, setInstructorFilterOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Dropdown states for edit mode
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [instructorDropdownOpen, setInstructorDropdownOpen] = useState(false);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [classesRes, locationsRes, instructorsRes] = await Promise.all([
        fetch("/api/maintenance/classes"),
        fetch("/api/maintenance/locations"),
        fetch("/api/maintenance/instructors"),
      ]);
      let nextClasses: ClassOption[] = [];
      let nextLocations: LocationOption[] = [];
      let nextInstructors: InstructorOption[] = [];
      if (classesRes.ok) {
        const data = await classesRes.json();
        nextClasses = Array.isArray(data) ? data : (data.classes || []);
        setClasses(nextClasses);
      }
      if (locationsRes.ok) {
        const data = await locationsRes.json();
        nextLocations = Array.isArray(data) ? data : (data.locations || []);
        setLocations(nextLocations);
      }
      if (instructorsRes.ok) {
        const data = await instructorsRes.json();
        nextInstructors = Array.isArray(data) ? data : (data.instructors || []);
        setInstructors(nextInstructors);
      }
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      const errorCode = await logError(
        err instanceof Error ? err : new Error(String(err)),
        "API_ERROR",
        { page: "scheduling/sessions", action: "fetchReferenceData" }
      );
      console.error(`[${errorCode}] Error fetching reference data:`, err);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!scheduleId || !branchId) return;
    setLoading(true);
    setError(null);
    try {
      const url = "/api/scheduling/sessions?schedule_id=" + scheduleId + "&branch_id=" + branchId;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      const loadedSessions = data.sessions || [];
      setSessions(loadedSessions);
      onSessionsLoaded?.(loadedSessions);
    } catch (err) {
      // PRODUCTION ERROR HANDLING - Do not remove
      const errorCode = await logError(
        err instanceof Error ? err : new Error(String(err)),
        "API_ERROR",
        { 
          page: "scheduling/sessions", 
          action: "fetchSessions",
          branchId,
          params: { scheduleId }
        }
      );
      setError(getUserErrorMessage(errorCode));
    } finally {
      setLoading(false);
    }
  }, [scheduleId, branchId, onSessionsLoaded]);

  useEffect(() => { fetchReferenceData(); }, [fetchReferenceData]);
  
  // Clear sessions and refetch when branch or schedule changes
  useEffect(() => {
    setSessions([]); // Clear stale data immediately
    fetchSessions();
  }, [scheduleId, branchId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = (session: Session) => {
    setEditingId(session.id);
    setEditForm({
      day_of_week: session.day_of_week,
      start_time: session.start_time.slice(0, 5),
      end_time: session.end_time.slice(0, 5),
      class_id: session.class_id,
      location_id: session.location_id,
      instructor_ids: session.instructors.map((i) => i.id),
      headcount: session.headcount,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ day_of_week: "", start_time: "", end_time: "", class_id: "", location_id: "", instructor_ids: [], headcount: null });
    setDayDropdownOpen(false);
    setClassDropdownOpen(false);
    setLocationDropdownOpen(false);
    setInstructorDropdownOpen(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/scheduling/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          day_of_week: editForm.day_of_week,
          start_time: editForm.start_time,
          end_time: editForm.end_time,
          class_id: editForm.class_id,
          location_id: editForm.location_id,
          instructor_ids: editForm.instructor_ids,
          headcount: editForm.headcount,
        }),
      });
      if (!res.ok) throw new Error("Failed to update session");
      await fetchSessions();
      handleCancelEdit();
    } catch (err) {
      console.error("Error updating session:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm("Are you sure you want to delete this session?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/scheduling/sessions?id=" + sessionId, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete session");
      await fetchSessions();
    } catch (err) {
      console.error("Error deleting session:", err);
    } finally {
      setSaving(false);
    }
  };

  const formatInstructors = (list: Session["instructors"]) => {
    if (!list || list.length === 0) return "-";
    return list.map((i) => i.nickname || (i.first_name + " " + i.last_name).trim()).join(", ");
  };

  const formatLocation = (loc: Session["location"]) => {
    if (!loc) return "-";
    return loc.code + " - " + loc.name;
  };

  // Unique values for column filters
  const uniqueClassValues = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.class?.name) set.add(s.class.name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const uniqueLocationValues = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const loc = formatLocation(s.location);
      if (loc && loc !== "-") set.add(loc);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const uniqueInstructorValues = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      s.instructors.forEach((i) => {
        const name = i.nickname || `${i.first_name} ${i.last_name}`.trim();
        if (name) set.add(name);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  // Fuzzy match helper for Smart mode
  const fuzzyMatch = useCallback((text: string, pattern: string): boolean => {
    if (!pattern) return true;
    let patternIdx = 0;
    for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
      if (text[i] === pattern[patternIdx]) patternIdx++;
    }
    return patternIdx === pattern.length;
  }, []);

  const getSortDirection = (column: SortColumn): SortDirection | null => {
    const entry = sortOrder.find((s) => s.column === column);
    return entry ? entry.direction : null;
  };

  const toggleSort = (column: SortColumn) => {
    setSortOrder((prev) => {
      const current = prev.find((s) => s.column === column);
      let nextDirection: SortDirection | null = null;
      if (!current) nextDirection = "asc";
      else if (current.direction === "asc") nextDirection = "desc";
      else nextDirection = null; // cycle back to none
      if (!nextDirection) return []; // no sort
      return [{ column, direction: nextDirection }]; // single-column sort only
    });
  };

  const toggleFilterValue = (value: string, selected: string[], setter: (vals: string[]) => void) => {
    if (!value) return;
    if (selected.includes(value)) setter(selected.filter((v) => v !== value));
    else setter([...selected, value]);
  };

  const setAllFilters = (values: string[], setter: (vals: string[]) => void) => {
    setter(values);
  };

  const unselectAllFilters = (setter: (vals: string[]) => void) => {
    setter(["__NONE__"]); // Special marker that won't match any real value
  };

  const clearFilters = (setter: (vals: string[]) => void) => {
    setter([]);
  };

  const clearSortAndFilters = () => {
    setSortOrder([]);
    setClassFilter([]);
    setLocationFilter([]);
    setInstructorFilter([]);
  };

  const filteredSessions = useMemo(() => {
    let result = sessions;

    // Column filters (unique-value style)
    if (classFilter.length > 0) {
      result = result.filter((s) => (s.class?.name ? classFilter.includes(s.class.name) : false));
    }
    if (locationFilter.length > 0) {
      result = result.filter((s) => {
        const loc = formatLocation(s.location);
        return loc !== "-" && locationFilter.includes(loc);
      });
    }
    if (instructorFilter.length > 0) {
      result = result.filter((s) =>
        s.instructors.some((i) => {
          const name = i.nickname || `${i.first_name} ${i.last_name}`.trim();
          return instructorFilter.includes(name);
        }),
      );
    }

    // Week filter
    if (filterWeekStart && scheduleMonthYear) {
      const weekStartDate = new Date(filterWeekStart + "T00:00:00");
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6); // Friday (6 days after Saturday)

      const weekStartStr = filterWeekStart;
      const weekEndStr = weekEndDate.toISOString().split("T")[0];

      result = result.filter((s) => {
        if (s.session_date < weekStartStr || s.session_date > weekEndStr) return false;
        const [sYear, sMonth] = s.session_date.split("-").map(Number);
        return sYear === scheduleMonthYear.year && sMonth === scheduleMonthYear.month;
      });
    }

    // Date filter
    if (filterDate) {
      result = result.filter((s) => s.session_date === filterDate);
    }

    // Search filter
    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase();
    return result.filter((s) => {
      let value = "";
      switch (filterField) {
        case "day": value = s.day_of_week.toLowerCase(); break;
        case "class": value = (s.class?.name || "").toLowerCase(); break;
        case "location": value = formatLocation(s.location).toLowerCase(); break;
        case "instructor": value = formatInstructors(s.instructors).toLowerCase(); break;
      }
      switch (searchMode) {
        case "narrow": return value === term;
        case "find": return value.includes(term);
        case "smart": return fuzzyMatch(value, term);
        default: return value.includes(term);
      }
    });
  }, [
    sessions,
    searchTerm,
    filterField,
    searchMode,
    fuzzyMatch,
    filterDate,
    filterWeekStart,
    scheduleMonthYear,
    classFilter,
    locationFilter,
    instructorFilter,
  ]);

  const sortedSessions = useMemo(() => {
    const activeSort = sortOrder[0] || null;
    return [...filteredSessions].sort((a, b) => {
      // 1) User-selected single-column sort (if any)
      if (activeSort) {
        if (activeSort.column === "class") {
          const aVal = a.class?.name || "";
          const bVal = b.class?.name || "";
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return activeSort.direction === "asc" ? cmp : -cmp;
        } else if (activeSort.column === "location") {
          const aVal = formatLocation(a.location);
          const bVal = formatLocation(b.location);
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return activeSort.direction === "asc" ? cmp : -cmp;
        } else if (activeSort.column === "instructor") {
          const aVal = formatInstructors(a.instructors);
          const bVal = formatInstructors(b.instructors);
          const cmp = aVal.localeCompare(bVal);
          if (cmp !== 0) return activeSort.direction === "asc" ? cmp : -cmp;
        }
      }

      // 2) Default ordering fallback: Day -> Date -> Start Time
      const dayDiff = (DAY_ORDER[a.day_of_week] ?? 99) - (DAY_ORDER[b.day_of_week] ?? 99);
      if (dayDiff !== 0) return dayDiff;
      const dateDiff = a.session_date.localeCompare(b.session_date);
      if (dateDiff !== 0) return dateDiff;
      return a.start_time.localeCompare(b.start_time);
    });
  }, [filteredSessions, sortOrder]);

  const generateExcelFilename = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    
    // Format branch name (replace spaces with underscores)
    const branchPart = branchName ? branchName.replace(/\s+/g, "_") : "Schedule";
    
    // Format schedule name (e.g., "December 2025")
    const schedulePart = scheduleName ? scheduleName.replace(/\s+/g, "_") : "";
    
    return `${dateStr}.${timeStr}.${branchPart}_Schedule${schedulePart ? "_" + schedulePart : ""}.xlsx`;
  };

  const getFilterCriteria = () => {
    const criteria: string[] = [];
    
    // Check if any filters are applied
    const hasWeekFilter = !!filterWeekStart;
    const hasDateFilter = !!filterDate;
    const hasSearchFilter = !!searchTerm.trim();
    const hasClassFilter = classFilter.length > 0 && !classFilter.includes("__NONE__");
    const hasLocationFilter = locationFilter.length > 0 && !locationFilter.includes("__NONE__");
    const hasInstructorFilter = instructorFilter.length > 0 && !instructorFilter.includes("__NONE__");
    
    const isFiltered = hasWeekFilter || hasDateFilter || hasSearchFilter || hasClassFilter || hasLocationFilter || hasInstructorFilter;
    
    // Add data scope indicator
    if (isFiltered) {
      criteria.push("⚠ PARTIAL SCHEDULE (Filtered)");
    } else {
      criteria.push("✓ FULL SCHEDULE");
    }
    
    // Branch and Schedule
    if (branchName) criteria.push(`Branch: ${branchName}`);
    if (scheduleName) criteria.push(`Schedule: ${scheduleName}`);
    
    // Week filter
    if (hasWeekFilter) {
      const satDate = new Date(filterWeekStart + "T00:00:00");
      const friDate = new Date(satDate);
      friDate.setDate(satDate.getDate() + 6);
      const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      criteria.push(`Week: SAT ${formatDate(satDate)} to FRI ${formatDate(friDate)}`);
    }
    
    // Date filter
    if (hasDateFilter) criteria.push(`Date: ${filterDate}`);
    
    // Search filter
    if (hasSearchFilter) criteria.push(`Search (${filterField}): "${searchTerm}" [${searchMode}]`);
    
    // Column filters
    if (hasClassFilter) {
      criteria.push(`Class Filter: ${classFilter.join(", ")}`);
    }
    if (hasLocationFilter) {
      criteria.push(`Location Filter: ${locationFilter.join(", ")}`);
    }
    if (hasInstructorFilter) {
      criteria.push(`Instructor Filter: ${instructorFilter.join(", ")}`);
    }
    
    // Sort order
    const activeSort = sortOrder[0];
    if (activeSort) {
      criteria.push(`Sort: ${activeSort.column} (${activeSort.direction === "asc" ? "ascending" : "descending"})`);
    } else {
      criteria.push("Sort: Default (Day → Date → Start Time)");
    }
    
    return criteria;
  };

  const getExcelWorkbook = () => {
    const filterCriteria = getFilterCriteria();
    const title = `${branchName || "Schedule"} - ${scheduleName || "Export"}`;
    
    // Calculate unique instructors
    const uniqueInstructorIds = new Set<string>();
    sortedSessions.forEach((session) => {
      session.instructors.forEach((inst) => {
        uniqueInstructorIds.add(inst.id);
      });
    });
    const totalUniqueInstructors = uniqueInstructorIds.size;
    
    // Create header rows with title on left and criteria on right
    const headerRows: Record<string, string | number>[] = [
      { Day: title, Headcount: "DATA CONTEXT:" },
      { Day: `Total Sessions: ${sortedSessions.length}`, Headcount: filterCriteria[0] || "" },
      { Day: `Total Unique Instructors: ${totalUniqueInstructors}`, Headcount: filterCriteria[1] || "" },
      { Day: `Generated: ${new Date().toLocaleString()}`, Headcount: filterCriteria[2] || "" },
    ];

    // Add remaining criteria rows
    for (let i = 3; i < filterCriteria.length; i++) {
      headerRows.push({ Day: "", Headcount: filterCriteria[i] });
    }
    
    // Add empty row before data
    headerRows.push({});

    // Prepare data for export
    const exportData = sortedSessions.map((session) => ({
      Day: session.day_of_week,
      Date: session.session_date,
      Start: session.start_time.slice(0, 5),
      End: session.end_time.slice(0, 5),
      Class: session.class?.name || "-",
      Location: formatLocation(session.location),
      "Instructor(s)": formatInstructors(session.instructors),
      Headcount: session.headcount ?? "-",
    }));

    // Combine header rows with data
    const exportDataWithHeader = [
      ...headerRows,
      ...exportData,
    ];

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(exportDataWithHeader);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");

    // Auto-size columns
    const colWidths = [
      { wch: 14 }, // Day
      { wch: 12 }, // Date
      { wch: 8 },  // Start
      { wch: 8 },  // End
      { wch: 20 }, // Class
      { wch: 25 }, // Location
      { wch: 25 }, // Instructor(s)
      { wch: 50 }, // Headcount (wider to accommodate criteria text on right)
    ];
    ws["!cols"] = colWidths;

    return wb;
  };

  const handleExcelDownload = () => {
    const wb = getExcelWorkbook();
    const filename = generateExcelFilename();
    XLSX.writeFile(wb, filename);
  };

  const handleExcelPreview = () => {
    // For preview, we'll open the data in a new window as HTML table
    const exportData = sortedSessions.map((session) => ({
      Day: session.day_of_week,
      Date: session.session_date,
      Start: session.start_time.slice(0, 5),
      End: session.end_time.slice(0, 5),
      Class: session.class?.name || "-",
      Location: formatLocation(session.location),
      "Instructor(s)": formatInstructors(session.instructors),
      Headcount: session.headcount ?? "-",
    }));

    const headers = ["Day", "Date", "Start", "End", "Class", "Location", "Instructor(s)", "Headcount"];
    const title = `${branchName || "Schedule"} - ${scheduleName || "Export"}`;
    const filterCriteria = getFilterCriteria();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .header-left h1 { color: #333; margin: 0 0 10px 0; }
          .header-left .info { color: #666; font-size: 14px; }
          .header-right { text-align: right; background-color: #f8f9fa; padding: 12px 15px; border-radius: 8px; border: 1px solid #ddd; max-width: 400px; }
          .header-right h3 { margin: 0 0 8px 0; color: #0d9488; font-size: 12px; font-weight: bold; }
          .header-right ul { margin: 0; padding: 0; list-style: none; }
          .header-right li { color: #666; font-size: 11px; margin-bottom: 3px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #0d9488; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
          tr:hover { background-color: #ddd; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>${title}</h1>
            <div class="info">Total Sessions: ${exportData.length} | Unique Instructors: ${new Set(sortedSessions.flatMap(s => s.instructors.map(i => i.id))).size} | Generated: ${new Date().toLocaleString()}</div>
          </div>
          <div class="header-right">
            <h3>DATA CONTEXT</h3>
            <ul>
              ${filterCriteria.map(c => `<li>${c}</li>`).join("")}
            </ul>
          </div>
        </div>
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${exportData.map(row => `<tr>${headers.map(h => `<td>${row[h as keyof typeof row]}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.write(html);
      previewWindow.document.close();
    }
  };

  const handleExcelPrint = () => {
    // Preview first, then trigger print
    const exportData = sortedSessions.map((session) => ({
      Day: session.day_of_week,
      Date: session.session_date,
      Start: session.start_time.slice(0, 5),
      End: session.end_time.slice(0, 5),
      Class: session.class?.name || "-",
      Location: formatLocation(session.location),
      "Instructor(s)": formatInstructors(session.instructors),
      Headcount: session.headcount ?? "-",
    }));

    const headers = ["Day", "Date", "Start", "End", "Class", "Location", "Instructor(s)", "Headcount"];
    const title = `${branchName || "Schedule"} - ${scheduleName || "Export"}`;
    const filterCriteria = getFilterCriteria();
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
          .header-left h1 { color: #333; margin: 0 0 10px 0; }
          .header-left .info { color: #666; font-size: 14px; }
          .header-right { text-align: right; background-color: #f8f9fa; padding: 12px 15px; border-radius: 8px; border: 1px solid #ddd; max-width: 400px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .header-right h3 { margin: 0 0 8px 0; color: #0d9488; font-size: 12px; font-weight: bold; }
          .header-right ul { margin: 0; padding: 0; list-style: none; }
          .header-right li { color: #666; font-size: 11px; margin-bottom: 3px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #0d9488; color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tr:nth-child(even) { background-color: #f2f2f2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @media print {
            th { background-color: #0d9488 !important; color: white !important; }
            tr:nth-child(even) { background-color: #f2f2f2 !important; }
            .header-right { background-color: #f8f9fa !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>${title}</h1>
            <div class="info">Total Sessions: ${exportData.length} | Unique Instructors: ${new Set(sortedSessions.flatMap(s => s.instructors.map(i => i.id))).size} | Generated: ${new Date().toLocaleString()}</div>
          </div>
          <div class="header-right">
            <h3>DATA CONTEXT</h3>
            <ul>
              ${filterCriteria.map(c => `<li>${c}</li>`).join("")}
            </ul>
          </div>
        </div>
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${exportData.map(row => `<tr>${headers.map(h => `<td>${row[h as keyof typeof row]}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const toggleInstructor = (id: string) => {
    setEditForm((prev) => ({
      ...prev,
      instructor_ids: prev.instructor_ids.includes(id)
        ? prev.instructor_ids.filter((x) => x !== id)
        : [...prev.instructor_ids, id],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">Error: {error}</div>;
  }

  if (!scheduleId) {
    return <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"><p>Please select a schedule (month) to view sessions.</p></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative z-10 flex items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSearchMode("narrow"); }}
            placeholder="Search..."
            autoComplete="off"
            className="h-9 w-48 rounded-lg border border-white/10 bg-black/20 pl-9 pr-8 text-sm placeholder:text-muted-foreground focus:border-[var(--brand-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
              className="absolute right-2 rounded p-0.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Field Radio Buttons */}
        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
          {(["day", "class", "location", "instructor"] as FilterField[]).map((field) => (
            <label key={field} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="filterField"
                value={field}
                checked={filterField === field}
                onChange={() => { setFilterField(field); searchInputRef.current?.focus(); }}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--cta)]"
              />
              <span className="text-sm">{field.toUpperCase()}</span>
            </label>
          ))}
        </div>

        {/* Search Mode Filter Options */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Filter Options:</span>
          {([
            { id: "narrow" as const, label: "Narrow", getDescription: (field: string) => `Exact match: Shows only sessions where ${field} exactly matches your search term.` },
            { id: "find" as const, label: "Find", getDescription: (field: string) => `Contains match: Shows sessions where ${field} contains your search term anywhere in the text.` },
            { id: "smart" as const, label: "Smart", getDescription: (field: string) => `Fuzzy match: Finds ${field} values even with partial or out-of-order characters (e.g., "bpmp" finds "BODYPUMP").` },
          ]).map((option) => (
            <Popover
              key={option.id}
              open={popoverOpen === option.id}
              onOpenChange={() => {}}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchMode(option.id);
                    setPopoverOpen(null);
                    searchInputRef.current?.focus();
                  }}
                  onMouseEnter={() => setPopoverOpen(option.id)}
                  onMouseLeave={() => setPopoverOpen(null)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                    searchMode === option.id
                      ? "bg-[var(--brand)] text-white shadow-sm"
                      : "bg-black/20 text-foreground/70 hover:bg-black/30 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={8}
                className="pointer-events-none w-64 rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                {option.getDescription(filterField.toUpperCase())}
              </PopoverContent>
            </Popover>
          ))}
        </div>

        {/* Session Count */}
        <div className="ml-auto text-sm text-muted-foreground">
          {sortedSessions.length} of {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </div>
        <button
          type="button"
          onClick={clearSortAndFilters}
          className="rounded border border-white/10 px-3 py-1 text-xs text-foreground transition hover:bg-white/10"
        >
          Clear sort/filter
        </button>
        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          disabled={sortedSessions.length === 0}
          className="flex items-center gap-1.5 rounded border border-white/10 bg-green-600 px-3 py-1 text-xs text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export to Excel
        </button>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Saving...
          </div>
        )}
      </div>

      <div ref={tableContainerRef} className="max-h-[600px] overflow-auto rounded-xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--brand-strong)]">
            <tr className="border-b border-white/10">
              <th className="px-3 py-3 text-left font-medium">Day</th>
              <th className="px-3 py-3 text-left font-medium">Date</th>
              <th className="px-3 py-3 text-left font-medium">Start</th>
              <th className="px-3 py-3 text-left font-medium">End</th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="flex items-center gap-2">
                  <span>Class</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("class")}
                    className="rounded p-1 hover:bg-white/10"
                    title="Sort Class"
                  >
                    {getSortDirection("class") === "asc" ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : getSortDirection("class") === "desc" ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4" />
                    )}
                  </button>
                  <Popover open={classFilterOpen} onOpenChange={setClassFilterOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-white/10"
                        title="Filter Class"
                      >
                        <Filter className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={4}
                      className="w-[220px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 text-xs text-[var(--brand-ink)]">
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => setAllFilters(uniqueClassValues, setClassFilter)}
                        >
                          Select All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => unselectAllFilters(setClassFilter)}
                        >
                          Unselect All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => clearFilters(setClassFilter)}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto text-sm text-[var(--brand-ink)]">
                        {uniqueClassValues.length === 0 && (
                          <div className="px-2 py-1 text-[var(--brand-ink)]/70">No values</div>
                        )}
                        {uniqueClassValues.map((val) => (
                          <label key={val} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white">
                            <input
                              type="checkbox"
                              checked={classFilter.length === 0 ? true : classFilter.includes(val)}
                              onChange={() => toggleFilterValue(val, classFilter, setClassFilter)}
                              className="h-4 w-4 rounded border-gray-300 bg-green-500 text-green-600 accent-green-500"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="flex items-center gap-2">
                  <span>Location</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("location")}
                    className="rounded p-1 hover:bg-white/10"
                    title="Sort Location"
                  >
                    {getSortDirection("location") === "asc" ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : getSortDirection("location") === "desc" ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4" />
                    )}
                  </button>
                  <Popover open={locationFilterOpen} onOpenChange={setLocationFilterOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-white/10"
                        title="Filter Location"
                      >
                        <Filter className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={4}
                      className="w-[240px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 text-xs text-[var(--brand-ink)]">
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => setAllFilters(uniqueLocationValues, setLocationFilter)}
                        >
                          Select All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => unselectAllFilters(setLocationFilter)}
                        >
                          Unselect All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => clearFilters(setLocationFilter)}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto text-sm text-[var(--brand-ink)]">
                        {uniqueLocationValues.length === 0 && (
                          <div className="px-2 py-1 text-[var(--brand-ink)]/70">No values</div>
                        )}
                        {uniqueLocationValues.map((val) => (
                          <label key={val} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white">
                            <input
                              type="checkbox"
                              checked={locationFilter.length === 0 ? true : locationFilter.includes(val)}
                              onChange={() => toggleFilterValue(val, locationFilter, setLocationFilter)}
                              className="h-4 w-4 rounded border-gray-300 bg-green-500 text-green-600 accent-green-500"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium">
                <div className="flex items-center gap-2">
                  <span>Instructor(s)</span>
                  <button
                    type="button"
                    onClick={() => toggleSort("instructor")}
                    className="rounded p-1 hover:bg-white/10"
                    title="Sort Instructor"
                  >
                    {getSortDirection("instructor") === "asc" ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : getSortDirection("instructor") === "desc" ? (
                      <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4" />
                    )}
                  </button>
                  <Popover open={instructorFilterOpen} onOpenChange={setInstructorFilterOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-white/10"
                        title="Filter Instructor"
                      >
                        <Filter className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      sideOffset={4}
                      className="w-[240px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-2 shadow-xl backdrop-blur-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 text-xs text-[var(--brand-ink)]">
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => setAllFilters(uniqueInstructorValues, setInstructorFilter)}
                        >
                          Select All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => unselectAllFilters(setInstructorFilter)}
                        >
                          Unselect All
                        </button>
                        <button
                          className="rounded px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white"
                          onClick={() => clearFilters(setInstructorFilter)}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto text-sm text-[var(--brand-ink)]">
                        {uniqueInstructorValues.length === 0 && (
                          <div className="px-2 py-1 text-[var(--brand-ink)]/70">No values</div>
                        )}
                        {uniqueInstructorValues.map((val) => (
                          <label key={val} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--brand-strong)] hover:text-white">
                            <input
                              type="checkbox"
                              checked={instructorFilter.length === 0 ? true : instructorFilter.includes(val)}
                              onChange={() => toggleFilterValue(val, instructorFilter, setInstructorFilter)}
                              className="h-4 w-4 rounded border-gray-300 bg-green-500 text-green-600 accent-green-500"
                            />
                            <span className="truncate">{val}</span>
                          </label>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </th>
              <th className="px-3 py-3 text-center font-medium">HC</th>
              <th className="px-3 py-3 text-center font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSessions.map((session, idx) =>
              editingId === session.id ? (
                <tr key={session.id} className="border-b border-[var(--brand-strong)]/50 bg-[var(--brand-strong)]/20">
                  {/* Day Dropdown */}
                  <td className="px-2 py-2">
                    <Popover open={dayDropdownOpen} onOpenChange={setDayDropdownOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10">
                          <span>{editForm.day_of_week ? editForm.day_of_week.slice(0, 3) : "Day"}</span>
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-[120px] rounded-xl border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md">
                        <div className="max-h-[200px] overflow-y-auto">
                          {DAY_OPTIONS.map((d) => (
                            <button
                              key={d}
                              onClick={() => { setEditForm((f) => ({ ...f, day_of_week: d })); setDayDropdownOpen(false); }}
                              className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm transition ${d === editForm.day_of_week ? "bg-[var(--cta)] text-[var(--cta-foreground)]" : "hover:bg-white/10"}`}
                            >
                              {d.slice(0, 3)}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </td>
                  {/* Date (read-only) */}
                  <td className="px-3 py-2 text-muted-foreground">{session.session_date}</td>
                  {/* Start Time */}
                  <td className="px-2 py-2">
                    <input type="time" value={editForm.start_time} onChange={(e) => setEditForm((f) => ({ ...f, start_time: e.target.value }))} className="w-full rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card focus:outline-none focus:ring-[var(--brand-strong)]" />
                  </td>
                  {/* End Time */}
                  <td className="px-2 py-2">
                    <input type="time" value={editForm.end_time} onChange={(e) => setEditForm((f) => ({ ...f, end_time: e.target.value }))} className="w-full rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card focus:outline-none focus:ring-[var(--brand-strong)]" />
                  </td>
                  {/* Class Dropdown */}
                  <td className="px-2 py-2">
                    <Popover open={classDropdownOpen} onOpenChange={setClassDropdownOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10">
                          <span className="truncate">{classes.find((c) => c.id === editForm.class_id)?.name || "Select class"}</span>
                          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-[200px] rounded-xl border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md">
                        <div className="max-h-[250px] overflow-y-auto">
                          {classes.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setEditForm((f) => ({ ...f, class_id: c.id })); setClassDropdownOpen(false); }}
                              className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm transition ${c.id === editForm.class_id ? "bg-[var(--cta)] text-[var(--cta-foreground)]" : "hover:bg-white/10"}`}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </td>
                  {/* Location Dropdown */}
                  <td className="px-2 py-2">
                    <Popover open={locationDropdownOpen} onOpenChange={setLocationDropdownOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10">
                          <span className="truncate">{locations.find((l) => l.id === editForm.location_id) ? `${locations.find((l) => l.id === editForm.location_id)?.code}` : "Location"}</span>
                          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-[220px] rounded-xl border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md">
                        <div className="max-h-[250px] overflow-y-auto">
                          {locations.map((l) => (
                            <button
                              key={l.id}
                              onClick={() => { setEditForm((f) => ({ ...f, location_id: l.id })); setLocationDropdownOpen(false); }}
                              className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm transition ${l.id === editForm.location_id ? "bg-[var(--cta)] text-[var(--cta-foreground)]" : "hover:bg-white/10"}`}
                            >
                              {l.code} - {l.name}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </td>
                  {/* Instructor Dropdown (Multi-select) */}
                  <td className="px-2 py-2">
                    <Popover open={instructorDropdownOpen} onOpenChange={setInstructorDropdownOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card hover:ring-white/10">
                          <span className="flex items-center gap-1 truncate">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {editForm.instructor_ids.length > 0 
                              ? instructors
                                  .filter((i) => editForm.instructor_ids.includes(i.id))
                                  .map((i) => i.nickname || i.first_name)
                                  .join(", ")
                              : "Select"}
                          </span>
                          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-[200px] rounded-xl border border-white/20 bg-black/95 p-1 shadow-xl backdrop-blur-md">
                        <div className="max-h-[250px] overflow-y-auto">
                          {instructors.map((inst) => (
                            <button
                              key={inst.id}
                              onClick={() => toggleInstructor(inst.id)}
                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${editForm.instructor_ids.includes(inst.id) ? "bg-[var(--cta)] text-[var(--cta-foreground)]" : "hover:bg-white/10"}`}
                            >
                              <div className={`flex h-4 w-4 items-center justify-center rounded border ${editForm.instructor_ids.includes(inst.id) ? "border-[var(--cta-foreground)] bg-[var(--cta-foreground)]/20" : "border-white/30"}`}>
                                {editForm.instructor_ids.includes(inst.id) && <Check className="h-3 w-3" />}
                              </div>
                              {inst.nickname || `${inst.first_name} ${inst.last_name}`.trim()}
                            </button>
                          ))}
                          {instructors.length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">No instructors</div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </td>
                  {/* Headcount Input */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      value={editForm.headcount ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, headcount: e.target.value ? parseInt(e.target.value, 10) : null }))}
                      placeholder="-"
                      className="w-16 rounded-lg border border-white/10 bg-card/60 px-2 py-1.5 text-center text-sm shadow-sm ring-1 ring-white/5 transition hover:bg-card focus:outline-none focus:ring-[var(--brand-strong)]"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center gap-1">
                      <button onClick={handleSaveEdit} disabled={saving} className="rounded p-1.5 text-green-400 transition hover:bg-green-500/20" title="Save"><Check className="h-4 w-4" /></button>
                      <button onClick={handleCancelEdit} className="rounded p-1.5 text-gray-400 transition hover:bg-gray-500/20" title="Cancel"><X className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={session.id} className={`border-b border-white/5 transition hover:bg-white/5 ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}`}>
                  <td className="px-3 py-2">{session.day_of_week.slice(0,3)}</td>
                  <td className="px-3 py-2">{session.session_date}</td>
                  <td className="px-3 py-2">{session.start_time.slice(0,5)}</td>
                  <td className="px-3 py-2">{session.end_time.slice(0,5)}</td>
                  <td className="px-3 py-2">{session.class?.name || "-"}</td>
                  <td className="px-3 py-2">{formatLocation(session.location)}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{formatInstructors(session.instructors)}</td>
                  <td className="px-3 py-2 text-center">{session.headcount ?? "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => handleEdit(session)} className="rounded p-1.5 text-blue-400 transition hover:bg-blue-500/20" title="Edit session"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(session.id)} className="rounded p-1.5 text-red-400 transition hover:bg-red-500/20" title="Delete session"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {sortedSessions.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {searchTerm ? "No sessions match your search." : "No sessions found for this schedule."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_OPTIONS.map((day) => {
          const count = sessions.filter((s) => s.day_of_week === day).length;
          return (
            <div key={day} className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
              <div className="text-xs text-muted-foreground">{day.slice(0,3)}</div>
              <div className="text-lg font-semibold">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Export to Excel Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setExportModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600/20">
                  <FileSpreadsheet className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Export to Excel</h2>
                  <p className="text-sm text-[var(--brand-ink)]/70">Preview, download, or print schedule</p>
                </div>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
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
                  <span className="font-medium text-[var(--brand-ink)]">{branchName || "Not selected"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Schedule:</span>
                  <span className="font-medium text-[var(--brand-ink)]">{scheduleName || "Not selected"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Sessions:</span>
                  <span className="font-medium text-[var(--brand-ink)]">{sortedSessions.length} classes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--brand-ink)]/70">Filename:</span>
                  <span className="font-medium text-[var(--brand-ink)] text-xs truncate max-w-[200px]" title={generateExcelFilename()}>
                    {generateExcelFilename()}
                  </span>
                </div>
              </div>
            </div>

            {/* Warning if no sessions */}
            {sortedSessions.length === 0 && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                No sessions found to export. Please adjust your filters.
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => { handleExcelPreview(); }}
                disabled={sortedSessions.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
              
              <button
                onClick={() => { handleExcelDownload(); setExportModalOpen(false); }}
                disabled={sortedSessions.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download Excel
              </button>
              
              <button
                onClick={() => { handleExcelPrint(); }}
                disabled={sortedSessions.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-strong)] bg-[var(--brand-strong)]/30 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] transition hover:bg-[var(--brand-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-center text-xs text-[var(--brand-ink)]/70">
              Export includes currently displayed sessions with active filters
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
