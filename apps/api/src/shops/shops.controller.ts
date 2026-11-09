import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ShopScopeGuard } from '../auth/shop-scope.guard';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { CreateShopWithInventoryDto } from './dto/create-shop-with-inventory.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { UpdateShopBrandingDto } from './dto/shop-theme.dto';

/** Organization of the signed-in user (JwtAuthGuard loads the user with its shop). */
function orgIdOf(req: Request): string {
  return (req.user as User & { shop: { orgId: string } }).shop.orgId;
}

@Controller('shops')
@UseGuards(JwtAuthGuard, ShopScopeGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  async create(@Req() req: Request, @Body() createShopDto: CreateShopDto) {
    if (!(await this.shopsService.isFactory(req.effectiveShopCode!))) {
      throw new ForbiddenException(
        'Shop management is only allowed from the Factory scope',
      );
    }
    return this.shopsService.create(createShopDto, orgIdOf(req));
  }

  @Post('bulk-create')
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  async bulkCreate(
    @Req() req: Request,
    @Body() dto: CreateShopWithInventoryDto,
  ) {
    if (!(await this.shopsService.isFactory(req.effectiveShopCode!))) {
      throw new ForbiddenException(
        'Shop management is only allowed from the Factory scope',
      );
    }
    return this.shopsService.createWithInitialInventory(dto, orgIdOf(req));
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  async findAll(@Req() req: Request) {
    return this.shopsService.findAll(orgIdOf(req));
  }

  @Get('current')
  findCurrent(@Req() req: Request) {
    return this.shopsService.findByShopCode(req.effectiveShopCode!);
  }

  /** Logo and theme of the active shop. Shop owners (ADMIN) and SUPER_ADMIN only. */
  @Patch('current/branding')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  updateBranding(@Req() req: Request, @Body() dto: UpdateShopBrandingDto) {
    return this.shopsService.updateBranding(req.effectiveShopCode!, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.shopsService.findOne(id, req.user as User, orgIdOf(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateShopDto: UpdateShopDto,
    @Req() req: Request,
  ) {
    return this.shopsService.update(
      id,
      updateShopDto,
      req.user as User,
      orgIdOf(req),
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(RolesGuard)
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.shopsService.remove(id, req.effectiveShopCode!, orgIdOf(req));
  }
}
