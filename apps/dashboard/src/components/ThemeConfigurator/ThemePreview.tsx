"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { BarChart3, ClipboardList, LayoutDashboard, Package, ScanBarcode } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo/BrandLogo";
import { useTheme } from "@/contexts/ThemeContext";
import { buildThemeAttrs, buildThemeVars, sidebarIsDark } from "@/lib/theme/cssVars";
import type { ResolvedMode, ShopThemeConfig } from "@/lib/theme/types";
import styles from "./ThemePreview.module.css";

type ThemePreviewProps = {
  config: ShopThemeConfig;
  logoUrl: string | null;
  shopName?: string;
  className?: string;
};

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Billing POS", icon: ScanBarcode, active: true },
  { label: "Orders", icon: ClipboardList },
  { label: "Products", icon: Package },
  { label: "Reports", icon: BarChart3 },
];

/**
 * Miniature app shell rendered with a theme's variables scoped to this element, so a
 * theme can be previewed without changing the rest of the screen.
 */
export function ThemePreview({ config, logoUrl, shopName, className }: ThemePreviewProps) {
  const { mode: appMode } = useTheme();
  const mode: ResolvedMode = config.mode === "system" ? appMode : config.mode;

  const style = useMemo(() => buildThemeVars(config, mode) as CSSProperties, [config, mode]);
  const attrs = useMemo(() => buildThemeAttrs(config, mode), [config, mode]);

  return (
    <div
      className={`${styles.frame} ${className ?? ""}`.trim()}
      style={{ ...style, colorScheme: mode }}
      {...attrs}
      role="img"
      aria-label={`Preview of the ${config.preset.toLowerCase()} theme in ${mode} mode`}
    >
      <aside className={styles.sidebar} aria-hidden>
        <div className={styles.logo}>
          <BrandLogo
            logoUrl={logoUrl}
            shopName={shopName}
            onDark={sidebarIsDark(config, mode)}
          />
        </div>
        <ul className={styles.nav}>
          {NAV.map(({ label, icon: Icon, active }) => (
            <li key={label} className={active ? styles.navActive : styles.navItem}>
              <Icon size={13} strokeWidth={2} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className={styles.main} aria-hidden>
        <div className={styles.header}>
          <span className={styles.crumb}>
            {shopName || "Your shop"} <span className={styles.crumbSep}>/</span>{" "}
            <strong>Billing POS</strong>
          </span>
          <span className={styles.avatar}>A</span>
        </div>
        <div className={styles.content}>
          <div className={styles.titleRow}>
            <div>
              <div className={styles.title}>Today&apos;s sales</div>
              <div className={styles.subtitle}>Bills saved from this counter</div>
            </div>
            <span className={styles.primaryBtn}>New bill</span>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Revenue</span>
              <span className={styles.statValue}>₹48,250</span>
              <span className={styles.bar}>
                <span className={styles.barFill} />
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Bills</span>
              <span className={styles.statValue}>126</span>
              <span className={styles.tags}>
                <span className={styles.tagSecondary}>UPI 64%</span>
                <span className={styles.tagAccent}>New</span>
              </span>
            </div>
          </div>
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Item</span>
              <span>Qty</span>
              <span>Amount</span>
            </div>
            <div className={styles.tableRow}>
              <span>Rasgulla 1kg</span>
              <span>2</span>
              <span>₹640</span>
            </div>
            <div className={`${styles.tableRow} ${styles.tableRowSelected}`}>
              <span>Sandesh 500g</span>
              <span>1</span>
              <span>₹280</span>
            </div>
          </div>
          <div className={styles.actions}>
            <span className={styles.defaultBtn}>Cancel</span>
            <span className={styles.link}>View all orders</span>
          </div>
        </div>
      </div>
    </div>
  );
}
