import { paymentLabel as sharedPaymentLabel } from "@/lib/payments";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { chartDayLabel, formatInrForPdf } from "@/lib/chartFormat";
import { billRefOf } from "@/lib/printInvoice";

export type ReportsExportOrderRow = {
  id: string;
  billNo?: string | null;
  legacyBillRef?: string | null;
  createdAt: string;
  paymentMethod: string;
  totalAmount: number;
  discount: number;
  tax: number;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
};

export type ReportsExportLineItem = {
  orderId: string;
  billNo?: string | null;
  legacyBillRef?: string | null;
  orderCreatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string;
  productName: string;
  variantName: string | null;
  barcode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReportsExportPayload = {
  shopCode: string;
  days: number;
  range: { start: string; end: string };
  generatedAt: string;
  totals: { orderCount: number; revenue: number };
  daily: { date: string; revenue: number; orderCount: number }[];
  paymentMix: {
    paymentMethod: string;
    orderCount: number;
    revenue: number;
  }[];
  topProducts: { productName: string; qtySold: number; revenue: number }[];
  export: {
    orders: ReportsExportOrderRow[];
    lineItems: ReportsExportLineItem[];
    ordersCapped: boolean;
    lineItemsCapped: boolean;
  };
};

function paymentLabel(raw: string) {
  return sharedPaymentLabel(raw, "Other");
}

export function safeFileSegment(s: string) {
  return s.replace(/[^\w\-]+/g, "_").slice(0, 64) || "report";
}

export function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(a.href);
}

function formatIsoLocal(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export async function downloadReportsExcel(
  p: ReportsExportPayload,
  shopName: string,
  shopCode: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fluxen POS";
  wb.created = new Date();

  const meta: [string, string][] = [
    ["Shop", shopName],
    ["Shop code", shopCode],
    ["Period (IST)", `${p.range.start} → ${p.range.end}`],
    ["Rolling window (days)", String(p.days)],
    ["Generated", formatIsoLocal(p.generatedAt)],
    [
      "Note",
      [
        p.export.ordersCapped ? "Orders list capped at 10,000 rows." : "",
        p.export.lineItemsCapped ? "Line items capped at 50,000 rows." : "",
      ]
        .filter(Boolean)
        .join(" ") || "Full export within caps.",
    ],
  ];

  const ws0 = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  ws0.addRow(["Field", "Value"]);
  for (const row of meta) {
    ws0.addRow(row);
  }
  ws0.getColumn(1).width = 22;
  ws0.getColumn(2).width = 48;

  const wsTotals = wb.addWorksheet("Totals");
  wsTotals.addRows([
    ["Total revenue", p.totals.revenue],
    ["Bills (orders)", p.totals.orderCount],
    [
      "Avg. bill",
      p.totals.orderCount > 0 ? p.totals.revenue / p.totals.orderCount : 0,
    ],
  ]);
  wsTotals.getColumn(1).width = 18;
  wsTotals.getColumn(2).width = 16;

  const wsDaily = wb.addWorksheet("Daily");
  wsDaily.addRow(["Date (IST)", "Revenue", "Order count"]);
  for (const d of p.daily) {
    wsDaily.addRow([d.date, d.revenue, d.orderCount]);
  }
  wsDaily.getColumn(1).width = 14;
  wsDaily.getColumn(2).width = 14;
  wsDaily.getColumn(3).width = 12;

  const wsPay = wb.addWorksheet("Payment mix");
  wsPay.addRow(["Payment", "Bills", "Revenue"]);
  for (const row of p.paymentMix) {
    wsPay.addRow([
      paymentLabel(row.paymentMethod),
      row.orderCount,
      row.revenue,
    ]);
  }
  wsPay.getColumn(1).width = 16;
  wsPay.getColumn(2).width = 10;
  wsPay.getColumn(3).width = 14;

  const wsTop = wb.addWorksheet("Top products");
  wsTop.addRow(["Product", "Qty sold", "Revenue"]);
  for (const row of p.topProducts) {
    wsTop.addRow([row.productName, row.qtySold, row.revenue]);
  }
  wsTop.getColumn(1).width = 36;
  wsTop.getColumn(2).width = 12;
  wsTop.getColumn(3).width = 14;

  const wsOrd = wb.addWorksheet("Orders");
  wsOrd.addRow([
    "Bill ref",
    "Order id",
    "Date",
    "Payment",
    "Status",
    "Customer",
    "Phone",
    "Items",
    "Discount",
    "Tax",
    "Total",
  ]);
  for (const o of p.export.orders) {
    wsOrd.addRow([
      billRefOf(o),
      o.id,
      formatIsoLocal(o.createdAt),
      paymentLabel(o.paymentMethod),
      o.status,
      o.customerName ?? "",
      o.customerPhone ?? "",
      o.itemCount,
      o.discount,
      o.tax,
      o.totalAmount,
    ]);
  }
  wsOrd.views = [{ state: "frozen", ySplit: 1 }];
  [10, 38, 20, 12, 12, 22, 14, 8, 10, 10, 12].forEach((w, i) => {
    wsOrd.getColumn(i + 1).width = w;
  });

  const wsLines = wb.addWorksheet("Line items");
  wsLines.addRow([
    "Bill ref",
    "Order id",
    "Bill date",
    "Payment",
    "Customer",
    "Phone",
    "Product",
    "Variant",
    "Barcode",
    "Qty",
    "Unit price",
    "Line total",
  ]);
  for (const li of p.export.lineItems) {
    wsLines.addRow([
      billRefOf({ ...li, id: li.orderId }),
      li.orderId,
      formatIsoLocal(li.orderCreatedAt),
      paymentLabel(li.paymentMethod),
      li.customerName ?? "",
      li.customerPhone ?? "",
      li.productName,
      li.variantName ?? "",
      li.barcode ?? "",
      li.quantity,
      li.unitPrice,
      li.lineTotal,
    ]);
  }
  wsLines.views = [{ state: "frozen", ySplit: 1 }];
  [10, 38, 20, 12, 18, 14, 28, 16, 14, 10, 12, 12].forEach((w, i) => {
    wsLines.getColumn(i + 1).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  const name = `${safeFileSegment(shopName)}_${shopCode}_${p.range.start}_${p.range.end}.xlsx`;
  triggerDownload(new Blob([buf]), name);
}

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function tableBottom(doc: DocWithAutoTable) {
  return doc.lastAutoTable?.finalY ?? 24;
}

const PDF_ORDER_ROWS = 200;
const PDF_LINE_ROWS = 250;

export async function downloadReportsPdf(
  p: ReportsExportPayload,
  shopName: string,
  shopCode: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  let y = 18;
  doc.setFontSize(14);
  doc.text("Sales & billing report", margin, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`${shopName} (${shopCode})`, margin, y);
  y += 5;
  doc.text(
    `IST range ${p.range.start} → ${p.range.end} · last ${p.days} days · generated ${formatIsoLocal(p.generatedAt)}`,
    margin,
    y,
  );
  y += 8;

  const capNote: string[] = [];
  if (p.export.ordersCapped) capNote.push("Orders capped at 10k in Excel export.");
  if (p.export.lineItemsCapped) capNote.push("Line items capped at 50k in Excel export.");
  if (capNote.length) {
    doc.setFontSize(8);
    doc.text(capNote.join(" "), margin, y);
    y += 6;
  }

  doc.setFontSize(10);
  doc.text("Summary", margin, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Metric", "Value"]],
    body: [
      ["Total revenue", formatInrForPdf(p.totals.revenue)],
      ["Bills", String(p.totals.orderCount)],
      [
        "Avg. bill",
        formatInrForPdf(
          p.totals.orderCount > 0
            ? p.totals.revenue / p.totals.orderCount
            : 0,
        ),
      ],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [44, 24, 16] },
  });
  y = tableBottom(doc as DocWithAutoTable) + 10;

  doc.setFontSize(10);
  doc.text("Daily revenue", margin, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Day", "Revenue", "Bills"]],
    body: p.daily.map((d) => [
      chartDayLabel(d.date),
      formatInrForPdf(d.revenue),
      String(d.orderCount),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [44, 24, 16] },
  });
  y = tableBottom(doc as DocWithAutoTable) + 10;

  if (y > 250) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(10);
  doc.text("Payment mix", margin, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Payment", "Bills", "Revenue"]],
    body: p.paymentMix.map((r) => [
      paymentLabel(r.paymentMethod),
      String(r.orderCount),
      formatInrForPdf(r.revenue),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [44, 24, 16] },
  });
  y = tableBottom(doc as DocWithAutoTable) + 10;

  if (y > 240) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(10);
  doc.text("Top products", margin, y);
  y += 4;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Product", "Qty", "Revenue"]],
    body: p.topProducts.map((r) => [
      r.productName,
      String(r.qtySold),
      formatInrForPdf(r.revenue),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [44, 24, 16] },
  });
  y = tableBottom(doc as DocWithAutoTable) + 10;

  const ordSlice = p.export.orders.slice(0, PDF_ORDER_ROWS);
  if (y > 220) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(10);
  doc.text(
    `Orders (${ordSlice.length} of ${p.export.orders.length})`,
    margin,
    y,
  );
  y += 4;
  if (p.export.orders.length > PDF_ORDER_ROWS) {
    doc.setFontSize(8);
    doc.text(
      `PDF lists first ${PDF_ORDER_ROWS} bills; Excel includes all rows within the server cap.`,
      margin,
      y,
    );
    y += 5;
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        "Ref",
        "Date",
        "Pay",
        "Customer",
        "Items",
        "Total",
      ],
    ],
    body: ordSlice.map((o) => [
      billRefOf(o),
      formatIsoLocal(o.createdAt),
      paymentLabel(o.paymentMethod),
      (o.customerName ?? "Walk-in").slice(0, 28),
      String(o.itemCount),
      formatInrForPdf(o.totalAmount),
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [44, 24, 16] },
  });
  y = tableBottom(doc as DocWithAutoTable) + 10;

  const lineSlice = p.export.lineItems.slice(0, PDF_LINE_ROWS);
  if (y > 200) {
    doc.addPage();
    y = 18;
  }
  doc.setFontSize(10);
  doc.text(
    `Line items (${lineSlice.length} of ${p.export.lineItems.length})`,
    margin,
    y,
  );
  y += 4;
  if (p.export.lineItems.length > PDF_LINE_ROWS) {
    doc.setFontSize(8);
    doc.text(
      `PDF lists first ${PDF_LINE_ROWS} lines; Excel includes all rows within the server cap.`,
      margin,
      y,
    );
    y += 5;
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        "Ref",
        "Product",
        "Qty",
        "Rate",
        "Line",
      ],
    ],
    body: lineSlice.map((li) => [
      billRefOf({ ...li, id: li.orderId }),
      `${li.productName} (${li.variantName ?? "-"})`.slice(0, 40),
      String(li.quantity),
      formatInrForPdf(li.unitPrice),
      formatInrForPdf(li.lineTotal),
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [44, 24, 16] },
  });

  const name = `${safeFileSegment(shopName)}_${shopCode}_${p.range.start}_${p.range.end}.pdf`;
  doc.save(name);
}
