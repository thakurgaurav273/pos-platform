import { BadRequestException } from '@nestjs/common';
import type { Prisma, StockMovementReason } from '@fluxen/database';
import { dec, qty, type DecimalLike } from './money';

type Tx = Prisma.TransactionClient;

export type StockChange = {
  variantId: string;
  shopCode: string;
  delta: DecimalLike;
  reason: StockMovementReason;
  refId?: string | null;
  userId?: string | null;
  note?: string | null;
  /** Allow the balance to go below zero (e.g. a pre-paid website booking). */
  allowNegative?: boolean;
  /** Used in the "insufficient stock" message. */
  label?: string;
};

/**
 * The only way stock should change. Applies the delta atomically (never below zero
 * unless allowed) and appends a StockMovement row. Must run inside a transaction.
 */
export async function applyStockChange(tx: Tx, c: StockChange) {
  const delta = qty(c.delta);
  if (delta.isZero()) return;

  const guard =
    delta.isNegative() && !c.allowNegative
      ? { quantity: { gte: delta.neg() } }
      : {};
  const res = await tx.productVariant.updateMany({
    where: { id: c.variantId, shopCode: c.shopCode, ...guard },
    data: { quantity: { increment: delta } },
  });
  if (res.count !== 1) {
    const exists = await tx.productVariant.findFirst({
      where: { id: c.variantId, shopCode: c.shopCode },
      select: { quantity: true },
    });
    if (!exists) {
      throw new BadRequestException('Item not found in this shop');
    }
    throw new BadRequestException(
      `Insufficient stock for ${c.label ?? 'item'}. Available: ${dec(exists.quantity).toString()}, needed: ${delta.neg().toString()}`,
    );
  }

  const after = await tx.productVariant.findUniqueOrThrow({
    where: { id: c.variantId },
    select: { quantity: true },
  });
  await tx.stockMovement.create({
    data: {
      shopCode: c.shopCode,
      variantId: c.variantId,
      reason: c.reason,
      delta,
      balance: after.quantity,
      refId: c.refId ?? null,
      userId: c.userId ?? null,
      note: c.note ?? null,
    },
  });
}

/** Gap-free counter (invoice series, barcodes, shop codes). Row-locked by the upsert. */
export async function nextSequence(tx: Tx, id: string): Promise<number> {
  const row = await tx.invoiceSequence.upsert({
    where: { id },
    update: { current: { increment: 1 } },
    create: { id, current: 1 },
  });
  return row.current;
}

/** Interactive transactions that touch many rows on a remote DB need more than Prisma's 5 s default. */
export const LONG_TX = { timeout: 20_000, maxWait: 10_000 } as const;
