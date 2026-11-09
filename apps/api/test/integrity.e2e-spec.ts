/**
 * Regression tests for the data-integrity review (tasks.md, B-xx ids).
 * Runs the real AppModule against a disposable local Postgres (see setup-env.ts).
 */
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import * as PaytmChecksum from 'paytmchecksum';
import { Prisma, Unit, UserRole } from '@fluxen/database';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.provider';

const FACTORY = 'FACTORY01';
const SHOP_A = 'fluxen-main';
const SHOP_B = 'shop-b';

describe('Data integrity (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const token: Record<string, string> = {};
  const userId: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${token[who]}` });

  async function variant(
    shopCode: string,
    barcode: string,
    price: number,
    quantity: number,
    opts: {
      unit?: Unit;
      name?: string;
      taxRate?: number;
      product?: string;
    } = {},
  ) {
    const product = await prisma.product.create({
      data: {
        name: opts.product ?? `Item ${barcode}`,
        shopCode,
        isListedOnWebsite: true,
      },
    });
    const v = await prisma.productVariant.create({
      data: {
        productId: product.id,
        shopCode,
        name: opts.name ?? 'Regular',
        barcode,
        price,
        quantity,
        unit: opts.unit ?? Unit.PC,
        taxRate: opts.taxRate ?? null,
      },
    });
    await prisma.stockMovement.create({
      data: {
        shopCode,
        variantId: v.id,
        reason: 'ADJUSTMENT',
        delta: quantity,
        balance: quantity,
        note: 'test opening',
      },
    });
    return v;
  }

  const stock = async (id: string) =>
    Number(
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id },
          select: { quantity: true },
        })
      ).quantity,
    );

  const sale = (
    who: string,
    items: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
  ) =>
    http()
      .post('/api/orders/pos')
      .set(as(who))
      .send({ paymentMethod: 'CASH', items, ...extra });

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
    jwt = app.get(JwtService);

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
    );

    await prisma.shop.createMany({
      data: [
        { shopCode: FACTORY, name: 'Factory', isFactory: true },
        { shopCode: SHOP_A, name: 'Shop A' },
        { shopCode: SHOP_B, name: 'Shop B' },
      ],
    });
    const people: [string, UserRole, string][] = [
      ['super', UserRole.SUPER_ADMIN, SHOP_A],
      ['admin', UserRole.ADMIN, SHOP_A],
      ['manager', UserRole.MANAGER, SHOP_A],
      ['cashier', UserRole.CASHIER, SHOP_A],
      ['cashierB', UserRole.CASHIER, SHOP_B],
      ['factory', UserRole.MANAGER, FACTORY],
    ];
    for (const [key, role, shopCode] of people) {
      const u = await prisma.user.create({
        data: { email: `${key}@test.local`, password: 'x', role, shopCode },
      });
      userId[key] = u.id;
      token[key] = await jwt.signAsync({ sub: u.id });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(async () => {
    // Ledger invariant: every stock balance equals the sum of its movements.
    const drift = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "ProductVariant" v
      WHERE v.quantity <> COALESCE((SELECT sum(delta) FROM "StockMovement" m WHERE m."variantId" = v.id), 0)`;
    expect(Number(drift[0].n)).toBe(0);
  });

  describe('POS sales', () => {
    it('B-02: concurrent sales never oversell', async () => {
      const v = await variant(SHOP_A, 'RACE1', 40, 3);
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          sale('cashier', [{ variantId: v.id, quantity: 1, unitPrice: 40 }]),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(results.filter((r) => r.status === 400)).toHaveLength(7);
      expect(await stock(v.id)).toBe(0);
    });

    it('B-03: same item on two lines is checked against the combined quantity', async () => {
      const v = await variant(SHOP_A, 'DUP1', 20, 1);
      const res = await sale('cashier', [
        { variantId: v.id, quantity: 1, unitPrice: 20 },
        { variantId: v.id, quantity: 1, unitPrice: 20 },
      ]);
      expect(res.status).toBe(400);
      expect(await stock(v.id)).toBe(1);
    });

    it('B-04: the server prices catalog lines and rejects a tampered price', async () => {
      const v = await variant(SHOP_A, 'PRICE1', 90, 10);
      const bad = await sale('cashier', [
        { variantId: v.id, quantity: 1, unitPrice: 0.01 },
      ]);
      expect(bad.status).toBe(409);
      expect(await stock(v.id)).toBe(10);

      const ok = await sale('cashier', [
        { variantId: v.id, quantity: 2, unitPrice: 90 },
      ]);
      expect(ok.status).toBe(201);
      expect(ok.body.totalAmount).toBe(180);
      expect(ok.body.tax).toBe(8.57); // 180 × 5 / 105, rounded to paise
      expect(ok.body.cgstAmount + ok.body.sgstAmount).toBeCloseTo(8.57, 2);
    });

    it('B-04: discount cannot exceed the bill', async () => {
      const v = await variant(SHOP_A, 'DISC1', 90, 10);
      const res = await sale(
        'cashier',
        [{ variantId: v.id, quantity: 1, unitPrice: 90 }],
        { discount: 500 },
      );
      expect(res.status).toBe(400);
      expect(await stock(v.id)).toBe(10);
    });

    it('B-22: tax is per line at the item rate, after its share of the discount', async () => {
      const sweet = await variant(SHOP_A, 'TAX5', 100, 10); // shop default 5%
      const soda = await variant(SHOP_A, 'TAX40', 100, 10, { taxRate: 40 });
      const res = await sale(
        'cashier',
        [
          { variantId: sweet.id, quantity: 1, unitPrice: 100 },
          { variantId: soda.id, quantity: 1, unitPrice: 100 },
        ],
        { discount: 20 },
      );
      expect(res.status).toBe(201);
      // Each line nets 90: 90×5/105 = 4.29 and 90×40/140 = 25.71
      expect(res.body.totalAmount).toBe(180);
      expect(res.body.tax).toBe(30);
      const lines = await prisma.orderItem.findMany({
        where: { orderId: res.body.id },
        orderBy: { taxRate: 'asc' },
      });
      expect(lines.map((l) => Number(l.taxAmount))).toEqual([4.29, 25.71]);
      expect(lines[0].productName).toBe('Item TAX5');
    });

    it('B-17: a repeat customer keeps details the cashier did not re-enter', async () => {
      const v = await variant(SHOP_A, 'CUST1', 10, 10);
      const line = [{ variantId: v.id, quantity: 1, unitPrice: 10 }];
      await sale('cashier', line, {
        customerPhone: '9876500001',
        customerName: 'Ravi',
        customerEmail: 'ravi@x.com',
        customerGstin: '19abcde1234f1z5',
      }).expect(201);
      await sale('cashier', line, { customerPhone: '9876500001' }).expect(201);
      const c = await prisma.customer.findFirstOrThrow({
        where: { shopCode: SHOP_A, phone: { contains: '9876500001' } },
      });
      expect(c).toMatchObject({
        name: 'Ravi',
        email: 'ravi@x.com',
        gstin: '19ABCDE1234F1Z5',
      });
    });
  });

  describe('cancelling bills', () => {
    it('B-08: cashier cannot cancel; manager cancel keeps the bill and returns stock once', async () => {
      const v = await variant(SHOP_A, 'CXL1', 50, 10);
      const { body: order } = await sale('cashier', [
        { variantId: v.id, quantity: 4, unitPrice: 50 },
      ]).expect(201);
      expect(await stock(v.id)).toBe(6);

      await http()
        .delete(`/api/orders/${order.id}`)
        .set(as('cashier'))
        .expect(403);

      const attempts = await Promise.all(
        [1, 2, 3].map(() =>
          http()
            .post(`/api/orders/${order.id}/cancel`)
            .set(as('manager'))
            .send({ reason: 'customer returned' }),
        ),
      );
      expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await stock(v.id)).toBe(10);

      const saved = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(saved.status).toBe('CANCELLED');
      expect(saved.billNo).toBe(order.billNo);
      expect(saved.cancelReason).toBe('customer returned');
    });
  });

  describe('stock transfers', () => {
    it('B-09 / B-12: fractional transfer, fulfilled exactly once under concurrency, scoped reads', async () => {
      const f = await variant(FACTORY, 'XFER1', 400, 100, { unit: Unit.KG });
      const r = await variant(SHOP_A, 'XFER1', 400, 2, { unit: Unit.KG });

      const { body: req } = await http()
        .post('/api/stock-transfers')
        .set(as('cashier'))
        .send({
          items: [
            {
              barcode: 'XFER1',
              productName: 'Kaju',
              variantName: '1kg',
              quantity: 2.5,
            },
          ],
        })
        .expect(201);

      await http()
        .get(`/api/stock-transfers/${req.id}`)
        .set(as('cashierB'))
        .expect(404);

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          http()
            .patch(`/api/stock-transfers/${req.id}/fulfill`)
            .set(as('factory')),
        ),
      );
      expect(results.filter((x) => x.status === 200)).toHaveLength(1);
      expect(results.filter((x) => x.status === 409)).toHaveLength(4);
      expect(await stock(f.id)).toBe(97.5);
      expect(await stock(r.id)).toBe(4.5);
    });

    it('B-12: a retail shop cannot fulfil its own request', async () => {
      await variant(FACTORY, 'XFER2', 10, 10);
      const { body: req } = await http()
        .post('/api/stock-transfers')
        .set(as('cashier'))
        .send({
          items: [
            {
              barcode: 'XFER2',
              productName: 'p',
              variantName: 'v',
              quantity: 1,
            },
          ],
        })
        .expect(201);
      await http()
        .patch(`/api/stock-transfers/${req.id}/fulfill`)
        .set(as('admin'))
        .expect(403);
    });
  });

  describe('website orders and payments', () => {
    const webOrder = (
      variantId: string,
      quantity: number,
      pickupTime?: string,
    ) =>
      http()
        .post('/api/public/order')
        .send({
          shopCode: SHOP_A,
          customerName: 'Web',
          customerPhone: '9876500009',
          pickupTime:
            pickupTime ?? new Date(Date.now() + 86_400_000).toISOString(),
          items: [{ productId: 'ignored', variantId, quantity }],
        });

    it('B-16: invalid website orders are rejected with 4xx', async () => {
      const v = await variant(SHOP_A, 'WEB1', 40, 5);
      await webOrder(v.id, -10).expect(400);
      await webOrder(v.id, 1, 'not-a-date').expect(400);
      await webOrder(v.id, 99).expect(400);
      const ok = await webOrder(v.id, 2).expect(201);
      expect(ok.body).toMatchObject({
        status: 'DRAFT',
        totalAmount: 80,
        tax: 3.81,
      });
    });

    it('B-05: underpaid callbacks are refused; duplicate good callbacks settle once', async () => {
      const v = await variant(SHOP_A, 'PAY1', 40, 10);
      const { body: order } = await webOrder(v.id, 2).expect(201);

      const callback = async (amount: string) => {
        const params = {
          ORDERID: order.id,
          STATUS: 'TXN_SUCCESS',
          TXNID: 'T1',
          TXNAMOUNT: amount,
        };
        const CHECKSUMHASH = await PaytmChecksum.generateSignature(
          params,
          process.env.PAYTM_MERCHANT_KEY!,
        );
        return http()
          .post('/api/payment/callback')
          .type('form')
          .send({ ...params, CHECKSUMHASH });
      };

      const under = await callback('1.00');
      expect(under.headers.location).toContain('/payment/failure');
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
          .status,
      ).toBe('DRAFT');

      const paid = await Promise.all([1, 2, 3].map(() => callback('80.00')));
      for (const r of paid)
        expect(r.headers.location).toContain('/payment/success');

      const saved = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(saved.status).toBe('PAID');
      expect(saved.paymentMethod).toBe('ONLINE');
      expect(saved.billNo).toMatch(/^\d{6}$/);
      expect(await stock(v.id)).toBe(8);
    });
  });

  describe('bill numbers', () => {
    const DIGITS6 = /^\d{6}$/;
    const num = (billNo: string) => Number(billNo);
    const sell = async (
      who: string,
      variantId: string,
      extra: Record<string, unknown> = {},
    ) => {
      const res = await sale(
        who,
        [{ variantId, quantity: 1, unitPrice: 10 }],
        extra,
      ).expect(201);
      return res.body as { id: string; billNo: string };
    };

    const payWebsiteOrder = async (variantId: string) => {
      const { body: order } = await http()
        .post('/api/public/order')
        .send({
          shopCode: SHOP_A,
          customerName: 'Web',
          customerPhone: '9876500010',
          pickupTime: new Date(Date.now() + 86_400_000).toISOString(),
          items: [{ productId: 'ignored', variantId, quantity: 1 }],
        })
        .expect(201);
      expect(order.billNo ?? null).toBeNull(); // numbered only once paid
      const params = {
        ORDERID: order.id,
        STATUS: 'TXN_SUCCESS',
        TXNID: `T-${order.id}`,
        TXNAMOUNT: Number(order.totalAmount).toFixed(2),
      };
      const CHECKSUMHASH = await PaytmChecksum.generateSignature(
        params,
        process.env.PAYTM_MERCHANT_KEY!,
      );
      await http()
        .post('/api/payment/callback')
        .type('form')
        .send({ ...params, CHECKSUMHASH });
      return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    };

    it('are digits only, zero-padded to 6 and consecutive per shop', async () => {
      const v = await variant(SHOP_B, 'BN1', 10, 100);
      const a = await sell('cashierB', v.id);
      const b = await sell('cashierB', v.id);
      expect(a.billNo).toMatch(DIGITS6);
      expect(a.billNo.startsWith('0')).toBe(true); // leading zeros kept (string, not number)
      expect(num(b.billNo)).toBe(num(a.billNo) + 1);
    });

    it('do not reset at the financial year (31 Mar -> 1 Apr IST)', async () => {
      const v = await variant(SHOP_B, 'BN2', 10, 100);
      // 2026-03-31 22:30 IST is FY 25-26; 2026-04-01 01:30 IST is FY 26-27.
      const lastOfYear = await sell('cashierB', v.id, {
        createdAt: '2026-03-31T17:00:00.000Z',
      });
      const firstOfYear = await sell('cashierB', v.id, {
        createdAt: '2026-03-31T20:00:00.000Z',
      });
      expect(firstOfYear.billNo).toMatch(DIGITS6);
      expect(num(firstOfYear.billNo)).toBe(num(lastOfYear.billNo) + 1);
    });

    it('are unique and gap-free under concurrent sales', async () => {
      const v = await variant(SHOP_B, 'BN3', 10, 100);
      const before = num((await sell('cashierB', v.id)).billNo);
      const bills = await Promise.all(
        Array.from({ length: 10 }, () => sell('cashierB', v.id)),
      );
      const numbers = bills.map((b) => num(b.billNo)).sort((x, y) => x - y);
      expect(numbers).toEqual(
        Array.from({ length: 10 }, (_, i) => before + 1 + i),
      );
    });

    it('are not consumed by a failed sale', async () => {
      const v = await variant(SHOP_B, 'BN4', 10, 1);
      const ok = await sell('cashierB', v.id);
      await sale('cashierB', [
        { variantId: v.id, quantity: 5, unitPrice: 10 },
      ]).expect(400);
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { quantity: { increment: 1 } },
      });
      await prisma.stockMovement.create({
        data: {
          shopCode: SHOP_B,
          variantId: v.id,
          reason: 'ADJUSTMENT',
          delta: 1,
          balance: 1,
        },
      });
      const next = await sell('cashierB', v.id);
      expect(num(next.billNo)).toBe(num(ok.billNo) + 1);
    });

    it('cannot be chosen by the client', async () => {
      const v = await variant(SHOP_B, 'BN5', 10, 10);
      await sale(
        'cashierB',
        [{ variantId: v.id, quantity: 1, unitPrice: 10 }],
        {
          billNo: '999999',
        },
      ).expect(400);
    });

    it('POS and website sales share one series; website bills are numbered at payment', async () => {
      const v = await variant(SHOP_A, 'BN6', 10, 50);
      const pos1 = await sell('cashier', v.id);
      const web = await payWebsiteOrder(v.id);
      const pos2 = await sell('cashier', v.id);
      expect(web.status).toBe('PAID');
      expect(web.billNo).toMatch(DIGITS6);
      expect(num(web.billNo!)).toBe(num(pos1.billNo) + 1);
      expect(num(pos2.billNo)).toBe(num(pos1.billNo) + 2);
    });

    it('a cancelled bill keeps its number and the number is never reused', async () => {
      const v = await variant(SHOP_A, 'BN7', 10, 10);
      const bill = await sell('cashier', v.id);
      await http()
        .post(`/api/orders/${bill.id}/cancel`)
        .set(as('manager'))
        .send({ reason: 'test' })
        .expect(201);
      const after = await sell('cashier', v.id);
      const saved = await prisma.order.findUniqueOrThrow({
        where: { id: bill.id },
      });
      expect(saved.billNo).toBe(bill.billNo);
      expect(num(after.billNo)).toBe(num(bill.billNo) + 1);
    });

    it('the database rejects duplicates, non-digit numbers and edits to issued numbers', async () => {
      const v = await variant(SHOP_A, 'BN8', 10, 10);
      const bill = await sell('cashier', v.id);
      const base = { shopCode: SHOP_A, totalAmount: 1 };
      await expect(
        prisma.order.create({ data: { ...base, billNo: bill.billNo } }),
      ).rejects.toThrow(); // (shopCode, billNo) unique
      await expect(
        prisma.order.create({ data: { ...base, billNo: '26-27/000001' } }),
      ).rejects.toThrow(/digits only/);
      await expect(
        prisma.order.update({
          where: { id: bill.id },
          data: { billNo: '000777' },
        }),
      ).rejects.toThrow(/cannot be changed/);
      // Other fields of an issued bill stay editable (e.g. cancellation).
      await prisma.order.update({
        where: { id: bill.id },
        data: { cancelReason: 'note' },
      });
    });

    it('a bill can be found by its number', async () => {
      const v = await variant(SHOP_A, 'BN9', 10, 10);
      const bill = await sell('cashier', v.id);
      const { body } = await http()
        .get(`/api/orders?q=${bill.billNo}`)
        .set(as('manager'))
        .expect(200);
      const rows = (body.data ?? body.items ?? body) as {
        id: string;
        billNo: string;
      }[];
      expect(rows.map((r) => r.id)).toContain(bill.id);
      expect(rows.find((r) => r.id === bill.id)?.billNo).toBe(bill.billNo);
    });

    describe('legacy bills (issued before bill numbers existed)', () => {
      const printedRef = (id: string) =>
        id.replace(/-/g, '').slice(0, 12).toUpperCase();

      /**
       * A bill as migration 20261018090000 leaves it: no billNo, printed ref stored.
       * The migration backfills before installing the guard, so replay that here by
       * skipping triggers for this one transaction (local superuser test DB only).
       */
      const legacyBill = async () => {
        const o = await prisma.order.create({
          data: {
            shopCode: SHOP_A,
            totalAmount: 50,
            status: 'PAID',
            createdAt: new Date(),
            items: {
              create: [{ customName: 'Old sweet', quantity: 1, price: 50 }],
            },
          },
        });
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'SET LOCAL session_replication_role = replica',
          );
          await tx.$executeRaw`UPDATE "Order" SET "legacyBillRef" = ${printedRef(o.id)} WHERE "id" = ${o.id}`;
        });
        return prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      };

      it('keep their printed reference in lists, detail, search and report exports', async () => {
        const old = await legacyBill();
        const ref = old.legacyBillRef!;
        expect(old.billNo).toBeNull();

        const detail = await http()
          .get(`/api/orders/${old.id}`)
          .set(as('manager'))
          .expect(200);
        expect(detail.body).toMatchObject({ billNo: null, legacyBillRef: ref });

        const found = await http()
          .get(`/api/orders?q=${ref.toLowerCase()}`)
          .set(as('manager'))
          .expect(200);
        const row = (
          found.body.data as { id: string; legacyBillRef: string | null }[]
        ).find((r) => r.id === old.id);
        expect(row?.legacyBillRef).toBe(ref);

        // Reports cut days at IST midnight.
        const today = new Date(Date.now() + 330 * 60_000)
          .toISOString()
          .slice(0, 10);
        const exp = await http()
          .get(`/api/analytics/reports/export-data?start=${today}&end=${today}`)
          .set(as('super'))
          .set('X-Shop', SHOP_A)
          .expect(200);
        const expOrder = (
          exp.body.export.orders as {
            id: string;
            legacyBillRef: string | null;
          }[]
        ).find((o) => o.id === old.id);
        const expLine = (
          exp.body.export.lineItems as {
            orderId: string;
            legacyBillRef: string | null;
          }[]
        ).find((l) => l.orderId === old.id);
        expect(expOrder?.legacyBillRef).toBe(ref);
        expect(expLine?.legacyBillRef).toBe(ref);
      });

      it('can still be cancelled and keep their reference', async () => {
        const old = await legacyBill();
        await http()
          .post(`/api/orders/${old.id}/cancel`)
          .set(as('manager'))
          .send({ reason: 'legacy cancel' })
          .expect(201);
        const saved = await prisma.order.findUniqueOrThrow({
          where: { id: old.id },
        });
        expect(saved.status).toBe('CANCELLED');
        expect(saved.legacyBillRef).toBe(old.legacyBillRef);
        expect(saved.billNo).toBeNull();
      });

      it('the database keeps legacy references write-once', async () => {
        const old = await legacyBill();
        const v = await variant(SHOP_A, 'BN10', 10, 10);
        const numbered = await sell('cashier', v.id);
        await expect(
          prisma.order.update({
            where: { id: old.id },
            data: { legacyBillRef: 'CHANGED' },
          }),
        ).rejects.toThrow(/cannot be set or changed/);
        await expect(
          prisma.order.update({
            where: { id: old.id },
            data: { billNo: '000999' },
          }),
        ).rejects.toThrow(/legacy reference/);
        await expect(
          prisma.order.update({
            where: { id: numbered.id },
            data: { legacyBillRef: 'ABC' },
          }),
        ).rejects.toThrow(/cannot be set or changed/);
        await expect(
          prisma.order.create({
            data: { shopCode: SHOP_A, totalAmount: 1, legacyBillRef: 'NEW' },
          }),
        ).rejects.toThrow(/only for bills issued before/);
      });
    });
  });

  describe('analytics', () => {
    it('B-10: dashboard, explorer and reports agree and only count PAID sales', async () => {
      const v = await variant(SHOP_B, 'REV1', 100, 100);
      const before = await http()
        .get('/api/analytics/dashboard')
        .set(as('super'))
        .set('X-Shop', SHOP_B)
        .expect(200);
      await sale('cashierB', [
        { variantId: v.id, quantity: 1, unitPrice: 100 },
      ]).expect(201);
      const { body: cancelled } = await sale('cashierB', [
        { variantId: v.id, quantity: 1, unitPrice: 100 },
      ]).expect(201);
      await prisma.order.update({
        where: { id: cancelled.id },
        data: { status: 'CANCELLED' },
      });
      await prisma.order.create({
        data: {
          shopCode: SHOP_B,
          totalAmount: 999,
          status: 'DRAFT',
          orderSource: 'WEBSITE',
          paymentMethod: 'ONLINE',
        },
      });

      const dash = await http()
        .get('/api/analytics/dashboard')
        .set(as('super'))
        .set('X-Shop', SHOP_B)
        .expect(200);
      expect(dash.body.today.revenue - before.body.today.revenue).toBe(100);

      const today = dash.body.last7Days[6].date as string;
      const reports = await http()
        .get(`/api/analytics/reports/summary?start=${today}&end=${today}`)
        .set(as('super'))
        .set('X-Shop', SHOP_B)
        .expect(200);
      expect(reports.body.totals).toEqual(dash.body.today);
    });

    it('B-11: days are cut at IST midnight', async () => {
      const v = await variant(SHOP_B, 'IST1', 10, 10);
      // 2026-06-30 19:00 UTC = 2026-07-01 00:30 IST
      await sale(
        'cashierB',
        [{ variantId: v.id, quantity: 1, unitPrice: 10 }],
        {
          createdAt: '2026-06-30T19:00:00.000Z',
        },
      ).expect(201);
      const res = await http()
        .get('/api/analytics/reports/summary?start=2026-06-30&end=2026-07-01')
        .set(as('super'))
        .set('X-Shop', SHOP_B)
        .expect(200);
      const byDay = Object.fromEntries(
        res.body.daily.map((d: { date: string; orderCount: number }) => [
          d.date,
          d.orderCount,
        ]),
      );
      expect(byDay).toEqual({ '2026-06-30': 0, '2026-07-01': 1 });
    });
  });

  describe('catalog maintenance keeps sales history', () => {
    it('B-06: bulk-deleting a sold variant keeps the order lines', async () => {
      const v = await variant(SHOP_A, 'HIST1', 30, 10, { product: 'Rasgulla' });
      const { body: order } = await sale('cashier', [
        { variantId: v.id, quantity: 2, unitPrice: 30 },
      ]).expect(201);
      await http()
        .post('/api/inventory/variants/bulk-delete')
        .set(as('cashier'))
        .send({ variantIds: [v.id] })
        .expect(201);
      const detail = await http()
        .get(`/api/orders/${order.id}`)
        .set(as('cashier'))
        .expect(200);
      expect(detail.body.items).toHaveLength(1);
      expect(detail.body.items[0].productName).toBe('Rasgulla');
      expect(detail.body.subtotal).toBe(detail.body.totalAmount);
    });

    it('B-19: deleting a product works and keeps its sales', async () => {
      const v = await variant(SHOP_A, 'PDEL1', 15, 10, { product: 'Samosa' });
      const { body: order } = await sale('cashier', [
        { variantId: v.id, quantity: 1, unitPrice: 15 },
      ]).expect(201);
      await http()
        .delete(`/api/products/${v.productId}`)
        .set(as('cashier'))
        .expect(200);
      const line = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(line).toMatchObject({
        productName: 'Samosa',
        productVariantId: null,
      });
    });

    it('B-07: only a super admin can purge, with confirmation, and orders survive', async () => {
      const v = await variant(SHOP_B, 'PURGE1', 10, 10);
      await sale('cashierB', [
        { variantId: v.id, quantity: 1, unitPrice: 10 },
      ]).expect(201);
      const orders = await prisma.order.count({ where: { shopCode: SHOP_B } });

      await http()
        .post('/api/inventory/purge-shop-catalog')
        .set(as('cashierB'))
        .send({ confirmShopCode: SHOP_B })
        .expect(403);
      await http()
        .post('/api/inventory/purge-shop-catalog')
        .set(as('super'))
        .set('X-Shop', SHOP_B)
        .send({ confirmShopCode: 'wrong' })
        .expect(400);
      await http()
        .post('/api/inventory/purge-shop-catalog')
        .set(as('super'))
        .set('X-Shop', SHOP_B)
        .send({ confirmShopCode: SHOP_B })
        .expect(201);

      expect(await prisma.order.count({ where: { shopCode: SHOP_B } })).toBe(
        orders,
      );
      expect(
        await prisma.productVariant.count({ where: { shopCode: SHOP_B } }),
      ).toBe(0);
    });
  });

  describe('stock edits', () => {
    it('B-15: negative stock rejected, stale edits conflict, changes are ledgered', async () => {
      const v = await variant(SHOP_A, 'EDIT1', 10, 10);
      const patch = (body: object) =>
        http()
          .patch(`/api/inventory/variants/${v.id}`)
          .set(as('cashier'))
          .send(body);

      await patch({ quantity: -25 }).expect(400);
      await patch({ price: -5 }).expect(400);
      await patch({ quantity: 15, expectedQuantity: 9 }).expect(409);
      await patch({
        quantity: 15,
        expectedQuantity: 10,
        stockNote: 'recount',
      }).expect(200);
      expect(await stock(v.id)).toBe(15);
      const last = await prisma.stockMovement.findFirstOrThrow({
        where: { variantId: v.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(last).toMatchObject({
        reason: 'ADJUSTMENT',
        note: 'recount',
        userId: userId.cashier,
      });
      expect(Number(last.delta)).toBe(5);
    });
  });

  describe('access control', () => {
    it('B-25: an admin cannot grant ADMIN/SUPER_ADMIN or create privileged users', async () => {
      await http()
        .patch(`/api/users/${userId.cashier}`)
        .set(as('admin'))
        .send({ role: 'SUPER_ADMIN' })
        .expect(403);
      await http()
        .post('/api/users')
        .set(as('admin'))
        .send({
          email: 'x@test.local',
          password: 'Passw0rd!x',
          role: 'ADMIN',
          shopCode: SHOP_A,
        })
        .expect(403);
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: userId.cashier },
      });
      expect(u.role).toBe('CASHIER');
    });

    it('B-24: only a super admin can rename a shared category', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Sweets-e2e' },
      });
      await http()
        .patch(`/api/category/${cat.id}`)
        .set(as('admin'))
        .send({ name: 'Hacked' })
        .expect(403);
      await http()
        .patch(`/api/category/${cat.id}`)
        .set(as('super'))
        .send({ name: 'Mithai-e2e' })
        .expect(200);
    });
  });

  describe('shops', () => {
    it('B-20: generated shop codes are sequential and unique despite legacy codes', async () => {
      const codes = await Promise.all(
        [1, 2, 3].map((i) =>
          http()
            .post('/api/shops')
            .set(as('super'))
            .set('X-Shop', FACTORY)
            .send({ name: `New ${i}` })
            .then((r) => r.body.shopCode as string),
        ),
      );
      expect(codes.sort()).toEqual(['SH000001', 'SH000002', 'SH000003']);
    });

    it('B-07: a shop with sales cannot be deleted', async () => {
      const shop = await prisma.shop.findUniqueOrThrow({
        where: { shopCode: SHOP_A },
      });
      await http()
        .delete(`/api/shops/${shop.id}`)
        .set(as('super'))
        .set('X-Shop', FACTORY)
        .expect(400);
    });
  });

  it('money is returned as JSON numbers, not Decimal strings', async () => {
    const v = await variant(SHOP_A, 'JSON1', 12.5, 3);
    const res = await http()
      .get(`/api/inventory/variants/${v.id}`)
      .set(as('cashier'))
      .expect(200);
    expect(res.body.price).toBe(12.5);
    expect(res.body.quantity).toBe(3);
    expect(new Prisma.Decimal(res.body.price).eq(12.5)).toBe(true);
  });
});
