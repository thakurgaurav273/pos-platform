import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assertIndianMobile10,
  normalizeIndianMobile,
} from '../common/indian-mobile';
import { PrismaService } from '../prisma.service';
import {
  OrderSource,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '@fluxen/database';
import { dec, qty } from '../common/money';
import { computeBill, type PricedLine } from '../orders/orders.service';
import { CreateWebsiteOrderDto } from './dto/create-website-order.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenu(shopCode: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: {
        shopCode: true,
        name: true,
        allowNextDayBooking: true,
        allowBookingWhenOutOfStock: true,
        upiId: true,
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const categories = await this.prisma.category.findMany({
      include: {
        products: {
          where: {
            shopCode,
            isActive: true,
            isListedOnWebsite: true,
          },
          include: {
            variants: {
              orderBy: { price: 'asc' },
            },
            images: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      shop,
      categories,
    };
  }

  async getMarketingSweetsItems(shopCode: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: { shopCode: true, name: true },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const sweetsCategory = await this.prisma.category.findFirst({
      where: { name: { equals: 'Sweets', mode: 'insensitive' } },
    });

    if (!sweetsCategory) {
      return { shop, items: [] };
    }

    const publicBase =
      process.env.INVENTORY_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';

    const products = await this.prisma.product.findMany({
      where: {
        shopCode,
        categoryId: sweetsCategory.id,
        isActive: true,
      },
      include: {
        variants: { orderBy: { price: 'asc' } },
        images: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    const items = products.map((p) => {
      const variant = p.variants[0];
      const image = p.images[0];
      let imageUrl = image?.url ?? null;
      if (imageUrl && publicBase && imageUrl.startsWith('/')) {
        imageUrl = `${publicBase}${imageUrl}`;
      }

      return {
        inventoryProductId: p.id,
        name: p.name,
        description: p.description ?? '',
        price: variant ? Math.round(Number(variant.price)) : 0,
        unit: variant?.name?.trim() || '200g',
        categoryLabel: 'Sweets',
        imageUrl,
      };
    });

    return { shop, items };
  }

  async createWebsiteOrder(dto: CreateWebsiteOrderDto) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode: dto.shopCode },
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const customerPhone = normalizeIndianMobile(dto.customerPhone);
    if (!customerPhone) {
      throw new BadRequestException('customerPhone is required');
    }
    assertIndianMobile10(customerPhone, 'customerPhone');

    const pickupTime = new Date(dto.pickupTime);
    if (Number.isNaN(pickupTime.getTime())) {
      throw new BadRequestException('Invalid pickupTime');
    }
    if (pickupTime.getTime() < Date.now() - 5 * 60_000) {
      throw new BadRequestException('pickupTime cannot be in the past');
    }

    const variantIds = [...new Set(dto.items.map((i) => i.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        shopCode: dto.shopCode,
        product: { isActive: true, isListedOnWebsite: true },
      },
      include: { product: { select: { name: true } } },
    });
    const vmap = new Map(variants.map((v) => [v.id, v]));
    const shopRate = dec(shop.cgstRate).add(shop.sgstRate);

    const needed = new Map<string, Prisma.Decimal>();
    const lines: PricedLine[] = dto.items.map((item) => {
      const v = vmap.get(item.variantId);
      if (!v) {
        throw new NotFoundException(
          `Product variant ${item.variantId} not found`,
        );
      }
      const quantity = qty(item.quantity);
      needed.set(v.id, (needed.get(v.id) ?? dec(0)).add(quantity));
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
        posLabelQuantity: null,
        posLabelUnit: null,
        label: `${v.product.name} (${v.name})`,
      };
    });

    // Availability check only: stock is taken when payment is confirmed (PaymentService).
    if (!shop.allowBookingWhenOutOfStock) {
      for (const [id, q] of needed) {
        const v = vmap.get(id)!;
        if (dec(v.quantity).lt(q)) {
          throw new BadRequestException(
            `Insufficient stock for ${v.product.name} (${v.name})`,
          );
        }
      }
    }

    const bill = computeBill(lines, 0);

    // Single nested create: order and its lines are written atomically.
    return this.prisma.order.create({
      data: {
        shopCode: dto.shopCode,
        totalAmount: bill.total,
        tax: bill.tax,
        discount: 0,
        customerName: dto.customerName.trim(),
        customerPhone,
        customerEmail: dto.customerEmail?.trim() || null,
        pickupTime,
        orderSource: OrderSource.WEBSITE,
        status: OrderStatus.DRAFT,
        paymentMethod: PaymentMethod.ONLINE,
        items: {
          create: bill.lines.map((l) => ({
            productId: l.productId,
            productVariantId: l.variantId,
            productName: l.productName,
            variantName: l.variantName,
            barcode: l.barcode,
            hsnCode: l.hsnCode,
            quantity: l.quantity,
            price: l.price,
            taxRate: l.taxRate,
            taxAmount: l.taxAmount,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true,
            productVariant: true,
          },
        },
      },
    });
  }
}
