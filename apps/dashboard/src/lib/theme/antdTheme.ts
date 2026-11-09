import { theme as antdTheme, type ThemeConfig } from "antd";
import { rgba } from "./color";
import { FONT_STACKS, RADIUS_SCALE, buildScales } from "./cssVars";
import { NEUTRALS } from "./palette";
import type { ResolvedMode, ShopThemeConfig } from "./types";

/**
 * antd needs concrete colours (it derives hover/active shades itself), so this reads
 * the same palette the CSS variables are built from. Keeps antd and CSS-module
 * styling on identical shades.
 */
export function buildAntdTheme(
  config: ShopThemeConfig,
  mode: ResolvedMode,
  options: { reducedMotion?: boolean } = {},
): ThemeConfig {
  const n = NEUTRALS[mode];
  const { primary } = buildScales(config, mode);
  const r = RADIUS_SCALE[config.radius];
  const radius = (px: number) => Math.max(2, Math.round(px * r));
  const shadow = n["--shadow-lg"];

  return {
    algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary[500],
      colorPrimaryHover: primary[400],
      colorPrimaryActive: primary[600],
      colorPrimaryBg: primary[100],
      colorPrimaryBgHover: primary[200],
      colorPrimaryBorder: primary[300],
      colorSuccess: n["--success"],
      colorWarning: n["--warning"],
      colorError: n["--danger"],
      colorInfo: n["--info"],
      colorText: n["--bistre-950"],
      colorTextSecondary: n["--bistre-700"],
      colorTextTertiary: n["--bistre-400"],
      colorTextQuaternary: n["--bistre-300"],
      colorBgLayout: n["--linen"],
      colorBgContainer: n["--surface"],
      colorBgElevated: n["--surface-raised"],
      colorBgMask: n["--overlay"],
      colorFillAlter: n["--surface-subtle"],
      colorFillSecondary: n["--linen-90"],
      colorFillTertiary: n["--linen"],
      colorBorder: n["--border-strong"],
      colorBorderSecondary: n["--border"],
      colorSplit: n["--border"],
      controlOutline: rgba(primary[500], mode === "dark" ? 0.3 : 0.14),
      controlItemBgActive: primary[100],
      controlItemBgHover: n["--surface-subtle"],
      borderRadius: radius(6),
      borderRadiusSM: radius(4),
      borderRadiusLG: radius(10),
      borderRadiusXS: radius(2),
      // One button/input scale for the whole app: 28 (table rows, compact toolbars),
      // 36 (default: page actions, forms, modals), 44 (touch-first POS controls only).
      controlHeightSM: 28,
      controlHeight: 36,
      controlHeightLG: 44,
      // Users who ask the OS for reduced motion get antd without animations. This must be
      // done here rather than by shortening animations in CSS: antd positions popups
      // during their opening animation, so a near-zero animation leaves them off screen.
      motion: !options.reducedMotion,
      fontSize: 14,
      fontFamily: FONT_STACKS[config.font].body,
      boxShadow: shadow,
      boxShadowSecondary: shadow,
      colorLink: primary[600],
      colorLinkHover: primary[500],
      colorLinkActive: primary[700],
    },
    components: {
      Button: {
        fontWeight: 500,
        paddingInline: 16,
        paddingInlineSM: 10,
        paddingInlineLG: 20,
        primaryShadow: "none",
        defaultShadow: "none",
        dangerShadow: "none",
      },
      Card: { headerFontSize: 15 },
      Table: {
        headerBg: n["--surface-subtle"],
        headerColor: n["--bistre-400"],
        rowHoverBg: n["--surface-subtle"],
        borderColor: n["--border"],
        rowSelectedBg: primary[50],
        rowSelectedHoverBg: primary[100],
      },
      Tabs: {
        itemColor: n["--bistre-500"],
        itemSelectedColor: primary[600],
        itemHoverColor: n["--bistre-950"],
        inkBarColor: primary[500],
      },
      Segmented: {
        itemSelectedBg: n["--surface-raised"],
        trackBg: n["--linen-90"],
      },
      Menu: {
        itemBg: "transparent",
        subMenuItemBg: "transparent",
        itemColor: n["--bistre-700"],
        itemSelectedBg: primary[100],
        itemSelectedColor: primary[600],
        itemHoverColor: n["--bistre-950"],
        itemHoverBg: n["--linen"],
        itemBorderRadius: radius(6),
        itemHeight: 40,
        itemMarginInline: 12,
        iconSize: 17,
      },
      Modal: { titleFontSize: 18 },
      Layout: {
        bodyBg: n["--linen"],
        headerBg: n["--surface"],
        siderBg: n["--surface"],
      },
    },
  };
}
