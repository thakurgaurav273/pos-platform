/** IST calendar days as `YYYY-MM-DD` strings: arithmetic, labels and range checks. */

export type DayRange = { start: string; end: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

const shortDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDayYear = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayDay = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** `day` moved by `delta` days, e.g. shiftDay("2026-11-01", -1) is "2026-10-31". */
export function shiftDay(day: string, delta: number): string {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Days from `start` to `end`, counting both. */
export function dayCount(start: string, end: string): number {
  return Math.round((asDate(end).getTime() - asDate(start).getTime()) / 86_400_000) + 1;
}

/** "26 Oct" */
export function formatDay(day: string): string {
  return shortDay.format(asDate(day));
}

/** "Sat, 31 Oct" */
export function formatWeekday(day: string): string {
  return weekdayDay.format(asDate(day));
}

/** "Sat, 31 Oct" for one day, "26 Oct – 1 Nov" for a range (with years when they differ). */
export function formatDayRange({ start, end }: DayRange): string {
  if (start === end) return formatWeekday(start);
  const format = start.slice(0, 4) === end.slice(0, 4) ? shortDay : shortDayYear;
  return `${format.format(asDate(start))} – ${format.format(asDate(end))}`;
}

/** Why a picked range can't be reported on, or null when it can. */
export function dayRangeError({ start, end }: DayRange, today: string, maxDays: number): string | null {
  if (!DAY_RE.test(start) || !DAY_RE.test(end)) return "Pick a start and an end date.";
  if (end < start) return "The end date must be on or after the start date.";
  if (end > today) return "The end date can't be in the future.";
  if (dayCount(start, end) > maxDays) return `Pick a range of up to ${maxDays} days.`;
  return null;
}
