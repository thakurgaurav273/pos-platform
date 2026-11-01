import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../auth/permissions.decorator';
import { ShopScopeGuard } from '../auth/shop-scope.guard';
import { UserRole } from '@calcutta/database';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('category')
@UseGuards(JwtAuthGuard, ShopScopeGuard, PermissionsGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @RequireAnyPermission('canAccessCategories', 'canAccessBilling')
  findAllForShop(@Req() req: Request) {
    return this.categoryService.findAllWithShopSummary(req.effectiveShopCode!);
  }

  @Get(':id/products')
  @RequireAnyPermission('canAccessCategories', 'canAccessBilling')
  findProductsPage(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('page') pageStr?: string,
    @Query('size') sizeStr?: string,
    @Query('q') q?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const size = Math.min(
      100,
      Math.max(1, parseInt(sizeStr ?? '20', 10) || 20),
    );
    const search = typeof q === 'string' ? q.trim().slice(0, 100) : '';
    return this.categoryService.findProductsPage(
      id,
      req.effectiveShopCode!,
      page,
      size,
      search,
    );
  }

  @Get(':id')
  @RequirePermission('canAccessCategories')
  findOneForShop(@Req() req: Request, @Param('id') id: string) {
    return this.categoryService.findOneSummaryForShop(
      id,
      req.effectiveShopCode!,
    );
  }

  @Post()
  @RequirePermission('canAccessCategories')
  // Categories are shared by every shop, so creating one needs at least a manager.
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  @UseGuards(RolesGuard)
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Patch(':id')
  @RequirePermission('canAccessCategories')
  // Categories are shared by every shop, so only a super admin may rename/delete them.
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @RequirePermission('canAccessCategories')
  // Categories are shared by every shop, so only a super admin may rename/delete them.
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  remove(@Param('id') id: string) {
    return this.categoryService.delete(id);
  }
}
