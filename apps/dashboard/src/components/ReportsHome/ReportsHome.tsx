"use client";

import { App, Button, Dropdown, Input, Segmented } from "antd";
import { CircleAlert, Download, ReceiptText, RotateCw, Store } from "lucide-react";
import { useEffect, useState } from "react";

import { DateRangeFields } from "@/components/DateRangeFields/DateRangeFields";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Metric, MetricStrip } from "@/components/MetricStrip/MetricStrip";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { PaymentMixList, type PaymentMixRow } from "@/components/PaymentMixList/PaymentMixList";
import { SectionCard, SectionLink } from "@/components/SectionCard/SectionCard";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { apiFetchLong, isRequestTimeout, REQUEST_TIMEOUT_MESSAGE } from "@/lib/api";
import { formatInrFull, istDayOffset } from "@/lib/chartFormat";
import {
  dayCount,
  dayRangeError,
  formatDayRange,
  formatWeekday,
  shiftDay,
  type DayRange,
} from "@/lib/dayRange";
import { isMonthKey, istMonthNow, monthLabel } from "@/lib/istMonths";
import type { ReportsExportPayload } from "@/lib/reportsExport";
import styles from "./ReportsHome.module.css";

type DailyPoint = { date: string; revenue: number; orderCount: number };
type TopProduct = { productName: string; qtySold: number; revenue: number };

type ReportsPayload = {
  days: number;
  range: DayRange;
  totals: { orderCount: number; revenue: number };
  daily: DailyPoint[];
  paymentMix: PaymentMixRow[];
  topProducts: TopProduct[];
};

type Preset = "7" | "30" | "90" | "180" | "month" | "custom";

const PRESETS: { label: string; value: Preset }[] = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "180 days", value: "180" },
  { label: "Month", value: "month" },
  { label: "Custom", value: "custom" },
];

/** Longer custom ranges load every bill line, so they are capped. */
const MAX_RANGE_DAYS = 366;
/** Switching periods quickly sends one request, for the period you stop on. */
const FETCH_DELAY_MS = 250;
/** The API returns up to 20 products; the rest sit behind "Show all". */
const TOP_PRODUCTS_SHOWN = 10;

/** The latest finished request. `month` is set when it was for a calendar month. */
type LoadResult = {
  key: string;
  month: string | null;
  data: ReportsPayload | null;
  error: string | null;
};

const countFormat = new Intl.NumberFormat("en-IN");
const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const shareFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

function inr(n: number): string {
  return formatInrFull(Number.isFinite(n) ? n : 0);
}

function bills(n: number): string {
  return `${countFormat.format(n)} ${n === 1 ? "bill" : "bills"}`;
}

/** Query for the summary and export endpoints. Daily totals are always by IST day. */
function periodQuery(preset: Preset, month: string, custom: DayRange): string {
  const q = new URLSearchParams({ bucket: "day" });
  if (preset === "month") q.set("month", month);
  else if (preset === "custom") {
    q.set("start", custom.start);
    q.set("end", custom.end);
  } else q.set("days", preset);
  return q.toString();
}

function periodError(
  preset: Preset,
  month: string,
  custom: DayRange,
  today: string,
): string | null {
  if (preset === "month") {
    if (!isMonthKey(month)) return "Pick a month.";
    if (month > today.slice(0, 7)) return "Pick this month or an earlier one.";
    return null;
  }
  if (preset === "custom") return dayRangeError(custom, today, MAX_RANGE_DAYS);
  return null;
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <span className={styles.skeletonBar} />
        </div>
      ))}
    </div>
  );
}

/**
 * Bars are scaled to the best seller so small differences stay visible; the
 * percentage next to each bar is its true share of the period's sales.
 */
function TopProductsTable({
  products,
  total,
  leader,
}: {
  products: TopProduct[];
  total: number;
  leader: number;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.rank}>
              #
            </th>
            <th scope="col">Product</th>
            <th scope="col" className={styles.num}>
              Qty sold
            </th>
            <th scope="col" className={styles.num}>
              Revenue
            </th>
            <th scope="col" className={`${styles.shareCol} ${styles.shareCell}`}>
              Share of sales
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const share = total > 0 ? (p.revenue / total) * 100 : 0;
            const bar = leader > 0 ? (p.revenue / leader) * 100 : 0;
            return (
              <tr key={p.productName}>
                <td className={styles.rank}>{i + 1}</td>
                <td className={styles.name} title={p.productName}>
                  {p.productName}
                </td>
                <td className={styles.num}>{qtyFormat.format(p.qtySold)}</td>
                <td className={styles.num}>
                  {inr(p.revenue)}
                  <div className={styles.shareInline}>{shareFormat.format(share)}% of sales</div>
                </td>
                <td className={styles.shareCell}>
                  <div className={styles.share}>
                    <span className={styles.track} aria-hidden>
                      <span className={styles.fill} style={{ width: `${bar}%` }} />
                    </span>
                    <span className={styles.shareValue}>{shareFormat.format(share)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Analytics tab: totals, top products and payment modes for a chosen period, plus exports. */
export default function ReportsHome() {
  const { message } = App.useApp();
  const { permissions } = useAuth();
  const { effectiveShopCode, shops } = useShop();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";
  const shopKey = effectiveShopCode || defaultShop;
  const shopName = shops.find((s) => s.shopCode === shopKey)?.name?.trim() || shopKey;

  const today = istDayOffset(0);
  const [preset, setPreset] = useState<Preset>("30");
  const [month, setMonth] = useState(istMonthNow);
  const [custom, setCustom] = useState<DayRange>(() => ({
    start: shiftDay(istDayOffset(0), -29),
    end: istDayOffset(0),
  }));
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const invalid = periodError(preset, month, custom, today);
  const query = periodQuery(preset, month, custom);
  const labelMonth = preset === "month" ? month : null;
  const requestKey = invalid ? null : `${shopKey}|${query}|${reloadKey}`;
  const loading = Boolean(shopKey) && requestKey !== null && result?.key !== requestKey;
  const loadError = requestKey !== null && result?.key === requestKey ? result.error : null;

  useEffect(() => {
    if (!shopKey || invalid) return;
    const key = `${shopKey}|${query}|${reloadKey}`;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetchLong(`/analytics/reports/summary?${query}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        const payload = (await res.json()) as ReportsPayload;
        if (!controller.signal.aborted) {
          setResult({ key, month: labelMonth, data: payload, error: null });
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        setResult({
          key,
          month: labelMonth,
          data: null,
          error: isRequestTimeout(e) ? REQUEST_TIMEOUT_MESSAGE : "Check your connection and try again.",
        });
      }
    }, FETCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [shopKey, query, reloadKey, invalid, labelMonth]);

  const onPresetChange = (value: Preset) => {
    // Custom starts from the period on screen, so it only needs adjusting.
    if (value === "custom" && preset !== "custom" && result?.data) {
      const { start, end } = result.data.range;
      setCustom({ start, end: end > today ? today : end });
    }
    setPreset(value);
  };

  const exportReport = async (kind: "xlsx" | "pdf") => {
    if (!shopKey || invalid) return;
    setExporting(kind);
    try {
      const res = await apiFetchLong(`/analytics/reports/export-data?${query}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          typeof body?.message === "string" ? body.message : `Export failed (${res.status}).`,
        );
      }
      const payload = (await res.json()) as ReportsExportPayload;
      // Loaded on demand so exceljs/jspdf stay out of the page bundle.
      const { downloadReportsExcel, downloadReportsPdf } = await import("@/lib/reportsExport");
      if (kind === "xlsx") await downloadReportsExcel(payload, shopName, shopKey);
      else await downloadReportsPdf(payload, shopName, shopKey);
      message.success(kind === "xlsx" ? "Excel file downloaded." : "PDF downloaded.");
    } catch (e) {
      message.error(
        isRequestTimeout(e)
          ? REQUEST_TIMEOUT_MESSAGE
          : e instanceof Error
            ? e.message
            : "Export failed.",
      );
    } finally {
      setExporting(null);
    }
  };

  // Unknown permissions (an older saved session) keep the link; the page checks access.
  const canOpenProducts = permissions?.canAccessProducts ?? true;

  const header = (
    <PageHeader
      title="Analytics & reports"
      description="Revenue, payment modes and best sellers for any period. Days follow IST."
      actions={
        <Dropdown
          disabled={!shopKey || Boolean(invalid) || exporting !== null}
          menu={{
            items: [
              { key: "xlsx", label: "Excel (.xlsx)" },
              { key: "pdf", label: "PDF" },
            ],
            onClick: ({ key }) => void exportReport(key as "xlsx" | "pdf"),
          }}
        >
          <Button icon={<Download size={16} />} loading={exporting !== null}>
            Export
          </Button>
        </Dropdown>
      }
    />
  );

  if (!shopKey) {
    return (
      <div className={styles.root}>
        {header}
        <EmptyState
          icon={<Store size={40} />}
          message="No shop selected"
          description="Choose a shop in the header to see its reports."
        />
      </div>
    );
  }

  let body: React.ReactNode;
  if (invalid) {
    body = <p className={styles.warning}>{invalid}</p>;
  } else if (loadError) {
    body = (
      <EmptyState
        icon={<CircleAlert size={40} />}
        message="Couldn't load reports"
        description={loadError}
        action={
          <Button icon={<RotateCw size={16} />} onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        }
      />
    );
  } else if (!result?.data) {
    body = (
      <div className={styles.report}>
        <span className={`${styles.skeletonBar} ${styles.skeletonMeta}`} />
        <MetricStrip label="Loading period totals">
          {[0, 1, 2, 3].map((i) => (
            <Metric
              key={i}
              label={<span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />}
              value={<span className={`${styles.skeletonBar} ${styles.skeletonValue}`} />}
            />
          ))}
        </MetricStrip>
        <div className={styles.columns}>
          <SectionCard title="Top products">
            <SkeletonRows count={6} />
          </SectionCard>
          <SectionCard title="Payment modes">
            <SkeletonRows count={3} />
          </SectionCard>
        </div>
      </div>
    );
  } else {
    // While the next period loads, the last one stays on screen (dimmed), labelled by
    // the period it was fetched for.
    const { data } = result;
    const label = result.month ? monthLabel(result.month) : formatDayRange(data.range);
    const revenue = data.totals.revenue;
    const count = data.totals.orderCount;
    // A month still in progress counts only the days so far.
    const lastDay = data.range.end > today ? today : data.range.end;
    const days = Math.max(1, dayCount(data.range.start, lastDay));
    const best = data.daily.reduce<DailyPoint | null>(
      (top, d) => (d.revenue > (top?.revenue ?? 0) ? d : top),
      null,
    );
    const products = showAllProducts ? data.topProducts : data.topProducts.slice(0, TOP_PRODUCTS_SHOWN);

    body = (
      <div
        className={`${styles.report} ${loading ? styles.refreshing : ""}`.trim()}
        aria-busy={loading || undefined}
      >
        {count === 0 ? (
          <EmptyState
            icon={<ReceiptText size={40} />}
            message={`No paid bills in ${label}`}
            description="Pick a longer period or another month."
          />
        ) : (
          <>
            <p className={styles.meta}>
              <span className={styles.metaStrong}>{label}</span>
              <span>
                {countFormat.format(days)} {days === 1 ? "day" : "days"}
                {data.range.end > today ? " so far" : ""}
              </span>
            </p>

            <MetricStrip label="Period totals">
              <Metric
                accent
                label="Revenue"
                value={inr(revenue)}
                note={`${inr(revenue / days)} a day on average`}
              />
              <Metric
                label="Bills"
                value={countFormat.format(count)}
                note={days > 1 ? `About ${countFormat.format(Math.round(count / days))} a day` : undefined}
              />
              <Metric label="Average bill" value={inr(revenue / count)} />
              <Metric
                label="Best day"
                value={best ? inr(best.revenue) : "–"}
                note={best ? `${formatWeekday(best.date)} · ${bills(best.orderCount)}` : undefined}
              />
            </MetricStrip>

            <div className={styles.columns}>
              <SectionCard
                title="Top products"
                description="Ranked by revenue after discounts"
                action={canOpenProducts ? <SectionLink href="/products">Products</SectionLink> : null}
              >
                {data.topProducts.length === 0 ? (
                  <p className={styles.notice}>No items sold in this period.</p>
                ) : (
                  <TopProductsTable
                    products={products}
                    total={revenue}
                    leader={data.topProducts[0]?.revenue ?? 0}
                  />
                )}
                {data.topProducts.length > TOP_PRODUCTS_SHOWN ? (
                  <div className={styles.cardFooter}>
                    <Button type="link" size="small" onClick={() => setShowAllProducts((v) => !v)}>
                      {showAllProducts
                        ? `Show top ${TOP_PRODUCTS_SHOWN}`
                        : `Show all ${data.topProducts.length}`}
                    </Button>
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard title="Payment modes" description="Share of revenue">
                <PaymentMixList rows={data.paymentMix} emptyText="No payments in this period." />
              </SectionCard>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {header}

      <div className={styles.toolbar}>
        <div className={styles.presets}>
          <Segmented<Preset>
            aria-label="Report period"
            value={preset}
            options={PRESETS}
            onChange={onPresetChange}
          />
        </div>
        {preset === "month" ? (
          <Input
            type="month"
            aria-label="Report month"
            className={styles.monthInput}
            value={month}
            max={today.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value)}
          />
        ) : preset === "custom" ? (
          <DateRangeFields value={custom} onChange={setCustom} max={today} />
        ) : null}
      </div>

      {body}
    </div>
  );
}
