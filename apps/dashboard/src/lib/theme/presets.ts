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
} from "./types";

export type ThemePreset = {
  id: Exclude<ThemePresetId, "CUSTOM">;
  name: string;
  description: string;
  config: ShopThemeConfig;
};

const base = { version: 1 as const, mode: "light" as const };

/** Curated, professional starting points. Classic is today's Calcutta Sweets look. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "CLASSIC",
    name: "Classic",
    description: "Warm copper from the Calcutta Sweets logo on clean neutrals.",
    config: {
      ...base,
      preset: "CLASSIC",
      primaryColor: "#a84f1c",
      secondaryColor: "#0f766e",
      accentColor: "#ca8a04",
      sidebarStyle: "light",
      headerStyle: "light",
      radius: "default",
      font: "geist",
    },
  },
  {
    id: "MODERN",
    name: "Modern",
    description: "Confident indigo with a dark navigation rail.",
    config: {
      ...base,
      preset: "MODERN",
      primaryColor: "#4f46e5",
      secondaryColor: "#0891b2",
      accentColor: "#f59e0b",
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
    description: "Deep rosewood with gold details and serif headings.",
    config: {
      ...base,
      preset: "ELEGANT",
      primaryColor: "#8b2346",
      secondaryColor: "#7c5e10",
      accentColor: "#b08d57",
      sidebarStyle: "light",
      headerStyle: "light",
      radius: "default",
      font: "serif",
    },
  },
  {
    id: "PREMIUM",
    name: "Premium",
    description: "Rich emerald brand rail with gold accents.",
    config: {
      ...base,
      preset: "PREMIUM",
      primaryColor: "#047857",
      secondaryColor: "#1e3a8a",
      accentColor: "#b7791f",
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
    themeConfigEquals({ ...p.config, mode: config.mode }, { ...config, preset: p.id }),
  );
  return { ...config, preset: match ? match.id : "CUSTOM" };
}
