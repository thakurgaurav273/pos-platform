"use client";

import { Button } from "antd";
import { CircleAlert, CircleCheck, RotateCw, ShoppingBag, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import RevenueExplorer from "@/components/DashboardHome/RevenueExplorer";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { Metric, MetricStrip } from "@/components/MetricStrip/MetricStrip";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { SectionCard, SectionLink } from "@/components/SectionCard/SectionCard";
import { useAuth, type RolePermissions } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch } from "@/lib/api";
import { formatInrFull, istDayOffset } from "@/lib/chartFormat";
import { paymentLabel } from "@/lib/payments";
import { billRefOf } from "@/lib/printInvoice";
import styles from "./DashboardHome.module.css";

type RecentOrder = {
  id: string;
  billNo?: string | null;
  legacyBillRef?: string | null;
  createdAt: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
};

type LowStockVariant = {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  minStock: number | null;
};

type DashboardPayload = {
  today: { orderCount: number; revenue: number };
  monthToDate: { orderCount: number; revenue: number };
  catalog: { productCount: number; variantCount: number; lowStockCount: number };
  paymentToday: { paymentMethod: string; orderCount: number; revenue: number }[];
  recentOrders: RecentOrder[];
  lowStockVariants: LowStockVariant[];
};

const countFormat = new Intl.NumberFormat("en-IN");
const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const shareFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const istDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const istTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});
const istShortDay = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
});

function inr(n: number): string {
  return formatInrFull(Number.isFinite(Number(n)) ? Number(n) : 0);
}

function bills(n: number): string {
  return `${countFormat.format(n)} ${n === 1 ? "bill" : "bills"}`;
}

/** "4:32 pm" today, "Yesterday, 4:32 pm", otherwise "29 Oct, 4:32 pm" (IST). */
function billTime(iso: string, today: string, yesterday: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = istDay.format(d);
  const time = istTime.format(d);
  if (day === today) return time;
  if (day === yesterday) return `Yesterday, ${time}`;
  return `${istShortDay.format(d)}, ${time}`;
}

function statusPill(status: string): ReactNode {
  if (status === "PAID") return null;
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  const tone = status === "CANCELLED" ? styles.pillDanger : styles.pillWarning;
  return <span className={`${styles.pill} ${tone}`}>{label}</span>;
}

/** A list row that opens a page when the user may open it, else plain text. */
function RowLink({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? (
    <Link href={href} className={styles.row}>
      {children}
    </Link>
  ) : (
    <div className={styles.row}>{children}</div>
  );
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

function RecentBills({ orders, canOpen }: { orders: RecentOrder[]; canOpen: boolean }) {
  if (orders.length === 0) {
    return <p className={styles.notice}>No bills yet. Bills saved in Billing POS appear here.</p>;
  }
  const today = istDayOffset(0);
  const yesterday = istDayOffset(-1);
  return (
    <ul className={styles.list}>
      {orders.map((o) => {
        const customer = o.customerName?.trim() || o.customerPhone?.trim() || "Walk-in";
        return (
          <li key={o.id}>
            <RowLink href={canOpen ? `/orders/${encodeURIComponent(o.id)}` : null}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  <span className={styles.billRef}>{billRefOf(o)}</span>
                  {statusPill(o.status)}
                </div>
                <div className={styles.rowMeta}>
                  {customer} · {billTime(o.createdAt, today, yesterday)}
                </div>
              </div>
              <div className={styles.rowEnd}>
                <div
                  className={`${styles.amount} ${o.status === "CANCELLED" ? styles.amountCancelled : ""}`.trim()}
                >
                  {inr(o.totalAmount)}
                </div>
                <div className={styles.rowMeta}>{paymentLabel(o.paymentMethod)}</div>
              </div>
            </RowLink>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentsToday({ rows }: { rows: DashboardPayload["paymentToday"] }) {
  if (rows.length === 0) {
    return <p className={styles.notice}>No sales yet today.</p>;
  }
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, r) => sum + r.revenue, 0);
  return (
    <ul className={styles.list}>
      {sorted.map((r) => {
        const share = total > 0 ? (r.revenue / total) * 100 : 0;
        return (
          <li key={r.paymentMethod} className={styles.payRow}>
            <div className={styles.payTop}>
              <span className={styles.payLabel}>{paymentLabel(r.paymentMethod)}</span>
              <span className={styles.amount}>{inr(r.revenue)}</span>
            </div>
            <div className={styles.payBar}>
              <span className={styles.track} aria-hidden>
                <span className={styles.fill} style={{ width: `${share}%` }} />
              </span>
              <span className={styles.payMeta}>
                {shareFormat.format(share)}% · {bills(r.orderCount)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RestockList({ items, canOpen }: { items: LowStockVariant[]; canOpen: boolean }) {
  if (items.length === 0) {
    return (
      <p className={styles.notice}>
        <CircleCheck size={16} className={styles.noticeIcon} aria-hidden />
        Everything is above its minimum stock.
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {items.map((v) => {
        const qty = Number(v.quantity);
        const out = qty <= 0;
        return (
          <li key={v.id}>
            <RowLink href={canOpen ? `/inventory/${encodeURIComponent(v.id)}` : null}>
              <div className={styles.rowMain}>
                <div className={styles.rowName} title={v.productName}>
                  {v.productName}
                </div>
                <div className={styles.rowMeta}>
                  {v.variantName}
                  {v.minStock != null ? ` · min ${qtyFormat.format(Number(v.minStock))}` : ""}
                </div>
              </div>
              <span className={`${styles.pill} ${out ? styles.pillDanger : styles.pillWarning}`}>
                {out ? "Out of stock" : `${qtyFormat.format(qty)} left`}
              </span>
            </RowLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Overview tab: today's figures, revenue by period, recent bills, payments and restock. */
export default function DashboardHome() {
  const router = useRouter();
  const { permissions } = useAuth();
  const { effectiveShopCode } = useShop();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";
  const shopKey = effectiveShopCode || defaultShop;

  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{ key: string; data: DashboardPayload | null } | null>(
    null,
  );
  const requestKey = `${shopKey}|${reloadKey}`;
  const loading = Boolean(shopKey) && result?.key !== requestKey;
  const data = result?.data ?? null;
  const failed = !loading && result?.key === requestKey && !result.data;

  useEffect(() => {
    if (!shopKey) return;
    const key = `${shopKey}|${reloadKey}`;
    // No abort: apiFetch shares one in-flight GET between callers, and aborting it
    // would also fail the request React's dev double-render starts right after.
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/analytics/dashboard");
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        const payload = (await res.json()) as DashboardPayload;
        if (!cancelled) setResult({ key, data: payload });
      } catch {
        if (!cancelled) setResult({ key, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopKey, reloadKey]);

  // Links only point at pages the user may open. Unknown permissions (an older saved
  // session) keep them; each page still checks access itself.
  const allowed = (key: keyof RolePermissions) => permissions?.[key] ?? true;

  const header = (
    <PageHeader
      title="Dashboard"
      description="Sales, recent bills and stock alerts for your shop. Days follow IST."
      actions={
        allowed("canAccessBilling") ? (
          <Button
            type="primary"
            icon={<ShoppingBag size={16} />}
            onClick={() => router.push("/billing-pos")}
          >
            New sale
          </Button>
        ) : null
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
          description="Choose a shop in the header to see its dashboard."
        />
      </div>
    );
  }

  if (failed) {
    return (
      <div className={styles.root}>
        {header}
        <EmptyState
          icon={<CircleAlert size={40} />}
          message="Couldn't load the dashboard"
          description="Check your connection and try again."
          action={
            <Button icon={<RotateCw size={16} />} onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const today = istDayOffset(0);
  const monthStart = istShortDay.format(new Date(`${today.slice(0, 7)}-01T12:00:00+05:30`));
  const lowStock = data?.catalog.lowStockCount ?? 0;

  return (
    <div className={styles.root}>
      {header}

      <MetricStrip label="Key figures">
        {data ? (
          <>
            <Metric
              accent
              label="Today's revenue"
              value={inr(data.today.revenue)}
              note={bills(data.today.orderCount)}
            />
            <Metric
              label="This month"
              value={inr(data.monthToDate.revenue)}
              note={`${bills(data.monthToDate.orderCount)} since ${monthStart}`}
            />
            <Metric
              label="Products"
              value={countFormat.format(data.catalog.productCount)}
              note={
                <>
                  {countFormat.format(data.catalog.variantCount)} SKUs
                  {allowed("canAccessProducts") ? (
                    <>
                      {" · "}
                      <Link href="/products" className={styles.inlineLink}>
                        View
                      </Link>
                    </>
                  ) : null}
                </>
              }
            />
            <Metric
              label="Low or out of stock"
              value={countFormat.format(lowStock)}
              tone={lowStock > 0 ? "warning" : undefined}
              note={
                <>
                  At or below minimum stock
                  {lowStock > 0 && allowed("canAccessInventory") ? (
                    <>
                      {" · "}
                      <Link href="/inventory?filter=low-stock" className={styles.inlineLink}>
                        View
                      </Link>
                    </>
                  ) : null}
                </>
              }
            />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => (
            <Metric
              key={i}
              label={<span className={`${styles.skeletonBar} ${styles.skeletonLabel}`} />}
              value={<span className={`${styles.skeletonBar} ${styles.skeletonValue}`} />}
            />
          ))
        )}
      </MetricStrip>

      <RevenueExplorer />

      <div className={styles.columns}>
        <SectionCard
          title="Recent bills"
          action={allowed("canAccessOrders") ? <SectionLink href="/orders">View all</SectionLink> : null}
        >
          {data ? (
            <RecentBills orders={data.recentOrders} canOpen={allowed("canAccessOrders")} />
          ) : (
            <SkeletonRows count={6} />
          )}
        </SectionCard>

        <div className={styles.side}>
          <SectionCard title="Today's payments">
            {data ? <PaymentsToday rows={data.paymentToday} /> : <SkeletonRows count={2} />}
          </SectionCard>

          <SectionCard
            title="Restock soon"
            description={
              data && lowStock > data.lowStockVariants.length
                ? `Lowest ${data.lowStockVariants.length} of ${countFormat.format(lowStock)}`
                : undefined
            }
            action={
              lowStock > 0 && allowed("canAccessInventory") ? (
                <SectionLink href="/inventory?filter=low-stock">View all</SectionLink>
              ) : null
            }
          >
            {data ? (
              <RestockList items={data.lowStockVariants} canOpen={allowed("canAccessInventory")} />
            ) : (
              <SkeletonRows count={3} />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
