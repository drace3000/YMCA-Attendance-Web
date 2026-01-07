"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Edit2, Plus, X } from "lucide-react";

type ProgramGroup = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type FormData = {
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

export function GroupsTab() {
  const [groups, setGroups] = useState<ProgramGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    code: "",
    name: "",
    description: "",
    sort_order: 1,
    is_active: true,
  });

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/maintenance/program-groups");
      if (!res.ok) throw new Error("Failed to load program groups");
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : (data.groups || []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load program groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const defaultSortOrder = useMemo(() => {
    const max = groups.reduce((acc, g) => Math.max(acc, g.sort_order ?? 0), 0);
    return max + 1;
  }, [groups]);

  const openCreate = () => {
    setEditingId(null);
    setFormError(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      sort_order: defaultSortOrder,
      is_active: true,
    });
    setIsFormOpen(true);
  };

  const openEdit = (g: ProgramGroup) => {
    setEditingId(g.id);
    setFormError(null);
    setFormData({
      code: g.code,
      name: g.name,
      description: g.description,
      sort_order: g.sort_order,
      is_active: g.is_active,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setFormError(null);
    if (!formData.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!formData.description.trim()) {
      setFormError("Description is required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch("/api/maintenance/program-groups", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            code: formData.code.trim() || undefined,
            name: formData.name.trim(),
            description: formData.description.trim(),
            sort_order: formData.sort_order,
            is_active: formData.is_active,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to update group");
      } else {
        const res = await fetch("/api/maintenance/program-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: formData.code.trim() || undefined,
            name: formData.name.trim(),
            description: formData.description.trim(),
            sort_order: formData.sort_order,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to create group");
      }

      closeForm();
      await loadGroups();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading program groups…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Program Groups</h2>
          <p className="text-sm text-muted-foreground">
            Manage the global list of program groups. Branches can enable/disable groups in Settings.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="btn-pill inline-flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-px active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add Group
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--brand-gradient-strong)] text-white">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Order</th>
              <th className="px-4 py-3 text-left font-semibold">Code</th>
              <th className="px-4 py-3 text-left font-semibold">Name</th>
              <th className="px-4 py-3 text-left font-semibold">Description</th>
              <th className="px-4 py-3 text-left font-semibold">Active</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {groups.map((g) => (
              <tr key={g.id} className="hover:bg-white/5">
                <td className="px-4 py-3 text-muted-foreground">{g.sort_order}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground/90">{g.code}</td>
                <td className="px-4 py-3 font-semibold text-foreground">{g.name}</td>
                <td className="px-4 py-3 text-foreground/80">{g.description}</td>
                <td className="px-4 py-3">
                  {g.is_active ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-semibold text-slate-200">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(g)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No groups found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {editingId ? "Edit Group" : "Add Group"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {editingId
                  ? "Update group details. Changes affect all branches."
                  : "Create a new global program group. You can enable it per branch in Settings."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {formError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
              {formError}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">Name *</label>
              <input
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                placeholder="e.g., Pilates"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">
                Code <span className="text-foreground/50">(optional)</span>
              </label>
              <input
                value={formData.code}
                onChange={(e) => updateField("code", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                placeholder="Auto-generated from name if blank"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-foreground/90">Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                className="min-h-[90px] w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
                placeholder="Describe what this program group includes…"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">Sort order</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => updateField("sort_order", Number(e.target.value))}
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => updateField("is_active", e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/20"
                />
                Active
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeForm}
              className="btn-pill inline-flex items-center justify-center gap-2 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-pill inline-flex items-center justify-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


