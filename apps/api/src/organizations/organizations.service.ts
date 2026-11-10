import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.provider';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { ShopsService } from '../shops/shops.service';
import { SignupDto } from './dto/signup.dto';
import { trialEndsFrom } from '../billing/subscription';

const SALT_ROUNDS = 10;
const PENDING_TTL_SECONDS = 30 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

/** Signup details held in Redis until the email is confirmed (password already hashed). */
type PendingSignup = {
  businessName: string;
  name: string;
  email: string;
  phone: string | null;
  password: string;
};

const pendingKey = (email: string) => `signup:pending:${email}`;
const otpKey = (email: string) => `otp:signup:${email}`;
const cooldownKey = (email: string) => `otp:signup:cooldown:${email}`;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopsService,
    private readonly auth: AuthService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  /**
   * Self-serve signup, step 1: hold the details for PENDING_TTL_SECONDS and email
   * a code. Nothing is written to the database until the email is confirmed.
   */
  async startSignup(dto: SignupDto) {
    await this.assertEmailFree(dto.email);
    const pending: PendingSignup = {
      businessName: dto.businessName,
      name: dto.name,
      email: dto.email,
      phone: dto.phone || null,
      password: await bcrypt.hash(dto.password, SALT_ROUNDS),
    };
    await this.redis.set(
      pendingKey(dto.email),
      JSON.stringify(pending),
      'EX',
      PENDING_TTL_SECONDS,
    );
    // Re-submitting within the cooldown keeps the code already sent.
    const cooldown = await this.redis.ttl(cooldownKey(dto.email));
    if (cooldown > 0) {
      return { email: dto.email, resendInSeconds: cooldown };
    }
    return this.sendCode(pending);
  }

  async resendSignupCode(email: string) {
    const pending = await this.loadPending(email);
    const cooldown = await this.redis.ttl(cooldownKey(email));
    if (cooldown > 0) {
      throw new HttpException(
        {
          message: `Please wait ${cooldown}s before requesting another code.`,
          seconds_remaining: cooldown,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.sendCode(pending);
  }

  /**
   * Step 2: a correct code creates the organization, its factory (the central
   * kitchen / warehouse) and the SUPER_ADMIN owner, then returns a session.
   * Nothing here touches another organization's data.
   */
  async verifySignup(email: string, otp: string) {
    const pending = await this.loadPending(email);
    if (!(await this.auth.matchOtp(otpKey(email), otp))) {
      throw new UnauthorizedException(
        'That code is wrong or has expired. Check the latest email or send a new code.',
      );
    }
    await this.redis.del(otpKey(email));
    await this.assertEmailFree(email);

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: pending.businessName,
            subscriptionStatus: 'TRIALING',
            trialEndsAt: trialEndsFrom(new Date()),
          },
        });
        const shopCode = await this.shops.generateShopCode(tx);
        await tx.shop.create({
          data: {
            orgId: org.id,
            shopCode,
            name: `${pending.businessName} Factory`,
            isFactory: true,
            phone: pending.phone,
            email: pending.email,
          },
        });
        return tx.user.create({
          data: {
            email: pending.email,
            password: pending.password,
            name: pending.name,
            phone: pending.phone,
            role: UserRole.SUPER_ADMIN,
            shopCode,
          },
        });
      });
    } catch (e) {
      // Two simultaneous verifications for one email: the unique index decides.
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw e;
    }
    await this.redis.del(pendingKey(email), cooldownKey(email));
    return this.auth.issueSession(user);
  }

  private async sendCode(pending: PendingSignup) {
    const otp = await this.auth.issueOtp(otpKey(pending.email));
    try {
      await this.email.sendSignupVerificationEmail(
        pending.email,
        pending.name,
        otp,
      );
    } catch (e) {
      await this.redis.del(otpKey(pending.email));
      this.logger.error(
        `Signup verification email to ${pending.email} failed: ${(e as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'We could not send the verification email. Please try again in a moment.',
      );
    }
    await this.redis.set(
      cooldownKey(pending.email),
      '1',
      'EX',
      RESEND_COOLDOWN_SECONDS,
    );
    return { email: pending.email, resendInSeconds: RESEND_COOLDOWN_SECONDS };
  }

  private async loadPending(email: string): Promise<PendingSignup> {
    const raw = await this.redis.get(pendingKey(email));
    if (!raw) {
      throw new GoneException(
        'This signup has expired. Please fill in the form again.',
      );
    }
    return JSON.parse(raw) as PendingSignup;
  }

  private async assertEmailFree(email: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
  }

  async getCurrent(orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        onboardingCompletedAt: true,
        _count: { select: { shops: true } },
      },
    });
    return {
      id: org.id,
      name: org.name,
      onboardingCompleted: org.onboardingCompletedAt !== null,
      shopCount: org._count.shops,
    };
  }

  async completeOnboarding(orgId: string) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { onboardingCompletedAt: new Date() },
    });
    return this.getCurrent(orgId);
  }
}
