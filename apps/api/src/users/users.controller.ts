import {
  BadRequestException,
  ForbiddenException,
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
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ShopScopeGuard } from '../auth/shop-scope.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * Shop a user lookup is limited to. A super admin can create or move users into any
 * shop, so they must be able to open them again without switching the active shop.
 */
function userScope(req: Request): string | null {
  return (req.user as User).role === UserRole.SUPER_ADMIN
    ? null
    : req.effectiveShopCode!;
}

/** Organization of the signed-in user; super admins are confined to it. */
function orgOf(req: Request): string {
  return (req.user as User & { shop: { orgId: string } }).shop.orgId;
}

@Controller('users')
@UseGuards(JwtAuthGuard, ShopScopeGuard, PermissionsGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('canAccessUsers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findPage(
    @Req() req: Request,
    @Query('page') pageStr?: string,
    @Query('size') sizeStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const size = Math.min(
      100,
      Math.max(1, parseInt(sizeStr ?? '20', 10) || 20),
    );
    return this.usersService.findPage(req.effectiveShopCode!, page, size);
  }

  @Get(':id')
  @RequirePermission('canAccessUsers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findOneForManager(@Req() req: Request, @Param('id') id: string) {
    return this.usersService.findOneForShop(id, userScope(req), orgOf(req));
  }

  @Post()
  @RequirePermission('canAccessUsers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Req() req: Request, @Body() dto: CreateUserDto) {
    const actor = req.user as User;
    const shopCode =
      actor.role === UserRole.SUPER_ADMIN ? dto.shopCode : actor.shopCode;
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      dto.shopCode !== actor.shopCode
    ) {
      throw new BadRequestException(
        'You can only create users for your assigned shop',
      );
    }
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      (dto.role === UserRole.ADMIN || dto.role === UserRole.SUPER_ADMIN)
    ) {
      throw new ForbiddenException(
        'Only a super admin can create ADMIN or SUPER_ADMIN users',
      );
    }
    return this.usersService.create(
      {
        ...dto,
        shopCode,
      },
      orgOf(req),
    );
  }

  @Patch(':id')
  @RequirePermission('canAccessUsers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const actor = req.user as User;
    return this.usersService.update(
      id,
      dto,
      userScope(req),
      {
        id: actor.id,
        role: actor.role,
      },
      orgOf(req),
    );
  }

  @Delete(':id')
  @RequirePermission('canAccessUsers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  remove(@Req() req: Request, @Param('id') id: string) {
    const actor = req.user as User;
    return this.usersService.remove(
      id,
      userScope(req),
      {
        id: actor.id,
        role: actor.role,
      },
      orgOf(req),
    );
  }

  @Get('profile/me')
  getMe(@Req() req: Request) {
    const userId = (req.user as any).sub || (req.user as any).id;
    return this.usersService.findOne(userId);
  }

  @Patch('profile/me')
  updateMe(
    @Req() req: Request,
    @Body() dto: { name?: string; avatarUrl?: string; phone?: string },
  ) {
    const userId = (req.user as any).sub || (req.user as any).id;
    return this.usersService.updateProfile(userId, dto);
  }
}
