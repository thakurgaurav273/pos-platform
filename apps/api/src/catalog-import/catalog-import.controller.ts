import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ShopScopeGuard } from '../auth/shop-scope.guard';
import { mergeEffectivePermissions } from '../settings/effective-permissions';
import { CatalogImportService } from './catalog-import.service';
import {
  ImportCategoriesDto,
  ImportProductsDto,
} from './dto/import-catalog.dto';

/**
 * Spreadsheet imports. Same access as creating the rows by hand: a new product sets a
 * price and opening stock, and categories are shared by every shop, so both need a
 * manager or above. Send `dryRun: true` to get the per-row outcome without saving.
 */
@Controller('catalog-import')
@UseGuards(JwtAuthGuard, ShopScopeGuard, PermissionsGuard)
export class CatalogImportController {
  constructor(private readonly catalogImportService: CatalogImportService) {}

  @Post('products')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('canAccessProducts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(RolesGuard)
  importProducts(@Req() req: Request, @Body() dto: ImportProductsDto) {
    const user = req.user!;
    const permissions = mergeEffectivePermissions(
      user.role,
      user.permissionOverrides,
    );
    return this.catalogImportService.importProducts(
      req.effectiveShopCode!,
      dto.rows,
      {
        dryRun: dto.dryRun ?? false,
        canCreateCategories: permissions.canAccessCategories,
        userId: user.id,
      },
    );
  }

  @Post('categories')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('canAccessCategories')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(RolesGuard)
  importCategories(@Body() dto: ImportCategoriesDto) {
    return this.catalogImportService.importCategories(dto.rows, {
      dryRun: dto.dryRun ?? false,
    });
  }
}
