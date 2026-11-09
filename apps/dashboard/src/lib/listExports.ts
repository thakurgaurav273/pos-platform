import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { GstSummaryPayload } from "@/components/GstSummaryPanel/GstSummaryPanel";
import { getApiBaseUrl, getAuthHeaders } from "@/lib/api";
import { formatInrForPdf, istDayOffset } from "@/lib/chartFormat";
import { paymentLabel } from "@/lib/payments";
import { billRefOf } from "@/lib/printInvoice";
import { safeFileSegment, triggerDownload } from "@/lib/reportsExport";

/** Page size the list endpoints accept, and a hard cap on exported rows. */
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_ROWS = 20_000;

/**
 * Pulls every page of a paginated list endpoint (`{ data, last_page }`) with the same
 * filters the screen is showing, so the export matches what the user filtered.
 */
export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | undefined>,
): Promise<{ rows: T[]; capped: boolean }> {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const u = new URL(`${getApiBaseUrl()}${path}`, origin);
    u.searchParams.set("page", String(page));
    u.searchParams.set("size", String(EXPORT_PAGE_SIZE));
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    const res = await fetch(u.toString(), {
      headers: { ...getAuthHeaders(), Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const json = (await res.json()) as { data?: T[]; last_page?: number };
    rows.push(...(Array.isArray(json.data) ? json.data : []));
    if (rows.length >= EXPORT_MAX_ROWS) {
      return { rows: rows.slice(0, EXPORT_MAX_ROWS), capped: true };
    }
    if (page >= Math.max(1, Number(json.last_page ?? page))) {
      return { rows, capped: false };
    }
  }
}

function today() {
  return istDayOffset(0);
}

/** Bold, frozen header row and column widths for a simple one-sheet export. */
function styleSheet(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf]), filename);
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type OrderExportRow = {
  id: string;
  billNo?: string | null;
  legacyBillRef?: string | null;
  createdAt: string;
  paymentMethod: string;
  totalAmount: number;
  status: string;
  orderSource?: string;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
};

export async function downloadOrdersExcel(
  rows: OrderExportRow[],
  shopCode: string,
  search?: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fluxen POS";
  const ws = wb.addWorksheet("Orders");
  ws.addRow([
    "Bill no",
    "Date",
    "Customer",
    "Phone",
    "Items",
    "Payment",
    "Status",
    "Source",
    "Total (₹)",
  ]);
  for (const o of rows) {
    ws.addRow([
      billRefOf(o),
      new Date(o.createdAt),
      o.customerName ?? "",
      o.customerPhone ?? "",
      o.itemCount,
      paymentLabel(o.paymentMethod),
      o.status,
      o.orderSource ?? "",
      o.totalAmount,
    ]);
  }
  styleSheet(ws, [12, 20, 28, 14, 8, 12, 12, 10, 14]);
  ws.getColumn(2).numFmt = "dd-mmm-yyyy hh:mm";
  ws.getColumn(9).numFmt = "#,##0.00";
  const suffix = search?.trim() ? `_${safeFileSegment(search.trim())}` : "";
  await saveWorkbook(wb, `orders_${shopCode}${suffix}_${today()}.xlsx`);
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export type InventoryExportRow = {
  productName: string;
  variantName?: string;
  category?: string;
  sku?: string;
  barcode: string;
  quantity: number;
  minStock?: number | null;
  unit?: string;
  price: number;
};

export async function downloadInventoryExcel(
  rows: InventoryExportRow[],
  shopCode: string,
  lowStockOnly: boolean,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fluxen POS";
  const ws = wb.addWorksheet(lowStockOnly ? "Low stock" : "Inventory");
  ws.addRow([
    "Product",
    "Variant",
    "Category",
    "SKU",
    "Barcode",
    "Stock",
    "Min stock",
    "Unit",
    "Price (₹)",
    "Status",
  ]);
  for (const r of rows) {
    const q = Number(r.quantity) || 0;
    const min = r.minStock != null ? Number(r.minStock) : null;
    const status =
      q <= 0 ? "Out of stock" : min != null && q <= min ? "Low" : "OK";
    ws.addRow([
      r.productName,
      r.variantName ?? "",
      r.category ?? "",
      r.sku ?? "",
      r.barcode,
      q,
      min ?? "",
      r.unit ?? "PC",
      Number(r.price) || 0,
      status,
    ]);
  }
  styleSheet(ws, [32, 16, 16, 16, 14, 10, 10, 6, 12, 12]);
  ws.getColumn(9).numFmt = "#,##0.00";
  await saveWorkbook(
    wb,
    `${lowStockOnly ? "low_stock" : "inventory"}_${shopCode}_${today()}.xlsx`,
  );
}

// ── GST summary ───────────────────────────────────────────────────────────────

type GstExport = GstSummaryPayload & {
  byRate?: { ratePercent: number; tax: number }[];
};

function gstSummaryRows(d: GstExport): [string, number | string][] {
  return [
    ["Bills", d.billCount],
    ["Gross sales (incl. GST)", d.grossInclusive],
    ["Discount", d.discountTotal],
    ["Taxable value", d.taxableValue],
    [`CGST payable (${d.cgstRate}%)`, d.cgstPayable],
    [`SGST payable (${d.sgstRate}%)`, d.sgstPayable],
    ["IGST payable", d.igstPayable],
    ["Total tax", d.totalTax],
  ];
}

export async function downloadGstExcel(d: GstExport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fluxen POS";
  const ws = wb.addWorksheet(`GST ${d.month}`);
  ws.addRow(["Field", "Value"]);
  ws.addRows([
    ["Shop", `${d.shopName} (${d.shopCode})`],
    ["GSTIN", d.gstNumber ?? ""],
    ["Month", d.month],
    ...gstSummaryRows(d),
  ]);
  styleSheet(ws, [30, 22]);
  // Money format on rupee rows only; the bill count stays a whole number.
  ws.eachRow((row, n) => {
    if (n > 1 && typeof row.getCell(2).value === "number" && row.getCell(1).value !== "Bills") {
      row.getCell(2).numFmt = "#,##0.00";
    }
  });
  if (d.byRate?.length) {
    const wsRate = wb.addWorksheet("Tax by rate");
    wsRate.addRow(["GST rate (%)", "Tax (₹)"]);
    for (const r of d.byRate) wsRate.addRow([r.ratePercent, r.tax]);
    styleSheet(wsRate, [14, 16]);
    wsRate.getColumn(2).numFmt = "#,##0.00";
  }
  await saveWorkbook(wb, `gst_summary_${d.shopCode}_${d.month}.xlsx`);
}

export function downloadGstPdf(d: GstExport) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  doc.setFontSize(14);
  doc.text(`GST summary · ${d.month}`, margin, 18);
  doc.setFontSize(9);
  doc.text(
    `${d.shopName} (${d.shopCode})${d.gstNumber ? ` · GSTIN ${d.gstNumber}` : ""}`,
    margin,
    24,
  );
  autoTable(doc, {
    startY: 30,
    margin: { left: margin, right: margin },
    head: [["Metric", "Value"]],
    body: gstSummaryRows(d).map(([k, v]) => [
      k,
      typeof v === "number" && k !== "Bills" ? formatInrForPdf(v) : String(v),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [44, 24, 16] },
  });
  if (d.byRate?.length) {
    autoTable(doc, {
      margin: { left: margin, right: margin },
      head: [["GST rate", "Tax"]],
      body: d.byRate.map((r) => [`${r.ratePercent}%`, formatInrForPdf(r.tax)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [44, 24, 16] },
    });
  }
  doc.save(`gst_summary_${d.shopCode}_${d.month}.pdf`);
}
