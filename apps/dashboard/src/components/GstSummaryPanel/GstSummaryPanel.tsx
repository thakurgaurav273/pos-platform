"use client";

import { App, Button, Card, Col, Dropdown, Row, Spin, Typography } from "antd";
import { Download } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useShop } from "@/contexts/ShopContext";
import { apiFetchLong, isRequestTimeout, REQUEST_TIMEOUT_MESSAGE } from "@/lib/api";
import { formatInrFull, istDayOffset } from "@/lib/chartFormat";

const { Text, Title } = Typography;

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
};

/** Current IST month (`YYYY-MM`); GST months are IST calendar months on the API. */
function istMonthNow(): string {
  return istDayOffset(0).slice(0, 7);
}

function fmt(n: number): string {
  return formatInrFull(Number.isFinite(n) ? n : 0);
}

export type GstSummaryPanelProps = {
  variant?: "full" | "embedded";
};

const thCls =
  "bg-[var(--bistre-800)] px-3 py-2 text-left text-xs font-semibold text-[var(--surface)]";
const cellRight = "px-3 py-2 text-right text-sm tabular-nums text-[var(--bistre-800)]";
const cellLeft = "px-3 py-2 text-sm text-[var(--bistre-800)]";
const rowAlt = "bg-[var(--surface-subtle)]";

/** GST-style monthly matrix from POS bills (shop CGST/SGST; IGST not tracked). */
export default function GstSummaryPanel({
  variant = "full",
}: GstSummaryPanelProps) {
  const embedded = variant === "embedded";
  const { message } = App.useApp();
  const { effectiveShopCode } = useShop();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";
  const shopKey = effectiveShopCode || defaultShop;

  const [month, setMonth] = useState(istMonthNow);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GstSummaryPayload | null>(null);

  const load = useCallback(async () => {
    if (!shopKey || loading) return;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      message.warning("Pick a month (YYYY-MM).");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetchLong(
        `/analytics/gst-summary?month=${encodeURIComponent(month)}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          typeof body?.message === "string" ? body.message : res.statusText,
        );
      }
      setData((await res.json()) as GstSummaryPayload);
    } catch (e) {
      setData(null);
      message.error(
        isRequestTimeout(e)
          ? `GST report: ${REQUEST_TIMEOUT_MESSAGE}`
          : e instanceof Error
            ? e.message
            : "Could not load GST summary.",
      );
    } finally {
      setLoading(false);
    }
  }, [shopKey, month, message, loading]);

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

  useEffect(() => {
    if (shopKey) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopKey]);

  const sgstMid = data ? `${data.sgstRate.toFixed(1)}%` : "-";
  const cgstMid = data ? `${data.cgstRate.toFixed(1)}%` : "-";

  if (!shopKey) {
    return (
      <Card className="rounded-xl border-[var(--pearl-bush)]">
        <Text type="secondary">Select a shop to view GST summary.</Text>
      </Card>
    );
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-6 ${embedded ? "pb-2" : ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Title
            level={embedded ? 4 : 2}
            className={`!mb-1 !text-[var(--text-primary)] ${embedded ? "!text-lg sm:!text-xl" : ""}`}
          >
            GST summary
          </Title>
          <Text className="text-[var(--text-secondary)] text-xs sm:text-sm">
            Monthly taxable value and tax from POS bills (inclusive pricing). Rates
            use this shop&apos;s CGST/SGST. Interstate IGST is not modeled.
          </Text>
        </div>
        {/* Month, Get report and Export stay on one row; the block never shrinks to wrap. */}
        <div className="flex shrink-0 flex-wrap items-end gap-2 sm:flex-nowrap">
          <div>
            <Text className="mb-1 block text-xs text-[var(--text-secondary)]">
              Month
            </Text>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-md border border-[var(--pearl-bush)] bg-[var(--surface)] px-2 text-sm text-[var(--bistre-800)]"
            />
          </div>
          <Button type="primary" onClick={() => void load()} loading={loading}>
            Get report
          </Button>
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
        </div>
      </div>

      {loading && !data ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Spin size="large" />
        </div>
      ) : !data ? (
        <Card className="rounded-xl border-[var(--pearl-bush)]">
          <Text type="secondary">
            Choose a month and tap <strong>Get report</strong>.
          </Text>
        </Card>
      ) : (
        <>
          {data.taxInferred ? (
            <Text type="warning" className="text-sm">
              Tax amounts were estimated from bill totals (stored tax was zero).
            </Text>
          ) : null}

          <Card
            title="Sales summary (GST)"
            variant="borderless"
            className="rounded-xl border border-[var(--pearl-bush)] shadow-sm"
          >
            <div className="mb-3 text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                {data.shopName}
              </span>
              {data.gstNumber ? <> · GSTIN {data.gstNumber}</> : null} ·{" "}
              {data.month} · {data.billCount} bills · combined{" "}
              {data.combinedRatePercent.toFixed(1)}%
            </div>

            <div className="overflow-x-auto rounded-lg border border-[var(--pearl-bush)]">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr>
                    <th className={thCls} rowSpan={2}>
                      Sales summary
                    </th>
                    <th className={`${thCls} text-center`} colSpan={4}>
                      IGST
                    </th>
                    <th className={`${thCls} text-center`} colSpan={4}>
                      SGST / UTGST
                    </th>
                    <th className={`${thCls} text-center`} colSpan={4}>
                      CGST
                    </th>
                    <th className={`${thCls} text-center`} rowSpan={2}>
                      Total
                    </th>
                  </tr>
                  <tr>
                    <th className={thCls}>0.0%</th>
                    <th className={thCls}>5.0%</th>
                    <th className={thCls}>18.0%</th>
                    <th className={thCls}>…</th>
                    <th className={thCls}>0.0%</th>
                    <th className={thCls}>{sgstMid}</th>
                    <th className={thCls}>9.0%</th>
                    <th className={thCls}>…</th>
                    <th className={thCls}>0.0%</th>
                    <th className={thCls}>{cgstMid}</th>
                    <th className={thCls}>9.0%</th>
                    <th className={thCls}>…</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={rowAlt}>
                    <td className={cellLeft}>Taxable value</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(data.sgstRate > 0 ? data.taxableValue : 0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(data.cgstRate > 0 ? data.taxableValue : 0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(data.taxableValue)}</td>
                  </tr>
                  <tr>
                    <td className={cellLeft}>Tax payable</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(data.sgstRate > 0 ? data.sgstPayable : 0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(data.cgstRate > 0 ? data.cgstPayable : 0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(0)}</td>
                    <td className={cellRight}>{fmt(data.totalTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Text type="secondary" className="mt-3 block text-xs">
              Values in the SGST/CGST columns at your shop rate reflect all POS
              sales for the month. IGST and unused slabs stay at ₹0. Purchase /
              HSN / GSTR-3B are not wired yet.
            </Text>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card size="small" className="rounded-xl border-[var(--pearl-bush)]">
                <Text type="secondary">Gross (incl. tax)</Text>
                <div className="text-lg font-semibold text-[var(--bistre-800)]">
                  {fmt(data.grossInclusive)}
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" className="rounded-xl border-[var(--pearl-bush)]">
                <Text type="secondary">Taxable value</Text>
                <div className="text-lg font-semibold text-[var(--bistre-800)]">
                  {fmt(data.taxableValue)}
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" className="rounded-xl border-[var(--pearl-bush)]">
                <Text type="secondary">Total tax</Text>
                <div className="text-lg font-semibold text-[var(--bistre-800)]">
                  {fmt(data.totalTax)}
                </div>
              </Card>
            </Col>
          </Row>


        </>
      )}
    </div>
  );
}
