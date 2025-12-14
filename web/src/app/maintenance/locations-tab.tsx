"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Edit2, Plus, Search, X } from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Location = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type FormData = {
  code: string;
  name: string;
};

type ValidationState = {
  codeExists: boolean;
  nameExists: boolean;
};

export function LocationsTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    code: "",
    name: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Validation state
  const [validation, setValidation] = useState<ValidationState>({
    codeExists: false,
    nameExists: false,
  });
  const [validating, setValidating] = useState({ code: false, name: false });

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<"narrow" | "find" | "smart">("narrow");
  const [popoverOpen, setPopoverOpen] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("include_inactive", "true");
      const res = await fetch(`/api/maintenance/locations?${params}`);
      if (!res.ok) throw new Error("Failed to load locations");
      const data = await res.json();
      setLocations(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  // Validate code with debounce
  useEffect(() => {
    if (!formData.code.trim()) {
      setValidation((v) => ({ ...v, codeExists: false }));
      return;
    }

    const timeout = setTimeout(async () => {
      setValidating((v) => ({ ...v, code: true }));
      try {
        const params = new URLSearchParams({
          check_code: formData.code.trim(),
        });
        if (editingId) {
          params.set("exclude_id", editingId);
        }
        const res = await fetch(`/api/maintenance/locations?${params}`);
        if (res.ok) {
          const data = await res.json();
          setValidation((v) => ({ ...v, codeExists: data.exists }));
        }
      } catch {
        // Ignore validation errors
      } finally {
        setValidating((v) => ({ ...v, code: false }));
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formData.code, editingId]);

  // Validate name with debounce
  useEffect(() => {
    if (!formData.name.trim()) {
      setValidation((v) => ({ ...v, nameExists: false }));
      return;
    }

    const timeout = setTimeout(async () => {
      setValidating((v) => ({ ...v, name: true }));
      try {
        const params = new URLSearchParams({
          check_name: formData.name.trim(),
        });
        if (editingId) {
          params.set("exclude_id", editingId);
        }
        const res = await fetch(`/api/maintenance/locations?${params}`);
        if (res.ok) {
          const data = await res.json();
          setValidation((v) => ({ ...v, nameExists: data.exists }));
        }
      } catch {
        // Ignore validation errors
      } finally {
        setValidating((v) => ({ ...v, name: false }));
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formData.name, editingId]);

  const openNewForm = () => {
    setFormData({ code: "", name: "" });
    setEditingId(null);
    setFormError(null);
    setValidation({ codeExists: false, nameExists: false });
    setIsFormOpen(true);
  };

  const openEditForm = (location: Location) => {
    setFormData({
      code: location.code,
      name: location.name,
    });
    setEditingId(location.id);
    setFormError(null);
    setValidation({ codeExists: false, nameExists: false });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
    setValidation({ codeExists: false, nameExists: false });
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError("Code and name are required");
      return;
    }

    if (validation.codeExists || validation.nameExists) {
      setFormError("Please fix duplicate errors before saving");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId
        ? { id: editingId, ...formData }
        : formData;

      const res = await fetch("/api/maintenance/locations", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      closeForm();
      await loadLocations();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (location: Location) => {
    try {
      const res = await fetch("/api/maintenance/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: location.id, is_active: !location.is_active }),
      });

      if (!res.ok) throw new Error("Failed to update");
      await loadLocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const hasValidationErrors = validation.codeExists || validation.nameExists;

  // Search/filter logic
  const matchesSearch = useCallback((location: Location, term: string): boolean => {
    if (!term.trim()) return true;
    const lowerTerm = term.toLowerCase();
    return location.name.toLowerCase().includes(lowerTerm);
  }, []);

  const { displayedLocations, firstMatchId } = useMemo(() => {
    const term = searchTerm.trim();
    
    if (!term) {
      return { displayedLocations: locations, firstMatchId: null };
    }

    const firstMatch = locations.find((l) => matchesSearch(l, term));
    const firstMatchId = firstMatch?.id ?? null;

    if (searchMode === "find") {
      return { displayedLocations: locations, firstMatchId };
    }

    const filtered = locations.filter((l) => matchesSearch(l, term));
    return { displayedLocations: filtered, firstMatchId };
  }, [locations, searchTerm, searchMode, matchesSearch]);

  useEffect(() => {
    if ((searchMode === "find" || searchMode === "smart") && firstMatchId && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [firstMatchId, searchMode]);

  const searchModeOptions = [
    {
      id: "narrow" as const,
      label: "Narrow",
      description: "Narrows the list to show only locations matching your search. Non-matching locations are hidden.",
    },
    {
      id: "find" as const,
      label: "Find",
      description: "Finds and scrolls to matching locations while keeping the full list visible. Matches are highlighted.",
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
          <h2 className="text-base font-semibold">Locations</h2>
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
          <div className="relative z-10">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              autoComplete="off"
              className="w-40 rounded-xl border border-white/15 bg-black/20 py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
            />
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
          Add Location
        </button>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="border-b border-border bg-card/50 px-5 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {editingId ? "Edit Location" : "New Location"}
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
                  Code <span className="text-red-400">*</span>
                  {validating.code && (
                    <span className="ml-2 text-xs text-foreground/50">checking...</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                      validation.codeExists
                        ? "border-red-400/50 bg-red-950/20 focus:ring-red-400/50"
                        : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                    }`}
                    placeholder="e.g., MB, STUDIO, GYM"
                  />
                  {formData.code && !validating.code && !validation.codeExists && (
                    <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400" />
                  )}
                </div>
                {validation.codeExists && (
                  <p className="mt-1 text-xs text-red-400">This code already exists</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">
                  Name <span className="text-red-400">*</span>
                  {validating.name && (
                    <span className="ml-2 text-xs text-foreground/50">checking...</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                      validation.nameExists
                        ? "border-red-400/50 bg-red-950/20 focus:ring-red-400/50"
                        : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                    }`}
                    placeholder="e.g., Main Building, Yoga Studio"
                  />
                  {formData.name && !validating.name && !validation.nameExists && (
                    <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400" />
                  )}
                </div>
                {validation.nameExists && (
                  <p className="mt-1 text-xs text-red-400">This name already exists</p>
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
                disabled={saving || hasValidationErrors}
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
          <div className="text-sm text-muted-foreground">Loading locations...</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : locations.length === 0 ? (
          <div className="text-sm text-muted-foreground">No locations found.</div>
        ) : displayedLocations.length === 0 ? (
          <div className="text-sm text-muted-foreground">No locations match your search.</div>
        ) : (
          <div className="report-scroll max-h-96 overflow-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/60 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedLocations.map((location) => {
                  const isHighlighted = (searchMode === "find" || searchMode === "smart") && 
                    location.id === firstMatchId && 
                    searchTerm.trim() !== "";
                  
                  return (
                    <tr
                      key={location.id}
                      ref={isHighlighted ? highlightedRowRef : null}
                      className={`transition-colors ${
                        isHighlighted
                          ? "bg-[var(--brand)]/20 ring-2 ring-[var(--brand)]/50 ring-inset"
                          : "hover:bg-muted/50"
                      } ${!location.is_active ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2 font-mono text-foreground">
                        {location.code}
                      </td>
                      <td className="px-4 py-2 text-foreground">
                        {location.name}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            location.is_active
                              ? "bg-green-500/20 text-green-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {location.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(location)}
                            className="rounded-lg p-1.5 hover:bg-white/10"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(location)}
                            className={`rounded-lg px-2 py-1 text-xs font-medium ${
                              location.is_active
                                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                            }`}
                          >
                            {location.is_active ? "Deactivate" : "Activate"}
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
