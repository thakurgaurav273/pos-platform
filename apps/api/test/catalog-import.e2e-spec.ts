/**
 * Spreadsheet import endpoints against a disposable local Postgres (see setup-env.ts).
 */
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { UserRole } from '@fluxen/database';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.provider';

const SHOP_A = 'IMP-A';
const SHOP_B = 'IMP-B';

describe('Catalog import (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const token: Record<string, string> = {};

  const post = (who: string, path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/catalog-import/${path}`)
      .set('Authorization', `Bearer ${token[who]}`)
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useValue({
        quit: async () => undefined,
        onModuleDestroy: async () => undefined,
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
    );

    const org = await prisma.organization.create({
      data: { name: 'Import Org' },
    });
    await prisma.shop.createMany({
      data: [
        { shopCode: SHOP_A, name: 'Shop A', orgId: org.id },
        { shopCode: SHOP_B, name: 'Shop B', orgId: org.id },
      ],
    });
    await prisma.category.create({ data: { name: 'Sweets' } });
    const people: [string, UserRole, string][] = [
      ['managerA', UserRole.MANAGER, SHOP_A],
      ['managerB', UserRole.MANAGER, SHOP_B],
      ['cashierA', UserRole.CASHIER, SHOP_A],
    ];
    for (const [key, role, shopCode] of people) {
      const u = await prisma.user.create({
        data: { email: `${key}@import.test`, password: 'x', role, shopCode },
      });
      token[key] = jwt.sign({ sub: u.id });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const file = [
    {
      row: 2,
      name: 'Kaju Katli',
      variantName: '250g',
      category: 'sweets',
      price: '250',
      quantity: '12',
      sku: 'KK-250',
    },
    {
      row: 3,
      name: 'Kaju Katli',
      variantName: '500g',
      category: 'Sweets',
      price: '480',
      sku: 'KK-500',
    },
    { row: 4, name: 'Bhujia', category: 'Namkeen', price: '90', unit: 'kg' },
    { row: 5, name: 'Peda', price: '12.345' },
  ];

  it('previews a dry run without saving anything', async () => {
    const res = await post('managerA', 'products', {
      rows: file,
      dryRun: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dryRun: true,
      created: 3,
      failed: 1,
      newCategories: ['Namkeen'],
    });
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.category.count()).toBe(1);
  });

  it('imports products, variants, categories and opening stock in shop A', async () => {
    const res = await post('managerA', 'products', { rows: file });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 3, updated: 0, failed: 1 });
    expect(res.body.rows[3]).toMatchObject({
      row: 5,
      status: 'failed',
      message: 'Price must have at most 2 decimal places',
    });

    const kaju = await prisma.product.findFirstOrThrow({
      where: { shopCode: SHOP_A, name: 'Kaju Katli' },
      include: { variants: { orderBy: { name: 'asc' } }, category: true },
    });
    expect(kaju.category?.name).toBe('Sweets');
    expect(
      kaju.variants.map((v) => [v.name, v.sku, Number(v.quantity)]),
    ).toEqual([
      ['250g', 'KK-250', 12],
      ['500g', 'KK-500', 0],
    ]);
    const bhujia = await prisma.product.findFirstOrThrow({
      where: { shopCode: SHOP_A, name: 'Bhujia' },
      include: { variants: true, category: true },
    });
    expect(bhujia.category?.name).toBe('Namkeen');
    expect(bhujia.variants[0].unit).toBe('KG');
    expect(
      await prisma.stockMovement.count({ where: { shopCode: SHOP_A } }),
    ).toBe(1);
  });

  it('updates matching items on re-import and skips unchanged ones', async () => {
    const res = await post('managerA', 'products', {
      rows: [
        {
          row: 2,
          name: 'Kaju Katli',
          price: '260',
          quantity: '20',
          sku: 'kk-250',
        },
        { row: 3, name: 'Kaju Katli', variantName: '500g', price: '480' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 0, updated: 1, skipped: 1 });

    const v = await prisma.productVariant.findFirstOrThrow({
      where: { shopCode: SHOP_A, sku: 'KK-250' },
    });
    expect(Number(v.price)).toBe(260);
    expect(Number(v.quantity)).toBe(20);
    const ledger = await prisma.stockMovement.findMany({
      where: { variantId: v.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger.map((m) => Number(m.delta))).toEqual([12, 8]);
  });

  it("keeps shops apart: shop B's import never touches shop A", async () => {
    const res = await post('managerB', 'products', {
      rows: [{ row: 2, name: 'Kaju Katli', price: '999', sku: 'KK-250' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 0 });
    const a = await prisma.productVariant.findFirstOrThrow({
      where: { shopCode: SHOP_A, sku: 'KK-250' },
    });
    expect(Number(a.price)).toBe(260);
    expect(
      await prisma.productVariant.count({ where: { shopCode: SHOP_B } }),
    ).toBe(1);
  });

  it('refuses roles that cannot create products or categories', async () => {
    const products = await post('cashierA', 'products', { rows: file });
    const categories = await post('cashierA', 'categories', {
      rows: [{ row: 2, name: 'Dry Fruits' }],
    });
    expect(products.status).toBe(403);
    expect(categories.status).toBe(403);
  });

  it('accepts a full 1000-row file and rejects a larger one', async () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        row: i + 2,
        name: `Bulk item ${i}`,
        variantName: 'Regular pack',
        category: 'Sweets',
        price: '10.50',
        quantity: '5',
        sku: `BULK-${String(i).padStart(5, '0')}`,
        barcode: `89000000${String(i).padStart(5, '0')}`,
        hsnCode: '1704',
      }));
    const ok = await post('managerA', 'products', {
      rows: rows(1000),
      dryRun: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.created).toBe(1000);

    const tooMany = await post('managerA', 'products', {
      rows: rows(1001),
      dryRun: true,
    });
    expect(tooMany.status).toBe(400);
  });

  it('imports categories, skipping names that exist', async () => {
    const res = await post('managerA', 'categories', {
      rows: [
        { row: 2, name: 'Dry Fruits' },
        { row: 3, name: 'NAMKEEN' },
        { row: 4, name: 'dry fruits' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, skipped: 2, failed: 0 });
    expect(
      await prisma.category.findFirst({ where: { name: 'Dry Fruits' } }),
    ).not.toBeNull();
  });
});
