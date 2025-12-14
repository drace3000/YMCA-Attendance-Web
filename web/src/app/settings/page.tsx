"use client";

import { useEffect, useMemo, useState } from "react";
import { BranchOption, useThemeSettings } from "@/components/theme-settings-provider";
import { ThemeColorOption, YMCA_THEME_COLORS, normalizeHex } from "@/lib/ymca-theme";

type BranchResponse = (BranchOption & { theme_color?: string | null })[];

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

  useEffect(() => {
    const load = async () => {
      setLoadingBranches(true);
      setError(null);
      try {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error("Failed to load branches");
        const data: BranchResponse = await res.json();
        setBranches(data.map(({ id, name }) => ({ id, name })));
        const map: Record<string, string> = {};
        for (const b of data) {
          if (b.theme_color) map[b.id] = normalizeHex(b.theme_color);
        }
        setBranchThemeColors((prev) => ({ ...prev, ...map }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load branches");
      } finally {
        setLoadingBranches(false);
      }
    };
    void load();
  }, []);

  const branchOptions = useMemo(() => {
    if (branches.some((b) => b.id === branch.id)) return branches;
    return [branch, ...branches];
  }, [branch, branches]);

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
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/12 bg-panel-gradient p-5 shadow-sm ring-1 ring-white/10">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-foreground/80">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
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

