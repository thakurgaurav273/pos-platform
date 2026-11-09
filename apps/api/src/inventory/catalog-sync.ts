import type { PrismaClient } from '@prisma/client';

export type CatalogSyncResult = {
  factoryShopCode: string;
  targetShopCode: string;
  factoryProductCount: number;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  /** Retail prices that were changed to match the factory price. */
  pricesUpdated: number;
  imagesCreated: number;
};

export type CatalogSyncBatchResult = CatalogSyncResult & {
  batchSize: number;
  nextSkip: number;
  completed: boolean;
};

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_BATCH = 6;

async function assertFactoryAndTarget(
  prisma: PrismaClient,
  targetShopCode: string,
) {
  const target = await prisma.shop.findUnique({
    where: { shopCode: targetShopCode },
  });
  if (!target) {
    throw new Error(`Shop "${targetShopCode}" not found`);
  }
  // One factory per organization is assumed; oldest wins so the choice is deterministic.
  const factory = await prisma.shop.findFirst({
    where: { isFactory: true, orgId: target.orgId },
    orderBy: { createdAt: 'asc' },
  });
  if (!factory) {
    throw new Error(
      'No factory shop (isFactory=true). Mark a warehouse shop as factory first.',
    );
  }
  if (factory.shopCode === target.shopCode) {
    throw new Error('Choose a retail shop, not the factory.');
  }
  return { factory, target };
}

/**
 * Process one page of factory products (for HTTP: many short requests instead of one long one).
 */
export async function syncFactoryCatalogToShopBatch(
  prisma: PrismaClient,
  targetShopCode: string,
  skip: number,
  take: number = DEFAULT_BATCH,
): Promise<CatalogSyncBatchResult> {
  const { factory, target } = await assertFactoryAndTarget(
    prisma,
    targetShopCode,
  );

  const totalFactoryProducts = await prisma.product.count({
    where: { shopCode: factory.shopCode },
  });

  const factoryProducts = await prisma.product.findMany({
    where: { shopCode: factory.shopCode },
    include: { variants: true, images: true },
    orderBy: { name: 'asc' },
    skip,
    take,
  });

  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;
  let pricesUpdated = 0;
  let imagesCreated = 0;

  // One transaction per product: a failure never leaves a half-synced product.
  // New retail variants start at 0 stock. Stock only reaches a shop through a
  // stock transfer, so nothing is created out of thin air.
  for (const fp of factoryProducts) {
    await prisma.$transaction(async (tx) => {
      // Match on barcode first (stable), then fall back to the product name.
      const barcodes = fp.variants.map((v) => v.barcode);
      const byBarcode = await tx.productVariant.findFirst({
        where: { shopCode: target.shopCode, barcode: { in: barcodes } },
        select: { productId: true },
      });
      let tp = byBarcode
        ? await tx.product.findUnique({ where: { id: byBarcode.productId } })
        : await tx.product.findFirst({
            where: { shopCode: target.shopCode, name: fp.name },
            orderBy: { createdAt: 'asc' },
          });

      if (!tp) {
        tp = await tx.product.create({
          data: {
            name: fp.name,
            description: fp.description,
            categoryId: fp.categoryId,
            shopCode: target.shopCode,
            isActive: fp.isActive,
            isListedOnWebsite: fp.isListedOnWebsite,
            images: { create: fp.images.map((img) => ({ url: img.url })) },
          },
        });
        productsCreated += 1;
        imagesCreated += fp.images.length;
      } else {
        await tx.product.update({
          where: { id: tp.id },
          data: {
            description: fp.description,
            categoryId: fp.categoryId,
            isActive: fp.isActive,
            isListedOnWebsite: fp.isListedOnWebsite,
          },
        });
        productsUpdated += 1;
      }

      const existing = await tx.productVariant.findMany({
        where: { shopCode: target.shopCode, productId: tp.id },
      });
      for (const fv of fp.variants) {
        const hit =
          existing.find((v) => v.barcode === fv.barcode) ??
          existing.find((v) => v.name === fv.name);
        if (hit) {
          const repairBarcode =
            !!fv.barcode &&
            hit.barcode !== fv.barcode &&
            UUID_LIKE.test(hit.barcode) &&
            !UUID_LIKE.test(fv.barcode);
          if (!hit.price.eq(fv.price)) pricesUpdated += 1;
          await tx.productVariant.update({
            where: { id: hit.id },
            data: {
              price: fv.price,
              costPrice: fv.costPrice,
              hsnCode: fv.hsnCode,
              taxRate: fv.taxRate,
              sku: fv.sku,
              unit: fv.unit,
              ...(repairBarcode ? { barcode: fv.barcode } : {}),
            },
          });
          variantsUpdated += 1;
        } else {
          await tx.productVariant.create({
            data: {
              productId: tp.id,
              shopCode: target.shopCode,
              name: fv.name,
              price: fv.price,
              costPrice: fv.costPrice,
              hsnCode: fv.hsnCode,
              taxRate: fv.taxRate,
              sku: fv.sku,
              unit: fv.unit,
              barcode: fv.barcode,
              quantity: 0,
            },
          });
          variantsCreated += 1;
        }
      }
    });
  }

  const batchSize = factoryProducts.length;
  const nextSkip = skip + batchSize;
  const completed = nextSkip >= totalFactoryProducts || batchSize === 0;

  return {
    factoryShopCode: factory.shopCode,
    targetShopCode: target.shopCode,
    factoryProductCount: totalFactoryProducts,
    productsCreated,
    productsUpdated,
    variantsCreated,
    variantsUpdated,
    pricesUpdated,
    imagesCreated,
    batchSize,
    nextSkip,
    completed,
  };
}

/**
 * Full catalog sync (CLI / scripts): runs batches in-process so there is no HTTP timeout.
 */
export async function syncFactoryCatalogToShop(
  prisma: PrismaClient,
  targetShopCode: string,
  batchSize: number = DEFAULT_BATCH,
): Promise<CatalogSyncResult> {
  const { factory, target } = await assertFactoryAndTarget(
    prisma,
    targetShopCode,
  );

  const totalFactoryProducts = await prisma.product.count({
    where: { shopCode: factory.shopCode },
  });

  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;
  let pricesUpdated = 0;
  let imagesCreated = 0;

  let skip = 0;
  while (skip < totalFactoryProducts) {
    const batch = await syncFactoryCatalogToShopBatch(
      prisma,
      targetShopCode,
      skip,
      batchSize,
    );
    productsCreated += batch.productsCreated;
    productsUpdated += batch.productsUpdated;
    variantsCreated += batch.variantsCreated;
    variantsUpdated += batch.variantsUpdated;
    pricesUpdated += batch.pricesUpdated;
    imagesCreated += batch.imagesCreated;
    skip = batch.nextSkip;
    if (batch.batchSize === 0) break;
  }

  return {
    factoryShopCode: factory.shopCode,
    targetShopCode: target.shopCode,
    factoryProductCount: totalFactoryProducts,
    productsCreated,
    productsUpdated,
    variantsCreated,
    variantsUpdated,
    pricesUpdated,
    imagesCreated,
  };
}
