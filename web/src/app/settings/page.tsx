"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BranchOption, useThemeSettings } from "@/components/theme-settings-provider";
import { ThemeColorOption, YMCA_THEME_COLORS, normalizeHex } from "@/lib/ymca-theme";

type BranchResponse = (BranchOption & { 
  theme_color?: string | null;
  branch_manager_name?: string | null;
  branch_manager_email?: string | null;
  branch_manager_phone?: string | null;
})[];

type BranchManagerData = {
  name: string;
  email: string;
  phone: string;
};

type ProgramGroupOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_enabled: boolean;
};

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Phone format: (1234) 567-8901 ext 12345 (extension optional)
const PHONE_REGEX = /^\(\d{4}\)\s\d{3}-\d{4}(?:\s?(?:ext\.?|x)\s?\d{1,5})?$/;

function isValidEmail(email: string): boolean {
  return email === "" || EMAIL_REGEX.test(email);
}

function isValidPhone(phone: string): boolean {
  return phone === "" || PHONE_REGEX.test(phone.trim());
}

// Mask phone input as (1234) 567-8901 ext 12345
function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16); // max digits: 4+3+4+5
  const area = digits.slice(0, 4);
  const first = digits.slice(4, 7);
  const second = digits.slice(7, 11);
  const ext = digits.slice(11);

  let out = "";
  if (area) out += `(${area}`;
  if (area.length === 4) out += `)`;
  if (first) out += ` ${first}`;
  if (second) out += `-${second}`;
  if (ext) out += ` ext ${ext}`;
  return out.trim();
}

export default function SettingsPage() {
  const {
    branch,
    setBranch,
    brandColor,
    setBrandColor,
    sidebarPosition,
    setSidebarPosition,
  } = useThemeSettings();
  const [branches, setBranches] = useState<BranchOption[]>([branch]);
  const [branchThemeColors, setBranchThemeColors] = useState<Record<string, string>>({
    [branch.id]: brandColor,
  });
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  
  // Branch manager state
  const [branchManagerData, setBranchManagerData] = useState<Record<string, BranchManagerData>>({});
  const [managerForm, setManagerForm] = useState<BranchManagerData>({ name: "", email: "", phone: "" });
  const [savingManager, setSavingManager] = useState(false);
  const [managerSaveStatus, setManagerSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [validationErrors, setValidationErrors] = useState<{ email?: string; phone?: string }>({});
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Program groups (per-branch enablement)
  const [programGroups, setProgramGroups] = useState<ProgramGroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [savingGroups, setSavingGroups] = useState(false);
  const [groupsSaveStatus, setGroupsSaveStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    const load = async () => {
      setLoadingBranches(true);
      setError(null);
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to load branches");
        const data: BranchResponse = await res.json();
        setBranches(data.map(({ id, name }) => ({ id, name })));
        const colorMap: Record<string, string> = {};
        const managerMap: Record<string, BranchManagerData> = {};
        for (const b of data) {
          if (b.theme_color) colorMap[b.id] = normalizeHex(b.theme_color);
          managerMap[b.id] = {
            name: b.branch_manager_name || "",
            email: b.branch_manager_email || "",
            phone: b.branch_manager_phone || "",
          };
        }
        setBranchThemeColors((prev) => ({ ...prev, ...colorMap }));
        setBranchManagerData(managerMap);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load branches");
      } finally {
        setLoadingBranches(false);
      }
    };
    void load();
  }, []);

  // Update manager form when branch changes
  useEffect(() => {
    const data = branchManagerData[branch.id];
    if (data) {
      setManagerForm(data);
    } else {
      setManagerForm({ name: "", email: "", phone: "" });
    }
    setManagerSaveStatus("idle");
  }, [branch.id, branchManagerData]);

  // Load program groups for selected branch
  useEffect(() => {
    const load = async () => {
      if (!branch?.id) return;
      setLoadingGroups(true);
      setGroupsError(null);
      setGroupsSaveStatus("idle");
      try {
        const res = await fetch(`/api/branches/${branch.id}/program-groups`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load program groups");
        const groups = Array.isArray(data.groups) ? data.groups : [];
        setProgramGroups(groups);
      } catch (e) {
        setGroupsError(e instanceof Error ? e.message : "Failed to load program groups");
      } finally {
        setLoadingGroups(false);
      }
    };
    void load();
  }, [branch?.id]);

  const handleSaveGroups = async () => {
    setGroupsError(null);
    setSavingGroups(true);
    setGroupsSaveStatus("idle");
    try {
      const enabledIds = programGroups.filter((g) => g.is_enabled).map((g) => g.id);
      const res = await fetch(`/api/branches/${branch.id}/program-groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled_group_ids: enabledIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save program groups");
      setGroupsSaveStatus("success");
      setTimeout(() => setGroupsSaveStatus("idle"), 3000);
    } catch (e) {
      setGroupsSaveStatus("error");
      setGroupsError(e instanceof Error ? e.message : "Failed to save program groups");
    } finally {
      setSavingGroups(false);
    }
  };

  const branchOptions = useMemo(() => {
    if (branches.some((b) => b.id === branch.id)) return branches;
    return [branch, ...branches];
  }, [branch, branches]);

  const validateForm = (): boolean => {
    const errors: { email?: string; phone?: string } = {};
    
    if (managerForm.email && !isValidEmail(managerForm.email)) {
      errors.email = "Enter a valid email (e.g., manager@ymca.org).";
    }
    
    if (managerForm.phone && !isValidPhone(managerForm.phone)) {
      errors.phone = "Use format (1234) 567-8901 ext 12345 (ext optional).";
    }
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setDialogError(
        "Please fix the highlighted fields:\n• Email must be a valid address\n• Phone must match (1234) 567-8901 ext 12345"
      );
      return false;
    }
    setDialogError(null);
    return true;
  };

  const handleSaveManager = async () => {
    if (!validateForm()) return;
    
    setSavingManager(true);
    setManagerSaveStatus("idle");
    try {
      const res = await fetch(`/api/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_manager_name: managerForm.name || null,
          branch_manager_email: managerForm.email || null,
          branch_manager_phone: managerForm.phone || null,
        }),
      });
      if (!res.ok) {
        const details = await res.json().catch(() => ({}));
        throw new Error(details.error ?? "Failed to save manager info");
      }
      setBranchManagerData((prev) => ({ ...prev, [branch.id]: { ...managerForm } }));
      setManagerSaveStatus("success");
      setTimeout(() => setManagerSaveStatus("idle"), 3000);
    } catch (e) {
      setManagerSaveStatus("error");
      setDialogError(
        e instanceof Error
          ? `Could not save manager info: ${e.message}`
          : "Could not save manager info. Please try again."
      );
    } finally {
      setSavingManager(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="rounded-3xl border border-border bg-panel-gradient p-6 shadow-sm ring-1 ring-white/10">
        <p className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
          Settings
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          Customization
        </h1>
        <p className="mt-1 text-sm text-foreground/80">
          Configure sidebar side, branch selection, and your YMCA color theme. Changes apply immediately.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Sidebar position" description="Show the menu on the left or right.">
          <div className="flex gap-3">
            <ToggleButton
              active={sidebarPosition === "left"}
              onClick={() => setSidebarPosition("left")}
            >
              Left
            </ToggleButton>
            <ToggleButton
              active={sidebarPosition === "right"}
              onClick={() => setSidebarPosition("right")}
            >
              Right
            </ToggleButton>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Branch selection" description="Pick your assigned branch.">
          {loadingBranches ? (
            <div className="text-sm text-muted-foreground">Loading branches…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (
            <select
              className="ymca-select w-full text-sm font-semibold"
              value={branch.id}
              onChange={(e) => {
                const next = branchOptions.find((b) => b.id === e.target.value);
                if (!next) return;
                setBranch(next);
                const assigned = branchThemeColors[next.id];
                if (assigned) setBrandColor(assigned);
              }}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </Card>

        <Card title="Color theme" description="Pick a YMCA brand color (hex is fixed).">
          <ColorDropdown
            value={brandColor}
            onChange={(hex) => setBrandColor(hex)}
            open={colorMenuOpen}
            setOpen={setColorMenuOpen}
          />
          <div className="mt-2 text-xs text-foreground/70">
            Default: Eastside green {normalizeHex("#01A490")}
          </div>
        </Card>
      </section>

      {/* Program Groups Section */}
      <section>
        <Card
          title="Program Groups"
          description={`Enable program groups for ${branch.name}. GroupX is the default for Eastside.`}
          collapsible
          defaultOpen
        >
          {loadingGroups ? (
            <div className="text-sm text-muted-foreground">Loading program groups…</div>
          ) : groupsError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
              {groupsError}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2">
                {programGroups.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 transition hover:bg-black/20"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{g.name}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-foreground/80">
                          {g.code}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm text-foreground/75">{g.description}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={g.is_enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setProgramGroups((prev) =>
                          prev.map((x) => (x.id === g.id ? { ...x, is_enabled: checked } : x))
                        );
                        setGroupsSaveStatus("idle");
                      }}
                      className="mt-1 h-5 w-5 rounded border-white/20 bg-black/20"
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveGroups}
                  disabled={savingGroups || loadingGroups}
                  className="btn-pill bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingGroups ? "Saving..." : "Save Program Groups"}
                </button>
                {groupsSaveStatus === "success" && (
                  <span className="text-sm text-green-400">✓ Saved</span>
                )}
                {groupsSaveStatus === "error" && (
                  <span className="text-sm text-red-400">Failed to save</span>
                )}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* Branch Manager Section */}
      <section>
        <Card title="Branch Manager" description={`Contact information for ${branch.name}`} collapsible defaultOpen>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">Name</label>
              <input
                type="text"
                value={managerForm.name}
                onChange={(e) => setManagerForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Branch Manager Name"
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/50"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">Email</label>
              <input
                type="email"
                value={managerForm.email}
                onChange={(e) => {
                  setManagerForm((f) => ({ ...f, email: e.target.value }));
                  if (validationErrors.email) setValidationErrors((v) => ({ ...v, email: undefined }));
                }}
                placeholder="manager@ymca.org"
                className={`w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                  validationErrors.email 
                    ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50" 
                    : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                }`}
              />
              {validationErrors.email && (
                <p className="mt-1 text-xs text-red-400">{validationErrors.email}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/90">Phone</label>
              <input
                type="tel"
                value={managerForm.phone}
                onChange={(e) => {
                  const next = formatPhoneInput(e.target.value);
                  setManagerForm((f) => ({ ...f, phone: next }));
                  if (validationErrors.phone) setValidationErrors((v) => ({ ...v, phone: undefined }));
                }}
                placeholder="(1234) 567-8901 ext 12345"
                className={`w-full rounded-xl border px-3 py-2 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 ${
                  validationErrors.phone 
                    ? "border-red-500/50 bg-red-950/20 focus:ring-red-500/50" 
                    : "border-white/15 bg-black/20 focus:ring-[var(--brand)]/50"
                }`}
              />
              {validationErrors.phone && (
                <p className="mt-1 text-xs text-red-400">{validationErrors.phone}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveManager}
                disabled={savingManager}
                className="btn-pill bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {savingManager ? "Saving..." : "Save Manager Info"}
              </button>
              {managerSaveStatus === "success" && (
                <span className="text-sm text-green-400">✓ Saved</span>
              )}
              {managerSaveStatus === "error" && (
                <span className="text-sm text-red-400">Failed to save</span>
              )}
            </div>
          </div>
        </Card>
      </section>
      {dialogError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-50 shadow-lg ring-1 ring-red-500/20">
          <div className="font-semibold">Please fix and retry</div>
          <p className="mt-1 whitespace-pre-line text-red-50/90">{dialogError}</p>
          <button
            className="mt-3 rounded-lg border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
            onClick={() => setDialogError(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-3xl border border-white/12 bg-panel-gradient p-5 shadow-sm ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-foreground/80">{description}</p>
        </div>

        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn-pill inline-flex items-center gap-2 border border-white/12 bg-black/15 px-3 py-2 text-xs font-semibold text-foreground/90 shadow-sm transition hover:bg-black/25"
            aria-expanded={open}
          >
            <span>{open ? "Collapse" : "Expand"}</span>
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {(!collapsible || open) && <div className="mt-4">{children}</div>}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`btn-pill border px-4 py-2 text-sm font-semibold shadow-sm transition ${
        active
          ? "border-white/20 bg-black/25 text-white ring-1 ring-white/10"
          : "border-white/12 bg-black/15 text-foreground/90 hover:bg-black/25"
      }`}
    >
      {children}
    </button>
  );
}

function ColorDropdown({
  value,
  onChange,
  open,
  setOpen,
}: {
  value: string;
  onChange: (hex: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const selected =
    YMCA_THEME_COLORS.find((c) => normalizeHex(c.hex) === normalizeHex(value)) ??
    ({ id: "custom", name: "Selected", hex: value } satisfies ThemeColorOption);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm font-semibold text-foreground shadow-sm backdrop-blur hover:bg-black/30"
      >
        <span className="flex items-center gap-2">
          <span
            className="h-4 w-4 rounded-full ring-1 ring-white/20"
            style={{ backgroundColor: selected.hex }}
          />
          <span>{selected.name}</span>
        </span>
        <span className="text-xs text-foreground/70">{normalizeHex(selected.hex)}</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/12 bg-black/45 shadow-xl backdrop-blur">
          <div className="max-h-64 overflow-auto p-1">
            {YMCA_THEME_COLORS.map((opt) => {
              const isActive = normalizeHex(opt.hex) === normalizeHex(value);
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => {
                    onChange(normalizeHex(opt.hex));
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                    isActive
                      ? "bg-[var(--brand-strong)]/40"
                      : "hover:bg-[var(--brand-strong)]/25"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: opt.hex }}
                    />
                    <span className="text-foreground">{opt.name}</span>
                  </span>
                  <span className="text-xs text-foreground/70">{normalizeHex(opt.hex)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

