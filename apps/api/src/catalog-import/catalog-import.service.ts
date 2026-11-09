import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma, Unit } from '@prisma/client';
import { CategoryService } from '../category/category.service';
import { CreateCategoryDto } from '../category/dto/create-category.dto';
import { assertSkuAvailable } from '../common/catalog-uniqueness';
import { dec, qty } from '../common/money';
import { applyStockChange } from '../common/stock';
import { PrismaService } from '../prisma.service';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { ProductsService } from '../products/products.service';
import type {
  ImportCategoryRowDto,
  ImportProductRowDto,
} from './dto/import-catalog.dto';

type Db = Prisma.TransactionClient;

export type ImportRowStatus = 'created' | 'updated' | 'skipped' | 'failed';

export type ImportRowResult = {
  row: number;
  status: ImportRowStatus;
  message?: string;
};

export type ImportSummary = {
  /** True when nothing was saved and the statuses say what an import would do. */
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Categories the import adds (a product row may name a category that does not exist yet). */
  newCategories: string[];
  rows: ImportRowResult[];
};

export type ProductImportOptions = {
  dryRun: boolean;
  /** Missing categories are only created for users who could create them by hand. */
  canCreateCategories: boolean;
  userId?: string;
};

/** A whole file is written in one transaction, far longer than Prisma's 5 s default. */
const IMPORT_TX = { timeout: 90_000, maxWait: 10_000 } as const;

const UNIT_ALIASES: Record<string, Unit> = {
  PCS: Unit.PC,
  PIECE: Unit.PC,
  PIECES: Unit.PC,
  KGS: Unit.KG,
  G: Unit.GM,
  GMS: Unit.GM,
  GRAM: Unit.GM,
  GRAMS: Unit.GM,
  L: Unit.LTR,
  LITRE: Unit.LTR,
  LITER: Unit.LTR,
};

/** Spreadsheet column names, used to word the validation messages. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Product name',
  variantName: 'Variant',
  price: 'Price',
  costPrice: 'Cost price',
  quantity: 'Stock',
  sku: 'SKU',
  barcode: 'Barcode',
  hsnCode: 'HSN code',
  unit: 'Unit',
};

const VARIANT_SELECT = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  price: true,
  costPrice: true,
  hsnCode: true,
  quantity: true,
  unit: true,
  productId: true,
  product: { select: { name: true, categoryId: true } },
} satisfies Prisma.ProductVariantSelect;

type ExistingVariant = Prisma.ProductVariantGetPayload<{
  select: typeof VARIANT_SELECT;
}>;

type ParsedRow = {
  index: number;
  row: number;
  /** Validated with the same rules as the New product form. */
  dto: CreateProductDto;
  variantName: string;
  category?: string;
};

type UpdateStep = {
  kind: 'update';
  row: ParsedRow;
  variant: ExistingVariant;
  renameVariant: boolean;
};

type Step =
  | { kind: 'create'; row: ParsedRow }
  | { kind: 'addVariant'; row: ParsedRow }
  | UpdateStep;

type Plan = {
  steps: Step[];
  /** lower-case name → id, for categories that already exist. */
  categoryIds: Map<string, string>;
  /** lower-case name → display name, for categories to create. */
  newCategories: Map<string, string>;
  /** lower-case name → id, for this shop's products the rows refer to. */
  productIds: Map<string, string>;
};

type Fail = (p: { index: number; row: number }, message: string) => void;

const blank = (s?: string) => {
  const t = s?.trim();
  return t ? t : undefined;
};
const lower = (s: string) => s.trim().toLowerCase();
const itemKey = (name: string, variant: string) =>
  `${lower(name)}\u0000${lower(variant)}`;

/**
 * Bulk catalog import from a spreadsheet the dashboard has already parsed into text rows.
 *
 * Products: each row is one variant. A row matches an existing variant of the active shop
 * by SKU (case-insensitive), then barcode, then product name + variant name; a match is
 * updated (price, cost, HSN, unit, SKU, barcode, category, and stock set to the given
 * figure through the stock ledger), or skipped when nothing differs. Rows that match
 * nothing create the product, or add a variant when the shop already has a product of
 * that name. Blank optional cells leave existing values alone. Missing categories are
 * created. Rows that fail validation are reported and left out; every other row is
 * written in one transaction, so a write error saves nothing.
 *
 * Categories: created by name; names that already exist (case-insensitive) are skipped.
 */
@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly categories: CategoryService,
  ) {}

  async importCategories(
    rows: ImportCategoryRowDto[],
    opts: { dryRun: boolean },
  ): Promise<ImportSummary> {
    const results: ImportRowResult[] = [];
    const existing = await this.prisma.category.findMany({
      select: { name: true },
    });
    const known = new Map(existing.map((c) => [lower(c.name), c.name]));
    const seen = new Map<string, number>();
    const toCreate: string[] = [];

    for (const r of rows) {
      const name = blank(r.name);
      if (!name) {
        results.push({
          row: r.row,
          status: 'failed',
          message: 'Name is required',
        });
        continue;
      }
      const errors = await validationMessages(
        plainToInstance(CreateCategoryDto, { name }),
      );
      if (errors.length) {
        results.push({
          row: r.row,
          status: 'failed',
          message: errors.join('; '),
        });
        continue;
      }
      const key = lower(name);
      const clash = known.get(key);
      const earlier = seen.get(key);
      if (clash !== undefined) {
        results.push({
          row: r.row,
          status: 'skipped',
          message: `Already exists as "${clash}"`,
        });
      } else if (earlier !== undefined) {
        results.push({
          row: r.row,
          status: 'skipped',
          message: `Same name as row ${earlier}`,
        });
      } else {
        seen.set(key, r.row);
        toCreate.push(name);
        results.push({ row: r.row, status: 'created' });
      }
    }

    if (!opts.dryRun && toCreate.length) {
      await this.prisma.$transaction(async (tx) => {
        for (const name of toCreate) {
          await this.categories.create({ name }, tx);
        }
      }, IMPORT_TX);
    }
    return summarize(opts.dryRun, results, toCreate);
  }

  async importProducts(
    shopCode: string,
    rows: ImportProductRowDto[],
    opts: ProductImportOptions,
  ): Promise<ImportSummary> {
    if (!shopCode) {
      throw new BadRequestException('Missing shop context');
    }
    const results: (ImportRowResult | undefined)[] = rows.map(() => undefined);
    const fail: Fail = (p, message) => {
      results[p.index] = { row: p.row, status: 'failed', message };
    };

    const parsed: ParsedRow[] = [];
    for (const [index, r] of rows.entries()) {
      const out = await parseProductRow(r, index);
      if ('errors' in out) fail({ index, row: r.row }, out.errors.join('; '));
      else parsed.push(out);
    }
    const unique = rejectDuplicatesInFile(parsed, fail);

    const run = async (db: Db) => {
      const plan = await this.planProducts(
        db,
        shopCode,
        unique,
        opts.canCreateCategories,
        fail,
      );
      if (!opts.dryRun) await this.applyProducts(db, shopCode, plan, opts);
      return plan;
    };
    let plan: Plan;
    try {
      plan = opts.dryRun
        ? await run(this.prisma)
        : await this.prisma.$transaction(run, IMPORT_TX);
    } catch (e) {
      throw this.products.mapBarcodeConflict(e);
    }

    for (const step of plan.steps) {
      const { index, row } = step.row;
      if (step.kind !== 'update') {
        results[index] = {
          row,
          status: 'created',
          message:
            step.kind === 'addVariant'
              ? `New variant "${step.row.variantName}"`
              : undefined,
        };
        continue;
      }
      const changes = describeChanges(step, plan);
      results[index] = changes.length
        ? { row, status: 'updated', message: changes.join(', ') }
        : { row, status: 'skipped', message: 'No changes' };
    }

    return summarize(
      opts.dryRun,
      results.filter((r): r is ImportRowResult => r !== undefined),
      [...plan.newCategories.values()],
    );
  }

  /** Reads what the rows refer to (this shop only) and decides what each row does. */
  private async planProducts(
    db: Db,
    shopCode: string,
    rows: ParsedRow[],
    canCreateCategories: boolean,
    fail: Fail,
  ): Promise<Plan> {
    const plan: Plan = {
      steps: [],
      categoryIds: new Map(),
      newCategories: new Map(),
      productIds: new Map(),
    };
    if (!rows.length) return plan;

    const skus = [...new Set(rows.flatMap((r) => r.dto.sku ?? []))];
    const barcodes = [...new Set(rows.flatMap((r) => r.dto.barcode ?? []))];
    const names = [...new Set(rows.map((r) => r.dto.name))];
    const insensitive = Prisma.QueryMode.insensitive;

    const variants = await db.productVariant.findMany({
      where: {
        shopCode,
        OR: [
          ...(skus.length ? [{ sku: { in: skus, mode: insensitive } }] : []),
          ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
          { product: { name: { in: names, mode: insensitive } } },
        ],
      },
      select: VARIANT_SELECT,
    });
    const products = await db.product.findMany({
      where: { shopCode, name: { in: names, mode: insensitive } },
      select: { id: true, name: true },
    });
    const categories = await db.category.findMany({
      select: { id: true, name: true },
    });

    const bySku = new Map<string, ExistingVariant>();
    const byBarcode = new Map<string, ExistingVariant>();
    const byItem = new Map<string, ExistingVariant>();
    for (const v of variants) {
      if (v.sku) bySku.set(lower(v.sku), v);
      byBarcode.set(v.barcode, v);
      byItem.set(itemKey(v.product.name, v.name), v);
    }
    for (const p of products) plan.productIds.set(lower(p.name), p.id);
    for (const c of categories) plan.categoryIds.set(lower(c.name), c.id);

    const claimed = new Map<string, number>();
    const productsToCreate = new Set<string>();

    for (const r of rows) {
      const d = r.dto;
      const categoryKey = r.category ? lower(r.category) : undefined;
      if (
        categoryKey &&
        !plan.categoryIds.has(categoryKey) &&
        !canCreateCategories
      ) {
        fail(
          r,
          `Category "${r.category}" does not exist, and your role cannot create categories`,
        );
        continue;
      }

      const viaSku = d.sku ? bySku.get(lower(d.sku)) : undefined;
      const viaBarcode = d.barcode ? byBarcode.get(d.barcode) : undefined;
      const viaItem = byItem.get(itemKey(d.name, r.variantName));
      const hits = new Map(
        [viaSku, viaBarcode, viaItem]
          .filter((v): v is ExistingVariant => v !== undefined)
          .map((v) => [v.id, v]),
      );
      if (hits.size > 1) {
        fail(
          r,
          `SKU, barcode and name point to different items: ${[...hits.values()]
            .map(describeVariant)
            .join(' and ')}`,
        );
        continue;
      }
      const match = viaSku ?? viaBarcode ?? viaItem;

      if (match) {
        if (lower(match.product.name) !== lower(d.name)) {
          const by = viaSku ? `SKU "${d.sku}"` : `Barcode "${d.barcode}"`;
          fail(r, `${by} already belongs to ${describeVariant(match)}`);
          continue;
        }
        const earlier = claimed.get(match.id);
        if (earlier !== undefined) {
          fail(r, `Same item as row ${earlier}`);
          continue;
        }
        claimed.set(match.id, r.row);
        plan.steps.push({
          kind: 'update',
          row: r,
          variant: match,
          renameVariant:
            d.variantName !== undefined && d.variantName !== match.name,
        });
      } else {
        const productKey = lower(d.name);
        const exists =
          plan.productIds.has(productKey) || productsToCreate.has(productKey);
        if (!exists) productsToCreate.add(productKey);
        plan.steps.push({ kind: exists ? 'addVariant' : 'create', row: r });
      }

      // The first row's spelling names the new category.
      if (
        categoryKey &&
        !plan.categoryIds.has(categoryKey) &&
        !plan.newCategories.has(categoryKey)
      ) {
        plan.newCategories.set(categoryKey, r.category!);
      }
    }
    return plan;
  }

  private async applyProducts(
    db: Db,
    shopCode: string,
    plan: Plan,
    opts: ProductImportOptions,
  ) {
    for (const [key, name] of plan.newCategories) {
      const created = await this.categories.create({ name }, db);
      plan.categoryIds.set(key, created.id);
    }

    for (const step of plan.steps) {
      const d = step.row.dto;
      const categoryId = step.row.category
        ? plan.categoryIds.get(lower(step.row.category))
        : undefined;
      const productKey = lower(d.name);

      if (step.kind === 'create') {
        const product = await this.products.createInTx(
          db,
          { ...d, categoryId },
          shopCode,
        );
        plan.productIds.set(productKey, product.id);
      } else if (step.kind === 'addVariant') {
        const productId = plan.productIds.get(productKey)!;
        await this.products.addVariantInTx(db, productId, d, shopCode);
        if (categoryId) {
          await db.product.update({
            where: { id: productId },
            data: { categoryId },
          });
        }
      } else if (describeChanges(step, plan).length) {
        await this.updateVariant(db, shopCode, step, categoryId, opts.userId);
      }
    }
  }

  private async updateVariant(
    db: Db,
    shopCode: string,
    step: UpdateStep,
    categoryId: string | undefined,
    userId?: string,
  ) {
    const d = step.row.dto;
    const v = step.variant;
    const newSku = skuChange(step);
    if (newSku) {
      await assertSkuAvailable(db, shopCode, newSku, v.id);
    }
    if (d.quantity !== undefined) {
      // Re-read inside the transaction: the stock may have moved since the preview.
      const current = await db.productVariant.findUniqueOrThrow({
        where: { id: v.id },
        select: { quantity: true },
      });
      await applyStockChange(db, {
        variantId: v.id,
        shopCode,
        delta: qty(d.quantity).sub(current.quantity),
        reason: 'ADJUSTMENT',
        userId,
        note: 'Spreadsheet import',
      });
    }
    await db.productVariant.update({
      where: { id: v.id },
      data: {
        price: d.price,
        ...(d.costPrice !== undefined ? { costPrice: d.costPrice } : {}),
        ...(d.hsnCode ? { hsnCode: d.hsnCode } : {}),
        ...(d.unit ? { unit: d.unit } : {}),
        ...(newSku ? { sku: newSku } : {}),
        ...(d.barcode ? { barcode: d.barcode } : {}),
        ...(step.renameVariant ? { name: step.row.variantName } : {}),
        ...(categoryId && categoryId !== v.product.categoryId
          ? { product: { update: { categoryId } } }
          : {}),
      },
    });
  }
}

async function validationMessages(target: object): Promise<string[]> {
  const errors = await validate(target);
  return errors.flatMap((e) =>
    Object.values(e.constraints ?? {}).map((msg) => {
      const label = FIELD_LABELS[e.property];
      return label && msg.startsWith(`${e.property} `)
        ? `${label}${msg.slice(e.property.length)}`
        : msg;
    }),
  );
}

/** Text cells → a CreateProductDto, checked with the same rules as the New product form. */
async function parseProductRow(
  r: ImportProductRowDto,
  index: number,
): Promise<ParsedRow | { errors: string[] }> {
  const errors: string[] = [];
  const number = (field: string, text?: string) => {
    const t = blank(text);
    if (t === undefined) return undefined;
    const n = Number(t.replace(/[,₹\s]/g, ''));
    if (!Number.isFinite(n)) {
      errors.push(`${FIELD_LABELS[field]} must be a number`);
      return undefined;
    }
    return n;
  };

  const name = blank(r.name);
  if (!name) errors.push('Product name is required');
  if (!blank(r.price)) errors.push('Price is required');
  const price = number('price', r.price);
  const costPrice = number('costPrice', r.costPrice);
  const quantity = number('quantity', r.quantity);

  let unit: Unit | undefined;
  const unitText = blank(r.unit)?.toUpperCase();
  if (unitText) {
    unit = (Object.values(Unit) as string[]).includes(unitText)
      ? (unitText as Unit)
      : UNIT_ALIASES[unitText];
    if (!unit) {
      errors.push(`Unit must be one of ${Object.values(Unit).join(', ')}`);
    }
  }
  if (errors.length) return { errors };

  const variantName = blank(r.variantName);
  const dto = plainToInstance(CreateProductDto, {
    name,
    price,
    costPrice,
    quantity,
    unit,
    sku: blank(r.sku),
    barcode: blank(r.barcode),
    hsnCode: blank(r.hsnCode),
    variantName,
  });
  const ruleErrors = await validationMessages(dto);
  if (ruleErrors.length) return { errors: ruleErrors };

  return {
    index,
    row: r.row,
    dto,
    variantName: variantName ?? 'Regular',
    category: blank(r.category),
  };
}

/** A SKU, barcode or product + variant may appear once per file; later repeats fail. */
function rejectDuplicatesInFile(rows: ParsedRow[], fail: Fail): ParsedRow[] {
  const seen = new Map<string, number>();
  return rows.filter((r) => {
    const keys: [string, string, string][] = [
      [
        'item',
        itemKey(r.dto.name, r.variantName),
        `"${r.dto.name} / ${r.variantName}"`,
      ],
    ];
    if (r.dto.sku) keys.push(['sku', lower(r.dto.sku), `SKU "${r.dto.sku}"`]);
    if (r.dto.barcode) {
      keys.push(['barcode', r.dto.barcode, `Barcode "${r.dto.barcode}"`]);
    }
    for (const [kind, key, label] of keys) {
      const earlier = seen.get(`${kind}:${key}`);
      if (earlier !== undefined) {
        fail(r, `${label} is also on row ${earlier}`);
        return false;
      }
    }
    for (const [kind, key] of keys) seen.set(`${kind}:${key}`, r.row);
    return true;
  });
}

function describeVariant(v: ExistingVariant) {
  return `"${v.product.name} / ${v.name}"`;
}

/** The row's SKU when it differs from the item's; SKUs match ignoring case, so "kk-1" keeps "KK-1". */
function skuChange(step: UpdateStep): string | undefined {
  const sku = step.row.dto.sku;
  return sku && lower(sku) !== lower(step.variant.sku ?? '') ? sku : undefined;
}

function describeChanges(step: UpdateStep, plan: Plan): string[] {
  const d = step.row.dto;
  const v = step.variant;
  const changes: string[] = [];
  const rupees = (x: Prisma.Decimal | number) => `₹${dec(x).toString()}`;
  if (!dec(v.price).eq(d.price)) {
    changes.push(`price ${rupees(v.price)} → ${rupees(d.price)}`);
  }
  if (
    d.costPrice !== undefined &&
    (v.costPrice === null || !dec(v.costPrice).eq(d.costPrice))
  ) {
    const before = v.costPrice === null ? '—' : rupees(v.costPrice);
    changes.push(`cost ${before} → ${rupees(d.costPrice)}`);
  }
  if (d.quantity !== undefined && !qty(d.quantity).eq(v.quantity)) {
    changes.push(
      `stock ${dec(v.quantity).toString()} → ${qty(d.quantity).toString()}`,
    );
  }
  if (d.unit && d.unit !== v.unit) {
    changes.push(`unit ${v.unit ?? '—'} → ${d.unit}`);
  }
  if (d.hsnCode && d.hsnCode !== v.hsnCode) changes.push(`HSN → ${d.hsnCode}`);
  const newSku = skuChange(step);
  if (newSku) changes.push(`SKU → ${newSku}`);
  if (d.barcode && d.barcode !== v.barcode) {
    changes.push(`barcode → ${d.barcode}`);
  }
  if (step.renameVariant) {
    changes.push(`variant "${v.name}" → "${step.row.variantName}"`);
  }
  const category = step.row.category;
  if (
    category &&
    plan.categoryIds.get(lower(category)) !== v.product.categoryId
  ) {
    changes.push(`category → ${category}`);
  }
  return changes;
}

function summarize(
  dryRun: boolean,
  rows: ImportRowResult[],
  newCategories: string[],
): ImportSummary {
  const count = (s: ImportRowStatus) =>
    rows.filter((r) => r.status === s).length;
  return {
    dryRun,
    created: count('created'),
    updated: count('updated'),
    skipped: count('skipped'),
    failed: count('failed'),
    newCategories,
    rows: [...rows].sort((a, b) => a.row - b.row),
  };
}
