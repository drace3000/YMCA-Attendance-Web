"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Loader2, Trash2, Edit2, Check, X, Search, ChevronDown, Users } from "lucide-react";
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

export function SessionsTab({ scheduleId, branchId, refreshKey, onSessionsLoaded }: SessionsTabProps) {
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
      if (classesRes.ok) {
        const data = await classesRes.json();
        setClasses(Array.isArray(data) ? data : (data.classes || []));
      }
      if (locationsRes.ok) {
        const data = await locationsRes.json();
        setLocations(Array.isArray(data) ? data : (data.locations || []));
      }
      if (instructorsRes.ok) {
        const data = await instructorsRes.json();
        setInstructors(Array.isArray(data) ? data : (data.instructors || []));
      }
    } catch (err) {
      console.error("Error fetching reference data:", err);
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
      setError(err instanceof Error ? err.message : "An error occurred");
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

  // Fuzzy match helper for Smart mode
  const fuzzyMatch = useCallback((text: string, pattern: string): boolean => {
    if (!pattern) return true;
    let patternIdx = 0;
    for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
      if (text[i] === pattern[patternIdx]) patternIdx++;
    }
    return patternIdx === pattern.length;
  }, []);

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const term = searchTerm.toLowerCase();
    return sessions.filter((s) => {
      let value = "";
      switch (filterField) {
        case "day": value = s.day_of_week.toLowerCase(); break;
        case "class": value = (s.class?.name || "").toLowerCase(); break;
        case "location": value = formatLocation(s.location).toLowerCase(); break;
        case "instructor": value = formatInstructors(s.instructors).toLowerCase(); break;
      }
      // Apply search mode
      switch (searchMode) {
        case "narrow": return value === term;
        case "find": return value.includes(term);
        case "smart": return fuzzyMatch(value, term);
        default: return value.includes(term);
      }
    });
  }, [sessions, searchTerm, filterField, searchMode, fuzzyMatch]);

  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      const dayDiff = (DAY_ORDER[a.day_of_week] ?? 99) - (DAY_ORDER[b.day_of_week] ?? 99);
      if (dayDiff !== 0) return dayDiff;
      return a.start_time.localeCompare(b.start_time);
    });
  }, [filteredSessions]);

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
              <th className="px-3 py-3 text-left font-medium">Start</th>
              <th className="px-3 py-3 text-left font-medium">End</th>
              <th className="px-3 py-3 text-left font-medium">Class</th>
              <th className="px-3 py-3 text-left font-medium">Location</th>
              <th className="px-3 py-3 text-left font-medium">Instructor(s)</th>
              <th className="px-3 py-3 text-left font-medium">Date</th>
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
                  <td className="px-3 py-2 text-muted-foreground">{session.session_date}</td>
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
                  <td className="px-3 py-2">{session.start_time.slice(0,5)}</td>
                  <td className="px-3 py-2">{session.end_time.slice(0,5)}</td>
                  <td className="px-3 py-2">{session.class?.name || "-"}</td>
                  <td className="px-3 py-2">{formatLocation(session.location)}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{formatInstructors(session.instructors)}</td>
                  <td className="px-3 py-2">{session.session_date}</td>
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
    </div>
  );
}
