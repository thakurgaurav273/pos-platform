import { useId } from "react";
import styles from "./FluxenLogo.module.css";

type FluxenLogoProps = {
  /** Height of the mark in px. The wordmark scales with it. */
  size?: number;
  /** "light" = white wordmark for dark backgrounds; "auto" follows the page text colour. */
  tone?: "auto" | "light";
  /** Mark only, for tight spaces. */
  markOnly?: boolean;
  className?: string;
};

/**
 * The Fluxen mark: an F whose strokes flow into a node, on a tile that runs from the
 * theme's primary to its secondary colour (indigo to cyan in the default theme).
 */
export function FluxenMark({ size = 32, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  // Unique per mark: a shared id would make every mark use the first gradient on the
  // page, so a scoped theme preview would show the page's colours instead of its own.
  const gradientId = `fluxen-tile-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Fluxen POS" })}
      className={className}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="2" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--ochre-500, #4f46e5)" }} />
          <stop offset="1" style={{ stopColor: "var(--secondary-500, #0891b2)" }} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 29V11.5H27.5" />
        <path d="M14.5 20H23.5" />
      </g>
      <circle cx="28" cy="28.5" r="2.9" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

export function FluxenLogo({ size = 32, tone = "auto", markOnly = false, className }: FluxenLogoProps) {
  if (markOnly) return <FluxenMark size={size} className={className} />;
  return (
    <span className={`${styles.logo} ${tone === "light" ? styles.light : ""} ${className ?? ""}`.trim()} style={{ fontSize: size * 0.62 }}>
      <FluxenMark size={size} decorative />
      <span className={styles.word} aria-hidden>
        Fluxen<span className={styles.pos}>POS</span>
      </span>
      <span className={styles.srOnly}>Fluxen POS</span>
    </span>
  );
}
