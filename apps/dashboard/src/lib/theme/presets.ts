import { isHexColour } from "./color";
import {
  FONT_STYLES,
  HEADER_STYLES,
  RADIUS_STYLES,
  SIDEBAR_STYLES,
  THEME_MODES,
  THEME_PRESET_IDS,
  type ShopThemeConfig,
  type ThemePresetId,
  LOGO_HEIGHT,
  LOGO_WIDTH,
} from "./types";

export type ThemePreset = {
  id: Exclude<ThemePresetId, "CUSTOM">;
  name: string;
  description: string;
  config: ShopThemeConfig;
};

const base = {
  version: 1 as const,
  mode: "light" as const,
  logoHeight: LOGO_HEIGHT.default,
  logoWidth: LOGO_WIDTH.default,
};

/** Curated, professional starting points. Fluxen is the default look. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "CLASSIC",
    name: "Fluxen",
    description: "Signature indigo and cyan on clean, cool neutrals.",
    config: {
      ...base,
      preset: "CLASSIC",
      primaryColor: "#4f46e5",
      secondaryColor: "#0891b2",
      accentColor: "#8b5cf6",
      sidebarStyle: "light",
      headerStyle: "light",
      radius: "default",
      font: "geist",
    },
  },
  {
    id: "MODERN",
    name: "Modern",
    description: "Confident blue with a dark navigation rail.",
    config: {
      ...base,
      preset: "MODERN",
      primaryColor: "#2563eb",
      secondaryColor: "#0d9488",
      accentColor: "#ec4899",
      sidebarStyle: "dark",
      headerStyle: "light",
      radius: "rounded",
      font: "inter",
    },
  },
  {
    id: "MINIMAL",
    name: "Minimal",
    description: "Quiet slate, sharp corners and as little chrome as possible.",
    config: {
      ...base,
      preset: "MINIMAL",
      primaryColor: "#334155",
      secondaryColor: "#64748b",
      accentColor: "#0284c7",
      sidebarStyle: "light",
      headerStyle: "transparent",
      radius: "sharp",
      font: "system",
    },
  },
  {
    id: "ELEGANT",
    name: "Elegant",
    description: "Deep rosewood with plum details and serif headings.",
    config: {
      ...base,
      preset: "ELEGANT",
      primaryColor: "#8b2346",
      secondaryColor: "#5b21b6",
      accentColor: "#0ea5e9",
      sidebarStyle: "light",
      headerStyle: "light",
      radius: "default",
      font: "serif",
    },
  },
  {
    id: "PREMIUM",
    name: "Premium",
    description: "Rich emerald brand rail with cool blue accents.",
    config: {
      ...base,
      preset: "PREMIUM",
      primaryColor: "#047857",
      secondaryColor: "#1e3a8a",
      accentColor: "#0ea5e9",
      sidebarStyle: "brand",
      headerStyle: "light",
      radius: "rounded",
      font: "geist",
    },
  },
];

export const DEFAULT_THEME: ShopThemeConfig = THEME_PRESETS[0].config;

export function getPreset(id: ThemePresetId): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

function oneOf<T extends readonly string[]>(
  list: T,
  value: unknown,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

/**
 * Turns whatever is stored on the shop (possibly NULL, partial or from an older
 * version) into a complete config. Unknown or invalid fields fall back to the default.
 */
function logoSize(value: unknown, range: { min: number; max: number; default: number }) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, Math.round(value)))
    : range.default;
}

export function resolveThemeConfig(raw: unknown): ShopThemeConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_THEME;
  const o = raw as Record<string, unknown>;
  const d = DEFAULT_THEME;
  return {
    version: 1,
    preset: oneOf(THEME_PRESET_IDS, o.preset, "CUSTOM"),
    primaryColor: isHexColour(o.primaryColor) ? o.primaryColor.toLowerCase() : d.primaryColor,
    secondaryColor: isHexColour(o.secondaryColor)
      ? o.secondaryColor.toLowerCase()
      : d.secondaryColor,
    accentColor: isHexColour(o.accentColor) ? o.accentColor.toLowerCase() : d.accentColor,
    mode: oneOf(THEME_MODES, o.mode, d.mode),
    sidebarStyle: oneOf(SIDEBAR_STYLES, o.sidebarStyle, d.sidebarStyle),
    headerStyle: oneOf(HEADER_STYLES, o.headerStyle, d.headerStyle),
    radius: oneOf(RADIUS_STYLES, o.radius, d.radius),
    font: oneOf(FONT_STYLES, o.font, d.font),
    logoHeight: logoSize(o.logoHeight, LOGO_HEIGHT),
    logoWidth: logoSize(o.logoWidth, LOGO_WIDTH),
  };
}

export function themeConfigEquals(a: ShopThemeConfig, b: ShopThemeConfig): boolean {
  return (Object.keys(a) as (keyof ShopThemeConfig)[]).every((k) => a[k] === b[k]);
}

/**
 * When a field is edited by hand the config stops matching its preset; mark it CUSTOM
 * so the picker reflects what is actually stored.
 */
export function withPresetMatch(config: ShopThemeConfig): ShopThemeConfig {
  const match = THEME_PRESETS.find((p) =>
    themeConfigEquals(
      // Presets set colours and chrome only; mode and logo size are the shop's own.
      { ...p.config, mode: config.mode, logoHeight: config.logoHeight, logoWidth: config.logoWidth },
      { ...config, preset: p.id },
    ),
  );
  return { ...config, preset: match ? match.id : "CUSTOM" };
}
