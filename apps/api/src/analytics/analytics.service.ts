import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@fluxen/database';
import { PrismaService } from '../prisma.service';
import { dec, money, num } from '../common/money';
import {
  addDays,
  addMonths,
  istDayKey,
  istDayStart,
  istMonthKey,
  istMonthStart,
} from '../common/ist';

type ReportsSummaryQuery = {
  days: number;
  start?: string;
  end?: string;
  month?: string;
  bucket: 'day' | 'month';
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function assertMonth(month: string) {
  const m = month.match(MONTH_RE);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
    throw new BadRequestException('month must be YYYY-MM');
  }
}

/**
 * Single definition of "revenue" used by every screen: settled sales only.
 * DRAFT (unpaid website orders), PENDING and CANCELLED bills are excluded.
 */
function revenueWhere(shopCode: string, from: Date, to?: Date) {
  return {
    shopCode,
    status: OrderStatus.PAID,
    createdAt: { gte: from, ...(to ? { lt: to } : {}) },
  } satisfies Prisma.OrderWhereInput;
}

/** Day ranges are IST calendar days (`YYYY-MM-DD`), inclusive of both ends. */
function buildReportsRange(now: Date, query: ReportsSummaryQuery) {
  if (query.month) {
    assertMonth(query.month);
    const next = addMonths(query.month, 1);
    return {
      startKey: `${query.month}-01`,
      endKey: addDays(`${next}-01`, -1),
      rangeStart: istMonthStart(query.month),
      rangeEndExclusive: istMonthStart(next),
    };
  }

  if (query.start && query.end) {
    if (!DAY_RE.test(query.start) || !DAY_RE.test(query.end)) {
      throw new BadRequestException('start and end must be YYYY-MM-DD');
    }
    if (query.end < query.start) {
      throw new BadRequestException('end must be on or after start');
    }
    return {
      startKey: query.start,
      endKey: query.end,
      rangeStart: istDayStart(query.start),
      rangeEndExclusive: istDayStart(addDays(query.end, 1)),
    };
  }

  const todayKey = istDayKey(now);
  const startKey = addDays(todayKey, -(query.days - 1));
  return {
    startKey,
    endKey: todayKey,
    rangeStart: istDayStart(startKey),
    rangeEndExclusive: istDayStart(addDays(todayKey, 1)),
  };
}

function dayCount(startKey: string, endKey: string) {
  return (
    Math.round(
      (Date.parse(`${endKey}T00:00:00Z`) -
        Date.parse(`${startKey}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

type Bucket = { revenue: Prisma.Decimal; orderCount: number };

function emptyBuckets(keys: string[]) {
  return new Map<string, Bucket>(
    keys.map((k) => [k, { revenue: dec(0), orderCount: 0 }]),
  );
}

function fill(
  buckets: Map<string, Bucket>,
  orders: { createdAt: Date; totalAmount: Prisma.Decimal }[],
  keyOf: (d: Date) => string,
) {
  for (const o of orders) {
    const b = buckets.get(keyOf(o.createdAt));
    if (b) {
      b.revenue = b.revenue.add(o.totalAmount);
      b.orderCount += 1;
    }
  }
  return [...buckets.entries()].map(([date, b]) => ({
    date,
    revenue: num(b.revenue),
    orderCount: b.orderCount,
  }));
}

function totalsOf(orders: { totalAmount: Prisma.Decimal }[]) {
  return {
    orderCount: orders.length,
    revenue: num(orders.reduce((s, o) => s.add(o.totalAmount), dec(0))),
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Revenue per payment mode. Split bills count under each mode they used, with only
   * that leg's amount, so revenue across modes still adds up to total revenue. Orders
   * without leg rows (before split payments, website orders) count under paymentMethod.
   */
  private async paymentBreakdown(where: Prisma.OrderWhereInput) {
    const [legacy, legs] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: { ...where, payments: { none: {} } },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.orderPayment.groupBy({
        by: ['method'],
        where: { order: where },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);
    const byMethod = new Map<
      string,
      { orderCount: number; revenue: Prisma.Decimal }
    >();
    const add = (method: string, count: number, amount: Prisma.Decimal) => {
      const prev = byMethod.get(method);
      byMethod.set(method, {
        orderCount: (prev?.orderCount ?? 0) + count,
        revenue: (prev?.revenue ?? dec(0)).add(amount),
      });
    };
    for (const g of legacy) {
      add(g.paymentMethod, g._count.id, dec(g._sum.totalAmount));
    }
    for (const g of legs) add(g.method, g._count.id, dec(g._sum.amount));
    return [...byMethod].map(([paymentMethod, v]) => ({
      paymentMethod,
      orderCount: v.orderCount,
      revenue: num(money(v.revenue)),
    }));
  }

  async getDashboard(shopCode: string) {
    const now = new Date();
    const todayKey = istDayKey(now);
    const todayStart = istDayStart(todayKey);
    const tomorrowStart = istDayStart(addDays(todayKey, 1));
    const monthStart = istMonthStart(istMonthKey(now));
    const sevenStartKey = addDays(todayKey, -6);
    const sevenStart = istDayStart(sevenStartKey);

    const [
      todayAgg,
      monthAgg,
      chartOrders,
      recentOrders,
      productCount,
      variantCount,
      variantsForStock,
      paymentToday,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: revenueWhere(shopCode, todayStart, tomorrowStart),
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: revenueWhere(shopCode, monthStart),
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.findMany({
        where: revenueWhere(shopCode, sevenStart),
        select: { createdAt: true, totalAmount: true },
      }),
      this.prisma.order.findMany({
        where: { shopCode, status: { not: OrderStatus.DRAFT } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.product.count({ where: { shopCode } }),
      this.prisma.productVariant.count({ where: { shopCode } }),
      this.prisma.productVariant.findMany({
        where: { shopCode },
        select: {
          id: true,
          name: true,
          quantity: true,
          minStock: true,
          product: { select: { name: true } },
        },
      }),
      this.paymentBreakdown(revenueWhere(shopCode, todayStart, tomorrowStart)),
    ]);

    const dayKeys = Array.from({ length: 7 }, (_, i) =>
      addDays(sevenStartKey, i),
    );
    const last7Days = fill(emptyBuckets(dayKeys), chartOrders, istDayKey);

    const lowStockAll = variantsForStock.filter(
      (v) =>
        dec(v.quantity).lte(0) ||
        (v.minStock != null && dec(v.quantity).lte(v.minStock)),
    );
    const lowStockVariants = lowStockAll
      .sort((a, b) => num(a.quantity) - num(b.quantity))
      .slice(0, 10)
      .map((v) => ({
        id: v.id,
        productName: v.product.name,
        variantName: v.name,
        quantity: v.quantity,
        minStock: v.minStock,
      }));

    return {
      shopCode,
      generatedAt: now.toISOString(),
      today: {
        orderCount: todayAgg._count.id,
        revenue: num(todayAgg._sum.totalAmount),
      },
      monthToDate: {
        orderCount: monthAgg._count.id,
        revenue: num(monthAgg._sum.totalAmount),
      },
      last7Days,
      catalog: {
        productCount,
        variantCount,
        lowStockCount: lowStockAll.length,
      },
      paymentToday,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        billNo: o.billNo,
        legacyBillRef: o.legacyBillRef,
        createdAt: o.createdAt.toISOString(),
        totalAmount: o.totalAmount,
        paymentMethod: o.paymentMethod,
        status: o.status,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        itemCount: o._count.items,
      })),
      lowStockVariants,
    };
  }

  /**
   * Revenue for an IST calendar day or inclusive day range, plus a per-day breakdown.
   * Uses the same PAID-only definition as the dashboard and reports.
   */
  async getRevenueBreakdown(
    shopCode: string,
    query: { days: number; start?: string; end?: string },
  ) {
    const now = new Date();
    const { startKey, endKey, rangeStart, rangeEndExclusive } =
      buildReportsRange(now, { ...query, bucket: 'day' });
    const days = dayCount(startKey, endKey);
    if (days > 366) {
      throw new BadRequestException('date range cannot exceed 366 days');
    }

    const ordersInRange = await this.prisma.order.findMany({
      where: revenueWhere(shopCode, rangeStart, rangeEndExclusive),
      select: { createdAt: true, totalAmount: true },
    });

    const keys = Array.from({ length: days }, (_, i) => addDays(startKey, i));
    return {
      shopCode,
      days,
      range: { start: startKey, end: endKey },
      generatedAt: now.toISOString(),
      totals: totalsOf(ordersInRange),
      daily: fill(emptyBuckets(keys), ordersInRange, istDayKey),
    };
  }

  async getReportsSummary(shopCode: string, query: ReportsSummaryQuery) {
    const now = new Date();
    const { startKey, endKey, rangeStart, rangeEndExclusive } =
      buildReportsRange(now, query);
    const days = dayCount(startKey, endKey);
    const where = revenueWhere(shopCode, rangeStart, rangeEndExclusive);

    const [ordersInRange, paymentMix, itemsInRange] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: { createdAt: true, totalAmount: true },
      }),
      this.paymentBreakdown(where),
      this.prisma.orderItem.findMany({
        where: { order: where },
        select: {
          quantity: true,
          price: true,
          customName: true,
          productName: true,
          order: { select: { totalAmount: true, discount: true } },
        },
      }),
    ]);

    let daily: { date: string; revenue: number; orderCount: number }[];
    if (query.bucket === 'month') {
      const keys: string[] = [];
      for (
        let m = startKey.slice(0, 7);
        m <= endKey.slice(0, 7);
        m = addMonths(m, 1)
      ) {
        keys.push(`${m}-01`);
      }
      daily = fill(
        emptyBuckets(keys),
        ordersInRange,
        (d) => `${istMonthKey(d)}-01`,
      );
    } else {
      const keys = Array.from({ length: days }, (_, i) => addDays(startKey, i));
      daily = fill(emptyBuckets(keys), ordersInRange, istDayKey);
    }

    // `revenue` is net of each bill's discount (shared pro rata across its lines) so the
    // product table adds up to the totals; `grossRevenue` is before discount.
    const productMap = new Map<
      string,
      {
        qtySold: Prisma.Decimal;
        revenue: Prisma.Decimal;
        gross: Prisma.Decimal;
      }
    >();
    for (const line of itemsInRange) {
      const name = line.customName || line.productName || 'Manual Item';
      const gross = dec(line.quantity).mul(line.price);
      const orderGross = dec(line.order.totalAmount).add(line.order.discount);
      const net = orderGross.isZero()
        ? dec(0)
        : gross.mul(line.order.totalAmount).div(orderGross);
      const prev = productMap.get(name) ?? {
        qtySold: dec(0),
        revenue: dec(0),
        gross: dec(0),
      };
      productMap.set(name, {
        qtySold: prev.qtySold.add(line.quantity),
        revenue: prev.revenue.add(net),
        gross: prev.gross.add(gross),
      });
    }

    const topProducts = [...productMap.entries()]
      .map(([productName, v]) => ({
        productName,
        qtySold: num(v.qtySold),
        revenue: num(money(v.revenue)),
        grossRevenue: num(money(v.gross)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    return {
      shopCode,
      days,
      bucket: query.bucket,
      range: { start: startKey, end: endKey },
      generatedAt: now.toISOString(),
      totals: totalsOf(ordersInRange),
      daily,
      paymentMix,
      topProducts,
    };
  }

  async getReportsExportData(shopCode: string, query: ReportsSummaryQuery) {
    const summary = await this.getReportsSummary(shopCode, query);
    const where = revenueWhere(
      shopCode,
      istDayStart(summary.range.start),
      istDayStart(addDays(summary.range.end, 1)),
    );

    // The dashboard surfaces these caps to the user (reportsExport.ts).
    const ORDERS_CAP = 10_000;
    const LINES_CAP = 50_000;

    const [orders, lineRows] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: ORDERS_CAP,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.orderItem.findMany({
        where: { order: where },
        orderBy: [{ orderId: 'asc' }, { id: 'asc' }],
        take: LINES_CAP,
        include: {
          order: {
            select: {
              id: true,
              billNo: true,
              legacyBillRef: true,
              createdAt: true,
              customerName: true,
              customerPhone: true,
              paymentMethod: true,
            },
          },
        },
      }),
    ]);

    const ordersPayload = orders.map((o) => ({
      id: o.id,
      billNo: o.billNo,
      legacyBillRef: o.legacyBillRef,
      createdAt: o.createdAt.toISOString(),
      paymentMethod: o.paymentMethod,
      totalAmount: num(o.totalAmount),
      discount: num(o.discount),
      tax: num(o.tax),
      status: o.status,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      itemCount: o._count.items,
    }));

    const lineItems = lineRows.map((row) => {
      const lineTotal = money(dec(row.quantity).mul(row.price));
      return {
        orderId: row.orderId,
        billNo: row.order.billNo,
        legacyBillRef: row.order.legacyBillRef,
        orderCreatedAt: row.order.createdAt.toISOString(),
        customerName: row.order.customerName,
        customerPhone: row.order.customerPhone,
        paymentMethod: row.order.paymentMethod,
        productName: row.customName || row.productName || 'Manual Item',
        variantName: row.variantName ?? null,
        barcode: row.barcode ?? null,
        hsnCode: row.hsnCode ?? null,
        quantity: num(row.quantity),
        unitPrice: num(row.price),
        lineTotal: num(lineTotal),
        taxRate: num(row.taxRate),
        taxAmount: num(row.taxAmount),
      };
    });

    return {
      ...summary,
      export: {
        orders: ordersPayload,
        lineItems,
        ordersCapped: orders.length >= ORDERS_CAP,
        lineItemsCapped: lineRows.length >= LINES_CAP,
      },
    };
  }

  /**
   * Monthly GST summary for an IST calendar month, from the tax stored on each bill line
   * at sale time (so later rate changes never rewrite history). Intra-state: CGST/SGST
   * split in the shop's ratio; IGST is not modelled.
   */
  async getGstMonthlySummary(shopCode: string, month: string) {
    assertMonth(month);
    const rangeStart = istMonthStart(month);
    const rangeEndExclusive = istMonthStart(addMonths(month, 1));

    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: {
        name: true,
        gstNumber: true,
        cgstRate: true,
        sgstRate: true,
      },
    });
    if (!shop) {
      throw new BadRequestException('Shop not found');
    }

    const where = revenueWhere(shopCode, rangeStart, rangeEndExclusive);
    const [agg, byRate] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _count: { id: true },
        _sum: { totalAmount: true, discount: true, tax: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['taxRate'],
        where: { order: where },
        _sum: { taxAmount: true },
      }),
    ]);

    const cgstR = dec(shop.cgstRate);
    const sgstR = dec(shop.sgstRate);
    const combined = cgstR.add(sgstR);
    const grossInclusive = dec(agg._sum.totalAmount ?? 0);
    const totalTax = dec(agg._sum.tax ?? 0);
    const cgstPayable = combined.isZero()
      ? dec(0)
      : money(totalTax.mul(cgstR).div(combined));

    return {
      month,
      range: {
        startUtc: rangeStart.toISOString(),
        endUtcExclusive: rangeEndExclusive.toISOString(),
      },
      shopCode,
      shopName: shop.name,
      gstNumber: shop.gstNumber,
      cgstRate: num(cgstR),
      sgstRate: num(sgstR),
      combinedRatePercent: num(combined),
      billCount: agg._count.id,
      discountTotal: num(agg._sum.discount),
      grossInclusive: num(grossInclusive),
      taxableValue: num(grossInclusive.sub(totalTax)),
      totalTax: num(totalTax),
      cgstPayable: num(cgstPayable),
      sgstPayable: num(totalTax.sub(cgstPayable)),
      igstPayable: 0,
      /** Kept for API compatibility; tax is always taken from stored bill lines now. */
      taxInferred: false,
      byRate: byRate
        .map((r) => ({
          ratePercent: num(r.taxRate),
          tax: num(r._sum.taxAmount),
        }))
        .sort((a, b) => a.ratePercent - b.ratePercent),
    };
  }
}
