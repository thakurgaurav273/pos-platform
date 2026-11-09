import type { Shop, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Loaded with its shop by JwtAuthGuard. */
      user?: User & { shop: Shop };
      /** Shop code resolved by ShopScopeGuard (header + role). */
      effectiveShopCode?: string;
    }
  }
}

export {};
