import type { Prisma } from '@fluxen/database';

/**
 * Digits of a search term when it looks like (part of) a phone number, e.g.
 * "98765 43" -> "9876543". Null when the term has letters or fewer than 3 digits,
 * so a name search never degenerates into matching every phone.
 */
export function phoneDigitsQuery(q: string): string | null {
  const t = q.trim();
  if (/[a-z]/i.test(t)) return null;
  const digits = t.replace(/\D/g, '');
  return digits.length >= 3 ? digits : null;
}

/** Shop-scoped Customer filter: name contains `q` (any case) OR phone contains its digits. */
export function customerSearchWhere(
  shopCode: string,
  q: string | undefined,
): Prisma.CustomerWhereInput {
  const qt = q?.trim();
  if (!qt) return { shopCode };
  const digits = phoneDigitsQuery(qt);
  return {
    shopCode,
    OR: [
      { name: { contains: qt, mode: 'insensitive' } },
      ...(digits ? [{ phone: { contains: digits } }] : []),
    ],
  };
}

/** Order list search: customer name, customer phone (digits), bill number or legacy ref. */
export function orderSearchOr(q: string): Prisma.OrderWhereInput[] {
  const qt = q.trim();
  const digits = phoneDigitsQuery(qt);
  return [
    { customerName: { contains: qt, mode: 'insensitive' } },
    { customerPhone: { contains: digits ?? qt } },
    { billNo: { contains: qt, mode: 'insensitive' } },
    { legacyBillRef: { contains: qt, mode: 'insensitive' } },
    { id: { equals: qt } },
  ];
}
