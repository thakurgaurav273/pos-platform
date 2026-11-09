import { Prisma } from '@fluxen/database';

export type DecimalLike = Prisma.Decimal | number | string;

export function dec(v: DecimalLike | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(v ?? 0);
}

/** Rupees, rounded half-up to paise. */
export function money(v: DecimalLike): Prisma.Decimal {
  return dec(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Stock quantity, rounded to 3 dp (grams for KG items). */
export function qty(v: DecimalLike): Prisma.Decimal {
  return dec(v).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

export function num(v: DecimalLike | null | undefined): number {
  return v == null ? 0 : Number(v);
}

/** Tax contained in a GST-inclusive amount: amount × r / (100 + r). */
export function inclusiveTax(amount: DecimalLike, ratePercent: DecimalLike) {
  const r = dec(ratePercent);
  if (r.lte(0)) return dec(0);
  return money(dec(amount).mul(r).div(r.add(100)));
}

/**
 * Price policy for catalog prices and manual bill lines: ₹0.01 to ₹10,00,000, at most
 * 2 decimals. Zero, negative, over-long or sub-paise prices are rejected (400), never
 * rounded silently. Cost price may be 0. Mirrored in apps/dashboard/src/lib/catalogFields.ts.
 */
export const PRICE_MIN = 0.01;
export const PRICE_MAX = 1_000_000;
/** Largest bill a single POS sale may total; keeps totals well inside Decimal(12, 2). */
export const BILL_TOTAL_MAX = 10_000_000;
