"use client";

import { Input } from "antd";
import type { DayRange } from "@/lib/dayRange";
import styles from "./DateRangeFields.module.css";

/** "From" and "To" date boxes for a custom period. `max` is the latest allowed day. */
export function DateRangeFields({
  value,
  onChange,
  max,
  className,
}: {
  value: DayRange;
  onChange: (next: DayRange) => void;
  max: string;
  className?: string;
}) {
  return (
    <div className={`${styles.fields} ${className ?? ""}`.trim()}>
      <label className={styles.field}>
        From
        <Input
          type="date"
          className={styles.input}
          value={value.start}
          max={value.end || max}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        To
        <Input
          type="date"
          className={styles.input}
          value={value.end}
          min={value.start || undefined}
          max={max}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </label>
    </div>
  );
}
