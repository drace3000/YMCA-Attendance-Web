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

// Trademark symbols available for class names
const TRADEMARK_SYMBOLS = [
  { symbol: "\u2122", name: "Trademark", label: "TM" },
  { symbol: "\u00AE", name: "Registered", label: "R" },
  { symbol: "\u2120", name: "Service Mark", label: "SM" },
  { symbol: "\u00A9", name: "Copyright", label: "C" },
];

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

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

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
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
    setNameExists(false);
    setShowSymbolPicker(false);
  };

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
              <select
                className="ymca-select w-44 text-sm font-semibold"
                value={selectedProgramGroupId}
                onChange={(e) => {
                  setSelectedProgramGroupId(e.target.value);
                  setFormData((f) => ({ ...f, program_group_id: e.target.value, branch_id: branch.id }));
                }}
              >
                {programGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} - {g.name}
                  </option>
                ))}
              </select>
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

        <button
          type="button"
          onClick={openNewForm}
          className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Class
        </button>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="border-b border-border bg-card/50 px-5 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {editingId ? "Edit Class" : "New Class"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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

            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
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
                      className={`transition-colors ${
                        isHighlighted
                          ? "bg-[var(--brand)]/20 ring-2 ring-[var(--brand)]/50 ring-inset"
                          : "hover:bg-muted/50"
                      } ${!classItem.is_active ? "opacity-50" : ""}`}
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


