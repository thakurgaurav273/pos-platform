"use client";

import { paymentLabel as sharedPaymentLabel } from "@/lib/payments";
import {
  App,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Input,
  Row,
  Segmented,
  Spin,
  Statistic,
  Table,
  Typography,
} from "antd";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  PieChart as PieChartIcon,
} from "lucide-react";

import { useShop } from "@/contexts/ShopContext";
import { useChartPalette } from "@/contexts/ThemeContext";
import { apiFetch } from "@/lib/api";
import { chartDayLabel, formatInrFull } from "@/lib/chartFormat";
import {
  downloadReportsExcel,
  downloadReportsPdf,
  type ReportsExportPayload,
} from "@/lib/reportsExport";
import { antTableOverflowComponents } from "@/components/AntTableOverflowCell/AntTableOverflowCell";
import ReportsOrdersTable from "@/components/ReportsOrdersTable/ReportsOrdersTable";

const { Text, Title } = Typography;

type ReportsPayload = {
  days: number;
  /** New value on each successful summary fetch, used to remount charts. */
  generatedAt: string;
  bucket: "day" | "month";
  range: { start: string; end: string };
  totals: { orderCount: number; revenue: number };
  daily: { date: string; revenue: number; orderCount: number }[];
  paymentMix: {
    paymentMethod: string;
    orderCount: number;
    revenue: number;
  }[];
  topProducts: { productName: string; qtySold: number; revenue: number }[];
};

function paymentLabel(raw: string) {
  return sharedPaymentLabel(raw, "Other");
}

/** Presets for rolling window reports (API clamps days to 7–180). */
const REPORT_QUICK_DAY_PRESETS = [7, 30, 90, 180] as const;

type ReportsFilterMode = "quick" | "range" | "month";

export type ReportsHomeProps = {
  variant?: "full" | "embedded";
};

export default function ReportsHome({ variant = "full" }: ReportsHomeProps) {
  const embedded = variant === "embedded";
  const showSummaryCards = !embedded;
  const showDailyRevenueChart = !embedded;
  const { message } = App.useApp();
  const { effectiveShopCode, shops } = useShop();
  const palette = useChartPalette();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";
  const shopKey = effectiveShopCode || defaultShop;

  const [days, setDays] = useState<number>(30);
  const [filterMode, setFilterMode] = useState<ReportsFilterMode>("quick");
  const [bucket, setBucket] = useState<"day" | "month">("day");
  const [rangeDraft, setRangeDraft] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [rangeApplied, setRangeApplied] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [monthDraft, setMonthDraft] = useState<string>("");
  const [monthApplied, setMonthApplied] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [exportBusy, setExportBusy] = useState<"xlsx" | "pdf" | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const shopDisplayName = useMemo(() => {
    const row = shops.find((s) => s.shopCode === shopKey);
    return row?.name?.trim() || shopKey;
  }, [shops, shopKey]);

  const load = useCallback(async () => {
    if (!shopKey) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("bucket", bucket);
      if (filterMode === "month" && monthApplied) {
        q.set("month", monthApplied);
      } else if (
        filterMode === "range" &&
        rangeApplied.start &&
        rangeApplied.end
      ) {
        q.set("start", rangeApplied.start);
        q.set("end", rangeApplied.end);
      } else {
        q.set("days", String(days));
      }
      const res = await apiFetch(
        `/analytics/reports/summary?${q.toString()}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as ReportsPayload;
      setData(payload);
      setRangeDraft((prev) =>
        prev.start && prev.end
          ? prev
          : { start: payload.range.start, end: payload.range.end },
      );
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    shopKey,
    bucket,
    days,
    filterMode,
    monthApplied,
    rangeApplied.end,
    rangeApplied.start,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = useCallback(
    async (kind: "xlsx" | "pdf") => {
      if (!shopKey) return;
      setExportBusy(kind);
      try {
        const q = new URLSearchParams();
        q.set("bucket", bucket);
        if (filterMode === "month" && monthApplied) {
          q.set("month", monthApplied);
        } else if (
          filterMode === "range" &&
          rangeApplied.start &&
          rangeApplied.end
        ) {
          q.set("start", rangeApplied.start);
          q.set("end", rangeApplied.end);
        } else {
          q.set("days", String(days));
        }
        const res = await apiFetch(
          `/analytics/reports/export-data?${q.toString()}`,
        );
        if (!res.ok) {
          throw new Error((await res.text()) || res.statusText);
        }
        const payload = (await res.json()) as ReportsExportPayload;
        if (kind === "xlsx") {
          await downloadReportsExcel(payload, shopDisplayName, shopKey);
        } else {
          await downloadReportsPdf(payload, shopDisplayName, shopKey);
        }
        message.success(
          kind === "xlsx"
            ? "Excel file downloaded."
            : "PDF downloaded.",
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Export failed.";
        message.error(msg);
      } finally {
        setExportBusy(null);
      }
    },
    [
      bucket,
      days,
      filterMode,
      message,
      monthApplied,
      rangeApplied.end,
      rangeApplied.start,
      shopDisplayName,
      shopKey,
    ],
  );

  const barData = useMemo(() => {
    if (!data) return [];
    return data.daily.map((d) => ({
      ...d,
      label:
        data.bucket === "month"
          ? new Date(`${d.date.slice(0, 7)}-01T00:00:00.000Z`).toLocaleDateString(
              undefined,
              { month: "short", year: "2-digit" },
            )
          : chartDayLabel(d.date),
    }));
  }, [data]);

  const pieData = useMemo(() => {
    if (!data) return [];
    return data.paymentMix.map((p) => ({
      name: paymentLabel(p.paymentMethod),
      value: p.revenue,
      orders: p.orderCount,
    }));
  }, [data]);

  const periodLabel = useMemo(() => {
    if (filterMode === "month" && monthApplied) {
      return monthApplied;
    }
    if (filterMode === "range") {
      if (rangeApplied.start && rangeApplied.end) {
        return `${rangeApplied.start} to ${rangeApplied.end}`;
      }
      if (data) {
        return `${data.range.start} to ${data.range.end}`;
      }
      return "Custom range";
    }
    return `${days}d`;
  }, [data, days, filterMode, monthApplied, rangeApplied.end, rangeApplied.start]);

  const chartRemountKey = data?.generatedAt ?? "";

  if (!shopKey) {
    return (
      <Empty description="Select a shop to load reports." className="py-16" />
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-6 ${embedded ? "pb-6" : ""}`}>
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Title
            level={embedded ? 4 : 2}
            className={`!mb-1 !text-[var(--text-primary)] ${embedded ? "!text-lg sm:!text-xl" : ""}`}
          >
            {embedded ? "Analytics & reports" : "Reports"}
          </Title>
          <Text className="text-[var(--text-secondary)] text-xs sm:text-sm">
            {embedded
              ? "Deep-dive analytics: payment behavior, top products, and searchable order history."
              : "Sales trends, payment mix, top products, and searchable order history. Daily buckets use IST dates."}
          </Text>
          <Text
            className="mt-2 block text-xs text-[var(--bistre-600)]"
            type="secondary"
          >
            <span className="font-medium text-[var(--text-primary)]">
              Showing:{" "}
            </span>
            {!data && loading ? "Loading…" : periodLabel}
            {data && loading ? (
              <span className="text-[var(--text-secondary)]"> · refreshing…</span>
            ) : null}
            <span className="mx-1.5 text-[var(--pearl-bush)]">·</span>
            {bucket === "month" ? "Month-wise buckets" : "Day-wise buckets"}
          </Text>
          <div className="mt-3 flex max-w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Text className="shrink-0 text-xs text-[var(--text-secondary)]">
              Chart range
            </Text>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_QUICK_DAY_PRESETS.map((d) => (
                <Button
                  key={d}
                  size="small"
                  type={
                    filterMode === "quick" && days === d ? "primary" : "default"
                  }
                  onClick={() => {
                    setFilterMode("quick");
                    setDays(d);
                  }}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>
        </div>
        <Button
          type="primary"
          icon={<Download className="h-4 w-4" aria-hidden />}
          onClick={() => setFilterDrawerOpen(true)}
          className="shrink-0 self-start sm:self-center"
        >
          Export data
        </Button>
      </div>

      <Drawer
        title="Report filters & export"
        placement="right"
        size={420}
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        styles={{
          root: { maxWidth: "calc(100vw - 16px)" },
          body: { paddingTop: 12 },
          footer: { borderTop: "1px solid var(--pearl-bush)" },
        }}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => setFilterDrawerOpen(false)}>Close</Button>
            <Button
              icon={<FileSpreadsheet className="h-4 w-4" aria-hidden />}
              loading={exportBusy === "xlsx"}
              disabled={!shopKey || !!exportBusy}
              onClick={() => void handleExport("xlsx")}
            >
              Excel (.xlsx)
            </Button>
            <Button
              type="primary"
              icon={<FileText className="h-4 w-4" aria-hidden />}
              loading={exportBusy === "pdf"}
              disabled={!shopKey || !!exportBusy}
              onClick={() => void handleExport("pdf")}
            >
              PDF
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <div>
            <Text className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              Chart grouping
            </Text>
            <Segmented
              block
              options={[
                { label: "Day wise", value: "day" },
                { label: "Month wise", value: "month" },
              ]}
              value={bucket}
              onChange={(v) => setBucket(v as "day" | "month")}
            />
          </div>

          <div>
            <Text className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              Quick range
            </Text>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_QUICK_DAY_PRESETS.map((d) => (
                <Button
                  key={d}
                  size="small"
                  type={
                    filterMode === "quick" && days === d ? "primary" : "default"
                  }
                  onClick={() => {
                    setFilterMode("quick");
                    setDays(d);
                  }}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Text className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              Custom date range
            </Text>
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  type="date"
                  value={rangeDraft.start}
                  onChange={(e) =>
                    setRangeDraft((p) => ({ ...p, start: e.target.value }))
                  }
                  className="min-w-[140px] flex-1"
                />
                <Input
                  type="date"
                  value={rangeDraft.end}
                  onChange={(e) =>
                    setRangeDraft((p) => ({ ...p, end: e.target.value }))
                  }
                  className="min-w-[140px] flex-1"
                />
              </div>
              <Button
                type={filterMode === "range" ? "primary" : "default"}
                block
                onClick={() => {
                  if (!rangeDraft.start || !rangeDraft.end) return;
                  if (rangeDraft.end < rangeDraft.start) {
                    message.warning("End date must be after start date.");
                    return;
                  }
                  setFilterMode("range");
                  setRangeApplied(rangeDraft);
                }}
              >
                Apply date range
              </Button>
            </div>
          </div>

          <div>
            <Text className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              Single month
            </Text>
            <div className="flex w-full flex-col gap-2">
              <Input
                type="month"
                value={monthDraft}
                onChange={(e) => setMonthDraft(e.target.value)}
                className="w-full max-w-full"
              />
              <Button
                type={filterMode === "month" ? "primary" : "default"}
                block
                onClick={() => {
                  if (!monthDraft) return;
                  setFilterMode("month");
                  setMonthApplied(monthDraft);
                }}
              >
                Apply month
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      {loading && !data ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Spin size="large" />
        </div>
      ) : !data ? (
        <Card className="rounded-xl border-[var(--pearl-bush)]">
          <Empty description="Could not load reports." />
        </Card>
      ) : (
        <>
          {showSummaryCards ? (
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Card
                  variant="borderless"
                  className="rounded-xl border border-[var(--pearl-bush)] bg-[var(--surface-subtle)] shadow-sm"
                >
                  <Statistic
                    title={`Revenue (${periodLabel})`}
                    value={data.totals.revenue}
                    formatter={(v) => formatInrFull(Number(v))}
                    styles={{
                      content: { color: "var(--bistre-800)", fontWeight: 700 },
                    }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card
                  variant="borderless"
                  className="rounded-xl border border-[var(--pearl-bush)] bg-[var(--surface-subtle)] shadow-sm"
                >
                  <Statistic
                    title="Bills"
                    value={data.totals.orderCount}
                    styles={{
                      content: { color: "var(--bistre-800)", fontWeight: 700 },
                    }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card
                  variant="borderless"
                  className="rounded-xl border border-[var(--pearl-bush)] bg-[var(--surface-subtle)] shadow-sm"
                >
                  <Statistic
                    title="Avg. bill value"
                    value={
                      data.totals.orderCount > 0
                        ? data.totals.revenue / data.totals.orderCount
                        : 0
                    }
                    formatter={(v) => formatInrFull(Number(v))}
                    styles={{
                      content: { color: "var(--bistre-800)", fontWeight: 700 },
                    }}
                  />
                </Card>
              </Col>
            </Row>
          ) : null}

          <Row gutter={[16, 16]} className="items-stretch">
            {showDailyRevenueChart ? (
              <Col xs={24} xl={14} className="flex flex-col">
                <Card
                  title={
                    <span className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[var(--ochre-600)]" />
                      {data.bucket === "month" ? "Month-wise revenue" : "Daily revenue"}
                    </span>
                  }
                  variant="borderless"
                  className="flex flex-col h-full rounded-xl border border-[var(--pearl-bush)] shadow-sm"
                  styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
                >
                  <div className="flex-1 w-full min-w-0 min-h-[320px]">
                    <ResponsiveContainer
                      key={`bar-${chartRemountKey}`}
                      width="100%"
                      height="100%"
                    >
                      <BarChart
                        data={barData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid vertical={false} stroke={palette.grid} />
                        <XAxis
                          dataKey="label"
                          interval="preserveStartEnd"
                          tick={{ fontSize: 10, fill: palette.axis }}
                          axisLine={{ stroke: palette.grid }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: palette.axis }}
                          axisLine={false}
                          width={48}
                          tickFormatter={(v) =>
                            Number(v) >= 1000
                              ? `₹${(Number(v) / 1000).toFixed(1)}k`
                              : `₹${v}`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "var(--ui-radius-md)",
                            borderColor: palette.tooltipBorder,
                            background: palette.tooltipBg,
                            color: palette.text,
                          }}
                          formatter={(value, name) => {
                            if (name === "revenue")
                              return [
                                formatInrFull(Number(value ?? 0)),
                                "Revenue",
                              ];
                            return [value ?? "", String(name)];
                          }}
                          labelFormatter={(_, payload) =>
                            payload?.[0]?.payload?.date
                              ? chartDayLabel(String(payload[0].payload.date))
                              : ""
                          }
                        />
                        <Bar
                          dataKey="revenue"
                          name="revenue"
                          fill={palette.primary}
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </Col>
            ) : null}
            <Col xs={24} xl={showDailyRevenueChart ? 10 : 24} className="flex flex-col">
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-[var(--ochre-600)]" />
                    {embedded ? "Payment mix (selected range)" : "Revenue by payment mode"}
                  </span>
                }
                variant="borderless"
                className="flex flex-col h-full rounded-xl border border-[var(--pearl-bush)] shadow-sm"
                styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
              >
                <div className="flex-1 w-full min-w-0 min-h-[320px] flex items-center justify-center">
                  {pieData.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No sales in this range"
                      className="py-8"
                    />
                  ) : (
                    <ResponsiveContainer
                      key={`pie-${chartRemountKey}`}
                      width="100%"
                      height="100%"
                    >
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {pieData.map((_, i) => (
                            <Cell
                              key={String(i)}
                              fill={palette.series[i % palette.series.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "var(--ui-radius-md)",
                            borderColor: palette.tooltipBorder,
                            background: palette.tooltipBg,
                            color: palette.text,
                          }}
                          formatter={(value, _name, item) => {
                            const o = item?.payload as {
                              orders?: number;
                            };
                            return [
                              `${formatInrFull(Number(value ?? 0))} (${o?.orders ?? 0} bills)`,
                              "Revenue",
                            ];
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Card
            title="Top products by revenue"
            variant="borderless"
            className="rounded-xl border border-[var(--pearl-bush)] shadow-sm"
            extra={
              <Link
                href="/products"
                className="text-sm text-[var(--ochre-600)] hover:underline"
              >
                Manage products
              </Link>
            }
          >
            {data.topProducts.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No line items in this period"
              />
            ) : (
              <Table
                size="small"
                pagination={{ pageSize: 10, showSizeChanger: false }}
                rowKey="productName"
                components={antTableOverflowComponents}
                dataSource={data.topProducts}
                columns={[
                  {
                    title: "Product",
                    dataIndex: "productName",
                    ellipsis: true,
                  },
                  {
                    title: "Qty sold",
                    dataIndex: "qtySold",
                    width: 100,
                    align: "right" as const,
                  },
                  {
                    title: "Revenue",
                    dataIndex: "revenue",
                    width: 140,
                    align: "right" as const,
                    render: (n: number) => formatInrFull(n),
                  },
                ]}
              />
            )}
          </Card>

          <Card
            title="Order register"
            variant="borderless"
            className="rounded-xl border border-[var(--pearl-bush)] shadow-sm"
            extra={
              <Link href="/orders" className="text-sm text-[var(--ochre-600)] hover:underline">
                Open orders page
              </Link>
            }
          >
            <Text type="secondary" className="mb-3 block text-sm">
              Click a row to open bill details. Same data as the Orders list.
            </Text>
            <div className="max-h-[550px]">
              <ReportsOrdersTable />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
