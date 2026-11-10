import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@fluxen/database';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { nextSequence } from '../common/stock';
import {
  DEMO_CASHIER_EMAIL,
  DEMO_MANAGER_EMAIL,
  DEMO_ORG_NAME,
  DEMO_OWNER_EMAIL,
} from './demo.constants';
import { DEMO_CATALOG, DEMO_CUSTOMERS } from './demo-data';

type Tx = Prisma.TransactionClient;

const HISTORY_DAYS = 30;
const ORDERS_PER_DAY = 4;
const OPENING_STOCK_RETAIL = 200;
const OPENING_STOCK_FACTORY = 2000;
const GST_PERCENT = 5; // shop default: 2.5% CGST + 2.5% SGST, inclusive
const SEED_TX = { timeout: 60_000, maxWait: 15_000 } as const;

/** Deterministic PRNG so every demo reset produces the same-looking shop. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money = (n: number) => n.toFixed(2);

/**
 * Builds (and tears down) the shared demo business: one organization with a factory,
 * a retail shop, a three-person team, a catalog, customers and ~30 days of sales.
 * Depends only on Prisma so the CLI script can use it without the HTTP stack.
 */
@Injectable()
export class DemoSeederService {
  private readonly logger = new Logger(DemoSeederService.name);
  private inFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Creates the demo business if it does not exist yet. Safe to call concurrently. */
  ensureSeeded(): Promise<void> {
    this.inFlight ??= this.seedIfMissing().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Wipes the demo business and builds it again from scratch. */
  async reset(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.wipe(tx);
      await this.seed(tx);
    }, SEED_TX);
    this.logger.log('Demo data reset');
  }

  private async seedIfMissing(): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: DEMO_OWNER_EMAIL },
      select: { id: true },
    });
    if (existing) return;
    try {
      await this.prisma.$transaction((tx) => this.seed(tx), SEED_TX);
      this.logger.log('Demo data created');
    } catch (e) {
      // Another instance seeded at the same moment: the unique email decides.
      if ((e as { code?: string }).code === 'P2002') return;
      throw e;
    }
  }

  private async wipe(tx: Tx): Promise<void> {
    const owner = await tx.user.findUnique({
      where: { email: DEMO_OWNER_EMAIL },
      select: { shop: { select: { orgId: true } } },
    });
    if (!owner) return;
    const orgId = owner.shop.orgId;
    const shops = await tx.shop.findMany({
      where: { orgId },
      select: { shopCode: true },
    });
    const codes = shops.map((s) => s.shopCode);

    await tx.stockTransferRequest.deleteMany({
      where: {
        OR: [{ fromShopCode: { in: codes } }, { toShopCode: { in: codes } }],
      },
    });
    // OrderItem and OrderPayment cascade from Order.
    await tx.order.deleteMany({ where: { shopCode: { in: codes } } });
    await tx.stockMovement.deleteMany({ where: { shopCode: { in: codes } } });
    await tx.roleRequest.deleteMany({ where: { shopCode: { in: codes } } });
    await tx.customer.deleteMany({ where: { shopCode: { in: codes } } });
    // Variants and images cascade from Product.
    await tx.product.deleteMany({ where: { shopCode: { in: codes } } });
    await tx.user.deleteMany({ where: { shopCode: { in: codes } } });
    await tx.invoiceSequence.deleteMany({
      where: {
        OR: codes.flatMap((c) => [{ id: `BILL-${c}` }, { id: `BARCODE-${c}` }]),
      },
    });
    await tx.shop.deleteMany({ where: { orgId } });
    await tx.organization.delete({ where: { id: orgId } });
  }

  private async seed(tx: Tx): Promise<void> {
    const rand = mulberry32(20260101);
    const now = new Date();

    // Nobody logs in with these: DemoService issues sessions directly.
    const unusablePassword = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      10,
    );

    const org = await tx.organization.create({
      data: { name: DEMO_ORG_NAME, onboardingCompletedAt: now },
    });

    const factoryCode = await this.shopCode(tx);
    const retailCode = await this.shopCode(tx);
    await tx.shop.create({
      data: {
        orgId: org.id,
        shopCode: factoryCode,
        name: `${DEMO_ORG_NAME} Factory`,
        isFactory: true,
        city: 'Jaipur',
        state: 'Rajasthan',
        country: 'India',
      },
    });
    await tx.shop.create({
      data: {
        orgId: org.id,
        shopCode: retailCode,
        name: `${DEMO_ORG_NAME} - MI Road`,
        address: '12, MI Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        country: 'India',
        pincode: '302001',
        phone: '9810000000',
        email: 'store@demo.fluxen.app',
        gstNumber: '08AAAAA0000A1Z5',
        upiId: 'demobakery@upi',
      },
    });

    // The owner lands in the retail shop so the dashboard opens on real sales.
    const owner = await tx.user.create({
      data: {
        email: DEMO_OWNER_EMAIL,
        name: 'Demo Owner',
        password: unusablePassword,
        role: UserRole.SUPER_ADMIN,
        shopCode: retailCode,
      },
    });
    await tx.user.create({
      data: {
        email: DEMO_MANAGER_EMAIL,
        name: 'Priya Manager',
        password: unusablePassword,
        role: UserRole.MANAGER,
        shopCode: retailCode,
      },
    });
    const cashier = await tx.user.create({
      data: {
        email: DEMO_CASHIER_EMAIL,
        name: 'Ravi Cashier',
        password: unusablePassword,
        role: UserRole.CASHIER,
        shopCode: retailCode,
      },
    });

    // Categories are global (unique by name), so reuse any that already exist.
    const categoryIds = new Map<string, string>();
    for (const name of new Set(DEMO_CATALOG.map((p) => p.category))) {
      const cat = await tx.category.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      categoryIds.set(name, cat.id);
    }

    type SeededVariant = {
      id: string;
      productId: string;
      productName: string;
      variantName: string;
      barcode: string;
      hsnCode: string;
      price: number;
      stock: number;
    };
    const retailVariants: SeededVariant[] = [];
    const movements: Prisma.StockMovementCreateManyInput[] = [];
    const openedAt = new Date(now.getTime() - (HISTORY_DAYS + 1) * 86_400_000);

    for (const shopCodeOf of [factoryCode, retailCode]) {
      const isRetail = shopCodeOf === retailCode;
      const opening = isRetail ? OPENING_STOCK_RETAIL : OPENING_STOCK_FACTORY;
      let i = 0;
      for (const p of DEMO_CATALOG) {
        const product = await tx.product.create({
          data: {
            name: p.name,
            shopCode: shopCodeOf,
            categoryId: categoryIds.get(p.category),
            isActive: true,
          },
        });
        for (const v of p.variants) {
          i++;
          // Every 7th retail item starts low so the low-stock views have something to show.
          const stock = isRetail && i % 7 === 0 ? 45 : opening;
          const barcode = randomUUID();
          const created = await tx.productVariant.create({
            data: {
              productId: product.id,
              shopCode: shopCodeOf,
              name: v.name,
              price: money(v.price),
              costPrice: money(v.price * 0.7),
              barcode,
              hsnCode: p.hsnCode,
              unit: v.unit,
              quantity: stock,
              minStock: 20,
            },
          });
          movements.push({
            shopCode: shopCodeOf,
            variantId: created.id,
            reason: 'ADJUSTMENT',
            delta: stock,
            balance: stock,
            note: 'Demo opening stock',
            createdAt: openedAt,
          });
          if (isRetail) {
            retailVariants.push({
              id: created.id,
              productId: product.id,
              productName: p.name,
              variantName: v.name,
              barcode,
              hsnCode: p.hsnCode,
              price: v.price,
              stock,
            });
          }
        }
      }
    }

    await tx.customer.createMany({
      data: DEMO_CUSTOMERS.map((c) => ({
        shopCode: retailCode,
        name: c.name,
        phone: c.phone,
      })),
    });

    // ---- Sales history, oldest first so running stock balances stay correct ----
    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const payments: Prisma.OrderPaymentCreateManyInput[] = [];
    let billSeq = 0;

    for (let day = HISTORY_DAYS; day >= 0; day--) {
      const isToday = day === 0;
      const count = isToday
        ? 3
        : Math.max(1, ORDERS_PER_DAY + Math.round((rand() - 0.5) * 4));
      const times = Array.from({ length: count }, () => {
        const d = new Date(now.getTime() - day * 86_400_000);
        d.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
        return d;
      })
        .filter((d) => d <= now)
        .sort((a, b) => a.getTime() - b.getTime());

      for (const createdAt of times) {
        const lineCount = 1 + Math.floor(rand() * 4);
        const lines: {
          v: SeededVariant;
          q: number;
          total: number;
          tax: number;
        }[] = [];
        for (let l = 0; l < lineCount; l++) {
          const v = retailVariants[Math.floor(rand() * retailVariants.length)];
          const q = 1 + Math.floor(rand() * 3);
          if (v.stock < q || lines.some((x) => x.v === v)) continue;
          const total = v.price * q;
          lines.push({
            v,
            q,
            total,
            tax: (total * GST_PERCENT) / (100 + GST_PERCENT),
          });
        }
        if (lines.length === 0) continue;

        const orderId = randomUUID();
        const total = lines.reduce((s, x) => s + x.total, 0);
        const tax = lines.reduce((s, x) => s + x.tax, 0);
        const roll = rand();
        const method = roll < 0.55 ? 'CASH' : roll < 0.85 ? 'UPI' : 'CARD';
        const tendered =
          method === 'CASH' ? Math.ceil(total / 50) * 50 : undefined;
        const customer =
          rand() < 0.3
            ? DEMO_CUSTOMERS[Math.floor(rand() * DEMO_CUSTOMERS.length)]
            : undefined;
        billSeq++;

        orders.push({
          id: orderId,
          billNo: String(billSeq).padStart(6, '0'),
          shopCode: retailCode,
          totalAmount: money(total),
          tax: money(tax),
          status: 'PAID',
          paymentMethod: method,
          cashTendered: tendered === undefined ? undefined : money(tendered),
          changeDue:
            tendered === undefined ? undefined : money(tendered - total),
          createdById: rand() < 0.7 ? cashier.id : owner.id,
          customerName: customer?.name,
          customerPhone: customer?.phone,
          orderSource: 'POS',
          createdAt,
        });
        payments.push({
          orderId,
          method,
          amount: money(total),
          createdAt,
        });
        for (const x of lines) {
          x.v.stock -= x.q;
          items.push({
            orderId,
            productId: x.v.productId,
            productVariantId: x.v.id,
            productName: x.v.productName,
            variantName: x.v.variantName,
            barcode: x.v.barcode,
            hsnCode: x.v.hsnCode,
            quantity: x.q,
            price: money(x.v.price),
            taxRate: money(GST_PERCENT),
            taxAmount: money(x.tax),
          });
          movements.push({
            shopCode: retailCode,
            variantId: x.v.id,
            reason: 'SALE',
            delta: -x.q,
            balance: x.v.stock,
            refId: orderId,
            userId: cashier.id,
            createdAt,
          });
        }
      }
    }

    await tx.order.createMany({ data: orders });
    await tx.orderItem.createMany({ data: items });
    await tx.orderPayment.createMany({ data: payments });
    await tx.stockMovement.createMany({ data: movements });
    for (const v of retailVariants) {
      await tx.productVariant.update({
        where: { id: v.id },
        data: { quantity: v.stock },
      });
    }
    // Next real sale continues the series instead of colliding with the history.
    await tx.invoiceSequence.upsert({
      where: { id: `BILL-${retailCode}` },
      update: { current: billSeq },
      create: { id: `BILL-${retailCode}`, current: billSeq },
    });
  }

  /** Same `SH000123` format as ShopsService.generateShopCode. */
  private async shopCode(tx: Tx): Promise<string> {
    const n = await nextSequence(tx, 'SHOPCODE');
    return `SH${n.toString().padStart(6, '0')}`;
  }
}
