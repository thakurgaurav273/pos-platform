import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/permissions.decorator';
import { ShopScopeGuard } from '../auth/shop-scope.guard';
import { CatalogSyncService } from './catalog-sync.service';
import { ShopCatalogPurgeService } from './shop-catalog-purge.service';
import { InventoryService } from './inventory.service';
import { BulkDeleteVariantsDto } from './dto/bulk-delete-variants.dto';
import { CloneCatalogDto } from './dto/clone-catalog.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { PurgeShopCatalogDto } from './dto/purge-shop-catalog.dto';
import { UserRole } from '@fluxen/database';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('inventory')
@UseGuards(JwtAuthGuard, ShopScopeGuard, PermissionsGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly catalogSyncService: CatalogSyncService,
    private readonly shopCatalogPurgeService: ShopCatalogPurgeService,
  ) {}

  @Post('clone-catalog-from-factory')
  @RequirePermission('canAccessInventory')
  cloneCatalogFromFactory(@Req() req: Request, @Body() body: CloneCatalogDto) {
    return this.catalogSyncService.cloneFactoryCatalogBatch(
      req.effectiveShopCode!,
      body || {},
    );
  }

  /** Wipes the shop's catalog only. Super admin, with the shop code typed back as confirmation. */
  @Post('purge-shop-catalog')
  @RequirePermission('canAccessInventory')
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  purgeShopCatalog(@Req() req: Request, @Body() body: PurgeShopCatalogDto) {
    if (body.confirmShopCode !== req.effectiveShopCode) {
      throw new BadRequestException('Type the shop code to confirm the purge');
    }
    return this.shopCatalogPurgeService.purgeCurrentShop(
      req.effectiveShopCode!,
    );
  }

  @Get('variants/lookup')
  @RequireAnyPermission('canAccessInventory', 'canAccessBilling')
  lookupByBarcode(@Req() req: Request, @Query('barcode') barcode?: string) {
    const b = barcode?.trim();
    if (!b) {
      throw new BadRequestException('Query parameter "barcode" is required');
    }
    return this.inventoryService.findVariantByBarcode(
      b,
      req.effectiveShopCode!,
    );
  }

  @Post('variants/bulk-delete')
  @RequirePermission('canAccessInventory')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(RolesGuard)
  bulkDeleteVariants(@Req() req: Request, @Body() dto: BulkDeleteVariantsDto) {
    return this.inventoryService.deleteVariantsByIds(
      req.effectiveShopCode!,
      dto.variantIds,
    );
  }

  @Get('variants')
  @RequireAnyPermission('canAccessInventory', 'canAccessBilling')
  findVariants(
    @Req() req: Request,
    @Query('page') pageStr?: string,
    @Query('size') sizeStr?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const size = Math.min(
      100,
      Math.max(1, parseInt(sizeStr ?? '20', 10) || 20),
    );
    const rawCat = category?.trim();
    const catFilter =
      rawCat && rawCat.toLowerCase() !== 'all' ? rawCat : undefined;
    const searchText = (q ?? search)?.trim() || undefined;
    const isTrue = (v?: string) => v === '1' || v === 'true' || v === 'yes';
    const onlyActive = isTrue(activeOnly);

    return this.inventoryService.findVariantsPage(
      req.effectiveShopCode!,
      page,
      size,
      {
        search: searchText,
        category: catFilter,
        activeOnly: onlyActive || undefined,
        lowStock: isTrue(lowStock) || undefined,
      },
    );
  }

  @Get('variants/:id')
  @RequireAnyPermission('canAccessInventory', 'canAccessBilling')
  findVariantById(@Req() req: Request, @Param('id') id: string) {
    return this.inventoryService.findVariantById(id, req.effectiveShopCode!);
  }

  @Patch('variants/:id')
  @RequirePermission('canAccessInventory')
  updateVariant(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.inventoryService.updateVariant(
      id,
      dto,
      req.effectiveShopCode!,
      req.user?.id,
      req.user?.role,
    );
  }

  @Post('upload')
  @RequirePermission('canAccessInventory')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/uploads',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const relative = `/uploads/${file.filename}`;
    return {
      url: this.inventoryService.absoluteAssetUrl(relative),
    };
  }
}
