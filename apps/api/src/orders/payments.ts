import { BadRequestException } from '@nestjs/common';
import { PaymentLegMethod, PaymentMethod, Prisma } from '@fluxen/database';
import { dec, money, type DecimalLike } from '../common/money';

export type PaymentLegInput = { method: PaymentLegMethod; amount: DecimalLike };

export type ReconciledPayments = {
  legs: { method: PaymentLegMethod; amount: Prisma.Decimal }[];
  /** Order.paymentMethod: the single leg's method, or SPLIT. */
  paymentMethod: PaymentMethod;
  cashTendered: Prisma.Decimal | null;
  changeDue: Prisma.Decimal | null;
};

/**
 * POS payment policy. Legs must cover the bill total to the paisa; a short bill is
 * rejected (no credit sales). Only cash can be over-tendered: the customer hands over
 * cashTendered (>= the cash leg) and gets changeDue back. A cash leg larger than needed
 * is read the same way (excess = change). UPI and card are always exact.
 */
export function reconcilePayments(
  totalIn: DecimalLike,
  legsIn: PaymentLegInput[],
  cashTenderedIn?: DecimalLike | null,
): ReconciledPayments {
  const total = money(totalIn);
  if (legsIn.length === 0) {
    throw new BadRequestException('At least one payment is required');
  }
  const seen = new Set<PaymentLegMethod>();
  const legs = legsIn.map((l) => {
    if (seen.has(l.method)) {
      throw new BadRequestException(`${l.method} is listed more than once`);
    }
    seen.add(l.method);
    const amount = dec(l.amount);
    if (amount.lte(0) || !amount.eq(money(amount))) {
      throw new BadRequestException(
        'Payment amounts must be positive with at most 2 decimals',
      );
    }
    return { method: l.method, amount };
  });

  const paid = legs.reduce((s, l) => s.add(l.amount), dec(0));
  if (paid.lt(total)) {
    throw new BadRequestException(
      `Payment short by ₹${total.sub(paid).toFixed(2)}`,
    );
  }

  const cashLeg = legs.find((l) => l.method === PaymentLegMethod.CASH);
  let cashTendered =
    cashTenderedIn != null && cashTenderedIn !== ''
      ? dec(cashTenderedIn)
      : null;
  if (cashTendered && !cashLeg) {
    throw new BadRequestException(
      'Cash tendered was given but no cash payment is on the bill',
    );
  }
  if (cashTendered && !cashTendered.eq(money(cashTendered))) {
    throw new BadRequestException('Cash tendered must have at most 2 decimals');
  }

  const excess = paid.sub(total);
  if (excess.gt(0)) {
    // Over-payment is only allowed as cash change: the cash leg becomes what the bill
    // still needs and the handed-over cash is recorded as tendered.
    if (!cashLeg || cashLeg.amount.lte(excess)) {
      throw new BadRequestException(
        `Payments exceed the bill by ₹${excess.toFixed(2)}. Only cash can be over-paid (change is returned).`,
      );
    }
    cashTendered = cashTendered ?? cashLeg.amount;
    cashLeg.amount = cashLeg.amount.sub(excess);
  }

  let changeDue: Prisma.Decimal | null = null;
  if (cashLeg && cashTendered) {
    if (cashTendered.lt(cashLeg.amount)) {
      throw new BadRequestException(
        `Cash short by ₹${cashLeg.amount.sub(cashTendered).toFixed(2)}`,
      );
    }
    changeDue = cashTendered.sub(cashLeg.amount);
  }

  return {
    legs,
    paymentMethod:
      legs.length > 1 ? PaymentMethod.SPLIT : PaymentMethod[legs[0].method],
    cashTendered,
    changeDue,
  };
}
