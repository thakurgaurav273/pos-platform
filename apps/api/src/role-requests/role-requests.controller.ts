import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RoleRequestsService } from './role-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { ShopScopeGuard } from '../auth/shop-scope.guard';
import { CreateRoleRequestDto } from './dto/create-role-request.dto';

function orgIdOf(req: Request): string {
  return req.user!.shop.orgId;
}

@Controller('role-requests')
@UseGuards(JwtAuthGuard, ShopScopeGuard, RolesGuard)
export class RoleRequestsController {
  constructor(private readonly roleRequestsService: RoleRequestsService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateRoleRequestDto) {
    const userId = (req.user as any).sub || (req.user as any).id;
    const shopCode = req.effectiveShopCode || (req.user as any).shopCode;
    if (!shopCode) {
      throw new BadRequestException('Missing shop context');
    }
    return this.roleRequestsService.create(userId, shopCode, dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  findAll(@Req() req: Request) {
    // A super admin sees the pending requests of their own business only.
    return this.roleRequestsService.findAll(orgIdOf(req));
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  approve(@Req() req: Request, @Param('id') id: string) {
    return this.roleRequestsService.approve(id, orgIdOf(req));
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  reject(@Req() req: Request, @Param('id') id: string) {
    return this.roleRequestsService.reject(id, orgIdOf(req));
  }
}
