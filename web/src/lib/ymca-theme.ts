export type ThemeColorOption = {
  id: string;
  name: string;
  hex: string;
};

// NOTE: Add the full YMCA brand palette here as needed. For now we seed the
// dropdown with the default Eastside green and a few common companion themes.
export const YMCA_THEME_COLORS: ThemeColorOption[] = [
  { id: "ymca-green", name: "YMCA Green", hex: "#01A490" },
  { id: "ymca-blue", name: "YMCA Blue", hex: "#0077C8" },
  { id: "ymca-navy", name: "YMCA Navy", hex: "#0B1F3B" },
  { id: "ymca-purple", name: "YMCA Purple", hex: "#6E3FA9" },
  { id: "ymca-orange", name: "YMCA Orange", hex: "#F36F21" },
  { id: "ymca-red", name: "YMCA Red", hex: "#D7263D" },
];

export function normalizeHex(hex: string) {
  const h = hex.trim();
  if (!h.startsWith("#")) return `#${h}`.toUpperCase();
  return h.toUpperCase();
}

export function findThemeByHex(hex: string) {
  const target = normalizeHex(hex);
  return YMCA_THEME_COLORS.find((t) => normalizeHex(t.hex) === target) ?? null;
}

export function getDefaultBranchThemeColor(branchNameOrId: string | undefined) {
  const v = (branchNameOrId ?? "").toLowerCase();
  if (v.includes("eastside") || v.includes("east")) return "#01A490";
  // Default to Eastside green until branch->theme mapping exists in DB.
  return "#01A490";
}




