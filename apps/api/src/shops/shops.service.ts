import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateShopWithInventoryDto } from './dto/create-shop-with-inventory.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { UpdateShopBrandingDto } from './dto/shop-theme.dto';
import { normalizeLogoUrl, normalizeThemeConfig } from './theme/shop-theme';
import { deleteShopAndDependencies } from './shop-delete';
import { Prisma } from '@fluxen/database';
import { qty } from '../common/money';
import { applyStockChange, LONG_TX, nextSequence } from '../common/stock';

/** Matches the dashboard's Tax configuration section (settings/page.tsx `isAtLeastManager`). */
const TAX_EDITOR_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
];

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Next `SH000123` code from a counter (existing codes like `fluxen-main` are ignored). */
  async generateShopCode(tx?: Prisma.TransactionClient) {
    const n = await nextSequence(tx ?? this.prisma, 'SHOPCODE');
    return `SH${n.toString().padStart(6, '0')}`;
  }

  async create(createShopDto: CreateShopDto, orgId: string) {
    const { themeConfig, ...rest } = createShopDto;
    return this.prisma.$transaction(async (tx) => {
      const shopCode = await this.generateShopCode(tx);
      return tx.shop.create({
        data: {
          ...rest,
          logoUrl: normalizeLogoUrl(rest.logoUrl) ?? undefined,
          ...(themeConfig
            ? { themeConfig: normalizeThemeConfig(themeConfig) }
            : {}),
          shopCode,
          orgId,
        },
      });
    });
  }

  async createWithInitialInventory(
    dto: CreateShopWithInventoryDto,
    orgId: string,
  ) {
    // Validate branding before opening the transaction so bad input fails fast.
    const logoUrl = normalizeLogoUrl(dto.logoUrl) ?? undefined;
    const themeConfig = dto.themeConfig
      ? normalizeThemeConfig(dto.themeConfig)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      const shopCode = dto.shopCode || (await this.generateShopCode(tx));
      const factory = await tx.shop.findFirst({
        where: { isFactory: true, orgId },
        orderBy: { createdAt: 'asc' },
        select: { shopCode: true },
      });
      // 1. Create the new Shop
      const newShop = await tx.shop.create({
        data: {
          name: dto.name,
          shopCode,
          orgId,
          currency: dto.currency || 'INR',
          logoUrl,
          ...(themeConfig ? { themeConfig } : {}),
        },
      });

      if (!dto.initialInventory || dto.initialInventory.length === 0) {
        return newShop;
      }

      if (!factory) {
        throw new BadRequestException('No factory shop is configured');
      }

      // 2. Clone inventory items: stock physically moves out of the factory.
      for (const item of dto.initialInventory) {
        const sourceVariant = await tx.productVariant.findFirst({
          where: { id: item.variantId, shopCode: factory.shopCode },
          include: { product: true },
        });
        if (!sourceVariant) {
          throw new BadRequestException(
            `Variant ${item.variantId} is not in the factory inventory`,
          );
        }

        // Check if the product already exists in the new shop (by name)
        let targetProduct = await tx.product.findFirst({
          where: {
            name: sourceVariant.product.name,
            shopCode: newShop.shopCode,
          },
        });

        // If not, clone the product
        if (!targetProduct) {
          targetProduct = await tx.product.create({
            data: {
              name: sourceVariant.product.name,
              description: sourceVariant.product.description,
              categoryId: sourceVariant.product.categoryId,
              shopCode: newShop.shopCode,
              isActive: sourceVariant.product.isActive,
            },
          });
        }

        const created = await tx.productVariant.create({
          data: {
            productId: targetProduct.id,
            shopCode: newShop.shopCode,
            name: sourceVariant.name,
            price: sourceVariant.price,
            costPrice: sourceVariant.costPrice,
            barcode: sourceVariant.barcode,
            sku: sourceVariant.sku,
            hsnCode: sourceVariant.hsnCode,
            taxRate: sourceVariant.taxRate,
            unit: sourceVariant.unit,
            quantity: 0,
          },
        });

        await applyStockChange(tx, {
          variantId: sourceVariant.id,
          shopCode: factory.shopCode,
          delta: qty(item.quantity).neg(),
          reason: 'SHOP_SEED',
          refId: newShop.shopCode,
          label: `${sourceVariant.product.name} (${sourceVariant.name})`,
        });
        await applyStockChange(tx, {
          variantId: created.id,
          shopCode: newShop.shopCode,
          delta: qty(item.quantity),
          reason: 'SHOP_SEED',
          refId: factory.shopCode,
        });
      }

      return newShop;
    }, LONG_TX);
  }

  async findAll(orgId: string) {
    return this.prisma.shop.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByShopCode(shopCode: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
    });
    if (!shop) {
      throw new NotFoundException(`Shop ${shopCode} not found`);
    }
    return shop;
  }

  async findOne(id: string, actor: User, orgId: string) {
    await this.assertCanAccessShop(id, actor, orgId);
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      include: { products: true, users: true },
    });
    if (!shop) {
      throw new NotFoundException(`Shop #${id} not found`);
    }
    return shop;
  }

  async update(
    id: string,
    updateShopDto: UpdateShopDto,
    actor: User,
    orgId: string,
  ) {
    await this.assertCanAccessShop(id, actor, orgId);

    const data =
      actor.role === UserRole.SUPER_ADMIN
        ? updateShopDto
        : this.pickTaxOnlyUpdate(updateShopDto);

    if (actor.role !== UserRole.SUPER_ADMIN && Object.keys(data).length === 0) {
      return this.prisma.shop.findUnique({ where: { id } });
    }
    // GST rates change every bill, so they are limited to the roles that see Tax configuration.
    if (!TAX_EDITOR_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        'Only a manager or admin can change GST rates',
      );
    }

    return this.prisma.shop.update({
      where: { id },
      data,
    });
  }

  /**
   * Logo + theme for the caller's effective shop. The controller limits this to
   * SUPER_ADMIN / ADMIN and ShopScopeGuard pins non-super-admins to their own shop,
   * so the shop is never taken from the request body.
   */
  async updateBranding(shopCode: string, dto: UpdateShopBrandingDto) {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: { id: true },
    });
    if (!shop) {
      throw new NotFoundException(`Shop ${shopCode} not found`);
    }
    const data: Prisma.ShopUpdateInput = {};
    const logoUrl = normalizeLogoUrl(dto.logoUrl);
    if (logoUrl !== undefined) data.logoUrl = logoUrl;
    if (dto.themeConfig === null) {
      data.themeConfig = Prisma.DbNull;
    } else if (dto.themeConfig !== undefined) {
      data.themeConfig = normalizeThemeConfig(dto.themeConfig);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Nothing to update: send logoUrl or themeConfig',
      );
    }
    return this.prisma.shop.update({ where: { id: shop.id }, data });
  }

  private pickTaxOnlyUpdate(dto: UpdateShopDto): UpdateShopDto {
    const out: UpdateShopDto = {};
    if (dto.cgstRate !== undefined) out.cgstRate = dto.cgstRate;
    if (dto.sgstRate !== undefined) out.sgstRate = dto.sgstRate;
    return out;
  }

  private async assertCanAccessShop(id: string, actor: User, orgId: string) {
    const row = await this.prisma.shop.findFirst({
      where: { id, orgId },
      select: { shopCode: true },
    });
    if (!row) {
      throw new NotFoundException(`Shop #${id} not found`);
    }
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      row.shopCode !== actor.shopCode
    ) {
      throw new ForbiddenException('You can only update your assigned shop');
    }
  }

  async isFactory(shopCode: string): Promise<boolean> {
    const shop = await this.prisma.shop.findUnique({
      where: { shopCode },
      select: { isFactory: true },
    });
    return !!shop?.isFactory;
  }

  async remove(id: string, effectiveShopCode: string, orgId: string) {
    const owned = await this.prisma.shop.findFirst({
      where: { id, orgId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException(`Shop #${id} not found`);
    }
    if (!(await this.isFactory(effectiveShopCode))) {
      throw new ForbiddenException(
        'Shop deletion is only allowed when scoped to the factory warehouse',
      );
    }
    try {
      return await deleteShopAndDependencies(this.prisma, id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Shop not found') {
        throw new NotFoundException(`Shop #${id} not found`);
      }
      if (msg.includes('factory') || msg.includes('orders')) {
        throw new BadRequestException(msg);
      }
      throw e;
    }
  }
}
