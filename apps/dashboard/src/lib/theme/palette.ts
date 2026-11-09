import {
  contrast,
  ensureContrast,
  mix,
  readableOn,
  rgba,
} from "./color";
import type { ResolvedMode, ShadeScale } from "./types";

/**
 * Neutral palettes (ink, canvas, surfaces, borders, status). The light values are the
 * same as the `:root` defaults in `app/globals.css`, which are what the server renders.
 */
export const NEUTRALS: Record<ResolvedMode, Record<string, string>> = {
  light: {
    "--bistre-950": "#18181b",
    "--bistre-900": "#27272a",
    "--bistre-800": "#3f3f46",
    "--bistre-700": "#52525b",
    "--bistre-600": "#52525b",
    "--bistre-500": "#5f5f69",
    "--bistre-400": "#71717a",
    "--bistre-300": "#a1a1aa",
    "--bistre-200": "#d4d4d8",
    "--bistre-100": "#e4e4e7",
    "--bistre-80": "rgba(24, 24, 27, 0.8)",
    "--bistre-60": "rgba(24, 24, 27, 0.6)",
    "--bistre-50": "rgba(24, 24, 27, 0.5)",
    "--ink-rgb": "24, 24, 27",
    "--linen": "#f7f7f6",
    "--linen-100": "#fbfbfa",
    "--linen-95": "#f7f7f6",
    "--linen-90": "#f0f0ee",
    "--linen-80": "#e7e7e4",
    "--parchment": "#fbfbfa",
    "--pearl-bush": "#e6e6e3",
    "--surface": "#ffffff",
    "--surface-rgb": "255, 255, 255",
    "--surface-subtle": "#fbfbfa",
    "--surface-raised": "#ffffff",
    "--border": "#e6e6e3",
    "--border-strong": "#d4d4d1",
    "--overlay": "rgba(24, 24, 27, 0.55)",
    "--shadow-xs": "0 1px 0 rgba(24, 24, 27, 0.03)",
    "--shadow-sm": "0 1px 2px rgba(24, 24, 27, 0.05)",
    "--shadow-md":
      "0 1px 2px rgba(24, 24, 27, 0.06), 0 10px 24px -14px rgba(24, 24, 27, 0.2)",
    "--shadow-lg":
      "0 2px 4px rgba(24, 24, 27, 0.04), 0 18px 40px -18px rgba(24, 24, 27, 0.25)",
    "--success": "#15803d",
    "--success-bg": "#dcfce7",
    "--warning": "#a16207",
    "--warning-bg": "#fef9c3",
    "--danger": "#b91c1c",
    "--danger-bg": "#fee2e2",
    "--info": "#1d4ed8",
    "--info-bg": "#dbeafe",
  },
  dark: {
    "--bistre-950": "#f4f4f5",
    "--bistre-900": "#e4e4e7",
    "--bistre-800": "#d4d4d8",
    "--bistre-700": "#b8b8c0",
    "--bistre-600": "#b8b8c0",
    "--bistre-500": "#a1a1aa",
    "--bistre-400": "#8e8e98",
    "--bistre-300": "#5f5f69",
    "--bistre-200": "#3f3f46",
    "--bistre-100": "#2e2e34",
    "--bistre-80": "rgba(244, 244, 245, 0.8)",
    "--bistre-60": "rgba(244, 244, 245, 0.6)",
    "--bistre-50": "rgba(244, 244, 245, 0.5)",
    "--ink-rgb": "244, 244, 245",
    "--linen": "#0e0e10",
    "--linen-100": "#141417",
    "--linen-95": "#121215",
    "--linen-90": "#202025",
    "--linen-80": "#2a2a30",
    "--parchment": "#1c1c20",
    "--pearl-bush": "#2c2c32",
    "--surface": "#17171a",
    "--surface-rgb": "23, 23, 26",
    "--surface-subtle": "#1c1c20",
    "--surface-raised": "#1f1f23",
    "--border": "#2c2c32",
    "--border-strong": "#3c3c44",
    "--overlay": "rgba(0, 0, 0, 0.65)",
    "--shadow-xs": "0 1px 0 rgba(0, 0, 0, 0.3)",
    "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.4)",
    "--shadow-md": "0 1px 2px rgba(0, 0, 0, 0.4), 0 10px 24px -14px rgba(0, 0, 0, 0.7)",
    "--shadow-lg": "0 2px 4px rgba(0, 0, 0, 0.4), 0 18px 40px -18px rgba(0, 0, 0, 0.8)",
    "--success": "#4ade80",
    "--success-bg": "rgba(34, 197, 94, 0.16)",
    "--warning": "#facc15",
    "--warning-bg": "rgba(234, 179, 8, 0.16)",
    "--danger": "#f87171",
    "--danger-bg": "rgba(239, 68, 68, 0.16)",
    "--info": "#60a5fa",
    "--info-bg": "rgba(59, 130, 246, 0.16)",
  },
};

/** Exact copper scale from the original design, so shops saved with the old copper theme render unchanged. */
const COPPER_LIGHT: ShadeScale = {
  50: "#fef8f3",
  100: "#fdf1e8",
  200: "#f3d2bc",
  300: "#e0a27a",
  400: "#c8773a",
  500: "#a84f1c",
  600: "#8f4218",
  700: "#74360f",
  800: "#5c2b0c",
};

const WHITE = "#ffffff";
const BLACK = "#000000";

/**
 * Shade scale for light mode. 500 is the brand colour; lighter shades are tints
 * toward white, darker ones shades toward black, so luminance falls monotonically.
 * 600 is used for accent text on white, so it is darkened until it reaches 4.5:1.
 */
export function lightScale(baseHex: string): ShadeScale {
  const base = baseHex.toLowerCase();
  if (base === COPPER_LIGHT[500]) return COPPER_LIGHT;
  const s600 = ensureContrast(mix(base, BLACK, 0.15), WHITE, 4.5, BLACK);
  return {
    50: mix(base, WHITE, 0.96),
    100: mix(base, WHITE, 0.92),
    200: mix(base, WHITE, 0.74),
    300: mix(base, WHITE, 0.48),
    400: mix(base, WHITE, 0.2),
    500: base,
    600: s600,
    700: mix(s600, BLACK, 0.2),
    800: mix(s600, BLACK, 0.38),
  };
}

/**
 * Dark mode flips the roles: low shades become dark tinted surfaces and high shades
 * become lighter "accent text" colours, so the same variable names keep working.
 */
export function darkScale(baseHex: string): ShadeScale {
  const surface = NEUTRALS.dark["--surface"];
  const s500 = ensureContrast(baseHex.toLowerCase(), surface, 3.2, WHITE);
  const s600 = ensureContrast(mix(s500, WHITE, 0.22), surface, 5.6, WHITE);
  return {
    50: mix(surface, s500, 0.07),
    100: mix(surface, s500, 0.16),
    200: mix(surface, s500, 0.3),
    300: mix(surface, s500, 0.5),
    400: mix(s500, WHITE, 0.14),
    500: s500,
    600: s600,
    700: mix(s600, WHITE, 0.25),
    800: mix(s600, WHITE, 0.45),
  };
}

export function scaleFor(baseHex: string, mode: ResolvedMode): ShadeScale {
  return mode === "dark" ? darkScale(baseHex) : lightScale(baseHex);
}

/** Text colour for content placed on the 500 shade (buttons, badges). */
export function onColour(scale: ShadeScale): string {
  return readableOn(scale[500]);
}

/**
 * Background used for "brand" sidebars/headers: a deep version of the primary colour
 * that keeps white text at 4.5:1 or better.
 */
export function brandChrome(primaryHex: string, mode: ResolvedMode): string {
  const deep = mix(primaryHex, BLACK, mode === "dark" ? 0.55 : 0.3);
  return ensureContrast(deep, WHITE, 4.5, BLACK);
}

/** Lowest contrast of the brand colour against both canvases; used for picker warnings. */
export function worstCanvasContrast(hex: string): number {
  return Math.min(
    contrast(hex, NEUTRALS.light["--surface"]),
    contrast(hex, NEUTRALS.dark["--surface"]),
  );
}

export { rgba };
