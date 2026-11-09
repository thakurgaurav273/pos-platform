import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ShopScopeGuard } from './shop-scope.guard';
import type { PrismaService } from '../prisma.service';

function ctx(user: unknown, headers: Record<string, string> = {}) {
  const req = { user, headers, query: {} } as Record<string, unknown>;
  return {
    req,
    context: {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

function guardWithShops(shops: Record<string, string>) {
  const prisma = {
    shop: {
      findUnique: jest.fn(({ where }: { where: { shopCode: string } }) =>
        Promise.resolve(
          shops[where.shopCode] ? { orgId: shops[where.shopCode] } : null,
        ),
      ),
    },
  } as unknown as PrismaService;
  return new ShopScopeGuard(prisma);
}

const superAdmin = {
  role: 'SUPER_ADMIN',
  shopCode: 'SH1',
  shop: { orgId: 'orgA' },
};

describe('ShopScopeGuard tenant boundary', () => {
  const guard = guardWithShops({ SH1: 'orgA', SH2: 'orgA', SH9: 'orgB' });

  it('lets a super admin switch to another shop of their own org', async () => {
    const { req, context } = ctx(superAdmin, { 'x-shop': 'SH2' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.effectiveShopCode).toBe('SH2');
  });

  it("rejects a shop that belongs to another organization", async () => {
    const { context } = ctx(superAdmin, { 'x-shop': 'SH9' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an unknown shop code', async () => {
    const { context } = ctx(superAdmin, { 'x-shop': 'NOPE' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("pins non-super-admins to their own shop", async () => {
    const cashier = { role: 'CASHIER', shopCode: 'SH1', shop: { orgId: 'orgA' } };
    const { req, context } = ctx(cashier);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.effectiveShopCode).toBe('SH1');
  });
});
