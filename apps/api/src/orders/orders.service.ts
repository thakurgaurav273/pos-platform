import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreatePosOrderDto,
  PaymentMethodEnum,
} from './dto/create-pos-order.dto';
import { OrderStatus, PaymentLegMethod, Prisma } from '@fluxen/database';
import { reconcilePayments, type ReconciledPayments } from './payments';
import {
  normalizeIndianMobile,
  optionalIndianMobileOrNull,
} from '../common/indian-mobile';
import {
  BILL_TOTAL_MAX,
  dec,
  inclusiveTax,
  money,
  num,
  qty,
} from '../common/money';
import { applyStockChange, LONG_TX, nextSequence } from '../common/stock';
import { orderSearchOr } from '../common/customer-search';

type Tx = Prisma.TransactionClient;

/** Price drift tolerated between the POS cart and the catalog (float rounding on the client). */
const PRICE_TOLERANCE = 0.005;

export type PricedLine = {
  variantId: string | null;
  productId: string | null;
  customName: string | null;
  productName: string;
  variantName: string | null;
  barcode: string | null;
  hsnCode: string | null;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  posLabelQuantity: Prisma.Decimal | null;
  posLabelUnit: string | null;
  label: string;
};

/**
 * Splits the bill discount across lines in proportion to their value (last line takes
 * the rounding remainder) and computes GST-inclusive tax per line.
 */
export function computeBill(
  lines: PricedLine[],
  discountIn: Prisma.Decimal.Value,
) {
  const gross = money(
    lines.reduce((s, l) => s.add(l.quantity.mul(l.price)), dec(0)),
  );
  if (gross.gt(BILL_TOTAL_MAX)) {
    throw new BadRequestException(
      `Bill amount ₹${gross.toFixed(2)} exceeds the ₹${BILL_TOTAL_MAX.toLocaleString('en-IN')} limit for one sale. Check prices and quantities.`,
    );
  }
  const discount = money(discountIn);
  if (discount.gt(gross)) {
    throw new BadRequestException(
      `Discount (₹${discount.toFixed(2)}) cannot exceed the bill amount (₹${gross.toFixed(2)})`,
    );
  }
  let remaining = discount;
  const taxed = lines.map((l, i) => {
    const lineGross = money(l.quantity.mul(l.price));
    const share =
      i === lines.length - 1 || gross.isZero()
        ? remaining
        : money(discount.mul(lineGross).div(gross));
    remaining = remaining.sub(share);
    const net = lineGross.sub(share);
    return { ...l, taxAmount: inclusiveTax(net, l.taxRate) };
  });
  const tax = money(taxed.reduce((s, l) => s.add(l.taxAmount), dec(0)));
  return { lines: taxed, gross, discount, total: gross.sub(discount), tax };
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findCustomerByPhone(shopCode: string, rawPhone: string) {
    const phone = normalizeIndianMobile(rawPhone);
    if (!phone) return null;
    return this.prisma.customer.findUnique({
      where: { shopCode_phone: { shopCode, phone } },
      select: {
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        gstin: true,
      },
    });
  }

  /**
   * Next bill number for the shop: digits only, zero-padded to 6, e.g. `000042`.
   *
   * One continuous series per shop, shared by POS and website sales. It never resets
   * at the financial year: without a year prefix a reset would reissue `000001` and
   * collide with the (shopCode, billNo) unique index. A continuous series is still
   * consecutive and unique within every FY (GST Rule 46); a bill's FY is derived from
   * Order.createdAt when needed.
   *
   * Must run inside the transaction that creates/pays the order: the increment locks
   * the counter row and rolls back with the order, so a failed sale never consumes
   * or reuses a number.
   */
  static async allocateBillNo(tx: Tx, shopCode: string): Promise<string> {
    const seq = await nextSequence(tx, `BILL-${shopCode}`);
    return String(seq).padStart(6, '0');
  }

  async createPosOrder(
    shopCode: string,
    userId: string | undefined,
    dto: CreatePosOrderDto,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: { cgstRate: true, sgstRate: true },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const shopRate = dec(shop.cgstRate).add(shop.sgstRate);

    const variantIds = [
      ...new Set(
        dto.items.map((i) => i.variantId).filter((id): id is string => !!id),
      ),
    ];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, shopCode },
      include: { product: { select: { name: true, isActive: true } } },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException(
        'One or more line items are not valid for this shop',
      );
    }
    const vmap = new Map(variants.map((v) => [v.id, v]));

    // Catalog lines are always priced from the DB. A stale cart is rejected rather than
    // silently re-priced, so the receipt the POS prints matches what is stored.
    const lines: PricedLine[] = dto.items.map((line) => {
      const quantity = qty(line.quantity);
      if (quantity.lte(0))
        throw new BadRequestException('Quantity must be positive');
      const posLabelQuantity =
        line.displayQuantity != null ? qty(line.displayQuantity) : null;
      const posLabelUnit = line.displayUnit?.trim() || null;
      if (line.variantId) {
        const v = vmap.get(line.variantId)!;
        if (Math.abs(line.unitPrice - num(v.price)) > PRICE_TOLERANCE) {
          throw new ConflictException(
            `Price of ${v.product.name} (${v.name}) is now ₹${dec(v.price).toFixed(2)}. Refresh the cart and try again.`,
          );
        }
        return {
          variantId: v.id,
          productId: v.productId,
          customName: null,
          productName: v.product.name,
          variantName: v.name,
          barcode: v.barcode,
          hsnCode: v.hsnCode,
          quantity,
          price: dec(v.price),
          taxRate: v.taxRate != null ? dec(v.taxRate) : shopRate,
          posLabelQuantity,
          posLabelUnit,
          label: `${v.product.name} (${v.name})`,
        };
      }
      const name = line.customName?.trim() || 'Manual Item';
      return {
        variantId: null,
        productId: null,
        customName: name,
        productName: name,
        variantName: null,
        barcode: null,
        hsnCode: null,
        quantity,
        price: money(line.unitPrice),
        taxRate: shopRate,
        posLabelQuantity,
        posLabelUnit,
        label: name,
      };
    });

    const bill = computeBill(lines, dto.discount ?? 0);
    const payment = this.reconcilePosPayment(dto, bill.total);

    let backdatedAt: Date | undefined;
    if (dto.createdAt) {
      const parsed = new Date(dto.createdAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid sale date/time');
      }
      if (parsed.getTime() > Date.now() + 60_000) {
        throw new BadRequestException('Sale date/time cannot be in the future');
      }
      backdatedAt = parsed;
    }

    const customerPhone = optionalIndianMobileOrNull(dto.customerPhone);
    const customerName = dto.customerName?.trim() || null;
    const customerEmail = dto.customerEmail?.trim() || null;
    const customer = {
      email: customerEmail,
      address: dto.customerAddress?.trim() || null,
      notes: dto.customerNotes?.trim() || null,
      gstin: dto.customerGstin?.trim().toUpperCase() || null,
    };

    const order = await this.prisma.$transaction(async (tx) => {
      if (customerPhone) {
        // Only overwrite fields the cashier actually filled in.
        const filled = Object.fromEntries(
          Object.entries(customer).filter(([, v]) => v != null),
        );
        await tx.customer.upsert({
          where: { shopCode_phone: { shopCode, phone: customerPhone } },
          update: {
            ...(customerName ? { name: customerName } : {}),
            ...filled,
          },
          create: {
            shopCode,
            phone: customerPhone,
            name: customerName ?? 'Walk-in',
            ...customer,
          },
        });
      }

      const billNo = await OrdersService.allocateBillNo(tx, shopCode);
      const o = await tx.order.create({
        data: {
          shopCode,
          billNo,
          totalAmount: bill.total,
          discount: bill.discount,
          tax: bill.tax,
          status: OrderStatus.PAID,
          paymentMethod: payment.paymentMethod,
          cashTendered: payment.cashTendered,
          changeDue: payment.changeDue,
          createdById: userId ?? null,
          customerName,
          customerPhone,
          customerEmail,
          ...(backdatedAt ? { createdAt: backdatedAt } : {}),
        },
      });

      await tx.orderPayment.createMany({
        data: payment.legs.map((l) => ({
          orderId: o.id,
          method: l.method,
          amount: l.amount,
        })),
      });

      await tx.orderItem.createMany({
        data: bill.lines.map((l) => ({
          orderId: o.id,
          productId: l.productId,
          productVariantId: l.variantId,
          customName: l.customName,
          productName: l.productName,
          variantName: l.variantName,
          barcode: l.barcode,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          price: l.price,
          taxRate: l.taxRate,
          taxAmount: l.taxAmount,
          posLabelQuantity: l.posLabelQuantity,
          posLabelUnit: l.posLabelUnit,
        })),
      });

      // Aggregate per variant so the same item on two lines is checked against its total.
      const perVariant = new Map<
        string,
        { q: Prisma.Decimal; label: string }
      >();
      for (const l of bill.lines) {
        if (!l.variantId) continue;
        const prev = perVariant.get(l.variantId);
        perVariant.set(l.variantId, {
          q: (prev?.q ?? dec(0)).add(l.quantity),
          label: l.label,
        });
      }
      for (const [variantId, { q, label }] of perVariant) {
        await applyStockChange(tx, {
          variantId,
          shopCode,
          delta: q.neg(),
          reason: 'SALE',
          refId: o.id,
          userId,
          label,
        });
      }
      return o;
    }, LONG_TX);

    return {
      ...this.billSummary(order, shop),
      payments: payment.legs,
      cashTendered: payment.cashTendered,
      changeDue: payment.changeDue,
    };
  }

  /**
   * Payment legs for a POS sale, checked against the server-priced total. Clients that
   * send only paymentMethod (no legs) pay the full bill in that one mode; the legacy
   * UPI_CARD mode has no leg method and is stored without legs, as before.
   */
  private reconcilePosPayment(dto: CreatePosOrderDto, total: Prisma.Decimal) {
    if (dto.payments?.length) {
      return reconcilePayments(total, dto.payments, dto.cashTendered);
    }
    const method = dto.paymentMethod;
    if (!method || method === PaymentMethodEnum.SPLIT) {
      throw new BadRequestException('Add the payment split for a SPLIT bill');
    }
    if (method === PaymentMethodEnum.UPI_CARD) {
      if (dto.cashTendered != null) {
        throw new BadRequestException(
          'Cash tendered was given but no cash payment is on the bill',
        );
      }
      return {
        legs: [] as ReconciledPayments['legs'],
        paymentMethod: method,
        cashTendered: null,
        changeDue: null,
      };
    }
    return reconcilePayments(
      total,
      [{ method: PaymentLegMethod[method], amount: total }],
      dto.cashTendered,
    );
  }

  private billSummary(
    order: {
      id: string;
      billNo: string | null;
      createdAt: Date;
      totalAmount: Prisma.Decimal;
      tax: Prisma.Decimal;
      discount: Prisma.Decimal;
      paymentMethod: string;
    },
    shop: { cgstRate: Prisma.Decimal; sgstRate: Prisma.Decimal },
  ) {
    const rate = dec(shop.cgstRate).add(shop.sgstRate);
    const cgst = rate.isZero()
      ? dec(0)
      : money(dec(order.tax).mul(shop.cgstRate).div(rate));
    return {
      id: order.id,
      billNo: order.billNo,
      createdAt: order.createdAt.toISOString(),
      totalAmount: order.totalAmount,
      subtotal: dec(order.totalAmount).add(order.discount),
      tax: order.tax,
      cgstAmount: cgst,
      sgstAmount: dec(order.tax).sub(cgst),
      taxableValue: dec(order.totalAmount).sub(order.tax),
      discount: order.discount,
      paymentMethod: order.paymentMethod,
    };
  }

  async findPage(shopCode: string, page: number, size: number, q?: string) {
    const qt = q?.trim();
    const where: Prisma.OrderWhereInput = {
      shopCode,
      status: { not: OrderStatus.DRAFT },
      ...(qt ? { OR: orderSearchOr(qt) } : {}),
    };

    const total = await this.prisma.order.count({ where });
    const lastPage = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(Math.max(1, page), lastPage);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * size,
      take: size,
      include: {
        _count: { select: { items: true } },
      },
    });

    return {
      data: rows.map((o) => ({
        id: o.id,
        billNo: o.billNo,
        legacyBillRef: o.legacyBillRef,
        createdAt: o.createdAt.toISOString(),
        paymentMethod: o.paymentMethod,
        totalAmount: o.totalAmount,
        status: o.status,
        orderSource: o.orderSource,
        pickupTime: o.pickupTime?.toISOString() ?? null,
        cancelledAt: o.cancelledAt?.toISOString() ?? null,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        itemCount: o._count.items,
      })),
      last_page: lastPage,
      page: safePage,
      size,
      total,
    };
  }

  /**
   * Cancels a bill. The order (and its bill number) stays in the series for GST;
   * stock is returned for paid orders. Safe under concurrent cancels.
   */
  async cancel(
    shopCode: string,
    id: string,
    userId: string | undefined,
    reason?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, shopCode },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.order.updateMany({
        where: { id, shopCode, status: order.status },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId ?? null,
          cancelReason: reason?.trim() || null,
        },
      });
      if (flipped.count !== 1) {
        throw new ConflictException(
          'Order was changed by someone else. Reload and retry.',
        );
      }
      // DRAFT web orders never took stock; PAID ones did.
      if (order.status !== OrderStatus.PAID) return;
      for (const item of order.items) {
        if (!item.productVariantId) continue;
        const stillExists = await tx.productVariant.findFirst({
          where: { id: item.productVariantId, shopCode },
          select: { id: true },
        });
        if (!stillExists) continue;
        await applyStockChange(tx, {
          variantId: item.productVariantId,
          shopCode,
          delta: item.quantity,
          reason: 'SALE_CANCEL',
          refId: order.id,
          userId,
        });
      }
    }, LONG_TX);

    return { id, status: OrderStatus.CANCELLED };
  }

  async findOne(shopCode: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, shopCode },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            productVariant: { select: { unit: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: { method: true, amount: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    // Orders from before split payments have no legs: one leg of paymentMethod.
    const payments: { method: string; amount: Prisma.Decimal }[] =
      order.payments.length > 0
        ? order.payments
        : [{ method: order.paymentMethod, amount: order.totalAmount }];
    const subtotal = money(
      order.items.reduce((s, i) => s.add(dec(i.quantity).mul(i.price)), dec(0)),
    );
    return {
      id: order.id,
      billNo: order.billNo,
      legacyBillRef: order.legacyBillRef,
      createdAt: order.createdAt.toISOString(),
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      tax: order.tax,
      discount: order.discount,
      status: order.status,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      payments,
      cashTendered: order.cashTendered,
      changeDue: order.changeDue,
      subtotal,
      items: order.items.map((i) => {
        const stockQty = num(i.quantity);
        const catalogRate = num(i.price);
        const lineTotal = num(money(dec(i.quantity).mul(i.price)));
        const dispQ =
          i.posLabelQuantity != null ? num(i.posLabelQuantity) : stockQty;
        const dispU = i.posLabelUnit?.trim() || i.productVariant?.unit || 'PC';
        const dispRate = dispQ > 0 ? lineTotal / dispQ : catalogRate;
        return {
          quantity: dispQ,
          unitPrice: dispRate,
          lineTotal,
          productName: i.customName || i.productName || 'Manual Item',
          variantLabel: i.variantName ?? '-',
          unit: dispU,
          barcode: i.barcode ?? '',
          hsnCode: i.hsnCode,
          taxRate: i.taxRate,
          taxAmount: i.taxAmount,
        };
      }),
    };
  }
}
