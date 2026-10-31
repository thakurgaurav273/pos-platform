import { istDayOffset } from "@/lib/chartFormat";

/** GST began in India on 1 July 2017, so no earlier month can have GST bills. */
export const GST_START_MONTH = "2017-07";

/** Current IST month (`YYYY-MM`); the API reports GST by IST calendar month. */
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

/** A complete `YYYY-MM` from the start of GST up to the current month. */
export function isReportableMonth(month: string, currentMonth: string): boolean {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    month >= GST_START_MONTH &&
    month <= currentMonth
  );
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
