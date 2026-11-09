import type ExcelJS from "exceljs";

import { apiFetchLong } from "@/lib/api";
import { triggerDownload } from "@/lib/reportsExport";

export type ImportKind = "products" | "categories";

/** Rows per file; mirrors `IMPORT_MAX_ROWS` in apps/api/src/catalog-import/dto/import-catalog.dto.ts. */
export const IMPORT_MAX_ROWS = 1000;

/** Writing a large file runs in one transaction on the API; give it time. */
const IMPORT_TIMEOUT_MS = 120_000;

export type ImportCellKey =
  | "name"
  | "variantName"
  | "category"
  | "price"
  | "costPrice"
  | "quantity"
  | "unit"
  | "sku"
  | "barcode"
  | "hsnCode";

type ImportColumn = {
  key: ImportCellKey;
  header: string;
  /** Header spellings recognised in uploaded files (compared after `normalizeHeader`). */
  aliases: string[];
  required?: boolean;
  width: number;
  /** Stored as text in the template, so Excel keeps leading zeros. */
  text?: boolean;
  help: string;
  example: string[];
};

export const IMPORT_COLUMNS: Record<ImportKind, ImportColumn[]> = {
  products: [
    {
      key: "name",
      header: "Product name",
      aliases: ["product name", "product", "name", "item", "item name"],
      required: true,
      width: 28,
      help: "Rows with the same product name become variants of one product.",
      example: ["Kaju Katli", "Kaju Katli", "Masala Chai"],
    },
    {
      key: "variantName",
      header: "Variant",
      aliases: ["variant", "variant name", "size", "pack"],
      width: 14,
      help: 'Blank means "Regular".',
      example: ["250g", "500g", ""],
    },
    {
      key: "category",
      header: "Category",
      aliases: ["category", "category name"],
      width: 18,
      help: "Created if it does not exist yet.",
      example: ["Sweets", "Sweets", "Beverages"],
    },
    {
      key: "price",
      header: "Price",
      aliases: ["price", "selling price", "sale price", "mrp", "rate"],
      required: true,
      width: 10,
      help: "Selling price in ₹ (GST inclusive), from 0.01 to 10,00,000, at most 2 decimals.",
      example: ["250", "480", "30"],
    },
    {
      key: "costPrice",
      header: "Cost price",
      aliases: ["cost price", "cost", "purchase price"],
      width: 11,
      help: "Optional. What you pay for the item, in ₹.",
      example: ["180", "350", ""],
    },
    {
      key: "quantity",
      header: "Stock",
      aliases: ["stock", "quantity", "qty", "stock quantity", "opening stock"],
      width: 10,
      help: "Opening stock for new items. For items already in the shop, stock is set to this figure and recorded in the stock history. Blank leaves stock unchanged.",
      example: ["20", "10", "100"],
    },
    {
      key: "unit",
      header: "Unit",
      aliases: ["unit", "uom", "sold by"],
      width: 8,
      help: "KG, GM, LTR, ML or PC. Blank means PC for new items.",
      example: ["PC", "PC", "PC"],
    },
    {
      key: "sku",
      header: "SKU",
      aliases: ["sku", "sku code", "item code"],
      width: 16,
      text: true,
      help: "Optional, unique in the shop. Used to find the item when you import again.",
      example: ["KK-250", "KK-500", "CHAI-01"],
    },
    {
      key: "barcode",
      header: "Barcode",
      aliases: ["barcode", "ean", "upc"],
      width: 16,
      text: true,
      help: "Optional, unique in the shop. Left blank, new items get one automatically.",
      example: ["", "", "8901234567890"],
    },
    {
      key: "hsnCode",
      header: "HSN code",
      aliases: ["hsn code", "hsn", "hsn/sac"],
      width: 10,
      text: true,
      help: "Optional.",
      example: ["1704", "1704", "0902"],
    },
  ],
  categories: [
    {
      key: "name",
      header: "Category",
      aliases: ["category", "category name", "name"],
      required: true,
      width: 28,
      help: "One category per row. Names that already exist are skipped.",
      example: ["Sweets", "Namkeen", "Beverages"],
    },
  ],
};

const MATCHING_RULES: Record<ImportKind, string[]> = {
  products: [
    "Each row is one item (a product variant) in the active shop.",
    "A row updates an existing item when its SKU matches (ignoring case), else its barcode, else its product name and variant.",
    "Rows that match nothing create a new product, or a new variant when the shop already has a product with that name.",
    "On update, blank cells keep the current value; an item with no changes is skipped.",
    "A SKU, barcode or product + variant may appear only once per file.",
    `Up to ${IMPORT_MAX_ROWS} rows per file.`,
  ],
  categories: [
    "Categories are shared by all shops.",
    "Names are compared ignoring case; existing names are skipped.",
    `Up to ${IMPORT_MAX_ROWS} rows per file.`,
  ],
};

/** One data row, keyed like the API's row DTO; `row` is the spreadsheet row number. */
export type ImportRow = { row: number } & Partial<Record<ImportCellKey, string>>;

export type ImportRowStatus = "created" | "updated" | "skipped" | "failed";

export type ImportRowResult = {
  row: number;
  status: ImportRowStatus;
  message?: string;
};

export type ImportSummary = {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  newCategories: string[];
  rows: ImportRowResult[];
};

export type ParsedSheet = {
  rows: ImportRow[];
  /** Required columns with no matching header. */
  missingColumns: string[];
};

/** "Price (₹) *" → "price". */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)|\*/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

export async function downloadImportTemplate(kind: ImportKind) {
  const { default: Excel } = await import("exceljs");
  const columns = IMPORT_COLUMNS[kind];
  const wb = new Excel.Workbook();
  const sheetName = kind === "products" ? "Products" : "Categories";

  const data = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  data.columns = columns.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    key: c.key,
    width: c.width,
    style: c.text ? { numFmt: "@" } : undefined,
  }));
  data.getRow(1).font = { bold: true };

  const help = wb.addWorksheet("How to fill");
  help.columns = [
    { header: "Column", key: "column", width: 16 },
    { header: "Required", key: "required", width: 10 },
    { header: "Notes", key: "notes", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of columns) {
    help.addRow({ column: c.header, required: c.required ? "Yes" : "", notes: c.help });
  }
  help.addRow({});
  help.addRow({ column: "Matching" }).font = { bold: true };
  for (const rule of MATCHING_RULES[kind]) help.addRow({ notes: rule });
  help.addRow({});
  help.addRow({ column: "Example" }).font = { bold: true };
  help.addRow(columns.map((c) => c.header)).font = { bold: true };
  for (let i = 0; i < columns[0].example.length; i++) {
    help.addRow(columns.map((c) => c.example[i] ?? ""));
  }
  help.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf]), `fluxen-${kind}-import-template.xlsx`);
}

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF, BOM. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Sheet → [spreadsheet row number, cell texts]. */
async function readGrid(file: File): Promise<[number, string[]][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return parseCsv(await file.text()).map((cells, i) => [i + 1, cells]);
  }
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const grid: [number, string[]][] = [];
  sheet.eachRow((r: ExcelJS.Row, rowNumber: number) => {
    const cells: string[] = [];
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cell.text ?? "";
    });
    grid.push([rowNumber, Array.from(cells, (c) => c ?? "")]);
  });
  return grid;
}

/** Reads the first sheet of an .xlsx or a .csv: first non-empty row is the header. */
export async function parseImportFile(
  file: File,
  kind: ImportKind,
): Promise<ParsedSheet> {
  const columns = IMPORT_COLUMNS[kind];
  const grid = (await readGrid(file)).filter(([, cells]) =>
    cells.some((c) => c.trim()),
  );
  if (!grid.length) return { rows: [], missingColumns: [] };

  const [, header] = grid[0];
  const keyAt = header.map((h) => {
    const n = normalizeHeader(h);
    return columns.find((c) => c.aliases.includes(n))?.key;
  });
  const missingColumns = columns
    .filter((c) => c.required && !keyAt.includes(c.key))
    .map((c) => c.header);

  const rows: ImportRow[] = [];
  for (const [rowNumber, cells] of grid.slice(1)) {
    const row: ImportRow = { row: rowNumber };
    keyAt.forEach((key, i) => {
      const v = cells[i]?.trim();
      if (key && v && row[key] === undefined) row[key] = v;
    });
    if (Object.keys(row).length > 1) rows.push(row);
  }
  return { rows, missingColumns };
}

export async function runImport(
  kind: ImportKind,
  rows: ImportRow[],
  dryRun: boolean,
): Promise<ImportSummary> {
  const res = await apiFetchLong(
    `/catalog-import/${kind}`,
    { method: "POST", body: JSON.stringify({ rows, dryRun }) },
    IMPORT_TIMEOUT_MS,
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (payload as { message?: unknown }).message;
    throw new Error(
      typeof m === "string"
        ? m
        : Array.isArray(m)
          ? m.join(", ")
          : `Import failed (${res.status})`,
    );
  }
  return payload as ImportSummary;
}
