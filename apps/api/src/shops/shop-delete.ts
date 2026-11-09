import type { PrismaClient } from '@fluxen/database';

export type DeleteShopResult = {
  shopCode: string;
  orderItems: number;
  orders: number;
  stockTransfers: number;
  roleRequests: number;
  users: number;
  variants: number;
  images: number;
  products: number;
  orphanCategoriesRemoved: number;
};

export async function deleteShopAndDependencies(
  prisma: PrismaClient,
  shopId: string,
): Promise<DeleteShopResult> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, shopCode: true, isFactory: true },
  });
  if (!shop) {
    throw new Error(`Shop not found`);
  }
  if (shop.isFactory) {
    throw new Error('Cannot delete the factory / warehouse shop.');
  }

  const shopCode = shop.shopCode;

  // Orders are GST records that must be retained; a shop with sales cannot be erased.
  const orderCount = await prisma.order.count({ where: { shopCode } });
  if (orderCount > 0) {
    throw new Error(
      `This shop has ${orderCount} orders and cannot be deleted. Deactivate its users instead.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const userRows = await tx.user.findMany({
      where: { shopCode },
      select: { id: true },
    });
    const userIds = userRows.map((u) => u.id);

    const st = await tx.stockTransferRequest.deleteMany({
      where: {
        OR: [{ fromShopCode: shopCode }, { toShopCode: shopCode }],
      },
    });

    const rr = await tx.roleRequest.deleteMany({
      where:
        userIds.length > 0
          ? { OR: [{ shopCode }, { userId: { in: userIds } }] }
          : { shopCode },
    });

    await tx.customer.deleteMany({ where: { shopCode } });
    await tx.stockMovement.deleteMany({ where: { shopCode } });
    const usr = await tx.user.deleteMany({ where: { shopCode } });

    const pv = await tx.productVariant.deleteMany({ where: { shopCode } });
    const img = await tx.productImage.deleteMany({
      where: { product: { shopCode } },
    });
    const pr = await tx.product.deleteMany({ where: { shopCode } });

    await tx.shop.delete({ where: { id: shopId } });

    // Categories are shared across shops and are kept.
    return {
      shopCode,
      orderItems: 0,
      orders: 0,
      stockTransfers: st.count,
      roleRequests: rr.count,
      users: usr.count,
      variants: pv.count,
      images: img.count,
      products: pr.count,
      orphanCategoriesRemoved: 0,
    };
  });
}
