"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useBranchAccess } from "@/hooks/useBranchAccess";
import { useThemeSettings } from "@/components/theme-settings-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Alliance = { id: string; code: string; name: string };
type Association = { id: string; code: string; name: string; alliance_id: string | null };
type OrgBranch = { id: string; code: string; short_code: string | null; name: string; association_id: string };

type OrgPayload = {
  alliances: Alliance[];
  associations: Association[];
  branches: OrgBranch[];
};

type DropdownOption = { id: string; label: string };

function Dropdown({
  label,
  valueId,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  valueId: string | null;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = valueId ? options.find((o) => o.id === valueId) ?? null : null;

  const sortedOptions = useMemo(() => {
    if (!valueId) return options;
    const selectedOption = options.find((o) => o.id === valueId);
    if (!selectedOption) return options;
    return [selectedOption, ...options.filter((o) => o.id !== valueId)];
  }, [options, valueId]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-foreground/90">{label}:</span>
      <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-expanded={open}
            className={`btn-pill flex min-w-[260px] items-center justify-between gap-2 border px-4 py-2 text-sm shadow-sm ring-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "border-white/25 bg-black/30 ring-white/12 hover:bg-black/40 hover:ring-white/15"
                : "border-white/10 bg-card/60 ring-white/5 hover:bg-card hover:ring-white/10"
            }`}
          >
            <span className="truncate">
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[320px] rounded-xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-1 shadow-xl backdrop-blur-md"
        >
          <div className="max-h-[300px] overflow-y-auto">
            {sortedOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No options</div>
            ) : (
              sortedOptions.map((opt) => {
                const isSelected = opt.id === valueId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "text-foreground hover:bg-[var(--brand-strong)]/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const ADMIN_LAST_BRANCH_KEY = "ymca-admin-last-branch-id";

export function AdminHierarchySelectorBar() {
  const { isAdmin } = useBranchAccess();
  const { branch: currentBranch, setBranch } = useThemeSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [branches, setBranches] = useState<OrgBranch[]>([]);

  const [selectedAllianceId, setSelectedAllianceId] = useState<string | null>(null);
  const [selectedAssociationId, setSelectedAssociationId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectionInitialized, setSelectionInitialized] = useState(false);

  const loadOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/maintenance/organization");
      const json = (await res.json().catch(() => ({}))) as Partial<OrgPayload> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load organization hierarchy");
      setAlliances(Array.isArray(json.alliances) ? json.alliances : []);
      setAssociations(Array.isArray(json.associations) ? json.associations : []);
      setBranches(Array.isArray(json.branches) ? json.branches : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organization hierarchy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadOrg();
  }, [isAdmin, loadOrg]);

  // Initialize selection from last admin-selected branch (per-browser) or current theme branch.
  useEffect(() => {
    if (!isAdmin) return;
    if (loading) return;
    if (selectionInitialized) return;
    if (!branches.length) {
      setSelectionInitialized(true);
      return;
    }

    const stored = typeof window !== "undefined" ? window.localStorage?.getItem(ADMIN_LAST_BRANCH_KEY) : null;
    const initialBranchId =
      (stored && branches.some((b) => b.id === stored) ? stored : null) ??
      (branches.some((b) => b.id === currentBranch.id) ? currentBranch.id : null) ??
      branches[0]?.id ??
      null;

    if (!initialBranchId) {
      setSelectionInitialized(true);
      return;
    }

    const b = branches.find((x) => x.id === initialBranchId) ?? null;
    if (!b) {
      setSelectionInitialized(true);
      return;
    }

    const assoc = associations.find((a) => a.id === b.association_id) ?? null;
    const allianceId = assoc?.alliance_id ?? null;

    setSelectedBranchId(b.id);
    setSelectedAssociationId(assoc?.id ?? null);
    setSelectedAllianceId(allianceId);
    setSelectionInitialized(true);
  }, [isAdmin, loading, selectionInitialized, branches, associations, currentBranch.id]);

  // When admin selects a branch, apply it globally (ThemeSettings) and remember it.
  useEffect(() => {
    if (!isAdmin) return;
    if (!selectedBranchId) return;
    if (selectedBranchId === currentBranch.id) return;
    const b = branches.find((x) => x.id === selectedBranchId);
    if (!b) return;

    setBranch({ id: b.id, name: b.name });
    try {
      window.localStorage?.setItem(ADMIN_LAST_BRANCH_KEY, b.id);
    } catch {
      // ignore
    }
  }, [isAdmin, selectedBranchId, currentBranch.id, branches, setBranch]);

  const allianceOptions: DropdownOption[] = useMemo(
    () => alliances.map((a) => ({ id: a.id, label: `${a.code} - ${a.name}` })),
    [alliances]
  );

  const associationOptions: DropdownOption[] = useMemo(
    () =>
      associations
        .filter((a) => (selectedAllianceId ? a.alliance_id === selectedAllianceId : true))
        .map((a) => ({ id: a.id, label: `${a.code} - ${a.name}` })),
    [associations, selectedAllianceId]
  );

  const branchOptions: DropdownOption[] = useMemo(
    () =>
      branches
        .filter((b) => (selectedAssociationId ? b.association_id === selectedAssociationId : true))
        .map((b) => ({
          id: b.id,
          label: `${(b.short_code ?? b.code).toUpperCase()} - ${b.name}`,
        })),
    [branches, selectedAssociationId]
  );

  if (!isAdmin) return null;

  return (
    <div className="rounded-2xl border border-border bg-card/50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Admin Branch Context</div>
            <div className="text-xs text-muted-foreground">
              Select a branch to view and update Maintenance data for that branch.
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Current: <span className="font-semibold text-foreground/90">{currentBranch.name}</span>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading organization hierarchy…</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Dropdown
              label="Alliance"
              valueId={selectedAllianceId}
              options={allianceOptions}
              placeholder="Select Alliance..."
              onChange={(id) => {
                setSelectedAllianceId(id);
                setSelectedAssociationId(null);
                setSelectedBranchId(null);
              }}
            />
            <Dropdown
              label="Association"
              valueId={selectedAssociationId}
              options={associationOptions}
              placeholder="Select Association..."
              disabled={!selectedAllianceId}
              onChange={(id) => {
                setSelectedAssociationId(id);
                setSelectedBranchId(null);
              }}
            />
            <Dropdown
              label="Branch"
              valueId={selectedBranchId}
              options={branchOptions}
              placeholder="Select Branch..."
              disabled={!selectedAssociationId}
              onChange={(id) => {
                setSelectedBranchId(id);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

