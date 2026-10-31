"use client";

import Image from "next/image";
import logo from "@/assets/logo.svg";
import logoWhite from "@/assets/logowhite.svg";
import { useTheme } from "@/contexts/ThemeContext";
import { sidebarIsDark } from "@/lib/theme/cssVars";
import styles from "./BrandLogo.module.css";

type BrandLogoProps = {
  /** Shop name used as alt text for a custom logo. */
  shopName?: string;
  /** Force the light-on-dark artwork (e.g. inside a dark preview). Defaults to the sidebar style. */
  onDark?: boolean;
  /** Custom logo URL to show instead of the active theme's (used by previews). */
  logoUrl?: string | null;
  className?: string;
  priority?: boolean;
};

/**
 * The shop's uploaded logo, or the built-in Calcutta Sweets mark in the colour that
 * suits the sidebar background.
 */
export function BrandLogo({ shopName, onDark, logoUrl, className, priority }: BrandLogoProps) {
  const theme = useTheme();
  const src = logoUrl !== undefined ? logoUrl : theme.logoUrl;
  const dark = onDark ?? sidebarIsDark(theme.config, theme.mode);

  if (src) {
    return (
      // Shop logos can come from any https host, so a plain img avoids next/image host rules.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={shopName ? `${shopName} logo` : "Shop logo"}
        className={`${styles.custom} ${className ?? ""}`.trim()}
        decoding="async"
      />
    );
  }
  return (
    <Image
      src={dark ? logoWhite : logo}
      alt="Calcutta Sweets"
      width={240}
      height={95}
      className={`${styles.builtIn} ${className ?? ""}`.trim()}
      priority={priority}
    />
  );
}
