import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { OperatorAccount } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.provider';
import {
  decryptSecret,
  encryptSecret,
  generateSecret,
  operatorSessionSecret,
  otpauthUrl,
  verifyTotp,
} from './totp';

const ISSUER = 'Fluxen Admin';
const CHALLENGE_TTL = '5m';
const SESSION_TTL = '2h';
const SESSION_MINUTES = 120;
const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;
const failKey = (email: string) => `op:fail:${email}`;

// Compared when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/**
 * Admin-center sign-in: password, then an authenticator code (with a one-time QR
 * enrolment the first time). Wrong passwords and wrong codes share one counter, so five
 * misses lock the account for 15 minutes no matter which step was being guessed.
 */
@Injectable()
export class OperatorAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
  ) {}

  /** Step 1: email + password. Returns a short-lived token for step 2, never a session. */
  async login(email: string, password: string) {
    const key = email.toLowerCase().trim();
    await this.assertNotLocked(key);
    const op = await this.prisma.operatorAccount.findUnique({
      where: { email: key },
    });
    const ok = await bcrypt.compare(password, op?.passwordHash ?? DUMMY_HASH);
    if (!op || !ok || !op.isActive) {
      await this.recordFail(key);
      throw new UnauthorizedException('Wrong email or password.');
    }
    return {
      mode: op.totpEnabledAt ? ('verify' as const) : ('enroll' as const),
      challengeToken: await this.sign(op.id, 'challenge', CHALLENGE_TTL),
    };
  }

  /** First sign-in only: a fresh secret to scan into an authenticator app. */
  async startEnrol(challengeToken: string) {
    const op = await this.fromChallenge(challengeToken);
    if (op.totpEnabledAt) {
      throw new ConflictException(
        'An authenticator is already set up. Ask an administrator to reset it if you changed phones.',
      );
    }
    const secret = generateSecret();
    await this.prisma.operatorAccount.update({
      where: { id: op.id },
      data: { totpSecretEnc: encryptSecret(secret), lastUsedStep: null },
    });
    const url = otpauthUrl(op.email, secret, ISSUER);
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    return { secret, otpauthUrl: url, qrDataUrl };
  }

  /** The first valid code proves the app was set up correctly; it switches 2FA on. */
  async confirmEnrol(challengeToken: string, code: string) {
    const op = await this.fromChallenge(challengeToken);
    if (!op.totpSecretEnc || op.totpEnabledAt) {
      throw new BadRequestException('Start the authenticator setup first.');
    }
    await this.checkCode(op, code, true);
    return this.session(op);
  }

  /** Step 2 for everyone after enrolment. */
  async verify(challengeToken: string, code: string) {
    const op = await this.fromChallenge(challengeToken);
    if (!op.totpEnabledAt) {
      throw new BadRequestException('Set up your authenticator first.');
    }
    await this.checkCode(op, code, false);
    return this.session(op);
  }

  me(op: OperatorAccount) {
    return { id: op.id, email: op.email, name: op.name };
  }

  // ---------------------------------------------------------------- internals

  private async session(op: OperatorAccount) {
    await this.prisma.operatorAccount.update({
      where: { id: op.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      token: await this.sign(op.id, 'session', SESSION_TTL),
      expiresInMinutes: SESSION_MINUTES,
      operator: this.me(op),
    };
  }

  private sign(sub: string, op: 'challenge' | 'session', expiresIn: string) {
    return this.jwt.signAsync(
      { sub, op },
      { secret: operatorSessionSecret(), expiresIn: expiresIn as never },
    );
  }

  private async fromChallenge(token: string): Promise<OperatorAccount> {
    const expired = new UnauthorizedException(
      'That sign-in step expired. Please start again.',
    );
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; op: string }>(token, {
        secret: operatorSessionSecret(),
      });
      if (p.op !== 'challenge') throw new Error('wrong token type');
      const op = await this.prisma.operatorAccount.findUnique({
        where: { id: p.sub },
      });
      if (!op?.isActive) throw new Error('inactive');
      return op;
    } catch {
      throw expired;
    }
  }

  private async assertNotLocked(email: string) {
    const fails = Number((await this.redis.get(failKey(email))) ?? 0);
    if (fails >= MAX_FAILS) {
      const ttl = await this.redis.ttl(failKey(email));
      throw new HttpException(
        `Too many wrong attempts. Try again in ${Math.max(1, Math.ceil(ttl / 60))} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFail(email: string) {
    const n = await this.redis.incr(failKey(email));
    if (n === 1) await this.redis.expire(failKey(email), LOCK_SECONDS);
  }

  private async checkCode(
    op: OperatorAccount,
    code: string,
    enabling: boolean,
  ) {
    await this.assertNotLocked(op.email);
    const step = op.totpSecretEnc
      ? verifyTotp(
          decryptSecret(op.totpSecretEnc),
          code,
          Date.now(),
          op.lastUsedStep,
        )
      : null;
    // The step condition makes "use each code once" hold even if two requests with the
    // same code arrive together.
    const used =
      step === null
        ? { count: 0 }
        : await this.prisma.operatorAccount.updateMany({
            where: {
              id: op.id,
              OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
            },
            data: {
              lastUsedStep: step,
              ...(enabling ? { totpEnabledAt: new Date() } : {}),
            },
          });
    if (used.count !== 1) {
      await this.recordFail(op.email);
      throw new UnauthorizedException(
        'That code is wrong or has already been used. Wait for the next one and try again.',
      );
    }
    await this.redis.del(failKey(op.email));
  }
}
