import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { CreateEnquiryDto } from './dto';
import { describeSubscription, type SubscriptionView } from './subscription';

const CACHE_MS = 15_000;
const MAX_ENQUIRIES_PER_DAY = 3;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly cache = new Map<
    string,
    { view: SubscriptionView; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Subscription state for a business; cached briefly because every write request asks. */
  async getView(orgId: string): Promise<SubscriptionView> {
    const hit = this.cache.get(orgId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.view;
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        subscriptionStatus: true,
        trialEndsAt: true,
        planName: true,
        paidUntil: true,
      },
    });
    const view = describeSubscription(org);
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(orgId, { view, at: Date.now() });
    return view;
  }

  /**
   * Who is told about a new plan request: PLAN_ENQUIRY_TO (comma-separated) when set,
   * otherwise every active operator.
   */
  private async notifyRecipients(): Promise<string[]> {
    const configured = (process.env.PLAN_ENQUIRY_TO ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (configured.length > 0) return configured;
    const rows = await this.prisma.operatorAccount.findMany({
      where: { isActive: true },
      select: { email: true },
    });
    return rows.map((r) => r.email);
  }

  invalidate(orgId: string) {
    this.cache.delete(orgId);
  }

  async getStatus(orgId: string) {
    const [view, open] = await Promise.all([
      this.getView(orgId),
      this.prisma.planEnquiry.findFirst({
        where: { orgId, status: { in: ['OPEN', 'CONTACTED'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true },
      }),
    ]);
    return { ...view, openEnquiry: open };
  }

  async createEnquiry(orgId: string, userId: string, dto: CreateEnquiryDto) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.planEnquiry.count({
      where: { orgId, createdAt: { gte: since } },
    });
    if (recent >= MAX_ENQUIRIES_PER_DAY) {
      throw new HttpException(
        'You have already sent a few requests today. We will get back to you soon.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const enquiry = await this.prisma.planEnquiry.create({
      data: {
        orgId,
        userId,
        contactName: dto.contactName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        plan: dto.plan?.trim() || null,
        message: dto.message?.trim() || null,
      },
      include: { organization: { select: { name: true } } },
    });

    // The request is saved either way; a failed email must not lose it.
    const to = await this.notifyRecipients();
    try {
      await this.email.sendPlanEnquiryAckEmail(enquiry.email, {
        contactName: enquiry.contactName,
        businessName: enquiry.organization.name,
        plan: enquiry.plan,
      });
    } catch (e) {
      this.logger.error(
        `Plan enquiry ${enquiry.id} saved but the acknowledgement email failed: ${(e as Error).message}`,
      );
    }
    if (to.length > 0) {
      try {
        await this.email.sendPlanEnquiryEmail(to, {
          businessName: enquiry.organization.name,
          contactName: enquiry.contactName,
          email: enquiry.email,
          phone: enquiry.phone,
          plan: enquiry.plan,
          message: enquiry.message,
        });
      } catch (e) {
        this.logger.error(
          `Plan enquiry ${enquiry.id} saved but the notification email failed: ${(e as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `Plan enquiry ${enquiry.id} saved; PLAN_ENQUIRY_TO is empty and no operator account exists, so nobody was notified.`,
      );
    }

    return {
      id: enquiry.id,
      status: enquiry.status,
      createdAt: enquiry.createdAt,
    };
  }
}
