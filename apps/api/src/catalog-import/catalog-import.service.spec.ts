import { Prisma, Unit } from '@prisma/client';
import { CategoryService } from '../category/category.service';
import { PrismaService } from '../prisma.service';
import { ProductsService } from '../products/products.service';
import { CatalogImportService } from './catalog-import.service';
import type { ImportProductRowDto } from './dto/import-catalog.dto';

const SHOP_A = 'SHOP-A';
const SHOP_B = 'SHOP-B';

type FakeVariant = {
  id: string;
  shopCode: string;
  name: string;
  sku: string | null;
  barcode: string;
  price: Prisma.Decimal;
  costPrice: Prisma.Decimal | null;
  hsnCode: string | null;
  quantity: Prisma.Decimal;
  unit: Unit | null;
  productId: string;
  product: { name: string; categoryId: string | null };
};

type InFilter = { in: string[]; mode?: string };

const resolve = <T>(value: T) => Promise.resolve(value);

const matches = (value: string | null, f: InFilter) =>
  value !== null &&
  (f.mode === 'insensitive'
    ? f.in.some((x) => x.toLowerCase() === value.toLowerCase())
    : f.in.includes(value));

/** Just enough of Prisma for the import: rows live in memory and every query honours shopCode. */
function fakeDb(
  variants: FakeVariant[],
  categories: { id: string; name: string }[],
) {
  const tx = {
    productVariant: {
      findMany: jest.fn(
        (args: {
          where: {
            shopCode: string;
            OR: {
              sku?: InFilter;
              barcode?: InFilter;
              product?: { name: InFilter };
            }[];
          };
        }) =>
          resolve(
            variants.filter(
              (v) =>
                v.shopCode === args.where.shopCode &&
                args.where.OR.some(
                  (c) =>
                    (c.sku && matches(v.sku, c.sku)) ||
                    (c.barcode && matches(v.barcode, c.barcode)) ||
                    (c.product && matches(v.product.name, c.product.name)),
                ),
            ),
          ),
      ),
      findFirst: jest.fn(() => resolve(null)),
      findUniqueOrThrow: jest.fn((args: { where: { id: string } }) =>
        resolve(variants.find((v) => v.id === args.where.id)!),
      ),
      updateMany: jest.fn(() => resolve({ count: 1 })),
      update: jest.fn(() => resolve({})),
    },
    product: {
      findMany: jest.fn(
        (args: { where: { shopCode: string; name: InFilter } }) => {
          const seen = new Map<string, { id: string; name: string }>();
          for (const v of variants) {
            if (
              v.shopCode === args.where.shopCode &&
              matches(v.product.name, args.where.name)
            ) {
              seen.set(v.productId, { id: v.productId, name: v.product.name });
            }
          }
          return resolve([...seen.values()]);
        },
      ),
      update: jest.fn(() => resolve({})),
    },
    category: { findMany: jest.fn(() => resolve(categories)) },
    stockMovement: { create: jest.fn(() => resolve({})) },
  };
  return Object.assign(tx, {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  });
}

function variant(
  shopCode: string,
  overrides: Partial<FakeVariant> & { productName: string },
): FakeVariant {
  const { productName, ...rest } = overrides;
  return {
    id: `v-${shopCode}-${productName}`,
    shopCode,
    name: 'Regular',
    sku: null,
    barcode: `BC-${shopCode}-${productName}`,
    price: new Prisma.Decimal(100),
    costPrice: null,
    hsnCode: null,
    quantity: new Prisma.Decimal(5),
    unit: Unit.PC,
    productId: `p-${shopCode}-${productName}`,
    product: { name: productName, categoryId: 'cat-sweets' },
    ...rest,
  };
}

const row = (
  n: number,
  fields: Omit<ImportProductRowDto, 'row'>,
): ImportProductRowDto => ({ row: n, ...fields });

describe('CatalogImportService', () => {
  let db: ReturnType<typeof fakeDb>;
  let products: {
    createInTx: jest.Mock;
    addVariantInTx: jest.Mock;
    mapBarcodeConflict: jest.Mock;
  };
  let categories: { create: jest.Mock };
  let service: CatalogImportService;

  const setup = (
    variants: FakeVariant[] = [],
    existingCategories = [{ id: 'cat-sweets', name: 'Sweets' }],
  ) => {
    db = fakeDb(variants, existingCategories);
    products = {
      createInTx: jest.fn((_tx: unknown, dto: { name: string }) =>
        resolve({ id: `new-${dto.name}` }),
      ),
      addVariantInTx: jest.fn(() => resolve({ id: 'new-variant' })),
      mapBarcodeConflict: jest.fn((e: unknown) => e),
    };
    categories = {
      create: jest.fn((dto: { name: string }) =>
        resolve({ id: `cat-${dto.name.toLowerCase()}`, name: dto.name }),
      ),
    };
    service = new CatalogImportService(
      db as unknown as PrismaService,
      products as unknown as ProductsService,
      categories as unknown as CategoryService,
    );
  };

  const importProducts = (
    rows: ImportProductRowDto[],
    opts: Partial<{ dryRun: boolean; canCreateCategories: boolean }> = {},
    shopCode = SHOP_A,
  ) =>
    service.importProducts(shopCode, rows, {
      dryRun: false,
      canCreateCategories: true,
      ...opts,
    });

  it('creates products from valid rows, grouping variants under one product', async () => {
    setup();
    const res = await importProducts([
      row(2, {
        name: 'Kaju Katli',
        variantName: '250g',
        category: 'sweets',
        price: '250',
        costPrice: '180',
        quantity: '12',
        unit: 'pcs',
        sku: 'KK-250',
        hsnCode: '1704',
      }),
      row(3, {
        name: 'Kaju Katli',
        variantName: '500g',
        price: '480',
        sku: 'KK-500',
      }),
    ]);

    expect(res).toMatchObject({
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(products.createInTx).toHaveBeenCalledTimes(1);
    expect(products.createInTx).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        name: 'Kaju Katli',
        variantName: '250g',
        price: 250,
        costPrice: 180,
        quantity: 12,
        unit: Unit.PC,
        sku: 'KK-250',
        hsnCode: '1704',
        categoryId: 'cat-sweets',
      }),
      SHOP_A,
    );
    expect(products.addVariantInTx).toHaveBeenCalledWith(
      db,
      'new-Kaju Katli',
      expect.objectContaining({ variantName: '500g', price: 480 }),
      SHOP_A,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a missing category once and files the product under it', async () => {
    setup();
    const res = await importProducts([
      row(2, { name: 'Bhujia', category: 'Namkeen', price: '90' }),
      row(3, { name: 'Mixture', category: 'namkeen', price: '80' }),
    ]);

    expect(res.newCategories).toEqual(['Namkeen']);
    expect(categories.create).toHaveBeenCalledTimes(1);
    expect(categories.create).toHaveBeenCalledWith({ name: 'Namkeen' }, db);
    for (const name of ['Bhujia', 'Mixture']) {
      expect(products.createInTx).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ name, categoryId: 'cat-namkeen' }),
        SHOP_A,
      );
    }
  });

  it('fails rows with a missing category when the user cannot create categories', async () => {
    setup();
    const res = await importProducts(
      [row(2, { name: 'Bhujia', category: 'Namkeen', price: '90' })],
      { canCreateCategories: false },
    );
    expect(res.failed).toBe(1);
    expect(res.rows[0].message).toMatch(/cannot create categories/);
    expect(categories.create).not.toHaveBeenCalled();
  });

  it('updates the existing variant when the SKU is already in the shop', async () => {
    setup([variant(SHOP_A, { productName: 'Rasgulla', sku: 'RG-1' })]);
    const res = await importProducts([
      row(2, { name: 'rasgulla', price: '120', quantity: '8', sku: 'rg-1' }),
    ]);

    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect(res.rows[0].message).toContain('price ₹100 → ₹120');
    expect(res.rows[0].message).toContain('stock 5 → 8');
    expect(products.createInTx).not.toHaveBeenCalled();
    const [update] = db.productVariant.update.mock.calls[0] as unknown as [
      { where: { id: string }; data: { price: number } },
    ];
    expect(update.where).toEqual({ id: `v-${SHOP_A}-Rasgulla` });
    expect(update.data.price).toBe(120);
    // Stock moves through the ledger as a delta, never by overwriting the balance.
    const [stock] = db.productVariant.updateMany.mock.calls[0] as unknown as [
      { where: { shopCode: string }; data: unknown },
    ];
    expect(stock.where.shopCode).toBe(SHOP_A);
    expect(stock.data).toEqual({
      quantity: { increment: new Prisma.Decimal(3) },
    });
  });

  it('skips a matching row that changes nothing', async () => {
    setup([variant(SHOP_A, { productName: 'Rasgulla', sku: 'RG-1' })]);
    const res = await importProducts([
      row(2, { name: 'Rasgulla', price: '100', sku: 'RG-1' }),
    ]);
    expect(res).toMatchObject({ skipped: 1, updated: 0 });
    expect(db.productVariant.update).not.toHaveBeenCalled();
  });

  it('fails a SKU that belongs to a different product', async () => {
    setup([variant(SHOP_A, { productName: 'Rasgulla', sku: 'RG-1' })]);
    const res = await importProducts([
      row(2, { name: 'Gulab Jamun', price: '100', sku: 'RG-1' }),
    ]);
    expect(res.failed).toBe(1);
    expect(res.rows[0].message).toBe(
      'SKU "RG-1" already belongs to "Rasgulla / Regular"',
    );
  });

  it('fails the second row when a file repeats a SKU', async () => {
    setup();
    const res = await importProducts([
      row(2, { name: 'Peda', price: '40', sku: 'PD-1' }),
      row(3, { name: 'Barfi', price: '50', sku: 'pd-1' }),
    ]);
    expect(res).toMatchObject({ created: 1, failed: 1 });
    expect(res.rows[1]).toEqual({
      row: 3,
      status: 'failed',
      message: 'SKU "pd-1" is also on row 2',
    });
    expect(products.createInTx).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['abc', 'Price must be a number'],
    ['', 'Price is required'],
    ['0', 'Price must be at least ₹0.01'],
    ['12.345', 'Price must have at most 2 decimal places'],
    ['2000000', 'Price cannot exceed ₹10,00,000'],
  ])('fails a row with price %p', async (price, message) => {
    setup();
    const res = await importProducts([
      row(2, { name: 'Peda', price }),
      row(3, { name: 'Barfi', price: '50' }),
    ]);
    expect(res).toMatchObject({ created: 1, failed: 1 });
    expect(res.rows[0].message).toContain(message);
    expect(products.createInTx).toHaveBeenCalledTimes(1);
  });

  it('only matches items of the active shop', async () => {
    // Shop B already has this SKU and barcode; shop A must get its own new product.
    setup([
      variant(SHOP_B, {
        productName: 'Soan Papdi',
        sku: 'SP-1',
        barcode: 'B-1',
      }),
    ]);
    const res = await importProducts([
      row(2, { name: 'Soan Papdi', price: '60', sku: 'SP-1', barcode: 'B-1' }),
    ]);

    expect(res).toMatchObject({ created: 1, updated: 0 });
    expect(products.createInTx).toHaveBeenCalledWith(
      db,
      expect.anything(),
      SHOP_A,
    );
    expect(db.productVariant.update).not.toHaveBeenCalled();
    for (const call of [
      ...db.productVariant.findMany.mock.calls,
      ...db.product.findMany.mock.calls,
    ]) {
      expect(call[0].where.shopCode).toBe(SHOP_A);
    }
  });

  it('refuses to run without a shop', async () => {
    setup();
    await expect(
      importProducts([row(2, { name: 'Peda', price: '40' })], {}, ''),
    ).rejects.toThrow('Missing shop context');
  });

  it('reports what would happen on a dry run without writing', async () => {
    setup([variant(SHOP_A, { productName: 'Rasgulla', sku: 'RG-1' })]);
    const res = await importProducts(
      [
        row(2, { name: 'Rasgulla', price: '110', sku: 'RG-1' }),
        row(3, { name: 'Peda', category: 'Pedas', price: '40' }),
      ],
      { dryRun: true },
    );

    expect(res).toMatchObject({ dryRun: true, created: 1, updated: 1 });
    expect(res.newCategories).toEqual(['Pedas']);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(products.createInTx).not.toHaveBeenCalled();
    expect(categories.create).not.toHaveBeenCalled();
    expect(db.productVariant.update).not.toHaveBeenCalled();
  });

  describe('importCategories', () => {
    it('creates new names and skips existing or repeated ones', async () => {
      setup([], [{ id: 'cat-sweets', name: 'Sweets' }]);
      const res = await service.importCategories(
        [
          { row: 2, name: 'Namkeen' },
          { row: 3, name: 'SWEETS' },
          { row: 4, name: 'namkeen ' },
          { row: 5, name: '  ' },
        ],
        { dryRun: false },
      );

      expect(res).toMatchObject({ created: 1, skipped: 2, failed: 1 });
      expect(res.rows.map((r) => r.status)).toEqual([
        'created',
        'skipped',
        'skipped',
        'failed',
      ]);
      expect(categories.create).toHaveBeenCalledTimes(1);
      expect(categories.create).toHaveBeenCalledWith({ name: 'Namkeen' }, db);
    });
  });
});
