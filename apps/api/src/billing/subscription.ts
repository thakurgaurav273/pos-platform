export const TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

export type SubscriptionState = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export type SubscriptionInput = {
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  trialEndsAt: Date | null;
  planName: string | null;
  paidUntil: Date | null;
};

export type SubscriptionView = {
  state: SubscriptionState;
  /** True once the trial or paid period has ended: the business can look but not change. */
  readOnly: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
  planName: string | null;
  /** Whole days left in the trial or paid period (rounded up); null when there is no end date. */
  daysLeft: number | null;
};

export function trialEndsFrom(start: Date, days = TRIAL_DAYS): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

const daysUntil = (end: Date, now: Date) =>
  Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));

/**
 * The one place that decides what state a business is in.
 *  - ACTIVE with no paidUntil never expires (grandfathered businesses, the shared demo).
 *  - ACTIVE with a past paidUntil is expired.
 *  - TRIALING is a trial until trialEndsAt, expired after (or if it has no end date).
 */
export function describeSubscription(
  org: SubscriptionInput,
  now: Date = new Date(),
): SubscriptionView {
  const base = {
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    paidUntil: org.paidUntil?.toISOString() ?? null,
    planName: org.planName,
  };

  if (org.subscriptionStatus === 'ACTIVE') {
    if (org.paidUntil && org.paidUntil <= now) {
      return { ...base, state: 'EXPIRED', readOnly: true, daysLeft: 0 };
    }
    return {
      ...base,
      state: 'ACTIVE',
      readOnly: false,
      daysLeft: org.paidUntil ? daysUntil(org.paidUntil, now) : null,
    };
  }

  if (org.trialEndsAt && org.trialEndsAt > now) {
    return {
      ...base,
      state: 'TRIAL',
      readOnly: false,
      daysLeft: daysUntil(org.trialEndsAt, now),
    };
  }
  return { ...base, state: 'EXPIRED', readOnly: true, daysLeft: 0 };
}
