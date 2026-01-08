"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Globe2, Landmark, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { logError } from "@/lib/error-logger";

type Alliance = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_type: "state" | "regional";
  headquarters_state_code: string | null;
  is_active: boolean;
};

type Association = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_id: string | null;
  state_code: string;
  is_active: boolean;
};

type Branch = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  association_id: string;
  city: string | null;
  state_code: string | null;
  is_active: boolean;
  is_main_branch: boolean;
};

type OrgPayload = {
  alliances: Alliance[];
  associations: Association[];
  branches: Branch[];
};

export function OrganizationTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");

  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [selectedAllianceId, setSelectedAllianceId] = useState<string | null>(null);
  const [selectedAssociationId, setSelectedAssociationId] = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set("include_inactive", "true");

      const res = await fetch(`/api/maintenance/organization?${params}`);
      const data = (await res.json().catch(() => ({}))) as Partial<OrgPayload> & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load organization hierarchy");
      }

      setAlliances(Array.isArray(data.alliances) ? data.alliances : []);
      setAssociations(Array.isArray(data.associations) ? data.associations : []);
      setBranches(Array.isArray(data.branches) ? data.branches : []);
    } catch (e) {
      const errorCode = await logError(e instanceof Error ? e : "Failed to load organization hierarchy", "API_ERROR", {
        module: "maintenance.organization",
        criticality: "Low",
        description: "Failed to load YMCA alliances/associations/branches for Maintenance → Organization tab.",
        page: "maintenance",
        action: "loadOrganizationHierarchy",
        params: { includeInactive },
      });
      setError(`Failed to load organization hierarchy. ${errorCode}`);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredAlliances = useMemo(() => {
    if (!normalizedSearch) return alliances;
    return alliances.filter((a) => {
      return (
        a.code.toLowerCase().includes(normalizedSearch) ||
        a.name.toLowerCase().includes(normalizedSearch) ||
        (a.short_name ?? "").toLowerCase().includes(normalizedSearch) ||
        (a.headquarters_state_code ?? "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [alliances, normalizedSearch]);

  const filteredAssociations = useMemo(() => {
    const base = selectedAllianceId
      ? associations.filter((a) => a.alliance_id === selectedAllianceId)
      : associations;
    if (!normalizedSearch) return base;
    return base.filter((a) => {
      return (
        a.code.toLowerCase().includes(normalizedSearch) ||
        a.name.toLowerCase().includes(normalizedSearch) ||
        (a.short_name ?? "").toLowerCase().includes(normalizedSearch) ||
        a.state_code.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [associations, normalizedSearch, selectedAllianceId]);

  const filteredBranches = useMemo(() => {
    const base = selectedAssociationId
      ? branches.filter((b) => b.association_id === selectedAssociationId)
      : selectedAllianceId
        ? branches.filter((b) => {
            const assoc = associations.find((a) => a.id === b.association_id);
            return assoc?.alliance_id === selectedAllianceId;
          })
        : branches;

    if (!normalizedSearch) return base;
    return base.filter((b) => {
      return (
        b.code.toLowerCase().includes(normalizedSearch) ||
        b.name.toLowerCase().includes(normalizedSearch) ||
        (b.short_name ?? "").toLowerCase().includes(normalizedSearch) ||
        (b.city ?? "").toLowerCase().includes(normalizedSearch) ||
        (b.state_code ?? "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [branches, normalizedSearch, selectedAllianceId, selectedAssociationId, associations]);

  const allianceById = useMemo(() => new Map(alliances.map((a) => [a.id, a])), [alliances]);
  const associationById = useMemo(() => new Map(associations.map((a) => [a.id, a])), [associations]);

  const selectedAlliance = selectedAllianceId ? allianceById.get(selectedAllianceId) : null;
  const selectedAssociation = selectedAssociationId ? associationById.get(selectedAssociationId) : null;

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading organization hierarchy…</div>;
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
          <h2 className="text-lg font-semibold text-foreground">Organization Hierarchy</h2>
          <p className="text-sm text-muted-foreground">
            Browse YMCA alliances, associations, and branches (read-only).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIncludeInactive((v) => !v)}
          className="btn-pill inline-flex items-center gap-2 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          {includeInactive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {includeInactive ? "Including inactive" : "Active only"}
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-lg">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes, names, cities, states…"
            className="w-full rounded-xl border border-border bg-background/60 py-2 pl-9 pr-3 text-sm text-foreground shadow-sm outline-none ring-1 ring-transparent transition focus:ring-[var(--cta)]/70"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1">
            <Globe2 className="h-3.5 w-3.5" /> {alliances.length} alliances
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1">
            <Landmark className="h-3.5 w-3.5" /> {associations.length} associations
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-3 py-1">
            <Building2 className="h-3.5 w-3.5" /> {branches.length} branches
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Alliances */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Globe2 className="h-4 w-4" />
                Alliances
              </div>
              {selectedAlliance ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAllianceId(null);
                    setSelectedAssociationId(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {selectedAlliance ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Selected: <span className="font-semibold text-foreground">{selectedAlliance.code.toUpperCase()}</span>
              </div>
            ) : null}
          </div>

          <div className="max-h-[520px] overflow-auto">
            {filteredAlliances.map((a) => {
              const isSelected = selectedAllianceId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setSelectedAllianceId((prev) => (prev === a.id ? null : a.id));
                    setSelectedAssociationId(null);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-muted/40 ${
                    isSelected ? "bg-[var(--cta)]/10" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-foreground">
                        {a.code.toUpperCase()}
                      </span>
                      <span className="truncate font-semibold text-foreground">{a.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{a.alliance_type}</span>
                      {a.headquarters_state_code ? <span>HQ: {a.headquarters_state_code.toUpperCase()}</span> : null}
                      {!a.is_active ? <span className="text-red-300">inactive</span> : null}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
              );
            })}
            {filteredAlliances.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No alliances found.</div>
            ) : null}
          </div>
        </div>

        {/* Associations */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <Landmark className="h-4 w-4" />
                Associations
              </div>
              {selectedAssociation ? (
                <button
                  type="button"
                  onClick={() => setSelectedAssociationId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {selectedAlliance ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Filtered by alliance: <span className="font-semibold text-foreground">{selectedAlliance.code.toUpperCase()}</span>
              </div>
            ) : null}
          </div>

          <div className="max-h-[520px] overflow-auto">
            {filteredAssociations.map((a) => {
              const isSelected = selectedAssociationId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAssociationId((prev) => (prev === a.id ? null : a.id))}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-muted/40 ${
                    isSelected ? "bg-[var(--cta)]/10" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-foreground">
                        {a.code.toUpperCase()}
                      </span>
                      <span className="truncate font-semibold text-foreground">{a.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{a.state_code.toUpperCase()}</span>
                      {!a.is_active ? <span className="text-red-300">inactive</span> : null}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </button>
              );
            })}
            {filteredAssociations.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No associations found.</div>
            ) : null}
          </div>
        </div>

        {/* Branches */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4" />
              Branches
            </div>
            {selectedAssociation ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Filtered by association:{" "}
                <span className="font-semibold text-foreground">{selectedAssociation.code.toUpperCase()}</span>
              </div>
            ) : selectedAlliance ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Filtered by alliance: <span className="font-semibold text-foreground">{selectedAlliance.code.toUpperCase()}</span>
              </div>
            ) : null}
          </div>

          <div className="max-h-[520px] overflow-auto">
            {filteredBranches.map((b) => {
              const assoc = associationById.get(b.association_id);
              return (
                <div key={b.id} className="px-4 py-3 text-sm hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-foreground">
                      {b.code}
                    </span>
                    <span className="truncate font-semibold text-foreground">{b.name}</span>
                    {b.is_main_branch ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                        main
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {assoc ? <span>Assoc: {assoc.code.toUpperCase()}</span> : null}
                    {b.city ? <span>{b.city}</span> : null}
                    {b.state_code ? <span>{b.state_code.toUpperCase()}</span> : null}
                    {!b.is_active ? <span className="text-red-300">inactive</span> : null}
                  </div>
                </div>
              );
            })}
            {filteredBranches.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No branches found.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

