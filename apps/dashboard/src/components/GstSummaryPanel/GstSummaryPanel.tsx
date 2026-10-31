"use client";

import { Alert, App, Button, Dropdown, Input, Space } from "antd";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  ReceiptIndianRupee,
  RotateCw,
  Store,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Metric, MetricStrip } from "@/components/MetricStrip/MetricStrip";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { apiFetchLong, isRequestTimeout, REQUEST_TIMEOUT_MESSAGE } from "@/lib/api";
import { GstSummaryReport } from "./GstSummaryReport";
import {
  GST_START_MONTH,
  isReportableMonth,
  istMonthNow,
  monthLabel,
  shiftMonth,
} from "./gstMonths";
import styles from "./GstSummaryPanel.module.css";

export type GstSummaryPayload = {
  month: string;
  range: { startUtc: string; endUtcExclusive: string };
  shopCode: string;
  shopName: string;
  gstNumber: string | null;
  cgstRate: number;
  sgstRate: number;
  combinedRatePercent: number;
  billCount: number;
  discountTotal: number;
  grossInclusive: number;
  taxableValue: number;
  totalTax: number;
  cgstPayable: number;
  sgstPayable: number;
  igstPayable: number;
  taxInferred: boolean;
  /** Tax per GST rate, from the rate stored on each bill line. */
  byRate?: { ratePercent: number; tax: number }[];
};

export type GstSummaryPanelProps = {
  variant?: "full" | "embedded";
};

/** The latest finished request, tagged with the shop, month and retry it was for. */
type LoadResult = {
  key: string;
  data: GstSummaryPayload | null;
  error: string | null;
};

/** Clicking through several months sends one request, for the month you stop on. */
const FETCH_DELAY_MS = 250;

function ReportSkeleton() {
  return (
    <div className={styles.report} role="status" aria-label="Loading GST summary">
      <span className={`${styles.skeletonBar} ${styles.skeletonMeta}`} />
      <MetricStrip label="Loading GST totals">
        {[0, 1, 2, 3].map((i) => (
          <Metric
            key={i}
            label={<span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />}
            value={<span className={`${styles.skeletonBar} ${styles.skeletonValue}`} />}
          />
        ))}
      </MetricStrip>
      <div className={styles.skeletonCard}>
        <div className={styles.skeletonCardHeader}>
          <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`} />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <span className={styles.skeletonBar} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Monthly GST from paid bills: totals, CGST/SGST split and tax by rate (IGST not tracked). */
export default function GstSummaryPanel({ variant = "full" }: GstSummaryPanelProps) {
  const embedded = variant === "embedded";
  const { message } = App.useApp();
  const { user } = useAuth();
  const { effectiveShopCode } = useShop();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";
  const shopKey = effectiveShopCode || defaultShop;

  const currentMonth = istMonthNow();
  const [month, setMonth] = useState(istMonthNow);
  // What the month box shows. While a year is half-typed it differs from `month`,
  // which only ever holds a complete month we can report on.
  const [monthInput, setMonthInput] = useState(month);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  const requestKey = `${shopKey}|${month}|${reloadKey}`;
  const loading = Boolean(shopKey) && result?.key !== requestKey;
  // The previous month stays on screen, dimmed, until the next one arrives.
  const data = result?.data ?? null;
  const error = result?.key === requestKey ? result.error : null;

  useEffect(() => {
    if (!shopKey) return;
    const key = `${shopKey}|${month}|${reloadKey}`;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetchLong(
          `/analytics/gst-summary?month=${encodeURIComponent(month)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
          throw new Error(
            typeof body?.message === "string"
              ? body.message
              : res.statusText || `Request failed (${res.status}).`,
          );
        }
        const payload = (await res.json()) as GstSummaryPayload;
        if (!controller.signal.aborted) setResult({ key, data: payload, error: null });
      } catch (e) {
        // Aborted: the month or shop changed, and a newer request owns the screen.
        if (controller.signal.aborted) return;
        setResult({
          key,
          data: null,
          error: isRequestTimeout(e)
            ? REQUEST_TIMEOUT_MESSAGE
            : e instanceof Error
              ? e.message
              : "Something went wrong.",
        });
      }
    }, FETCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [shopKey, month, reloadKey]);

  const goToMonth = (next: string) => {
    setMonth(next);
    setMonthInput(next);
  };

  const [exporting, setExporting] = useState(false);
  const exportReport = async (format: "xlsx" | "pdf") => {
    if (!data) return;
    setExporting(true);
    try {
      // Loaded on demand so exceljs/jspdf stay out of the page bundle.
      const { downloadGstExcel, downloadGstPdf } = await import("@/lib/listExports");
      if (format === "xlsx") await downloadGstExcel(data);
      else downloadGstPdf(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not export GST summary.");
    } finally {
      setExporting(false);
    }
  };

  const actions = (
    <>
      <Space.Compact>
        <Button
          icon={<ChevronLeft size={16} />}
          aria-label="Previous month"
          disabled={month <= GST_START_MONTH}
          onClick={() => goToMonth(shiftMonth(month, -1))}
        />
        <Input
          type="month"
          aria-label="Report month"
          className={styles.monthInput}
          value={monthInput}
          min={GST_START_MONTH}
          max={currentMonth}
          onChange={(e) => {
            const next = e.target.value;
            setMonthInput(next);
            if (isReportableMonth(next, currentMonth)) setMonth(next);
          }}
          onBlur={() => setMonthInput(month)}
        />
        <Button
          icon={<ChevronRight size={16} />}
          aria-label="Next month"
          disabled={month >= currentMonth}
          onClick={() => goToMonth(shiftMonth(month, 1))}
        />
      </Space.Compact>
      <Dropdown
        disabled={!data || loading}
        menu={{
          items: [
            { key: "xlsx", label: "Excel (.xlsx)" },
            { key: "pdf", label: "PDF" },
          ],
          onClick: ({ key }) => void exportReport(key as "xlsx" | "pdf"),
        }}
      >
        <Button icon={<Download size={16} />} loading={exporting}>
          Export
        </Button>
      </Dropdown>
    </>
  );

  let body: React.ReactNode;
  if (!shopKey) {
    body = (
      <EmptyState
        icon={<Store size={40} />}
        message="No shop selected"
        description="Choose a shop in the header to see its GST summary."
      />
    );
  } else if (error) {
    body = (
      <EmptyState
        icon={<CircleAlert size={40} />}
        message="Couldn't load the GST summary"
        description={error}
        action={
          <Button icon={<RotateCw size={16} />} onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        }
      />
    );
  } else if (!data) {
    body = <ReportSkeleton />;
  } else {
    const previousMonth = shiftMonth(data.month, -1);
    body = (
      <div
        className={`${styles.report} ${loading ? styles.refreshing : ""}`.trim()}
        aria-busy={loading || undefined}
      >
        {data.taxInferred ? (
          <Alert
            type="warning"
            showIcon
            title="Some tax amounts were estimated from bill totals because the bills had no stored tax."
          />
        ) : null}
        {data.billCount === 0 ? (
          <EmptyState
            icon={<ReceiptIndianRupee size={40} />}
            message={`No paid bills in ${monthLabel(data.month)}`}
            description={
              data.month === currentMonth
                ? "GST figures appear here as bills are saved this month."
                : "No sales were recorded for this shop in that month."
            }
            action={
              previousMonth >= GST_START_MONTH ? (
                <Button onClick={() => goToMonth(previousMonth)}>
                  View {monthLabel(previousMonth)}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <GstSummaryReport
            data={data}
            currentMonth={currentMonth}
            canEditShopProfile={user?.role === "SUPER_ADMIN"}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${embedded ? styles.embedded : ""}`.trim()}>
      <PageHeader
        title="GST summary"
        description="Tax collected on paid bills in a month, split into CGST and SGST."
        actions={actions}
      />
      {body}
    </div>
  );
}
