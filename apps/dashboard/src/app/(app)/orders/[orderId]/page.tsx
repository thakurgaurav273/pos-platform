"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  App,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Modal,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { Printer, Receipt, Store, UserRound } from "lucide-react";
import {
  paymentLabel,
  receiptPaymentRows,
  type PaymentLeg,
} from "@/lib/payments";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch } from "@/lib/api";
import { billPrintQuantity } from "@/lib/billingInstantPricing";
import {
  buildPrintReceiptHtml,
  billRefOf,
  openPrintableInvoice,
  type InvoicePrintFormat,
} from "@/lib/printInvoice";

import styles from "./bill-detail.module.css";

const { Text, Title } = Typography;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

type OrderDetailItem = {
  quantity: number;
  unitPrice: number;
  productName: string;
  variantLabel: string;
  unit: string | null;
  barcode: string;
};

type OrderLineTabRow = OrderDetailItem & {
  id: string;
  unitResolved: string;
  lineTotal: number;
};

type OrderDetail = {
  id: string;
  billNo?: string | null;
  legacyBillRef?: string | null;
  createdAt: string;
  paymentMethod: string;
  totalAmount: number;
  tax: number;
  discount: number;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  /** Payment legs; older orders come back as one leg of paymentMethod. */
  payments?: PaymentLeg[];
  cashTendered?: number | null;
  changeDue?: number | null;
  subtotal: number;
  items: OrderDetailItem[];
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}



function statusTagColor(status: string): string {
  const u = status.toUpperCase();
  if (u === "PAID") return "success";
  if (u === "PENDING" || u === "OPEN") return "warning";
  if (u === "CANCELLED" || u === "REFUNDED") return "error";
  return "processing";
}

/**
 * Splits the bill's stored tax the way the API's bill summary does: CGST rounded to paise,
 * SGST the remainder, so the two always add up to the tax on the original receipt.
 */
function splitGst(tax: number, cgstRate: number, sgstRate: number) {
  const rate = cgstRate + sgstRate;
  const cgst = rate > 0 ? Math.round((tax * cgstRate * 100) / rate) / 100 : 0;
  return { cgst, sgst: Math.round((tax - cgst) * 100) / 100 };
}

export default function OrderBillDetailPage() {
  const { message } = App.useApp();
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;
  const { shops, effectiveShopCode } = useShop();
  const shopName = useMemo(
    () =>
      shops.find((s) => s.shopCode === effectiveShopCode)?.name ??
      "Fluxen POS",
    [shops, effectiveShopCode],
  );

  const currentShop = shops.find((s) => s.shopCode === effectiveShopCode);
  const totalTaxRate = ((currentShop?.cgstRate ?? 2.5) + (currentShop?.sgstRate ?? 2.5)) / 100;

  const shopAddressPrint = useMemo(() => {
    if (!currentShop) return null;
    const parts = [
      currentShop.address,
      [currentShop.city, currentShop.state].filter(Boolean).join(", "),
      currentShop.pincode,
    ].filter((x) => x?.trim());
    return parts.length ? parts.join(", ") : null;
  }, [currentShop]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [linesBodyMaxHeight, setLinesBodyMaxHeight] = useState(400);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptHtml, setReceiptHtml] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const measure = () => {
      if (typeof window === "undefined") return;
      const layoutReservePx = 460;
      const y = Math.max(200, Math.min(720, window.innerHeight - layoutReservePx));
      setLinesBodyMaxHeight(y);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/orders/${encodeURIComponent(orderId)}`);
      if (!res.ok) {
        if (res.status === 404) {
          message.error("Bill not found");
          router.push("/orders");
          return;
        }
        const t = await res.text();
        message.error(t || res.statusText);
        return;
      }
      setOrder((await res.json()) as OrderDetail);
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orderId, message, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const invoiceRef = order ? billRefOf(order) : "…";

  const lineColumns = useMemo<AppTableColumn[]>(
    () => [
      {
        key: "product",
        label: "Item",
        field: "productName",
        minWidth: 200,
        render: (_, row) => {
          const r = row as OrderLineTabRow;
          return (
            <div className={styles.lineItemProductStack}>
              <span className={styles.lineItemTitle}>{r.productName}</span>
              {r.variantLabel ? (
                <span className={styles.lineItemSub}>{r.variantLabel}</span>
              ) : null}
              {r.barcode ? (
                <span className={styles.lineItemCode}>{r.barcode}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "quantity",
        label: "Qty",
        field: "quantity",
        width: 88,
        align: "right",
        render: (val) => {
          const n = Number(val);
          return (
            <span className={styles.tabularCell}>
              {Number.isFinite(n)
                ? n.toLocaleString("en-IN", { maximumFractionDigits: 3 })
                : String(val ?? "")}
            </span>
          );
        },
      },
      {
        key: "unitResolved",
        label: "Unit",
        field: "unitResolved",
        width: 80,
        align: "center",
      },
      {
        key: "unitPrice",
        label: "Rate",
        field: "unitPrice",
        width: 112,
        align: "right",
        render: (val) => (
          <span className={styles.tabularCell}>
            {inr.format(Number(val) || 0)}
          </span>
        ),
      },
      {
        key: "lineTotal",
        label: "Amount",
        field: "lineTotal",
        width: 120,
        align: "right",
        render: (val) => (
          <span className={styles.lineItemAmount}>
            {inr.format(Number(val) || 0)}
          </span>
        ),
      },
    ],
    [],
  );

  const taxSplit = splitGst(
    order?.tax ?? 0,
    currentShop?.cgstRate ?? 2.5,
    currentShop?.sgstRate ?? 2.5,
  );

  const handlePrint = (format: InvoicePrintFormat) => {
    if (!order) return;
    const customer =
      order.customerName?.trim() || order.customerPhone?.trim()
        ? {
          name: order.customerName?.trim() || "Walk-in",
          phone: order.customerPhone?.trim() ?? "",
          ...(order.customerEmail?.trim()
            ? { email: order.customerEmail.trim() }
            : {}),
        }
        : null;
    const cg = currentShop?.cgstRate ?? 2.5;
    const sg = currentShop?.sgstRate ?? 2.5;
    const taxAmt = order.tax ?? 0;
    const { cgst: cgstSplit, sgst: sgstSplit } = splitGst(taxAmt, cg, sg);
    const taxableBase = order.totalAmount - taxAmt;

    const invoiceData = {
      shopName,
      shopCode: effectiveShopCode ?? "-",
      shopAddress: shopAddressPrint,
      shopPhone: currentShop?.phone ?? null,
      gstNumber: currentShop?.gstNumber ?? null,
      fssaiNumber: currentShop?.fssaiNumber ?? null,
      invoiceNo: billRefOf(order),
      issuedAt: order.createdAt,
      customer,
      // Same KG/LTR normalisation as the POS receipt, so an instant line reprints as
      // "0.25 KG @ ₹520" rather than "250 GM @ ₹2.08".
      lines: order.items.map((i) => {
        const printed = billPrintQuantity(i.quantity, i.unit ?? "PC");
        return {
          name: i.productName,
          variantLabel: i.variantLabel,
          barcode: i.barcode,
          quantity: printed.quantity,
          unit: printed.unit,
          unitPrice:
            printed.quantity > 0
              ? (i.quantity * i.unitPrice) / printed.quantity
              : i.unitPrice,
        };
      }),
      subtotal: taxableBase,
      gstRate: totalTaxRate,
      gstAmount: taxAmt,
      cgstPercent: cg,
      sgstPercent: sg,
      cgstAmountSplit: cgstSplit,
      sgstAmountSplit: sgstSplit,
      discount: order.discount,
      total: order.totalAmount,
      returnHref:
        typeof window !== 'undefined'
          ? `${window.location.origin}/orders/${order.id}`
          : null,
      bankAccountNumber: currentShop?.bankAccountNumber ?? null,
      bankIfsc: currentShop?.bankIfsc ?? null,
      paymentMode: paymentLabel(order.paymentMethod, 'Cash'),
      payments: order.payments ?? null,
      cashTendered: order.cashTendered ?? null,
      changeDue: order.changeDue ?? null,
    };

    if (format === 'receipt') {
      setReceiptHtml(buildPrintReceiptHtml(invoiceData, { inlinePreview: true }));
      setReceiptModalOpen(true);
      return;
    }

    const ok = openPrintableInvoice(invoiceData, format);
    if (!ok) {
      message.error("Pop-up blocked. Allow pop-ups to print this bill.");
    }
  };

  const tableData: OrderLineTabRow[] = useMemo(() => {
    if (!order?.items.length) return [];
    return order.items.map((line, idx) => ({
      ...line,
      id: `${order.id}-${idx}`,
      unitResolved: line.unit?.trim() || "PC",
      lineTotal: line.quantity * line.unitPrice,
    }));
  }, [order]);

  const lineCount = order?.items.length ?? 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-auto pb-2">
      <Breadcrumb
        className="shrink-0 text-sm"
        items={[
          {
            title: (
              <Link
                href="/dashboard"
                className="text-[var(--ochre-600)] hover:underline"
              >
                Home
              </Link>
            ),
          },
          {
            title: (
              <Link
                href="/orders"
                className="text-[var(--ochre-600)] hover:underline"
              >
                Orders
              </Link>
            ),
          },
          {
            title: (
              <span className="text-[var(--text-secondary)]">
                Bill {invoiceRef}
              </span>
            ),
          },
        ]}
      />

      {loading && !order ? (
        <ContentSkeleton variant="detail" rowCount={10} />
      ) : order ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
                <Title
                  level={2}
                  className="!mb-0 !mt-0 !leading-tight !text-[var(--text-primary)]"
                >
                  Bill {invoiceRef}
                </Title>
                <Tag
                  color={statusTagColor(order.status)}
                  className="m-0 shrink-0"
                >
                  {order.status}
                </Tag>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <Receipt
                    className="h-3.5 w-3.5 shrink-0 text-[var(--bistre-400)]"
                    aria-hidden
                  />
                  {formatWhen(order.createdAt)}
                </span>
                <span className="shrink-0 text-[var(--bistre-200)]" aria-hidden>
                  ·
                </span>
                <Tag
                  className="m-0 shrink-0"
                >
                  {paymentLabel(order.paymentMethod)}
                </Tag>
              </div>
            </div>
            <Space wrap className="shrink-0">
              <Button onClick={() => router.push("/orders")}>
                Back to orders
              </Button>
              {/* <Tooltip title="Full invoice on A4 / PDF-style layout">
                <Button
                  type="primary"
                  icon={<Printer className="h-4 w-4" />}
                  onClick={() => handlePrint("a4")}
                >
                  Print invoice (A4)
                </Button>
              </Tooltip> */}
              <Tooltip title="Narrow layout for 80mm thermal printers">
                <Button
                  icon={<Receipt className="h-4 w-4" />}
                  onClick={() => handlePrint("receipt")}
                >
                  Print receipt
                </Button>
              </Tooltip>
            </Space>
          </div>

          <Card
            variant="borderless"
            className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            styles={{
              body: { padding: 0 },
            }}
          >
            <div className="p-5 sm:p-6">
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={13}>
                  <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--bistre-400)]">
                      <UserRound className="h-3.5 w-3.5" aria-hidden />
                      Customer
                    </div>
                    {order.customerName?.trim() ||
                      order.customerPhone?.trim() ? (
                      <div>
                        <Text className="text-base font-semibold text-[var(--text-primary)]">
                          {order.customerName?.trim() || "Walk-in"}
                        </Text>
                        {order.customerPhone ? (
                          <div className="mt-1 font-mono text-sm text-[var(--text-muted)]">
                            {order.customerPhone}
                          </div>
                        ) : null}
                        {order.customerEmail?.trim() ? (
                          <div className="mt-2 text-sm text-[var(--text-secondary)]">
                            {order.customerEmail}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Text type="secondary" className="italic">
                        Walk-in customer
                      </Text>
                    )}
                  </div>
                </Col>
                <Col xs={24} lg={11}>
                  <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                    <Text
                      type="secondary"
                      className="mb-2 text-xs font-medium"
                    >
                      Summary
                    </Text>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4 text-[var(--text-secondary)]">
                        <span>Items Total (Incl. Tax)</span>
                        <span className="tabular-nums font-medium text-[var(--text-primary)]">
                          {inr.format(order.subtotal)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-[var(--text-secondary)]">
                        <span>CGST</span>
                        <span className="tabular-nums font-medium text-[var(--text-primary)]">
                          {inr.format(taxSplit.cgst)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-[var(--text-secondary)]">
                        <span>SGST</span>
                        <span className="tabular-nums font-medium text-[var(--text-primary)]">
                          {inr.format(taxSplit.sgst)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-[var(--text-secondary)]">
                        <span>Discount</span>
                        <span className="tabular-nums font-medium text-[var(--text-primary)]">
                          {inr.format(order.discount)}
                        </span>
                      </div>
                    </div>
                    <Divider className="my-2 border-[var(--pearl-bush)]/50" />
                    <div className="flex items-baseline justify-between gap-4 mt-1">
                      <Text strong className="text-sm text-[var(--text-primary)]">
                        Payable total
                      </Text>
                      <Text
                        className="!text-xl !font-bold !text-[var(--bistre-800)] tabular-nums"
                      >
                        {inr.format(order.totalAmount)}
                      </Text>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      {receiptPaymentRows(order, order.totalAmount, order.paymentMethod).map(
                        (r) => (
                          <div
                            key={r.label}
                            className="flex justify-between gap-4 text-[var(--text-secondary)]"
                          >
                            <span>{r.label}</span>
                            <span className="tabular-nums font-medium text-[var(--text-primary)]">
                              {inr.format(r.amount)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </Col>
              </Row>

              <Divider className="my-4 border-[var(--pearl-bush)]" />

              <div className={styles.linesSection}>
                <div className={styles.linesSectionHead}>
                  <span className={styles.linesSectionTitle}>Items</span>
                  <span className={styles.linesSectionCount}>({lineCount})</span>
                </div>
                <div className={styles.lineItemsTableHost}>
                  <DataTable
                    key={order.id}
                    columns={lineColumns}
                    data={tableData}
                    maxBodyHeight={linesBodyMaxHeight}
                    emptyTitle="No items"
                    emptyDescription="This bill has no items."
                  />
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      <Modal
        open={receiptModalOpen}
        onCancel={() => setReceiptModalOpen(false)}
        title="Print Receipt"
        centered
        destroyOnHidden
        width={440}
        styles={{ body: { padding: 0, overflow: 'hidden', borderRadius: '0 0 8px 8px' } }}
        footer={[
          <Button key="close" onClick={() => setReceiptModalOpen(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => iframeRef.current?.contentWindow?.print()}
            style={{ backgroundColor: 'var(--ochre-600)', borderColor: 'var(--ochre-600)' }}
          >
            Print
          </Button>,
        ]}
      >
        <iframe
          ref={iframeRef}
          srcDoc={receiptHtml}
          title="Receipt Preview"
          style={{ width: '100%', border: 'none', display: 'block', minHeight: 300 }}
          onLoad={() => {
            const iframe = iframeRef.current;
            if (iframe?.contentDocument?.body) {
              const h = iframe.contentDocument.body.scrollHeight;
              iframe.style.height = Math.min(Math.max(h, 300), 680) + 'px';
            }
          }}
        />
      </Modal>
    </div>
  );
}
