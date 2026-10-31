import type { ReactNode } from "react";
import styles from "./MetricStrip.module.css";

/**
 * A row of key figures in one bordered block with hairline dividers. Shows one, two or
 * four columns depending on the width it is given (not the viewport).
 */
export function MetricStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.container}>
      <section aria-label={label} className={styles.strip}>
        {children}
      </section>
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  accent = false,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** Marks the headline figure with a short bar on its left edge. */
  accent?: boolean;
  tone?: "warning";
}) {
  return (
    <div className={`${styles.metric} ${accent ? styles.accent : ""}`.trim()}>
      <div className={styles.label}>{label}</div>
      <div className={`${styles.value} ${tone === "warning" ? styles.warning : ""}`.trim()}>
        {value}
      </div>
      {note ? <div className={styles.note}>{note}</div> : null}
    </div>
  );
}
