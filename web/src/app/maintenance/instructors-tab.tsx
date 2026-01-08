"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit2, Plus, Search, X } from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useThemeSettings } from "@/components/theme-settings-provider";

type Instructor = {
  id: string;
  branch_id: string | null;
  raw_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  readable_id: string;
  is_active: boolean;
  created_at: string;
};

type FormData = {
  first_name: string;
  last_name: string;
  nickname: string;
};

type NicknameValidation = {
  exists: boolean;
  suggestions: string[];
};

export function InstructorsTab() {
  const { branch } = useThemeSettings();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    first_name: "",
    last_name: "",
    nickname: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Nickname validation
  const [nicknameValidation, setNicknameValidation] = useState<NicknameValidation | null>(null);
  const [validatingNickname, setValidatingNickname] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"narrow" | "find" | "smart">("narrow");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadInstructors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("include_inactive", "true");
      const res = await fetch(`/api/maintenance/instructors?${params}`);
      if (!res.ok) throw new Error("Failed to load instructors");
      const data = await res.json();
      setInstructors(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void loadInstructors();
  }, [loadInstructors]);

  // Validate nickname with debounce
  useEffect(() => {
    if (!formData.nickname.trim()) {
      setNicknameValidation(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setValidatingNickname(true);
      try {
        const params = new URLSearchParams({
          check_nickname: formData.nickname.trim(),
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          branch_id: branch.id,
        });
        const res = await fetch(`/api/maintenance/instructors?${params}`);
        if (res.ok) {
          const data = await res.json();
          // Do not show as duplicate if we are editing and it is our own nickname
          if (editingId) {
            const current = instructors.find((i) => i.id === editingId);
            if (current?.nickname?.toLowerCase() === formData.nickname.trim().toLowerCase()) {
              setNicknameValidation({ exists: false, suggestions: [] });
              return;
            }
          }
          setNicknameValidation(data);
        }
      } catch {
        // Ignore validation errors
      } finally {
        setValidatingNickname(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formData.nickname, formData.first_name, formData.last_name, editingId, instructors]);

  const openNewForm = () => {
    setFormData({ first_name: "", last_name: "", nickname: "" });
    setEditingId(null);
    setFormError(null);
    setNicknameValidation(null);
    setIsFormOpen(true);
  };

  const openEditForm = (instructor: Instructor) => {
    setFormData({
      first_name: instructor.first_name || "",
      last_name: instructor.last_name || "",
      nickname: instructor.nickname || "",
    });
    setEditingId(instructor.id);
    setFormError(null);
    setNicknameValidation(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
    setNicknameValidation(null);
  };

  const handleSave = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setFormError("First name and last name are required");
      return;
    }
    if (!formData.nickname.trim()) {
      setFormError("Nickname is required");
      return;
    }

    if (nicknameValidation?.exists) {
      setFormError("Please choose a unique nickname");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { id: editingId, ...formData }
        : { ...formData, branch_id: branch.id };

      const res = await fetch("/api/maintenance/instructors", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      closeForm();
      await loadInstructors();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (instructor: Instructor) => {
    try {
      const res = await fetch("/api/maintenance/instructors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: instructor.id, is_active: !instructor.is_active }),
      });

      if (!res.ok) throw new Error("Failed to update");
      await loadInstructors();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setFormData((f) => ({ ...f, nickname: suggestion }));
    setNicknameValidation(null);
  };

  // Search/filter logic
  const matchesSearch = useCallback((instructor: Instructor, term: string): boolean => {
    if (!term.trim()) return true;
    const lowerTerm = term.toLowerCase();
    return (
      (instructor.nickname?.toLowerCase().includes(lowerTerm) ?? false) ||
      instructor.readable_id.toLowerCase().includes(lowerTerm) ||
      (instructor.first_name?.toLowerCase().includes(lowerTerm) ?? false) ||
      (instructor.last_name?.toLowerCase().includes(lowerTerm) ?? false)
    );
  }, []);

  const { displayedInstructors, firstMatchId } = useMemo(() => {
    const term = searchTerm.trim();
    
    if (!term) {
      return { displayedInstructors: instructors, firstMatchId: null };
    }

    // Find first match for highlighting
    const firstMatch = instructors.find((i) => matchesSearch(i, term));
    const firstMatchId = firstMatch?.id ?? null;

    // For "find" mode, show all instructors but we'll highlight the match
    if (searchMode === "find") {
      return { displayedInstructors: instructors, firstMatchId };
    }

    // For "narrow" and "smart" modes, filter the list
    const filtered = instructors.filter((i) => matchesSearch(i, term));
    return { displayedInstructors: filtered, firstMatchId };
  }, [instructors, searchTerm, searchMode, matchesSearch]);

  // Scroll to highlighted row when in "find" or "smart" mode
  useEffect(() => {
    if ((searchMode === "find" || searchMode === "smart") && firstMatchId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [firstMatchId, searchMode]);

  const searchModeOptions = [
    {
      id: "narrow" as const,
      label: "Narrow",
      description: "Narrows the list to show only instructors matching your search. Non-matching instructors are hidden.",
    },
    {
      id: "find" as const,
      label: "Find",
      description: "Finds and scrolls to matching instructors while keeping the full list visible. Matches are highlighted.",
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
          <h2 className="text-base font-semibold">Instructors</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-black/20"
            />
            Show inactive
          </label>
        </div>

        {/* Search and Filter Options */}
        <div className="flex flex-1 items-center justify-center gap-3">
          {/* Search Input */}
          <div className="relative z-10">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              suppressHydrationWarning
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              autoComplete="off"
              className="w-40 rounded-xl border border-white/15 bg-black/20 py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
            />
          </div>

          {/* Filter Options */}
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
                      // Keep focus on search input for immediate typing
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
          Add Instructor
        </button>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="border-b border-border bg-card/50 px-5 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {editingId ? "Edit Instructor" : "New Instructor"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium text-foreground">
                  First Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                  placeholder="Smith"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Nickname
                  <span className="text-red-400"> *</span>
                  {validatingNickname && (
                    <span className="ml-2 text-xs text-foreground/50">checking...</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => setFormData((f) => ({ ...f, nickname: e.target.value }))}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                      nicknameValidation?.exists
                        ? "border-red-400/50 bg-red-950/20 focus:ring-red-400/50"
                        : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                    }`}
                    placeholder="JOHN S (shown on schedule)"
                  />
                  {formData.nickname && !validatingNickname && nicknameValidation && !nicknameValidation.exists && (
                    <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400" />
                  )}
                </div>

                {/* Nickname suggestions */}
                {nicknameValidation?.exists && nicknameValidation.suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-red-400">Nickname already in use. Suggestions:</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {nicknameValidation.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className="rounded-full bg-[var(--brand)]/20 px-2 py-0.5 text-xs font-medium text-[var(--brand-soft)] hover:bg-[var(--brand)]/30"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                disabled={saving || nicknameValidation?.exists}
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
          <div className="text-sm text-muted-foreground">Loading instructors...</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : instructors.length === 0 ? (
          <div className="text-sm text-muted-foreground">No instructors found.</div>
        ) : displayedInstructors.length === 0 ? (
          <div className="text-sm text-muted-foreground">No instructors match your search.</div>
        ) : (
          <div ref={tableContainerRef} className="report-scroll max-h-96 overflow-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Nickname</th>
                  <th className="px-4 py-2 text-left font-semibold">Instructor ID</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedInstructors.map((instructor) => {
                  const isHighlighted = (searchMode === "find" || searchMode === "smart") && 
                    instructor.id === firstMatchId && 
                    searchTerm.trim() !== "";
                  
                  return (
                    <tr
                      key={instructor.id}
                      ref={isHighlighted ? highlightedRowRef : null}
                      className={`transition-colors ${
                        isHighlighted
                          ? "bg-[var(--brand)]/20 ring-2 ring-[var(--brand)]/50 ring-inset"
                          : "hover:bg-muted/50"
                      } ${!instructor.is_active ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2 text-foreground">
                        {instructor.first_name} {instructor.last_name}
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {instructor.nickname || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground/90">
                        {instructor.readable_id}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            instructor.is_active
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {instructor.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(instructor)}
                            className="rounded-lg p-1.5 hover:bg-white/10"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(instructor)}
                            className={`rounded-lg px-2 py-1 text-xs font-medium ${
                              instructor.is_active
                                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                            }`}
                          >
                            {instructor.is_active ? "Deactivate" : "Activate"}
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

