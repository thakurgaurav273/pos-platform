/**
 * Per-shop appearance stored on `Shop.themeConfig`.
 * Mirrors `apps/api/src/shops/theme/shop-theme.ts`; keep the option lists in sync.
 */
export const THEME_PRESET_IDS = [
  "CLASSIC",
  "MODERN",
  "MINIMAL",
  "ELEGANT",
  "PREMIUM",
  "CUSTOM",
] as const;
export const THEME_MODES = ["light", "dark", "system"] as const;
export const SIDEBAR_STYLES = ["light", "dark", "brand"] as const;
export const HEADER_STYLES = ["light", "brand", "transparent"] as const;
export const RADIUS_STYLES = ["sharp", "default", "rounded"] as const;
export const FONT_STYLES = ["geist", "inter", "system", "serif"] as const;

/**
 * Box an uploaded logo is scaled to fit (px, aspect ratio kept). The sidebar"s logo row
 * grows past its usual 64px for taller logos; the sidebar is 240px wide with 8px side
 * padding, so 224px is the widest a logo can be.
 */
export const LOGO_HEIGHT = { min: 24, max: 96, default: 46 } as const;
export const LOGO_WIDTH = { min: 80, max: 224, default: 200 } as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedMode = "light" | "dark";
export type SidebarStyle = (typeof SIDEBAR_STYLES)[number];
export type HeaderStyle = (typeof HEADER_STYLES)[number];
export type RadiusStyle = (typeof RADIUS_STYLES)[number];
export type FontStyle = (typeof FONT_STYLES)[number];

export type ShopThemeConfig = {
  version: 1;
  preset: ThemePresetId;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  mode: ThemeMode;
  sidebarStyle: SidebarStyle;
  headerStyle: HeaderStyle;
  radius: RadiusStyle;
  font: FontStyle;
  logoHeight: number;
  logoWidth: number;
};

/** 50 (lightest surface tint) to 800 (deepest). 500 is the brand colour itself. */
export type ShadeKey = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800;
export type ShadeScale = Record<ShadeKey, string>;
export const SHADE_KEYS: ShadeKey[] = [50, 100, 200, 300, 400, 500, 600, 700, 800];

/** Device-level light/dark override. `null` follows the shop's configured mode. */
export type ModePreference = ThemeMode | null;
