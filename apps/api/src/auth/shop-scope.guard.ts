import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';

/**
 * After JWT: fills `req.effectiveShopCode` from X-Shop for super admins, otherwise the user's shop.
 */
@Injectable()
export class ShopScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const raw = req.headers['x-shop'];
    const headerShop =
      typeof raw === 'string'
        ? raw.trim()
        : Array.isArray(raw)
          ? (raw[0]?.trim() ?? '')
          : '';

    const queryShop = String(
      (req.query as { shopCode?: string })?.shopCode ?? '',
    ).trim();

    if (user.role === UserRole.SUPER_ADMIN) {
      // The dashboard sends X-Shop (the active shop) on every call, so an explicit
      // ?shopCode= is a deliberate override, e.g. viewing another shop's stock from /shops.
      req.effectiveShopCode = queryShop || headerShop || user.shopCode || '';
      if (!req.effectiveShopCode) {
        throw new BadRequestException(
          'Missing shop context: send X-Shop header or ensure your account has a shop',
        );
      }
      // Tenant boundary: a super admin may only act on shops of their own organization.
      if (req.effectiveShopCode !== user.shopCode) {
        const target = await this.prisma.shop.findUnique({
          where: { shopCode: req.effectiveShopCode },
          select: { orgId: true },
        });
        const ownOrgId = (user as User & { shop?: { orgId: string } }).shop
          ?.orgId;
        if (!target || !ownOrgId || target.orgId !== ownOrgId) {
          throw new ForbiddenException('That shop is not part of your business');
        }
      }
    } else {
      if (headerShop && headerShop !== user.shopCode) {
        throw new ForbiddenException(
          'X-Shop does not match your assigned shop',
        );
      }
      req.effectiveShopCode = user.shopCode;
    }

    return true;
  }
}
