"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit2, Plus, Search, X } from "lucide-react";
import { useThemeSettings } from "@/components/theme-settings-provider";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";

type ClassItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  branch_id: string;
  program_group_id: string;
  created_at: string;
};

type FormData = {
  name: string;
  description: string;
  category: string;
  branch_id: string;
  program_group_id: string;
};

type ProgramGroup = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_enabled: boolean;
};

type LocationItem = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  branch_id: string;
};

type InstructorItem = {
  id: string;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
};

type ClassLocationMapping = {
  id: string;
  class_id: string;
  instructor_id: string;
  location_id: string;
  location_name: string | null;
  location_label: string | null;
  minutes: number;
};

// Trademark symbols available for class names
const TRADEMARK_SYMBOLS = [
  { symbol: "\u2122", name: "Trademark", label: "TM" },
  { symbol: "\u00AE", name: "Registered", label: "R" },
  { symbol: "\u2120", name: "Service Mark", label: "SM" },
  { symbol: "\u00A9", name: "Copyright", label: "C" },
];

const DURATION_OPTIONS = [30, 45, 60];
const WARNING_POPUPS_KEY = "classMaintenance.warningPopupsEnabled";

export function ClassesTab() {
  const { branch } = useThemeSettings();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [programGroups, setProgramGroups] = useState<ProgramGroup[]>([]);
  const [selectedProgramGroupId, setSelectedProgramGroupId] = useState<string>("");
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
    category: "",
    branch_id: branch.id,
    program_group_id: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Name validation
  const [nameExists, setNameExists] = useState(false);
  const [validatingName, setValidatingName] = useState(false);

  // Class location + duration mappings (class-only, via placeholder instructor)
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [instructors, setInstructors] = useState<InstructorItem[]>([]);
  const [instructorsLoading, setInstructorsLoading] = useState(false);
  const [instructorsError, setInstructorsError] = useState<string | null>(null);
  const [classMappings, setClassMappings] = useState<ClassLocationMapping[]>([]);
  const [allClassMappings, setAllClassMappings] = useState<ClassLocationMapping[]>([]);
  const [classMappingLoading, setClassMappingLoading] = useState(false);
  const [classMappingError, setClassMappingError] = useState<string | null>(null);
  const [allMappingLoading, setAllMappingLoading] = useState(false);
  const [allMappingError, setAllMappingError] = useState<string | null>(null);
  const [placeholderInstructorId, setPlaceholderInstructorId] = useState<string | null>(null);
  const [durationSelect, setDurationSelect] = useState<string>("");
  const [locationSelect, setLocationSelect] = useState<string>("");
  const [pendingLocationIds, setPendingLocationIds] = useState<string[]>([]);
  const [customDurationInput, setCustomDurationInput] = useState<string>("");
  const [durationActionError, setDurationActionError] = useState<string | null>(null);
  const [locationActionError, setLocationActionError] = useState<string | null>(null);
  const [instructorActionError, setInstructorActionError] = useState<string | null>(null);
  const [instructorSearch, setInstructorSearch] = useState("");
  const [instructorFilter, setInstructorFilter] = useState<"all" | "available" | "selected">("all");
  const [warningPopupsEnabled, setWarningPopupsEnabled] = useState(true);
  const [warningDialog, setWarningDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [warningSuppressNext, setWarningSuppressNext] = useState(false);

  // Symbol picker
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const symbolPickerRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"narrow" | "find" | "smart">("narrow");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("include_inactive", "true");
      params.set("branch_id", branch.id);
      if (selectedProgramGroupId) params.set("program_group_id", selectedProgramGroupId);
      const res = await fetch(`/api/maintenance/classes?${params}`);
      if (!res.ok) throw new Error("Failed to load classes");
      const data = await res.json();
      setClasses(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [showInactive, branch.id, selectedProgramGroupId]);

  const loadLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      const res = await fetch(`/api/maintenance/locations?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load locations");
      const data = (await res.json()) as LocationItem[];
      setLocations(Array.isArray(data) ? data : []);
    } catch (e) {
      setLocationsError(e instanceof Error ? e.message : "Failed to load locations");
      setLocations([]);
    } finally {
      setLocationsLoading(false);
    }
  }, [branch.id]);

  const loadInstructors = useCallback(async () => {
    setInstructorsLoading(true);
    setInstructorsError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      const res = await fetch(`/api/maintenance/instructors?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load instructors");
      const data = (await res.json()) as InstructorItem[];
      setInstructors(Array.isArray(data) ? data : []);
    } catch (e) {
      setInstructorsError(e instanceof Error ? e.message : "Failed to load instructors");
      setInstructors([]);
    } finally {
      setInstructorsLoading(false);
    }
  }, [branch.id]);

  const loadClassMappings = useCallback(async () => {
    if (!editingId) {
      setClassMappings([]);
      setPlaceholderInstructorId(null);
      return;
    }

    setClassMappingLoading(true);
    setClassMappingError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("class_id", editingId);
      params.set("class_only", "true");
      const res = await fetch(`/api/scheduling/instructor-class-location-details?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to load class mappings");
      }
      const json = (await res.json()) as {
        rows?: ClassLocationMapping[];
        placeholder_instructor_id?: string | null;
      };
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      setClassMappings(
        rows.map((r) => ({
          id: String(r.id ?? ""),
          class_id: String(r.class_id ?? ""),
          instructor_id: String(r.instructor_id ?? ""),
          location_id: String(r.location_id ?? ""),
          location_name: r.location_name ? String(r.location_name) : null,
          location_label: r.location_label ? String(r.location_label) : null,
          minutes: Number(r.minutes),
        })),
      );
      setPlaceholderInstructorId(json?.placeholder_instructor_id ?? null);
    } catch (e) {
      setClassMappingError(e instanceof Error ? e.message : "Failed to load class mappings");
      setClassMappings([]);
      setPlaceholderInstructorId(null);
    } finally {
      setClassMappingLoading(false);
    }
  }, [branch.id, editingId]);

  const loadAllClassMappings = useCallback(async () => {
    if (!editingId) {
      setAllClassMappings([]);
      return;
    }

    setAllMappingLoading(true);
    setAllMappingError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("class_id", editingId);
      const res = await fetch(`/api/scheduling/instructor-class-location-details?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to load class mappings");
      }
      const json = (await res.json()) as { rows?: ClassLocationMapping[] };
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      setAllClassMappings(
        rows.map((r) => ({
          id: String(r.id ?? ""),
          class_id: String(r.class_id ?? ""),
          instructor_id: String(r.instructor_id ?? ""),
          location_id: String(r.location_id ?? ""),
          location_name: r.location_name ? String(r.location_name) : null,
          location_label: r.location_label ? String(r.location_label) : null,
          minutes: Number(r.minutes),
        })),
      );
    } catch (e) {
      setAllMappingError(e instanceof Error ? e.message : "Failed to load class mappings");
      setAllClassMappings([]);
    } finally {
      setAllMappingLoading(false);
    }
  }, [branch.id, editingId]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    void loadInstructors();
  }, [loadInstructors]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(WARNING_POPUPS_KEY);
      if (stored === null) return;
      setWarningPopupsEnabled(stored === "true");
    } catch {
      // Ignore localStorage failures
    }
  }, []);

  useEffect(() => {
    if (!isFormOpen) return;
    void loadClassMappings();
    void loadAllClassMappings();
  }, [isFormOpen, loadClassMappings, loadAllClassMappings]);

  // Load enabled program groups for this branch (default GroupX)
  useEffect(() => {
    const load = async () => {
      setLoadingGroups(true);
      try {
        const res = await fetch(`/api/branches/${branch.id}/program-groups`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load program groups");
        const allGroups: ProgramGroup[] = Array.isArray(data.groups) ? data.groups : [];
        const enabled = allGroups.filter((g) => g.is_enabled);
        setProgramGroups(enabled);
        const groupX = enabled.find((g) => g.code === "GroupX");
        const nextId = groupX?.id ?? enabled[0]?.id ?? "";
        setSelectedProgramGroupId((prev) => (prev && enabled.some((g) => g.id === prev) ? prev : nextId));
        setFormData((f) => ({ ...f, branch_id: branch.id, program_group_id: nextId }));
      } catch {
        setProgramGroups([]);
        setSelectedProgramGroupId("");
      } finally {
        setLoadingGroups(false);
      }
    };
    void load();
  }, [branch.id]);

  // Validate name with debounce
  useEffect(() => {
    if (!formData.name.trim()) {
      setNameExists(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setValidatingName(true);
      try {
        const params = new URLSearchParams({ check_name: formData.name.trim() });
        params.set("branch_id", formData.branch_id);
        params.set("program_group_id", formData.program_group_id);
        if (editingId) {
          params.set("exclude_id", editingId);
        }
        const res = await fetch(`/api/maintenance/classes?${params}`);
        if (res.ok) {
          const data = await res.json();
          setNameExists(data.exists);
        }
      } catch {
        // Ignore validation errors
      } finally {
        setValidatingName(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formData.name, editingId]);

  // Close symbol picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        symbolPickerRef.current &&
        !symbolPickerRef.current.contains(e.target as Node)
      ) {
        setShowSymbolPicker(false);
      }
    };

    if (showSymbolPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSymbolPicker]);

  const openNewForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      branch_id: branch.id,
      program_group_id: selectedProgramGroupId,
    });
    setEditingId(null);
    setFormError(null);
    setNameExists(false);
    setClassMappings([]);
    setAllClassMappings([]);
    setClassMappingError(null);
    setClassMappingLoading(false);
    setAllMappingError(null);
    setAllMappingLoading(false);
    setPlaceholderInstructorId(null);
    setDurationSelect("");
    setLocationSelect("");
    setPendingLocationIds([]);
    setCustomDurationInput("");
    setDurationActionError(null);
    setLocationActionError(null);
    setInstructorActionError(null);
    setInstructorSearch("");
    setInstructorFilter("all");
    setIsFormOpen(true);
  };

  const openEditForm = (classItem: ClassItem) => {
    setFormData({
      name: classItem.name,
      description: classItem.description || "",
      category: classItem.category || "",
      branch_id: classItem.branch_id,
      program_group_id: classItem.program_group_id,
    });
    setEditingId(classItem.id);
    setFormError(null);
    setNameExists(false);
    setDurationSelect("");
    setLocationSelect("");
    setPendingLocationIds([]);
    setCustomDurationInput("");
    setDurationActionError(null);
    setLocationActionError(null);
    setInstructorActionError(null);
    setInstructorSearch("");
    setInstructorFilter("all");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
    setNameExists(false);
    setShowSymbolPicker(false);
    setClassMappings([]);
    setAllClassMappings([]);
    setClassMappingError(null);
    setPlaceholderInstructorId(null);
    setAllMappingError(null);
    setDurationSelect("");
    setLocationSelect("");
    setPendingLocationIds([]);
    setCustomDurationInput("");
    setDurationActionError(null);
    setLocationActionError(null);
    setInstructorActionError(null);
    setInstructorSearch("");
    setInstructorFilter("all");
  };

  const updateWarningPopups = useCallback((next: boolean) => {
    setWarningPopupsEnabled(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(WARNING_POPUPS_KEY, String(next));
    } catch {
      // Ignore localStorage failures
    }
  }, []);

  const insertSymbol = (symbol: string) => {
    const input = nameInputRef.current;
    if (input) {
      const start = input.selectionStart ?? formData.name.length;
      const end = input.selectionEnd ?? formData.name.length;
      const newName =
        formData.name.slice(0, start) + symbol + formData.name.slice(end);
      setFormData((f) => ({ ...f, name: newName }));

      // Set cursor position after symbol
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + symbol.length, start + symbol.length);
      }, 0);
    } else {
      setFormData((f) => ({ ...f, name: f.name + symbol }));
    }
    setShowSymbolPicker(false);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError("Class name is required");
      return;
    }

    if (nameExists) {
      setFormError("A class with this name already exists");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { id: editingId, ...formData }
        : formData;

      const res = await fetch("/api/maintenance/classes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      closeForm();
      await loadClasses();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (classItem: ClassItem) => {
    try {
      const res = await fetch("/api/maintenance/classes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: classItem.id, is_active: !classItem.is_active }),
      });

      if (!res.ok) throw new Error("Failed to update");
      await loadClasses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const durationOptions = useMemo(
    () => DURATION_OPTIONS.map((value) => ({ value: String(value), label: `${value} minutes` })),
    [],
  );

  const durationOptionByValue = useMemo(() => {
    const map = new Map<number, { value: string; label: string }>();
    for (const opt of durationOptions) {
      const num = Number(opt.value);
      if (Number.isFinite(num)) {
        map.set(num, opt);
      }
    }
    return map;
  }, [durationOptions]);

  const mappingDurations = useMemo(() => {
    const unique = Array.from(new Set(allClassMappings.map((m) => m.minutes))).filter((m) => m > 0);
    return unique.sort((a, b) => a - b);
  }, [allClassMappings]);

  const mappingLocations = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    for (const row of allClassMappings) {
      const label = row.location_label || row.location_name || row.location_id;
      if (row.location_id && !byId.has(row.location_id)) {
        byId.set(row.location_id, { id: row.location_id, label });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [allClassMappings]);

  const assignedInstructorIds = useMemo(() => {
    const ids = new Set(
      allClassMappings
        .map((row) => row.instructor_id)
        .filter((id) => id && id !== placeholderInstructorId),
    );
    return ids;
  }, [allClassMappings, placeholderInstructorId]);

  const instructorOptions = useMemo(() => {
    const list = instructors
      .filter((i) => {
        if (i.id === placeholderInstructorId) return false;
        const nickname = String(i.nickname ?? "").trim().toUpperCase();
        return nickname !== "UNASSIGNED";
      })
      .map((i) => {
        const nickname = String(i.nickname ?? "").trim();
        const label = nickname || "(No nickname)";
        return { id: i.id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    return list;
  }, [instructors, placeholderInstructorId]);

  const filteredInstructors = useMemo(() => {
    const term = instructorSearch.trim().toLowerCase();
    return instructorOptions
      .filter((opt) => (term ? opt.label.toLowerCase().includes(term) : true));
  }, [instructorOptions, instructorSearch]);

  const visibleInstructors = useMemo(() => {
    if (instructorFilter === "available") {
      return filteredInstructors.filter((opt) => !assignedInstructorIds.has(opt.id));
    }
    if (instructorFilter === "selected") {
      return filteredInstructors.filter((opt) => assignedInstructorIds.has(opt.id));
    }
    return filteredInstructors;
  }, [assignedInstructorIds, filteredInstructors, instructorFilter]);

  const assignedInstructors = useMemo(() => {
    return instructorOptions.filter((opt) => assignedInstructorIds.has(opt.id));
  }, [assignedInstructorIds, instructorOptions]);

  const mappingKeySet = useMemo(() => {
    return new Set(allClassMappings.map((r) => `${r.location_id}:${r.minutes}`));
  }, [allClassMappings]);

  const pendingLocations = useMemo(() => {
    const byId = new Map(locations.map((loc) => [loc.id, loc]));
    return pendingLocationIds
      .map((id) => {
        const loc = byId.get(id);
        if (!loc) return null;
        return { id: loc.id, label: `${loc.code} - ${loc.name}` };
      })
      .filter((item): item is { id: string; label: string } => !!item);
  }, [locations, pendingLocationIds]);



  const locationOptions = useMemo(
    () =>
      locations.map((l) => ({
        value: l.id,
        label: `${l.code} - ${l.name}`,
      })),
    [locations],
  );

  const addMappings = useCallback(
    async (items: Array<{ location_id: string; minutes: number; location_name?: string }>) => {
      if (!editingId) return;
      if (!items.length) return;
      const payload = {
        branch_id: branch.id,
        class_id: editingId,
        class_name: formData.name,
        items: items.map((i) => ({
          location_id: i.location_id,
          minutes: i.minutes,
          location_name: i.location_name,
          class_name: formData.name,
        })),
      };
      const res = await fetch("/api/scheduling/instructor-class-location-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to save class mappings");
      }
      await loadClassMappings();
      await loadAllClassMappings();
    },
    [branch.id, editingId, formData.name, loadClassMappings, loadAllClassMappings],
  );

  const addInstructorMappings = useCallback(
    async (instructorId: string, instructorNickname: string, items: Array<{ location_id: string; minutes: number; location_name?: string }>) => {
      if (!editingId) return;
      if (!items.length) return;
      const payload = {
        branch_id: branch.id,
        class_id: editingId,
        class_name: formData.name,
        instructor_id: instructorId,
        instructor_nickname: instructorNickname,
        items: items.map((i) => ({
          location_id: i.location_id,
          minutes: i.minutes,
          location_name: i.location_name,
          class_name: formData.name,
        })),
      };
      const res = await fetch("/api/scheduling/instructor-class-location-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to save instructor mappings");
      }
      await loadAllClassMappings();
    },
    [branch.id, editingId, formData.name, loadAllClassMappings],
  );

  const handleAddDuration = useCallback(async (nextMinutes?: number) => {
    setDurationActionError(null);
    if (!editingId) return;
    const minutes = Number(nextMinutes ?? durationSelect);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    if (minutes % 15 !== 0) {
      setDurationActionError("Duration must be in 15-minute increments.");
      return;
    }
    if (mappingLocations.length === 0 && pendingLocations.length === 0) {
      setDurationActionError("Select a location first, then add a duration.");
      return;
    }
    if (mappingDurations.includes(minutes)) {
      setDurationActionError("That duration is already assigned.");
      return;
    }

    const activeLocations = mappingLocations.length > 0 ? mappingLocations : pendingLocations;
    const items = activeLocations
      .map((loc) => ({
        location_id: loc.id,
        minutes,
        location_name: loc.label,
      }))
      .filter((item) => !mappingKeySet.has(`${item.location_id}:${item.minutes}`));

    if (items.length === 0) return;
    try {
      await addMappings(items);
      if (pendingLocations.length > 0) {
        setPendingLocationIds([]);
      }
      setDurationSelect("");
    } catch (e) {
      setDurationActionError(e instanceof Error ? e.message : "Failed to add duration");
    }
  }, [addMappings, durationSelect, editingId, mappingKeySet, mappingLocations, mappingDurations, pendingLocations.length]);

  const handleAddLocation = useCallback(async (nextLocationId?: string) => {
    setLocationActionError(null);
    if (!editingId) return;
    const locationId = nextLocationId ?? locationSelect;
    if (!locationId) return;
    if (mappingDurations.length === 0) {
      setLocationActionError(null);
      setPendingLocationIds((prev) => (prev.includes(locationId) ? prev : [...prev, locationId]));
      setLocationSelect("");
      return;
    }
    if (mappingLocations.some((loc) => loc.id === locationId)) {
      setLocationActionError("That location is already assigned.");
      return;
    }
    if (pendingLocationIds.includes(locationId)) {
      return;
    }

    const loc = locations.find((l) => l.id === locationId);
    if (!loc) return;
    const label = `${loc.code} - ${loc.name}`;

    const items = mappingDurations
      .map((minutes) => ({
        location_id: loc.id,
        minutes,
        location_name: label,
      }))
      .filter((item) => !mappingKeySet.has(`${item.location_id}:${item.minutes}`));

    if (items.length === 0) return;
    try {
      await addMappings(items);
      setLocationSelect("");
    } catch (e) {
      setLocationActionError(e instanceof Error ? e.message : "Failed to add location");
    }
  }, [addMappings, editingId, locationSelect, locations, mappingDurations, mappingKeySet, mappingLocations, pendingLocationIds]);

  const deleteMappingsByCriteria = useCallback(
    async (criteria: { minutes?: number; locationId?: string }) => {
      if (!editingId) return;
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("class_id", editingId);
      params.set("scope", "all");
      if (criteria.minutes !== undefined) params.set("minutes", String(criteria.minutes));
      if (criteria.locationId) params.set("location_id", criteria.locationId);
      const res = await fetch(
        `/api/scheduling/instructor-class-location-details?${params.toString()}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to delete class mappings");
      }
      await loadClassMappings();
      await loadAllClassMappings();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("instructor-class-mappings-updated", { detail: { classId: editingId } }),
        );
      }
    },
    [branch.id, editingId, loadClassMappings, loadAllClassMappings],
  );

  const deleteMappingsByInstructor = useCallback(
    async (instructorId: string) => {
      if (!editingId) return;
      const params = new URLSearchParams();
      params.set("branch_id", branch.id);
      params.set("class_id", editingId);
      params.set("instructor_id", instructorId);
      const res = await fetch(
        `/api/scheduling/instructor-class-location-details?${params.toString()}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to delete instructor mappings");
      }
      await loadAllClassMappings();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("instructor-class-mappings-updated", { detail: { classId: editingId } }),
        );
      }
    },
    [branch.id, editingId, loadAllClassMappings],
  );

  const handleRemoveDuration = useCallback(
    async (minutes: number) => {
      setDurationActionError(null);
      const runDelete = async () => {
        try {
          await deleteMappingsByCriteria({ minutes });
        } catch (e) {
          setDurationActionError(e instanceof Error ? e.message : "Failed to remove duration");
        }
      };
      if (!warningPopupsEnabled) {
        await runDelete();
        return;
      }
      setWarningSuppressNext(false);
      setWarningDialog({
        title: "Remove duration?",
        message:
          "Removing this duration will also remove instructor links for this class at that duration.",
        confirmLabel: "Remove duration",
        onConfirm: runDelete,
      });
    },
    [deleteMappingsByCriteria, warningPopupsEnabled],
  );

  const handleRemoveLocation = useCallback(
    async (locationId: string) => {
      setLocationActionError(null);
      try {
        await deleteMappingsByCriteria({ locationId });
      } catch (e) {
        setLocationActionError(e instanceof Error ? e.message : "Failed to remove location");
      }
    },
    [deleteMappingsByCriteria],
  );

  const handleAddInstructor = useCallback(
    async (instructorId: string) => {
      setInstructorActionError(null);
      if (!editingId) return;
      if (mappingDurations.length === 0 || mappingLocations.length === 0) {
        setInstructorActionError("Assign durations and locations before adding instructors.");
        return;
      }
      const instructor = instructorOptions.find((opt) => opt.id === instructorId);
      const nickname = instructor?.label ?? "";
      const items = mappingLocations.flatMap((loc) =>
        mappingDurations.map((minutes) => ({
          location_id: loc.id,
          minutes,
          location_name: loc.label,
        })),
      );
      try {
        await addInstructorMappings(instructorId, nickname, items);
      } catch (e) {
        setInstructorActionError(e instanceof Error ? e.message : "Failed to add instructor");
      }
    },
    [addInstructorMappings, editingId, instructorOptions, mappingDurations, mappingLocations],
  );

  const handleRemoveInstructor = useCallback(
    async (instructorId: string, label: string) => {
      setInstructorActionError(null);
      const runDelete = async () => {
        try {
          await deleteMappingsByInstructor(instructorId);
        } catch (e) {
          setInstructorActionError(e instanceof Error ? e.message : "Failed to remove instructor");
        }
      };
      if (!warningPopupsEnabled) {
        await runDelete();
        return;
      }
      setWarningSuppressNext(false);
      setWarningDialog({
        title: "Remove instructor?",
        message: `Removing ${label} will unlink them from all class durations and locations.`,
        confirmLabel: "Remove instructor",
        onConfirm: runDelete,
      });
    },
    [deleteMappingsByInstructor, warningPopupsEnabled],
  );

  // Search/filter logic
  const matchesSearch = useCallback((classItem: ClassItem, term: string): boolean => {
    if (!term.trim()) return true;
    const lowerTerm = term.toLowerCase();
    return classItem.name.toLowerCase().includes(lowerTerm);
  }, []);

  const { displayedClasses, firstMatchId } = useMemo(() => {
    const term = searchTerm.trim();
    
    if (!term) {
      return { displayedClasses: classes, firstMatchId: null };
    }

    const firstMatch = classes.find((c) => matchesSearch(c, term));
    const firstMatchId = firstMatch?.id ?? null;

    if (searchMode === "find") {
      return { displayedClasses: classes, firstMatchId };
    }

    const filtered = classes.filter((c) => matchesSearch(c, term));
    return { displayedClasses: filtered, firstMatchId };
  }, [classes, searchTerm, searchMode, matchesSearch]);

  useEffect(() => {
    if ((searchMode === "find" || searchMode === "smart") && firstMatchId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [firstMatchId, searchMode]);

  const searchModeOptions = [
    {
      id: "narrow" as const,
      label: "Narrow",
      description: "Narrows the list to show only classes matching your search. Non-matching classes are hidden.",
    },
    {
      id: "find" as const,
      label: "Find",
      description: "Finds and scrolls to matching classes while keeping the full list visible. Matches are highlighted.",
    },
    {
      id: "smart" as const,
      label: "Smart",
      description: "Combines both: narrows the list to matches AND highlights the best match for quick identification.",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl bg-muted px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Classes</h2>
          <button
            type="button"
            onClick={openNewForm}
            className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add Class
          </button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/20"
            />
            Show inactive
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group:</span>
            {loadingGroups ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : programGroups.length === 0 ? (
              <span className="text-xs text-muted-foreground">No enabled groups</span>
            ) : (
              <>
                <select
                  className="rounded-lg border border-white/15 bg-[var(--cta)] px-3 py-1 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm ring-1 ring-white/10 hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
                  value={selectedProgramGroupId}
                  onChange={(e) => {
                    setSelectedProgramGroupId(e.target.value);
                    setFormData((f) => ({ ...f, program_group_id: e.target.value, branch_id: branch.id }));
                  }}
                >
                  {programGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-semibold text-orange-400/90">
                  {programGroups.find((g) => g.id === selectedProgramGroupId)?.name ?? ""}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Search and Filter Options */}
        <div className="flex flex-1 items-center justify-center gap-3">
          <div className="relative z-10 flex items-center">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
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

          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Filter Options:</span>
            {searchModeOptions.map((option) => (
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
                  className="pointer-events-none w-56 rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                >
                  <PopoverArrow
                    width={12}
                    height={8}
                    className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                  />
                  {option.description}
                </PopoverContent>
              </Popover>
            ))}
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-5 py-4 shadow-sm ring-1 ring-white/5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold">
                  {editingId ? "Edit Class" : "New Class"}
                </h3>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={warningPopupsEnabled}
                    onChange={(e) => updateWarningPopups(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/20"
                  />
                  Warning popups
                </label>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-4 py-3 shadow-sm ring-1 ring-white/5">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-semibold text-foreground">Class details</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Class Name <span className="text-red-400">*</span>
                      {validatingName && (
                        <span className="ml-2 text-xs text-foreground/50">checking...</span>
                      )}
                    </label>
                    <div className="relative mt-1 flex">
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                        className={`flex-1 rounded-l-xl border-r-0 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                          nameExists
                            ? "border border-red-400/50 bg-red-950/20 focus:ring-red-400/50"
                            : "border border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                        }`}
                        placeholder="e.g., BODYPUMP"
                      />
                      <div className="relative" ref={symbolPickerRef}>
                        <button
                          type="button"
                          onClick={() => setShowSymbolPicker(!showSymbolPicker)}
                          className="flex h-full items-center gap-1 rounded-r-xl border border-white/15 bg-[var(--brand)]/80 px-3 text-sm font-medium text-white hover:bg-[var(--brand)]"
                          title="Insert trademark symbol"
                        >
                          TM
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {showSymbolPicker && (
                          <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-xl border border-white/15 bg-black/90 py-1 shadow-xl backdrop-blur">
                            {TRADEMARK_SYMBOLS.map((item) => (
                              <button
                                key={item.symbol}
                                type="button"
                                onClick={() => insertSymbol(item.symbol)}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/10"
                              >
                                <span className="text-lg">{item.symbol}</span>
                                <span className="text-foreground/80">{item.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {formData.name && !validatingName && !nameExists && (
                        <Check className="absolute right-14 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400" />
                      )}
                    </div>
                    {nameExists && (
                      <p className="mt-1 text-xs text-red-400">This class name already exists</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                      placeholder="e.g., Cardio, Strength, Yoga"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                      placeholder="Optional description..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-4 py-3 shadow-sm ring-1 ring-white/5"
              data-testid="class-durations-section"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Class durations</div>
                  <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-semibold text-foreground/80 ring-1 ring-black/10">
                    {mappingDurations.length}
                  </span>
                </div>

                {!editingId ? (
                  <div className="text-sm text-muted-foreground">
                    Save the class first to assign durations.
                  </div>
                ) : classMappingLoading ? (
                  <div className="text-sm text-muted-foreground">Loading durations…</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">Assigned durations</div>
                      {mappingDurations.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No durations assigned yet.</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mappingDurations.map((d) => {
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => void handleRemoveDuration(d)}
                                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground whitespace-nowrap hover:bg-black/30"
                                aria-label={`Remove ${d} minutes`}
                              >
                                <span>{d} minutes</span>
                                <X className="h-3 w-3 text-foreground/70" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">Available durations</div>
                      <div className="flex flex-wrap gap-2">
                        {DURATION_OPTIONS.map((d) => {
                          const disabled =
                            mappingDurations.includes(d) ||
                            (mappingLocations.length === 0 && pendingLocations.length === 0);
                          return (
                            <button
                              key={d}
                              type="button"
                              disabled={disabled}
                              onClick={() => void handleAddDuration(d)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                disabled
                                  ? "cursor-not-allowed bg-black/20 text-muted-foreground/60"
                                  : "border border-white/10 bg-black/20 text-foreground hover:bg-black/30"
                              }`}
                              aria-disabled={disabled}
                            >
                              <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-foreground/80">
                                +
                              </span>
                              {durationOptionByValue.get(d)?.label ?? `${d} minutes`}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={15}
                            step={15}
                            value={customDurationInput}
                            onChange={(e) => setCustomDurationInput(e.target.value)}
                            className="w-[110px] rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
                            placeholder="Custom min"
                            aria-label="Custom duration"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const minutes = Number(customDurationInput);
                              void handleAddDuration(minutes);
                              setCustomDurationInput("");
                            }}
                            disabled={
                              !customDurationInput ||
                              (mappingLocations.length === 0 && pendingLocations.length === 0)
                            }
                            className="btn-pill inline-flex items-center gap-2 bg-black/40 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus className="h-3 w-3" />
                            Add custom
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {durationActionError ? (
                  <div className="text-sm text-red-400">{durationActionError}</div>
                ) : null}
                {mappingLocations.length === 0 && pendingLocations.length === 0 ? (
                  <div className="text-sm text-orange-400/90">
                    Sequence: choose a location first, then add a duration.
                  </div>
                ) : null}
                {classMappingError ? (
                  <div className="text-sm text-red-400">{classMappingError}</div>
                ) : null}
              </div>
            </div>

            <div
              className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-4 py-3 shadow-sm ring-1 ring-white/5"
              data-testid="class-locations-section"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Class locations</div>
                  <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-semibold text-foreground/80 ring-1 ring-black/10">
                    {mappingLocations.length + pendingLocations.length}
                  </span>
                </div>

                {!editingId ? (
                  <div className="text-sm text-muted-foreground">
                    Save the class first to assign locations.
                  </div>
                ) : locationsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading locations…</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">Assigned locations</div>
                      {mappingLocations.length === 0 && pendingLocations.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No locations assigned yet.</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mappingLocations.map((loc) => (
                            <button
                              key={loc.id}
                              type="button"
                              onClick={() => void handleRemoveLocation(loc.id)}
                              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground whitespace-nowrap hover:bg-black/30"
                              aria-label={`Remove ${loc.label}`}
                            >
                              <span>{loc.label}</span>
                              <X className="h-3 w-3 text-foreground/70" />
                            </button>
                          ))}
                          {mappingLocations.length === 0
                            ? pendingLocations.map((loc) => (
                                <button
                                  key={`pending-${loc.id}`}
                                  type="button"
                                  onClick={() =>
                                    setPendingLocationIds((prev) => prev.filter((id) => id !== loc.id))
                                  }
                                  className="inline-flex items-center gap-2 rounded-full border border-white/15 border-dashed bg-black/10 px-3 py-1 text-xs font-semibold text-foreground/80 whitespace-nowrap hover:bg-black/20"
                                  aria-label={`Remove pending ${loc.label}`}
                                >
                                  <span>{loc.label} (pending duration)</span>
                                  <X className="h-3 w-3 text-foreground/60" />
                                </button>
                              ))
                            : null}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">Available locations</div>
                      {locationsLoading ? (
                        <span className="text-sm text-muted-foreground">Loading locations…</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {locations.map((loc) => {
                            const label = `${loc.code} - ${loc.name}`;
                            const disabled =
                              mappingLocations.some((m) => m.id === loc.id) ||
                              pendingLocationIds.includes(loc.id);
                            return (
                              <button
                                key={loc.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => void handleAddLocation(loc.id)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                  disabled
                                    ? "cursor-not-allowed bg-black/20 text-muted-foreground/60"
                                    : "border border-white/10 bg-black/20 text-foreground hover:bg-black/30"
                                }`}
                                aria-disabled={disabled}
                              >
                                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-foreground/80">
                                  +
                                </span>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {locationActionError ? (
                  <div className="text-sm text-red-400">{locationActionError}</div>
                ) : null}
                {mappingDurations.length === 0 ? (
                  <div className="text-sm text-orange-400/90">
                    Sequence: choose locations first, then add a duration.
                  </div>
                ) : null}
                {locationsError ? (
                  <div className="text-sm text-red-400">{locationsError}</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--brand-strong)]/60 bg-[rgb(var(--brand-soft-rgb)/0.18)] px-4 py-3 shadow-sm ring-1 ring-white/5">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Class instructors</div>
                  <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-semibold text-foreground/80 ring-1 ring-black/10">
                    {assignedInstructors.length}
                  </span>
                </div>

                {!editingId ? (
                  <div className="text-sm text-muted-foreground">
                    Save the class first to assign instructors.
                  </div>
                ) : instructorsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading instructors…</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">Assigned instructors</div>
                      {assignedInstructors.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No instructors assigned yet.</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {assignedInstructors.map((inst) => (
                            <button
                              key={inst.id}
                              type="button"
                              onClick={() => void handleRemoveInstructor(inst.id, inst.label)}
                              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-semibold text-foreground whitespace-nowrap hover:bg-black/30"
                              aria-label={`Remove ${inst.label}`}
                            >
                              <span>{inst.label}</span>
                              <X className="h-3 w-3 text-foreground/70" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">Available instructors</div>
                      <div className="flex w-1/2 items-center gap-2">
                        <input
                          type="text"
                          value={instructorSearch}
                          onChange={(e) => setInstructorSearch(e.target.value)}
                          placeholder="Search instructors..."
                          className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-xs text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)]"
                        />
                        <div className="flex items-center gap-1">
                          {(["all", "available", "selected"] as const).map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setInstructorFilter(option)}
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                                instructorFilter === option
                                  ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                                  : "border border-white/15 bg-black/20 text-foreground/70 hover:bg-black/30"
                              }`}
                            >
                              {option === "all"
                                ? "All"
                                : option === "available"
                                  ? "Available"
                                  : "Selected"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 w-1/2 max-h-[220px] overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-1">
                        {visibleInstructors.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No instructors found.
                          </div>
                        ) : (
                          visibleInstructors.map((inst) => {
                            const isAssigned = assignedInstructorIds.has(inst.id);
                            return (
                            <button
                              key={inst.id}
                              type="button"
                              onClick={() => void handleAddInstructor(inst.id)}
                              disabled={isAssigned}
                              aria-disabled={isAssigned}
                              className={`flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                                isAssigned
                                  ? "cursor-not-allowed opacity-60"
                                  : "hover:bg-[var(--brand-strong)]/50"
                              }`}
                            >
                              {isAssigned ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-400/80 text-[10px] text-red-400">
                                  <X className="h-3 w-3" />
                                </span>
                              ) : (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-foreground/80">
                                  +
                                </span>
                              )}
                              <span className="truncate">{inst.label}</span>
                            </button>
                          );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {instructorActionError ? (
                  <div className="text-sm text-red-400">{instructorActionError}</div>
                ) : null}
                {mappingDurations.length === 0 || mappingLocations.length === 0 ? (
                  <div className="text-sm text-orange-400/90">
                    Assign at least one duration and one location before adding instructors.
                  </div>
                ) : null}
                {instructorsError ? (
                  <div className="text-sm text-red-400">{instructorsError}</div>
                ) : null}
              </div>
            </div>

            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}

            <div className="flex justify-start gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="btn-pill border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground hover:bg-black/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || nameExists}
                className="btn-pill bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {warningDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-4 shadow-xl">
            <div className="text-sm font-semibold text-foreground">{warningDialog.title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{warningDialog.message}</p>
            <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={warningSuppressNext}
                onChange={(e) => {
                  const next = e.target.checked;
                  setWarningSuppressNext(next);
                  if (next) {
                    updateWarningPopups(false);
                  }
                }}
                className="h-4 w-4 rounded border-white/20 bg-black/20"
              />
              No warnings please
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWarningDialog(null);
                  setWarningSuppressNext(false);
                }}
                className="rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-black/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const confirm = warningDialog.onConfirm;
                  setWarningDialog(null);
                  setWarningSuppressNext(false);
                  await confirm();
                }}
                className="rounded-lg bg-[var(--cta)] px-3 py-1.5 text-xs font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90"
              >
                {warningDialog.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <div className="p-5">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading classes...</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : classes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No classes found.</div>
        ) : displayedClasses.length === 0 ? (
          <div className="text-sm text-muted-foreground">No classes match your search.</div>
        ) : (
          <div className="report-scroll max-h-96 overflow-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Category</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedClasses.map((classItem) => {
                  const isHighlighted = (searchMode === "find" || searchMode === "smart") && 
                    classItem.id === firstMatchId && 
                    searchTerm.trim() !== "";
                  
                  return (
                    <tr
                      key={classItem.id}
                      ref={isHighlighted ? highlightedRowRef : null}
                      onClick={(e) => {
                        if (isFormOpen) return;
                        const target = e.target as HTMLElement | null;
                        if (target?.closest("button, a, input, select, textarea, [role='button']")) return;
                        openEditForm(classItem);
                      }}
                      className={`transition-colors ${
                        isHighlighted
                          ? "bg-[var(--brand)]/20 ring-2 ring-[var(--brand)]/50 ring-inset"
                          : "hover:bg-muted/50"
                      } ${!classItem.is_active ? "opacity-50" : ""} cursor-pointer`}
                    >
                      <td className="px-4 py-2 text-foreground">
                        {classItem.name}
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {classItem.category || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            classItem.is_active
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {classItem.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(classItem)}
                            className="rounded-lg p-1.5 hover:bg-white/10"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(classItem)}
                            className={`rounded-lg px-2 py-1 text-xs font-medium ${
                              classItem.is_active
                                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                            }`}
                          >
                            {classItem.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


