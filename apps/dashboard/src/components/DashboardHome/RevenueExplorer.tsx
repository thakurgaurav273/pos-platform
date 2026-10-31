"use client";

import { Button, Input, Segmented } from "antd";
import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionCard } from "@/components/SectionCard/SectionCard";
import { useShop } from "@/contexts/ShopContext";
import { useChartPalette } from "@/contexts/ThemeContext";
import { apiFetch } from "@/lib/api";
import { formatInrFull, istDayOffset } from "@/lib/chartFormat";
import styles from "./DashboardHome.module.css";

type DailyPoint = { date: string; revenue: number; orderCount: number };

type RevenuePayload = {
  days: number;
  range: { start: string; end: string };
  totals: { orderCount: number; revenue: number };
  daily: DailyPoint[];
};

type Range = { start: string; end: string };

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

const PRESETS: { label: string; value: Preset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Custom", value: "custom" },
];

/** The API rejects longer ranges. */
const MAX_RANGE_DAYS = 366;
/** Switching periods quickly sends one request, for the period you stop on. */
const FETCH_DELAY_MS = 250;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The latest finished request, with the period that was selected when it was sent. */
type LoadResult = {
  key: string;
  selection: Range;
  data: RevenuePayload | null;
  error: string | null;
};

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
const compactInr = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat("en-IN");

function shiftDay(day: string, delta: number): string {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function dayCount(start: string, end: string): number {
  return Math.round((asDate(end).getTime() - asDate(start).getTime()) / 86_400_000) + 1;
}

function presetRange(preset: Exclude<Preset, "custom">, today: string): Range {
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const day = shiftDay(today, -1);
      return { start: day, end: day };
    }
    case "7d":
      return { start: shiftDay(today, -6), end: today };
    case "30d":
      return { start: shiftDay(today, -29), end: today };
  }
}

function customRangeError({ start, end }: Range, today: string): string | null {
  if (!DAY_RE.test(start) || !DAY_RE.test(end)) return "Pick a start and an end date.";
  if (end < start) return "The end date must be on or after the start date.";
  if (end > today) return "The end date can't be in the future.";
  if (dayCount(start, end) > MAX_RANGE_DAYS) return `Pick a range of up to ${MAX_RANGE_DAYS} days.`;
  return null;
}

function rangeLabel({ start, end }: Range): string {
  if (start === end) return weekdayDay.format(asDate(start));
  const format = start.slice(0, 4) === end.slice(0, 4) ? shortDay : shortDayYear;
  return `${format.format(asDate(start))} – ${format.format(asDate(end))}`;
}

function inr(n: number): string {
  return formatInrFull(Number.isFinite(n) ? n : 0);
}

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
  const point = payload?.[0]?.payload as DailyPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{weekdayDay.format(asDate(point.date))}</div>
      <div className={styles.tooltipValue}>{inr(point.revenue)}</div>
      <div className={styles.tooltipNote}>
        {countFormat.format(point.orderCount)} {point.orderCount === 1 ? "bill" : "bills"}
      </div>
    </div>
  );
}

/**
 * Y-axis ticks in round steps (1, 2, 2.5 or 5 × 10ⁿ rupees). Left to itself the chart
 * picks steps like ₹550, whose compact labels round wrongly (₹1,650 shows as ₹1.7K).
 */
function rupeeTicks(max: number): number[] {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow);
  const count = Math.ceil(max / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/** One bar per day. With `highlight`, that day is solid and the others are faded. */
function RevenueChart({ points, highlight }: { points: DailyPoint[]; highlight: string | null }) {
  const palette = useChartPalette();
  const chartData = points.map((d) => ({ ...d, label: shortDay.format(asDate(d.date)) }));
  const ticks = rupeeTicks(Math.max(...points.map((d) => d.revenue)));
  return (
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={palette.grid} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: palette.axis }}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fontSize: 11, fill: palette.axis }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={(v) => `₹${compactInr.format(Number(v))}`}
          />
          <Tooltip
            cursor={{ fill: palette.grid, fillOpacity: 0.45 }}
            content={(p) => <RevenueTooltip active={p.active} payload={p.payload} />}
          />
          <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
            {chartData.map((d) => (
              <Cell
                key={d.date}
                fill={palette.primary}
                fillOpacity={highlight === null || d.date === highlight ? 1 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevenueSkeleton() {
  return (
    <div role="status" aria-label="Loading revenue">
      <div className={styles.figures}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.figure}>
            <span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />
            <span className={`${styles.skeletonBar} ${styles.skeletonValue}`} />
          </div>
        ))}
      </div>
      <span className={`${styles.skeletonBar} ${styles.skeletonChart}`} />
    </div>
  );
}

/** Revenue, bills and average bill for a chosen period, with a bar per day. */
export default function RevenueExplorer() {
  const { effectiveShopCode } = useShop();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";
  const shopKey = effectiveShopCode || defaultShop;

  const today = istDayOffset(0);
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState<Range>(() => presetRange("7d", istDayOffset(0)));
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  const selected = preset === "custom" ? custom : presetRange(preset, today);
  const rangeError = preset === "custom" ? customRangeError(custom, today) : null;
  const { start, end } = selected;
  const requestKey = rangeError ? null : `${shopKey}|${start}|${end}|${reloadKey}`;
  const loading = Boolean(shopKey) && requestKey !== null && result?.key !== requestKey;
  const error = requestKey !== null && result?.key === requestKey ? result.error : null;

  useEffect(() => {
    if (!shopKey || rangeError) return;
    const key = `${shopKey}|${start}|${end}|${reloadKey}`;
    const selection = { start, end };
    // A single day is charted with the six days before it, for comparison.
    const fetchStart = start === end ? shiftDay(start, -6) : start;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ start: fetchStart, end });
        const res = await apiFetch(`/analytics/dashboard/revenue?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        const payload = (await res.json()) as RevenuePayload;
        if (!controller.signal.aborted) setResult({ key, selection, data: payload, error: null });
      } catch {
        if (controller.signal.aborted) return;
        setResult({ key, selection, data: null, error: "Couldn't load revenue for this period." });
      }
    }, FETCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [shopKey, start, end, reloadKey, rangeError]);

  const onPresetChange = (value: Preset) => {
    // Custom starts from whatever was showing, so it only needs adjusting.
    if (value === "custom" && preset !== "custom") setCustom(selected);
    setPreset(value);
  };

  let body: React.ReactNode;
  if (rangeError) {
    body = <p className={`${styles.inlineMessage} ${styles.inlineWarning}`}>{rangeError}</p>;
  } else if (error) {
    body = (
      <p className={styles.inlineMessage}>
        {error}
        <Button size="small" icon={<RotateCw size={14} />} onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </p>
    );
  } else if (!result?.data) {
    body = <RevenueSkeleton />;
  } else {
    // While the next period loads, the last one stays on screen (dimmed), described by
    // the selection it was fetched for, so its labels and numbers always agree.
    const { data, selection } = result;
    const single = selection.start === selection.end;
    const day = single ? data.daily.find((d) => d.date === selection.end) : undefined;
    const revenue = single ? (day?.revenue ?? 0) : data.totals.revenue;
    const bills = single ? (day?.orderCount ?? 0) : data.totals.orderCount;
    const perDay = single ? null : revenue / dayCount(selection.start, selection.end);
    // An all-zero chart only shows an axis; say so instead.
    const noSales = data.daily.every((d) => d.revenue === 0);

    body = (
      <div
        className={`${styles.revenueContent} ${loading ? styles.refreshing : ""}`.trim()}
        aria-busy={loading || undefined}
      >
        <div className={styles.figures}>
          <div className={styles.figure}>
            <div className={styles.figureLabel}>Revenue · {rangeLabel(selection)}</div>
            <div className={styles.figureValue}>{inr(revenue)}</div>
            {perDay !== null ? (
              <div className={styles.figureNote}>{inr(perDay)} a day on average</div>
            ) : null}
          </div>
          <div className={styles.figure}>
            <div className={styles.figureLabel}>Bills</div>
            <div className={styles.figureValue}>{countFormat.format(bills)}</div>
          </div>
          <div className={styles.figure}>
            <div className={styles.figureLabel}>Average bill</div>
            <div className={styles.figureValue}>{bills > 0 ? inr(revenue / bills) : "–"}</div>
          </div>
        </div>

        {noSales ? (
          <p className={styles.chartEmpty}>No paid bills in this period.</p>
        ) : (
          <RevenueChart points={data.daily} highlight={single ? selection.end : null} />
        )}
        {single && !noSales ? (
          <p className={styles.chartCaption}>
            {rangeLabel(selection)} is highlighted next to the six days before it.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard
      title="Revenue"
      action={
        <div className={styles.presets}>
          <Segmented<Preset>
            aria-label="Revenue period"
            value={preset}
            options={PRESETS}
            onChange={onPresetChange}
          />
        </div>
      }
    >
      <div className={styles.revenueBody}>
        {preset === "custom" ? (
          <div className={styles.customRange}>
            <label className={styles.dateField}>
              From
              <Input
                type="date"
                className={styles.dateInput}
                value={custom.start}
                max={custom.end || today}
                onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
              />
            </label>
            <label className={styles.dateField}>
              To
              <Input
                type="date"
                className={styles.dateInput}
                value={custom.end}
                min={custom.start || undefined}
                max={today}
                onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
              />
            </label>
          </div>
        ) : null}
        {body}
      </div>
    </SectionCard>
  );
}
