"use client";

import { App, ConfigProvider } from "antd";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { EFFECTIVE_SHOP_STORAGE_KEY } from "@/lib/api";
import { buildAntdTheme } from "@/lib/theme/antdTheme";
import { buildScales, buildThemeAttrs, buildThemeVars } from "@/lib/theme/cssVars";
import { NEUTRALS } from "@/lib/theme/palette";
import { DEFAULT_THEME, resolveThemeConfig } from "@/lib/theme/presets";
import {
  DEFAULT_CACHE_SLOT,
  MODE_STORAGE_KEY,
  clearThemeCache,
  readCachedTheme,
  readModePreference,
  writeCachedTheme,
  writeModePreference,
} from "@/lib/theme/storage";
import type { ModePreference, ResolvedMode, ShopThemeConfig, ThemeMode } from "@/lib/theme/types";
import type { Shop } from "@/lib/types/shop";

type AppliedTheme = { config: ShopThemeConfig; logoUrl: string | null };

type ThemeContextValue = {
  /** Theme currently on screen (a preview if one is active). */
  config: ShopThemeConfig;
  /** Theme saved on the active shop (or the default). */
  savedConfig: ShopThemeConfig;
  /** Logo on screen: the shop's custom logo, or null for the built-in Calcutta Sweets logo. */
  logoUrl: string | null;
  savedLogoUrl: string | null;
  /** Light or dark, after applying the device override and system preference. */
  mode: ResolvedMode;
  /** This device's override; null follows the shop setting. */
  modePreference: ModePreference;
  setModePreference: (pref: ModePreference) => void;
  /** Temporarily show a theme across the app without saving it. */
  setPreview: (preview: AppliedTheme | null) => void;
  isPreviewing: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/* ---------- tiny external stores (hydration-safe reads of browser state) ---------- */

const modeListeners = new Set<() => void>();
let memoryModePref: ModePreference = null;

function subscribeMode(cb: () => void) {
  modeListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MODE_STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    modeListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
function getModeSnapshot(): ModePreference {
  return readModePreference() ?? memoryModePref;
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeSystemDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveMode(mode: ThemeMode, systemDark: boolean): ResolvedMode {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

function themeOf(shop: Shop): AppliedTheme {
  return { config: resolveThemeConfig(shop.themeConfig), logoUrl: shop.logoUrl ?? null };
}

const DEFAULT_APPLIED: AppliedTheme = { config: DEFAULT_THEME, logoUrl: null };

/**
 * antd popups (selects, dropdowns, colour pickers) default to <body>, but the app shell
 * scrolls inside #main-content, not the window. A body-level popup then stretches the
 * page (the window scrolls, leaving a blank band) and stays put while the content
 * scrolls. Rendering it inside the nearest modal or the main content area keeps it
 * attached to its trigger. Both containers are position: relative.
 */
function getPopupContainer(trigger?: HTMLElement): HTMLElement {
  return (
    trigger?.closest<HTMLElement>(".ant-modal-content, #main-content") ?? document.body
  );
}

/** Applies the active shop's theme to CSS variables and antd, and owns the antd ConfigProvider. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { shops, effectiveShopCode, activeShop } = useShop();
  const [preview, setPreview] = useState<AppliedTheme | null>(null);

  const modePreference = useSyncExternalStore(subscribeMode, getModeSnapshot, () => null);
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  const saved = useMemo<AppliedTheme>(() => {
    if (!isAuthenticated) return DEFAULT_APPLIED;
    if (activeShop) return themeOf(activeShop);
    // Shops still loading: reuse the last theme seen for this shop on this device.
    // Safe to read storage here: isAuthenticated is always false during hydration.
    let code = effectiveShopCode;
    if (!code && typeof window !== "undefined") {
      try {
        code = localStorage.getItem(EFFECTIVE_SHOP_STORAGE_KEY) ?? "";
      } catch {
        code = "";
      }
    }
    return (code && readCachedTheme(code)) || DEFAULT_APPLIED;
  }, [isAuthenticated, activeShop, effectiveShopCode]);

  const applied = preview ?? saved;
  const mode = resolveMode(
    preview ? preview.config.mode : (modePreference ?? saved.config.mode),
    systemDark,
  );

  // Paint: CSS variables + data attributes on <html>. Skipped until auth is restored so
  // the colours painted by the pre-paint script are not replaced by the default first.
  useEffect(() => {
    if (authLoading) return;
    const root = document.documentElement;
    const vars = buildThemeVars(applied.config, mode);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    for (const [k, v] of Object.entries(buildThemeAttrs(applied.config, mode))) {
      root.setAttribute(k, v);
    }
    root.style.colorScheme = mode;
  }, [authLoading, applied.config, mode]);

  // Cache saved themes per shop for the pre-paint script; clear everything on logout.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      clearThemeCache();
    } else {
      for (const shop of shops.slice(0, 50)) {
        const t = themeOf(shop);
        writeCachedTheme(shop.shopCode, t.config, t.logoUrl);
      }
    }
    writeCachedTheme(DEFAULT_CACHE_SLOT, DEFAULT_THEME, null);
  }, [authLoading, isAuthenticated, shops]);

  // A preview never outlives the shop it was started for.
  const [previewShop, setPreviewShop] = useState(effectiveShopCode);
  if (previewShop !== effectiveShopCode) {
    setPreviewShop(effectiveShopCode);
    if (preview) setPreview(null);
  }

  const setModePreference = useCallback((pref: ModePreference) => {
    memoryModePref = pref;
    writeModePreference(pref);
    modeListeners.forEach((cb) => cb());
  }, []);

  const antdTheme = useMemo(
    () => buildAntdTheme(applied.config, mode, { reducedMotion }),
    [applied.config, mode, reducedMotion],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      config: applied.config,
      savedConfig: saved.config,
      logoUrl: applied.logoUrl,
      savedLogoUrl: saved.logoUrl,
      mode,
      modePreference,
      setModePreference,
      setPreview,
      isPreviewing: preview !== null,
    }),
    [applied, saved, mode, modePreference, setModePreference, preview],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antdTheme} getPopupContainer={getPopupContainer}>
        <App>{children}</App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export type ChartPalette = {
  primary: string;
  secondary: string;
  accent: string;
  /** Ordered series colours for pies / multi-series charts. */
  series: string[];
  grid: string;
  axis: string;
  text: string;
  tooltipBg: string;
  tooltipBorder: string;
};

/**
 * Concrete colours for Recharts (SVG attributes need real values, not CSS variables).
 * Follows the active shop theme and light/dark mode.
 */
export function useChartPalette(): ChartPalette {
  const { config, mode } = useTheme();
  return useMemo(() => {
    const n = NEUTRALS[mode];
    const { primary, secondary, accent } = buildScales(config, mode);
    return {
      primary: primary[500],
      secondary: secondary[500],
      accent: accent[500],
      series: [primary[500], secondary[500], accent[500], n["--info"], n["--bistre-400"], primary[300]],
      grid: n["--border"],
      axis: n["--bistre-400"],
      text: n["--bistre-950"],
      tooltipBg: n["--surface-raised"],
      tooltipBorder: n["--border"],
    };
  }, [config, mode]);
}
