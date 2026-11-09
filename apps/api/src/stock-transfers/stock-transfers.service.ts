import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { qty } from '../common/money';
import { applyStockChange, LONG_TX } from '../common/stock';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the factory shop. Throws if none exists.
   */
  private async getFactoryShop(shopCode: string) {
    const requester = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: { orgId: true },
    });
    // One factory per organization is assumed; oldest wins so the choice is deterministic.
    const factory = await this.prisma.shop.findFirst({
      where: { isFactory: true, orgId: requester?.orgId ?? '' },
      orderBy: { createdAt: 'asc' },
    });
    if (!factory) {
      throw new BadRequestException(
        'No factory/warehouse shop is configured. Ask a super admin to mark a shop as factory.',
      );
    }
    return factory;
  }

  /**
   * Create a refill request from the requesting shop to the factory.
   */
  async create(dto: CreateTransferDto, shopCode: string, userId?: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item is required.');
    }

    const factory = await this.getFactoryShop(shopCode);

    if (shopCode === factory.shopCode) {
      throw new BadRequestException(
        'The factory shop cannot request refills from itself.',
      );
    }

    const barcodes = [...new Set(dto.items.map((i) => i.barcode.trim()))];
    const known = await this.prisma.productVariant.findMany({
      where: { shopCode: factory.shopCode, barcode: { in: barcodes } },
      select: { barcode: true },
    });
    const missing = barcodes.filter((b) => !known.some((k) => k.barcode === b));
    if (missing.length) {
      throw new BadRequestException(
        `Not in factory inventory: ${missing.join(', ')}`,
      );
    }

    return this.prisma.stockTransferRequest.create({
      data: {
        fromShopCode: factory.shopCode,
        toShopCode: shopCode,
        note: dto.note,
        createdById: userId,
        items: {
          create: dto.items.map((item) => ({
            barcode: item.barcode.trim(),
            productName: item.productName,
            variantName: item.variantName,
            quantity: qty(item.quantity),
          })),
        },
      },
      include: { items: true, fromShop: true, toShop: true },
    });
  }

  /**
   * List transfers visible to the given shop.
   * Factory sees all, regular shops see only their own.
   */
  async findAll(shopCode: string, status?: TransferStatus) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
    });

    const where: Prisma.StockTransferRequestWhereInput = {};

    if (shop?.isFactory) {
      // Factory sees incoming (fromShopCode = factory)
      where.fromShopCode = shopCode;
    } else {
      // Regular shops see their outgoing requests
      where.toShopCode = shopCode;
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.stockTransferRequest.findMany({
      where,
      include: {
        items: true,
        fromShop: { select: { name: true, shopCode: true } },
        toShop: { select: { name: true, shopCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Visible only to the two shops involved. */
  async findOne(id: string, shopCode?: string) {
    const request = await this.prisma.stockTransferRequest.findFirst({
      where: {
        id,
        ...(shopCode
          ? { OR: [{ fromShopCode: shopCode }, { toShopCode: shopCode }] }
          : {}),
      },
      include: {
        items: true,
        fromShop: { select: { name: true, shopCode: true } },
        toShop: { select: { name: true, shopCode: true } },
      },
    });
    if (!request) {
      throw new NotFoundException(`Transfer request #${id} not found`);
    }
    return request;
  }

  /**
   * Approve a pending request. Only factory/super-admin can do this.
   */
  async approve(id: string, userId: string, shopCode: string) {
    const request = await this.findOne(id);
    this.assertFactoryAccess(shopCode, request.fromShopCode);

    if (request.status !== TransferStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve a request with status ${request.status}`,
      );
    }

    await this.transition(id, [TransferStatus.PENDING], {
      status: TransferStatus.APPROVED,
      approvedById: userId,
    });
    return this.findOne(id);
  }

  /**
   * Reject a pending request.
   */
  async reject(id: string, userId: string, shopCode: string) {
    const request = await this.findOne(id);
    this.assertFactoryAccess(shopCode, request.fromShopCode);

    if (request.status !== TransferStatus.PENDING) {
      throw new BadRequestException(
        `Cannot reject a request with status ${request.status}`,
      );
    }

    await this.transition(id, [TransferStatus.PENDING], {
      status: TransferStatus.REJECTED,
      approvedById: userId,
    });
    return this.findOne(id);
  }

  /**
   * Fulfill an approved request:
   *  1. Subtract stock from factory variants (by barcode)
   *  2. Add stock to destination shop variants (by barcode, auto-create if missing)
   *  3. Mark status as FULFILLED
   */
  async fulfill(id: string, userId: string, shopCode: string) {
    const request = await this.findOne(id);
    this.assertFactoryAccess(shopCode, request.fromShopCode);

    if (
      request.status !== TransferStatus.APPROVED &&
      request.status !== TransferStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot fulfill a request with status ${request.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Claim the request first: a second concurrent fulfil finds nothing to update.
      const claimed = await tx.stockTransferRequest.updateMany({
        where: {
          id,
          status: { in: [TransferStatus.PENDING, TransferStatus.APPROVED] },
        },
        data: { status: TransferStatus.FULFILLED, approvedById: userId },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This request has already been processed.');
      }

      for (const item of request.items) {
        const factoryVariant = await tx.productVariant.findUnique({
          where: {
            shopCode_barcode: {
              shopCode: request.fromShopCode,
              barcode: item.barcode,
            },
          },
          include: { product: true },
        });
        if (!factoryVariant) {
          throw new BadRequestException(
            `Product with barcode ${item.barcode} not found in factory inventory.`,
          );
        }

        await applyStockChange(tx, {
          variantId: factoryVariant.id,
          shopCode: request.fromShopCode,
          delta: qty(item.quantity).neg(),
          reason: 'TRANSFER_OUT',
          refId: request.id,
          userId,
          label: `${item.productName} (${item.variantName})`,
        });

        let destVariantId = (
          await tx.productVariant.findUnique({
            where: {
              shopCode_barcode: {
                shopCode: request.toShopCode,
                barcode: item.barcode,
              },
            },
            select: { id: true },
          })
        )?.id;

        if (!destVariantId) {
          const destProduct =
            (await tx.product.findFirst({
              where: {
                name: factoryVariant.product.name,
                shopCode: request.toShopCode,
              },
              orderBy: { createdAt: 'asc' },
            })) ??
            (await tx.product.create({
              data: {
                name: factoryVariant.product.name,
                shopCode: request.toShopCode,
                categoryId: factoryVariant.product.categoryId,
                isActive: true,
              },
            }));
          destVariantId = (
            await tx.productVariant.create({
              data: {
                productId: destProduct.id,
                shopCode: request.toShopCode,
                name: factoryVariant.name,
                price: factoryVariant.price,
                costPrice: factoryVariant.costPrice,
                barcode: item.barcode,
                sku: factoryVariant.sku,
                hsnCode: factoryVariant.hsnCode,
                taxRate: factoryVariant.taxRate,
                quantity: 0,
                minStock: factoryVariant.minStock,
                unit: factoryVariant.unit,
              },
            })
          ).id;
        }

        await applyStockChange(tx, {
          variantId: destVariantId,
          shopCode: request.toShopCode,
          delta: qty(item.quantity),
          reason: 'TRANSFER_IN',
          refId: request.id,
          userId,
        });
      }
    }, LONG_TX);

    return this.findOne(id);
  }

  private async transition(
    id: string,
    from: TransferStatus[],
    data: Prisma.StockTransferRequestUncheckedUpdateManyInput,
  ) {
    const res = await this.prisma.stockTransferRequest.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    if (res.count !== 1) {
      throw new ConflictException('This request has already been processed.');
    }
  }

  /** Only the factory the request is addressed to (or a super admin scoped to it) may act. */
  private assertFactoryAccess(
    currentShopCode: string,
    factoryShopCode: string,
  ) {
    if (currentShopCode !== factoryShopCode) {
      throw new ForbiddenException(
        'Only the factory shop can approve, reject, or fulfill transfer requests.',
      );
    }
  }
}
