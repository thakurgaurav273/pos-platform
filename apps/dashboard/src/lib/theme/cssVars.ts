import { mix, rgbTriplet, rgba } from "./color";
import { NEUTRALS, brandChrome, onColour, scaleFor } from "./palette";
import {
  SHADE_KEYS,
  type FontStyle,
  type RadiusStyle,
  type ResolvedMode,
  type ShadeScale,
  type ShopThemeConfig,
} from "./types";

export const RADIUS_SCALE: Record<RadiusStyle, number> = {
  sharp: 0.5,
  default: 1,
  rounded: 1.5,
};

const SYSTEM_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Font variables come from next/font in `app/layout.tsx`. */
export const FONT_STACKS: Record<FontStyle, { body: string; heading: string }> = {
  geist: {
    body: `var(--font-geist-sans), ${SYSTEM_STACK}`,
    heading: `var(--font-geist-sans), ${SYSTEM_STACK}`,
  },
  inter: {
    body: `var(--font-inter), ${SYSTEM_STACK}`,
    heading: `var(--font-inter), ${SYSTEM_STACK}`,
  },
  system: { body: SYSTEM_STACK, heading: SYSTEM_STACK },
  serif: {
    body: `var(--font-geist-sans), ${SYSTEM_STACK}`,
    heading: `var(--font-playfair), Georgia, "Times New Roman", serif`,
  },
};

/** Mirrors the var()-based aliases in the :root block of app/globals.css. */
const DERIVED_TOKENS: Record<string, string> = {
  "--ui-radius-sm": "calc(4px * var(--ui-radius-scale))",
  "--ui-radius-md": "calc(8px * var(--ui-radius-scale))",
  "--ui-radius-lg": "calc(12px * var(--ui-radius-scale))",
  "--ui-radius-xl": "calc(16px * var(--ui-radius-scale))",
  "--bistre": "var(--bistre-800)",
  "--ochre": "var(--ochre-500)",
  "--ochre-light": "var(--ochre-400)",
  "--ochre-dark": "var(--ochre-600)",
  "--gold-300": "var(--accent-300)",
  "--gold-400": "var(--accent-400)",
  "--gold-500": "var(--accent-500)",
  "--gold-700": "var(--accent-700)",
  "--gold-100": "var(--accent-100)",
  "--gold-50": "var(--accent-50)",
  "--espresso-950": "var(--bistre-950)",
  "--espresso-900": "var(--bistre-900)",
  "--espresso-800": "var(--bistre-800)",
  "--espresso-text": "var(--bistre-700)",
  "--espresso-muted": "var(--bistre-400)",
  "--espresso-line": "var(--border)",
  "--text-primary": "var(--bistre-950)",
  "--text-secondary": "var(--bistre-700)",
  "--text-muted": "var(--bistre-400)",
  "--text-disabled": "var(--bistre-300)",
  "--cta-primary": "var(--ochre-500)",
  "--cta-hover": "var(--ochre-400)",
  "--cta-active": "var(--ochre-600)",
  "--cta-muted": "var(--ochre-200)",
  "--background": "var(--linen)",
  "--foreground": "var(--bistre-950)",
};

export type ThemeScales = {
  primary: ShadeScale;
  secondary: ShadeScale;
  accent: ShadeScale;
};

export function buildScales(config: ShopThemeConfig, mode: ResolvedMode): ThemeScales {
  return {
    primary: scaleFor(config.primaryColor, mode),
    secondary: scaleFor(config.secondaryColor, mode),
    accent: scaleFor(config.accentColor, mode),
  };
}

function scaleVars(prefix: string, scale: ShadeScale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SHADE_KEYS) out[`--${prefix}-${k}`] = scale[k];
  out[`--${prefix}-rgb`] = rgbTriplet(scale[500]);
  out[`--on-${prefix}`] = onColour(scale);
  return out;
}

/** Sidebar / header colours for each chrome style. */
function chromeVars(
  config: ShopThemeConfig,
  mode: ResolvedMode,
  primary: ShadeScale,
): Record<string, string> {
  const brand = brandChrome(config.primaryColor, mode);
  const darkRail = mode === "dark" ? "#0b0b0d" : "#151518";
  const onDark = {
    fg: "rgba(255, 255, 255, 0.78)",
    muted: "rgba(255, 255, 255, 0.52)",
    hoverBg: "rgba(255, 255, 255, 0.07)",
    hoverFg: "#ffffff",
    activeBg: "rgba(255, 255, 255, 0.12)",
    activeFg: "#ffffff",
    border: "rgba(255, 255, 255, 0.08)",
  };

  const sidebar =
    config.sidebarStyle === "dark"
      ? {
          bg: darkRail,
          ...onDark,
          activeBg: rgba(mix(config.primaryColor, "#ffffff", 0.2), 0.22),
          indicator: mix(config.primaryColor, "#ffffff", 0.35),
        }
      : config.sidebarStyle === "brand"
        ? { bg: brand, ...onDark, indicator: mix(config.accentColor, "#ffffff", 0.2) }
        : {
            bg: "var(--surface)",
            fg: "var(--bistre-700)",
            muted: "var(--bistre-400)",
            hoverBg: "var(--linen-90)",
            hoverFg: "var(--bistre-950)",
            activeBg: primary[100],
            activeFg: primary[600],
            border: "var(--border)",
            indicator: primary[500],
          };

  const header =
    config.headerStyle === "brand"
      ? {
          bg: brand,
          fg: "#ffffff",
          muted: "rgba(255, 255, 255, 0.72)",
          border: "transparent",
          controlBg: "rgba(255, 255, 255, 0.1)",
          controlBorder: "rgba(255, 255, 255, 0.22)",
          controlHover: "rgba(255, 255, 255, 0.16)",
        }
      : config.headerStyle === "transparent"
        ? {
            bg: "var(--linen)",
            fg: "var(--text-primary)",
            muted: "var(--text-muted)",
            border: "transparent",
            controlBg: "var(--surface)",
            controlBorder: "var(--border)",
            controlHover: "var(--linen-90)",
          }
        : {
            bg: "var(--surface)",
            fg: "var(--text-primary)",
            muted: "var(--text-muted)",
            border: "var(--border)",
            controlBg: "var(--surface)",
            controlBorder: "var(--border)",
            controlHover: "var(--linen)",
          };

  return {
    "--sidebar-bg": sidebar.bg,
    "--sidebar-fg": sidebar.fg,
    "--sidebar-muted": sidebar.muted,
    "--sidebar-hover-bg": sidebar.hoverBg,
    "--sidebar-hover-fg": sidebar.hoverFg,
    "--sidebar-active-bg": sidebar.activeBg,
    "--sidebar-active-fg": sidebar.activeFg,
    "--sidebar-border": sidebar.border,
    "--sidebar-indicator": sidebar.indicator,
    "--header-bg": header.bg,
    "--header-fg": header.fg,
    "--header-muted": header.muted,
    "--header-border": header.border,
    "--header-control-bg": header.controlBg,
    "--header-control-border": header.controlBorder,
    "--header-control-hover": header.controlHover,
  };
}

/**
 * Every CSS custom property the theme controls, for one config and mode. Applied on
 * `<html>` for the app, or on a wrapper element for a scoped preview.
 */
export function buildThemeVars(
  config: ShopThemeConfig,
  mode: ResolvedMode,
): Record<string, string> {
  const { primary, secondary, accent } = buildScales(config, mode);
  const r = RADIUS_SCALE[config.radius];
  const fonts = FONT_STACKS[config.font];
  return {
    ...NEUTRALS[mode],
    ...scaleVars("ochre", primary),
    "--ochre-20": rgba(primary[500], 0.2),
    "--ochre-10": rgba(primary[500], 0.1),
    "--ochre-2": rgba(primary[500], 0.02),
    "--on-primary": onColour(primary),
    ...scaleVars("secondary", secondary),
    ...scaleVars("accent", accent),
    "--ring": `0 0 0 3px ${rgba(primary[500], mode === "dark" ? 0.35 : 0.18)}`,
    "--ui-radius-scale": String(r),
    // Tokens derived from others in :root must be redeclared here too: custom properties
    // resolve where they are declared, so a scoped preview would otherwise inherit the
    // page's resolved values instead of its own.
    ...DERIVED_TOKENS,
    "--font-body": fonts.body,
    "--font-heading": fonts.heading,
    "--logo-height": `${config.logoHeight}px`,
    "--logo-width": `${config.logoWidth}px`,
    ...chromeVars(config, mode, primary),
  };
}

/** Attributes on `<html>` that CSS can key off (e.g. logo variant, color-scheme). */
export function buildThemeAttrs(
  config: ShopThemeConfig,
  mode: ResolvedMode,
): Record<string, string> {
  return {
    "data-theme-mode": mode,
    "data-sidebar": config.sidebarStyle,
    "data-header": config.headerStyle,
  };
}

/** Whether the sidebar background is dark enough to need the white logo. */
export function sidebarIsDark(config: ShopThemeConfig, mode: ResolvedMode): boolean {
  return config.sidebarStyle !== "light" || mode === "dark";
}
