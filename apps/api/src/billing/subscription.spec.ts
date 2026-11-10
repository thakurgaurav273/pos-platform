import {
  addMonths,
  describeSubscription,
  TRIAL_DAYS,
  trialEndsFrom,
} from './subscription';

const DAY = 86_400_000;
const now = new Date('2026-11-10T12:00:00Z');

const trialing = (trialEndsAt: Date | null) => ({
  subscriptionStatus: 'TRIALING' as const,
  trialEndsAt,
  planName: null,
  paidUntil: null,
});
const active = (paidUntil: Date | null) => ({
  subscriptionStatus: 'ACTIVE' as const,
  trialEndsAt: null,
  planName: 'Standard',
  paidUntil,
});

describe('subscription state', () => {
  it('a new trial lasts 14 days', () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(trialEndsFrom(now).getTime() - now.getTime()).toBe(14 * DAY);
  });

  it('is a trial while the end date is in the future', () => {
    const v = describeSubscription(trialing(trialEndsFrom(now)), now);
    expect(v).toMatchObject({ state: 'TRIAL', readOnly: false, daysLeft: 14 });
  });

  it('counts a partial day as a whole day left', () => {
    const v = describeSubscription(
      trialing(new Date(now.getTime() + DAY / 2)),
      now,
    );
    expect(v).toMatchObject({ state: 'TRIAL', daysLeft: 1 });
  });

  it('becomes read-only the moment the trial ends', () => {
    const v = describeSubscription(trialing(now), now);
    expect(v).toMatchObject({ state: 'EXPIRED', readOnly: true, daysLeft: 0 });
  });

  it('treats a trial with no end date as expired', () => {
    expect(describeSubscription(trialing(null), now).readOnly).toBe(true);
  });

  it('never expires an active business with no paid-until date (grandfathered, demo)', () => {
    const farFuture = new Date('2046-01-01T00:00:00Z');
    const v = describeSubscription(active(null), farFuture);
    expect(v).toMatchObject({
      state: 'ACTIVE',
      readOnly: false,
      daysLeft: null,
    });
  });

  it('is active until the paid-until date, then read-only', () => {
    const until = new Date(now.getTime() + 30 * DAY);
    expect(describeSubscription(active(until), now)).toMatchObject({
      state: 'ACTIVE',
      readOnly: false,
      daysLeft: 30,
    });
    expect(
      describeSubscription(active(until), new Date(until.getTime() + 1)),
    ).toMatchObject({ state: 'EXPIRED', readOnly: true });
  });

  it('adds calendar months', () => {
    expect(addMonths(new Date('2026-01-15T00:00:00Z'), 3).toISOString()).toBe(
      '2026-04-15T00:00:00.000Z',
    );
  });
});
