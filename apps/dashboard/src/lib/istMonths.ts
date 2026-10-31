import { istDayOffset } from "@/lib/chartFormat";

/** Calendar months as `YYYY-MM` strings. Reports treat them as IST calendar months. */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a complete `YYYY-MM`. */
export function isMonthKey(value: string): boolean {
  return MONTH_RE.test(value);
}

/** Current IST month (`YYYY-MM`). */
export function istMonthNow(): string {
  return istDayOffset(0).slice(0, 7);
}

function yearAndMonth(month: string): [number, number] {
  const [y, m] = month.split("-").map(Number);
  return [y, m];
}

/** `month` moved by `delta` months, e.g. shiftMonth("2026-01", -1) is "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = yearAndMonth(month);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = yearAndMonth(month);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "1–31 Oct 2026" */
export function monthRangeLabel(month: string): string {
  const [y, m] = yearAndMonth(month);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const short = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    timeZone: "UTC",
  });
  return `1–${lastDay} ${short} ${y}`;
}
