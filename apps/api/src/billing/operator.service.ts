import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { EnquiryStatus } from '@fluxen/database';
import { PrismaService } from '../prisma.service';
import { DEMO_EMAILS, isDemoEmail } from '../demo/demo.constants';
import { ActivateDto } from './dto';
import { BillingService } from './billing.service';
import {
  addMonths,
  describeSubscription,
  trialEndsFrom,
  type SubscriptionState,
} from './subscription';

const DAY = 86_400_000;
const num = (d: unknown) => (d == null ? 0 : Number(d));

/** Reads and actions for the admin center. Callers are already authenticated operators. */
@Injectable()
export class OperatorService {
  private readonly logger = new Logger(OperatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ----------------------------------------------------------------- helpers

  /** Businesses that belong to the shared demo (excluded from the numbers). */
  private async demoOrgIds(): Promise<Set<string>> {
    const rows = await this.prisma.user.findMany({
      where: { email: { in: [...DEMO_EMAILS] } },
      select: { shop: { select: { orgId: true } } },
    });
    return new Set(rows.map((r) => r.shop.orgId));
  }

  /** Per-shop counts and sales, keyed by shop code. */
  private async shopStats(codes: string[], since: Date) {
    const base = { shopCode: { in: codes } };
    const [users, orders, recent, products, customers] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['shopCode'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['shopCode'],
        where: { ...base, status: 'PAID' },
        _count: { _all: true },
        _sum: { totalAmount: true },
        _max: { createdAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['shopCode'],
        where: { ...base, status: 'PAID', createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.product.groupBy({
        by: ['shopCode'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.customer.groupBy({
        by: ['shopCode'],
        where: base,
        _count: { _all: true },
      }),
    ]);
    const by = <T extends { shopCode: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.shopCode, r]));
    return {
      users: by(users),
      orders: by(orders),
      recent: by(recent),
      products: by(products),
      customers: by(customers),
    };
  }

  // ---------------------------------------------------------------- overview

  async overview() {
    const now = new Date();
    const [orgs, demo, openEnquiries, recentEnquiries] = await Promise.all([
      this.prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          createdAt: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          planName: true,
          paidUntil: true,
        },
      }),
      this.demoOrgIds(),
      this.prisma.planEnquiry.count({ where: { status: 'OPEN' } }),
      this.prisma.planEnquiry.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { organization: { select: { id: true, name: true } } },
      }),
    ]);

    const rows = orgs
      .filter((o) => !demo.has(o.id))
      .map((o) => ({ o, view: describeSubscription(o, now) }));
    const count = (s: SubscriptionState) =>
      rows.filter((r) => r.view.state === s).length;
    const since = (days: number) => new Date(now.getTime() - days * DAY);

    const expiringSoon = rows
      .filter(
        (r) =>
          (r.view.state === 'TRIAL' ||
            (r.view.state === 'ACTIVE' && r.o.paidUntil)) &&
          r.view.daysLeft !== null &&
          r.view.daysLeft <= 7,
      )
      .sort((a, b) => (a.view.daysLeft ?? 0) - (b.view.daysLeft ?? 0))
      .slice(0, 8)
      .map((r) => ({
        id: r.o.id,
        name: r.o.name,
        state: r.view.state,
        daysLeft: r.view.daysLeft,
        endsAt: r.view.state === 'TRIAL' ? r.o.trialEndsAt : r.o.paidUntil,
      }));

    return {
      totals: {
        businesses: rows.length,
        trial: count('TRIAL'),
        active: count('ACTIVE'),
        expired: count('EXPIRED'),
        newLast7: rows.filter((r) => r.o.createdAt >= since(7)).length,
        newLast30: rows.filter((r) => r.o.createdAt >= since(30)).length,
        openEnquiries,
      },
      expiringSoon,
      recentSignups: rows.slice(0, 6).map((r) => ({
        id: r.o.id,
        name: r.o.name,
        createdAt: r.o.createdAt,
        state: r.view.state,
      })),
      recentEnquiries,
    };
  }

  // -------------------------------------------------------------- businesses

  async listOrganizations(search?: string, state?: SubscriptionState) {
    const q = search?.trim();
    const orgs = await this.prisma.organization.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              {
                shops: {
                  some: {
                    users: {
                      some: { email: { contains: q, mode: 'insensitive' } },
                    },
                  },
                },
              },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        planName: true,
        paidUntil: true,
        shops: {
          select: {
            shopCode: true,
            users: {
              where: { role: 'SUPER_ADMIN' },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { email: true, name: true, phone: true },
            },
          },
        },
      },
    });

    const codes = orgs.flatMap((o) => o.shops.map((s) => s.shopCode));
    const stats = await this.shopStats(codes, new Date(Date.now() - 30 * DAY));

    return orgs
      .map((o) => {
        const owner = o.shops.flatMap((s) => s.users)[0] ?? null;
        const sum = (f: (code: string) => number) =>
          o.shops.reduce((t, s) => t + f(s.shopCode), 0);
        return {
          id: o.id,
          name: o.name,
          createdAt: o.createdAt,
          shopCount: o.shops.length,
          userCount: sum((c) => stats.users.get(c)?._count._all ?? 0),
          orders30d: sum((c) => stats.recent.get(c)?._count._all ?? 0),
          revenue30d: sum((c) => num(stats.recent.get(c)?._sum.totalAmount)),
          owner,
          isDemo: isDemoEmail(owner?.email),
          ...describeSubscription(o),
        };
      })
      .filter((r) => !state || r.state === state);
  }

  async organizationDetail(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        shops: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            shopCode: true,
            name: true,
            isFactory: true,
            city: true,
            state: true,
            phone: true,
            email: true,
            gstNumber: true,
            createdAt: true,
          },
        },
        enquiries: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!org) throw new NotFoundException('Business not found');

    const codes = org.shops.map((s) => s.shopCode);
    const [users, stats, demoCount] = await Promise.all([
      this.prisma.user.findMany({
        where: { shopCode: { in: codes } },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          shopCode: true,
          createdAt: true,
        },
      }),
      this.shopStats(codes, new Date(Date.now() - 30 * DAY)),
      this.prisma.user.count({
        where: { email: { in: [...DEMO_EMAILS] }, shop: { orgId: id } },
      }),
    ]);

    const shops = org.shops.map((s) => ({
      ...s,
      users: stats.users.get(s.shopCode)?._count._all ?? 0,
      products: stats.products.get(s.shopCode)?._count._all ?? 0,
      customers: stats.customers.get(s.shopCode)?._count._all ?? 0,
      orders: stats.orders.get(s.shopCode)?._count._all ?? 0,
      revenue: num(stats.orders.get(s.shopCode)?._sum.totalAmount),
      lastOrderAt: stats.orders.get(s.shopCode)?._max.createdAt ?? null,
      orders30d: stats.recent.get(s.shopCode)?._count._all ?? 0,
      revenue30d: num(stats.recent.get(s.shopCode)?._sum.totalAmount),
    }));
    const total = (f: (s: (typeof shops)[number]) => number) =>
      shops.reduce((t, s) => t + f(s), 0);

    return {
      id: org.id,
      name: org.name,
      createdAt: org.createdAt,
      onboardingCompletedAt: org.onboardingCompletedAt,
      isDemo: demoCount > 0,
      subscription: describeSubscription(org),
      owner: users.find((u) => u.role === 'SUPER_ADMIN') ?? null,
      totals: {
        shops: shops.length,
        users: users.length,
        products: total((s) => s.products),
        customers: total((s) => s.customers),
        orders: total((s) => s.orders),
        revenue: total((s) => s.revenue),
        orders30d: total((s) => s.orders30d),
        revenue30d: total((s) => s.revenue30d),
      },
      shops,
      users,
      enquiries: org.enquiries,
    };
  }

  // ----------------------------------------------------------------- actions

  private async loadEditableOrg(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new NotFoundException('Business not found');
    const demoUsers = await this.prisma.user.count({
      where: { email: { in: [...DEMO_EMAILS] }, shop: { orgId } },
    });
    if (demoUsers > 0) {
      throw new BadRequestException(
        'The shared demo business cannot be changed.',
      );
    }
    return org;
  }

  private async result(orgId: string) {
    this.billing.invalidate(orgId);
    const o = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    return { id: o.id, ...describeSubscription(o) };
  }

  /** Marks a business as paid for `months` more months (stacking on any time already left). */
  async activate(orgId: string, dto: ActivateDto, operator: string) {
    const org = await this.loadEditableOrg(orgId);
    if (org.subscriptionStatus === 'ACTIVE' && !org.paidUntil) {
      throw new BadRequestException(
        'This business has no expiry (it was active before trials existed), so there is nothing to activate.',
      );
    }
    const now = new Date();
    const from =
      org.subscriptionStatus === 'ACTIVE' &&
      org.paidUntil &&
      org.paidUntil > now
        ? org.paidUntil
        : now;
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: 'ACTIVE',
        planName: dto.planName.trim(),
        paidUntil: addMonths(from, dto.months),
      },
    });
    this.logger.log(
      `operator ${operator} activated org ${orgId}: ${dto.planName} for ${dto.months} month(s)`,
    );
    return this.result(orgId);
  }

  async extendTrial(orgId: string, days: number, operator: string) {
    const org = await this.loadEditableOrg(orgId);
    if (describeSubscription(org).state === 'ACTIVE') {
      throw new BadRequestException(
        'This business is on an active plan; extending a trial does not apply.',
      );
    }
    const now = new Date();
    const from =
      org.subscriptionStatus === 'TRIALING' &&
      org.trialEndsAt &&
      org.trialEndsAt > now
        ? org.trialEndsAt
        : now;
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: 'TRIALING',
        trialEndsAt: trialEndsFrom(from, days),
        paidUntil: null,
      },
    });
    this.logger.log(
      `operator ${operator} extended trial of org ${orgId} by ${days} day(s)`,
    );
    return this.result(orgId);
  }

  /** Ends access immediately: the business becomes read-only until activated again. */
  async revoke(orgId: string, operator: string) {
    await this.loadEditableOrg(orgId);
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(),
        paidUntil: null,
      },
    });
    this.logger.log(`operator ${operator} revoked org ${orgId}`);
    return this.result(orgId);
  }

  // --------------------------------------------------------------- enquiries

  listEnquiries(status?: EnquiryStatus) {
    return this.prisma.planEnquiry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { organization: { select: { id: true, name: true } } },
    });
  }

  async setEnquiryStatus(id: string, status: EnquiryStatus) {
    const found = await this.prisma.planEnquiry.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Enquiry not found');
    return this.prisma.planEnquiry.update({ where: { id }, data: { status } });
  }
}
