"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getDefaultBranchThemeColor } from "@/lib/ymca-theme";

type Mode = "light" | "dark";
type SidebarPosition = "left" | "right";

export type BranchOption = { id: string; name: string };

type ThemeState = {
  brandColor: string;
  mode: Mode;
  sidebarPosition: SidebarPosition;
  branch: BranchOption;
};

type ThemeContextValue = ThemeState & {
  setBrandColor: (color: string) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  setSidebarPosition: (pos: SidebarPosition) => void;
  setBranch: (branch: BranchOption) => void;
};

const defaultBranch: BranchOption = {
  id: "26d6acb8-5acf-4a32-ac24-343f30b1442c",
  name: "Eastside Family YMCA",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

const defaultState: ThemeState = {
  brandColor: "#01A490", // Eastside green
  mode: "light",
  sidebarPosition: "left",
  branch: defaultBranch,
};

const ThemeSettingsContext = createContext<ThemeContextValue | null>(null);

// Simple color helpers
function hexToHsl(hex: string) {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      default:
        h = (rNorm - gNorm) / delta + 4;
    }
    h /= 6;
  }

  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number) {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16).padStart(2, "0");
    return hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function adjust(hex: string, delta: number) {
  const { h, s, l } = hexToHsl(hex);
  const nextL = Math.min(1, Math.max(0, l + delta));
  return hslToHex(h, s, nextL);
}

function hexToRgb(hex: string) {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function buildPalette(base: string) {
  return {
    base,
    light: adjust(base, 0.2),
    lighter: adjust(base, 0.3),
    dark: adjust(base, -0.2),
    darker: adjust(base, -0.3),
  };
}

export function ThemeSettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>(() => {
    if (typeof window === "undefined") return defaultState;
    try {
      const saved = window.localStorage.getItem("ymca-theme");
      if (!saved) return defaultState;
      const parsed = JSON.parse(saved) as ThemeState;
      const parsedBranch = parsed.branch ?? defaultBranch;
      // Auto-heal any older saved state that used non-UUID ids like "eastside".
      const safeBranch = isUuid(parsedBranch.id) ? parsedBranch : defaultBranch;
      return {
        ...defaultState,
        ...parsed,
        branch: safeBranch,
      };
    } catch {
      return defaultState;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ymca-theme", JSON.stringify(state));
  }, [state]);

  const applyCssVars = useCallback(
    (current: ThemeState) => {
      if (typeof document === "undefined") return;
      const palette = buildPalette(current.brandColor);
      const root = document.documentElement;
      const isDark = current.mode === "dark";

      // App-inspired chrome: light mode is still a teal/green gradient UI, while
      // dark mode deepens the same theme.
      const bg = isDark ? "#061013" : "#07161a";
      const card = isDark ? "rgba(10, 20, 24, 0.65)" : "rgba(5, 16, 18, 0.50)";
      const muted = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)";
      const foreground = "#eaf6f4";
      const border = isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.12)";
      // Light mode: brighten sidebar surface by ~75% (reduce dark overlay).
      const navSurface = isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.065)";

      root.style.setProperty("--brand", palette.base);
      root.style.setProperty("--brand-strong", palette.dark);
      root.style.setProperty("--brand-soft", palette.light);
      root.style.setProperty("--brand-ink", palette.darker);

      root.style.setProperty("--background", bg);
      root.style.setProperty("--foreground", foreground);
      root.style.setProperty("--card", card);
      root.style.setProperty("--card-foreground", foreground);
      root.style.setProperty("--popover", card);
      root.style.setProperty("--popover-foreground", foreground);
      root.style.setProperty("--primary", palette.base);
      root.style.setProperty(
        "--primary-foreground",
        "#061013",
      );
      root.style.setProperty("--secondary", muted);
      root.style.setProperty("--secondary-foreground", foreground);
      root.style.setProperty("--muted", muted);
      root.style.setProperty(
        "--muted-foreground",
        "rgba(234, 246, 244, 0.80)",
      );
      root.style.setProperty("--accent", muted);
      root.style.setProperty(
        "--accent-foreground",
        foreground,
      );
      root.style.setProperty("--destructive", "#b42318");
      root.style.setProperty("--destructive-foreground", "#fef2f2");
      root.style.setProperty("--border", border);
      root.style.setProperty("--input", border);
      root.style.setProperty("--ring", palette.base);
      root.style.setProperty("--sidebar", navSurface);
      root.style.setProperty("--sidebar-foreground", foreground);
      root.style.setProperty("--sidebar-primary", palette.base);
      root.style.setProperty("--sidebar-primary-foreground", "#061013");
      root.style.setProperty("--sidebar-accent", "rgba(255,255,255,0.08)");
      root.style.setProperty("--sidebar-accent-foreground", foreground);
      root.style.setProperty("--sidebar-border", border);
      root.style.setProperty("--sidebar-ring", palette.base);

      // Gradients
      root.style.setProperty(
        "--brand-gradient",
        `linear-gradient(135deg, ${palette.base}, ${palette.light})`,
      );
      root.style.setProperty(
        "--brand-gradient-strong",
        `linear-gradient(135deg, ${palette.dark}, ${palette.base})`,
      );
      root.style.setProperty(
        "--app-gradient",
        isDark
          ? `linear-gradient(180deg, ${palette.dark} 0%, ${palette.darker} 45%, #061013 100%)`
          : `linear-gradient(180deg, ${palette.base} 0%, ${palette.dark} 45%, #07161a 100%)`,
      );
      root.style.setProperty(
        "--panel-gradient",
        `linear-gradient(135deg, rgba(1,164,144,0.40), rgba(6,16,19,0.55))`,
      );
      root.style.setProperty(
        "--nav-gradient",
        isDark
          ? `linear-gradient(180deg, ${palette.darker} 0%, ${palette.dark} 60%, #061013 140%)`
          : `linear-gradient(180deg, ${palette.light} 0%, ${palette.base} 55%, ${palette.dark} 140%)`,
      );

      // CTA (app's yellow pill buttons)
      root.style.setProperty("--cta", "#F6C400");
      root.style.setProperty("--cta-foreground", "#061013");

      const rgb = hexToRgb(palette.base);
      root.style.setProperty("--brand-rgb", `${rgb.r} ${rgb.g} ${rgb.b}`);
      const rgbSoft = hexToRgb(palette.light);
      root.style.setProperty(
        "--brand-soft-rgb",
        `${rgbSoft.r} ${rgbSoft.g} ${rgbSoft.b}`,
      );

      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    },
    [],
  );

  useEffect(() => {
    applyCssVars(state);
  }, [state, applyCssVars]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...state,
      setBrandColor: (brandColor) => setState((s) => ({ ...s, brandColor })),
      setMode: (mode) => setState((s) => ({ ...s, mode })),
      toggleMode: () =>
        setState((s) => ({ ...s, mode: s.mode === "light" ? "dark" : "light" })),
      setSidebarPosition: (sidebarPosition) =>
        setState((s) => ({ ...s, sidebarPosition })),
      setBranch: (branch) =>
        setState((s) => ({
          ...s,
          branch,
          // Branch selection should auto-apply its assigned theme color.
          brandColor: getDefaultBranchThemeColor(branch.id || branch.name),
        })),
    }),
    [state],
  );

  return (
    <ThemeSettingsContext.Provider value={value}>
      {children}
    </ThemeSettingsContext.Provider>
  );
}

export function useThemeSettings() {
  const ctx = useContext(ThemeSettingsContext);
  if (!ctx) {
    throw new Error("useThemeSettings must be used within ThemeSettingsProvider");
  }
  return ctx;
}
