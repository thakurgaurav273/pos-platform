import { buildThemeAttrs, buildThemeVars } from "./cssVars";
import { resolveThemeConfig } from "./presets";
import { THEME_MODES, type ModePreference, type ShopThemeConfig } from "./types";

/**
 * Device-local storage for the theme:
 * - `fluxen_color_mode`: the user's light/dark/system override on this device.
 * - `fluxen_theme_cache`: last applied theme per shop code, so the pre-paint script
 *   can paint the right colours before React loads. Entries are keyed by shop code and
 *   the whole cache is cleared on logout, so one shop's branding never shows for another.
 */
export const MODE_STORAGE_KEY = "fluxen_color_mode";
export const THEME_CACHE_KEY = "fluxen_theme_cache";
/** Cache slot used when no shop is active (login page, first load). */
export const DEFAULT_CACHE_SLOT = "__default";

export type ThemeCacheEntry = {
  config: ShopThemeConfig;
  logoUrl: string | null;
  light: Record<string, string>;
  dark: Record<string, string>;
  attrs: { light: Record<string, string>; dark: Record<string, string> };
};

export function readModePreference(): ModePreference {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    return v && (THEME_MODES as readonly string[]).includes(v) ? (v as ModePreference) : null;
  } catch {
    return null;
  }
}

export function writeModePreference(pref: ModePreference): void {
  try {
    if (pref) localStorage.setItem(MODE_STORAGE_KEY, pref);
    else localStorage.removeItem(MODE_STORAGE_KEY);
  } catch {
    // Storage blocked: the choice still applies for this page session.
  }
}

function readCache(): Record<string, ThemeCacheEntry> {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ThemeCacheEntry>) : {};
  } catch {
    return {};
  }
}

export function readCachedTheme(
  slot: string,
): { config: ShopThemeConfig; logoUrl: string | null } | null {
  const entry = readCache()[slot];
  if (!entry) return null;
  return { config: resolveThemeConfig(entry.config), logoUrl: entry.logoUrl ?? null };
}

export function writeCachedTheme(
  slot: string,
  config: ShopThemeConfig,
  logoUrl: string | null,
): void {
  try {
    const cache = readCache();
    cache[slot] = {
      config,
      logoUrl,
      light: buildThemeVars(config, "light"),
      dark: buildThemeVars(config, "dark"),
      attrs: { light: buildThemeAttrs(config, "light"), dark: buildThemeAttrs(config, "dark") },
    };
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota or blocked storage: only the pre-paint optimisation is lost.
  }
}

export function clearThemeCache(): void {
  try {
    localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Inline script for `<head>`: applies the cached theme of the signed-in user's active
 * shop (or the default slot) before first paint. Plain ES5, no imports.
 */
export const THEME_PREPAINT_SCRIPT = `(function(){try{
var d=document.documentElement,ls=window.localStorage;
var cache=JSON.parse(ls.getItem(${JSON.stringify(THEME_CACHE_KEY)})||"{}")||{};
var authed=!!ls.getItem("fluxen_auth");
var shop=ls.getItem("fluxen_effective_shop");
var e=(authed&&shop&&cache[shop])||cache[${JSON.stringify(DEFAULT_CACHE_SLOT)}]||null;
var pref=ls.getItem(${JSON.stringify(MODE_STORAGE_KEY)});
var m=pref||(e&&e.config&&e.config.mode)||"light";
if(m==="system"){m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
if(m!=="dark"){m="light";}
d.setAttribute("data-theme-mode",m);d.style.colorScheme=m;
if(e&&e[m]){var v=e[m];for(var k in v){d.style.setProperty(k,v[k]);}
var a=e.attrs&&e.attrs[m];if(a){for(var n in a){d.setAttribute(n,a[n]);}}}
}catch(_){}})();`;
