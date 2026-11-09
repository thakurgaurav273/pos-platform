import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.provider';
import { EmailService } from '../email/email.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

const SALT_ROUNDS = 10;

const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_LENGTH = 6;
// Wrong guesses allowed per OTP before it is discarded (a 6-digit code is otherwise brute-forceable).
const OTP_MAX_ATTEMPTS = 5;

/** Copy of a user row without the bcrypt hash, safe to return from an endpoint. */
function withoutPassword<T extends { password: string }>(
  user: T,
): Omit<T, 'password'> {
  const { password, ...rest } = user;
  void password;
  return rest;
}

const ROLE_MAP: Record<string, string> = {
  admin: 'ADMIN',
  super_admin: 'SUPER_ADMIN',
  manager: 'MANAGER',
  cashier: 'CASHIER',
  staff: 'STAFF',
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  async signIn(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !(await bcrypt.compare(pass, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // JwtAuthGuard rejects inactive users anyway; refuse here so they get a clear reason
    // instead of a token that fails on the first request.
    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your shop admin.',
      );
    }
    return this.issueSession(user);
  }

  /** Signs a session for an already-authenticated user (password stripped from the response). */
  async issueSession<T extends { id: string; password: string }>(user: T) {
    const payload = { sub: user.id };
    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
    });
    const refresh_token = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
    });
    return { user: withoutPassword(user), access_token, refresh_token };
  }

  /** Stores a fresh one-time code at `key` (clearing its miss counter) and returns it. */
  async issueOtp(key: string): Promise<string> {
    const otp = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
    await this.redis.set(key, otp, 'EX', OTP_TTL_SECONDS);
    await this.redis.del(`${key}:attempts`);
    return otp;
  }

  async sendResetPasswordEmailOTP(
    email: string,
  ): Promise<{ message: string; seconds_remaining?: number }> {
    const emailKey = email.toLowerCase().trim();

    // Enforce 60-second resend cooldown
    const cooldownKey = `otp:reset:cooldown:${emailKey}`;
    const cooldownTtl = await this.redis.ttl(cooldownKey);
    if (cooldownTtl > 0) {
      throw new HttpException(
        {
          message: 'Please wait before requesting another OTP.',
          seconds_remaining: cooldownTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { email: emailKey },
    });
    if (!user) {
      return {
        message: 'If an account exists, an OTP has been sent to your email.',
      };
    }

    const otp = Math.floor(Math.random() * Math.pow(10, OTP_LENGTH))
      .toString()
      .padStart(OTP_LENGTH, '0');

    await this.redis.set(`otp:reset:${emailKey}`, otp, 'EX', OTP_TTL_SECONDS);
    await this.redis.del(`otp:reset:${emailKey}:attempts`);
    await this.emailService.sendOtpEmail(email, otp);
    await this.redis.set(cooldownKey, '1', 'EX', 60);

    return {
      message: 'If an account exists, an OTP has been sent to your email.',
    };
  }

  async verifyResetPasswordOTP(
    email: string,
    otp: string,
  ): Promise<{ verified: true }> {
    const emailKey = email.toLowerCase().trim();
    if (!(await this.matchOtp(`otp:reset:${emailKey}`, otp))) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Consume the OTP and store a short-lived verified token (10 min)
    await this.redis.del(`otp:reset:${emailKey}`);
    await this.redis.set(`otp:reset:verified:${emailKey}`, '1', 'EX', 600);
    return { verified: true };
  }

  async resetPasswordVerified(
    email: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const emailKey = email.toLowerCase().trim();
    const isVerified = await this.redis.get(`otp:reset:verified:${emailKey}`);
    if (!isVerified) {
      throw new UnauthorizedException(
        'OTP not verified or session expired. Please restart.',
      );
    }
    if (newPassword.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }
    await this.redis.del(`otp:reset:verified:${emailKey}`);
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { email: emailKey },
      data: { password: hashedPassword },
    });
    return { message: 'Password reset successfully.' };
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<any> {
    const emailKey = email.toLowerCase().trim();
    if (!(await this.matchOtp(`otp:reset:${emailKey}`, otp))) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(`otp:reset:${emailKey}`);

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const user = await this.prisma.user.update({
      where: { email: emailKey },
      data: { password: hashedPassword },
    });

    const { password, ...result } = user;
    const payload = { sub: user.id };
    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
    });
    const refresh_token = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
    });
    return { user: result, access_token, refresh_token };
  }

  async sendChangePasswordEmailOTP(
    userId: string,
    oldPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    if (!(await bcrypt.compare(oldPassword, user.password))) {
      throw new HttpException(
        {
          message: 'Incorrect current password. Please try again.',
          code: 'WRONG_OLD_PASSWORD',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const otp = Math.floor(Math.random() * Math.pow(10, OTP_LENGTH))
      .toString()
      .padStart(OTP_LENGTH, '0');
    await this.redis.set(`otp:change:${user.id}`, otp, 'EX', OTP_TTL_SECONDS);
    await this.redis.del(`otp:change:${user.id}:attempts`);
    await this.emailService.sendOtpEmail(user.email, otp);
    return { message: 'OTP sent to your email.' };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    otp: string,
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    if (!(await bcrypt.compare(oldPassword, user.password)))
      throw new UnauthorizedException('Incorrect old password');

    if (!(await this.matchOtp(`otp:change:${user.id}`, otp))) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(`otp:change:${user.id}`);

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    return { message: 'Password changed successfully' };
  }

  /**
   * True when `otp` matches the code stored at `key`. Each miss is counted, and after
   * OTP_MAX_ATTEMPTS misses the code is deleted so the user has to request a new one.
   */
  async matchOtp(key: string, otp: string): Promise<boolean> {
    const storedOtp = await this.redis.get(key);
    if (storedOtp && storedOtp.trim() === String(otp ?? '').trim()) {
      await this.redis.del(`${key}:attempts`);
      return true;
    }
    if (storedOtp) {
      const attemptsKey = `${key}:attempts`;
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) await this.redis.expire(attemptsKey, OTP_TTL_SECONDS);
      if (attempts >= OTP_MAX_ATTEMPTS) await this.redis.del(key, attemptsKey);
    }
    return false;
  }

  private normalizeRole(
    role: string,
  ): 'ADMIN' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF' {
    const r = role.toLowerCase().replace(/-/g, '_');
    const mapped = ROLE_MAP[r] || role.toUpperCase().replace(/-/g, '_');
    const validRoles = ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'CASHIER', 'STAFF'];
    if (!validRoles.includes(mapped)) {
      throw new UnauthorizedException(`Invalid role: ${role}`);
    }
    return mapped as 'ADMIN' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  }

  async verifyOtp(email: string, otp: string) {
    const emailKey = email.toLowerCase().trim();
    if (!(await this.matchOtp(`otp:${emailKey}`, otp))) {
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redis.del(`otp:${emailKey}`);

    const user = await this.prisma.user.findFirst({
      where: { email },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const { password, ...result } = user;
    return result;
  }
  async register(
    email: string,
    password: string,
    shopCode: string,
    role: string,
  ) {
    try {
      const normalizedRole = this.normalizeRole(role);
      const shop = await this.prisma.shop.findUnique({
        where: { shopCode },
      });
      if (!shop) {
        throw new BadRequestException(`Shop with code ${shopCode} not found`);
      }
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          shopCode,
          role: normalizedRole,
        },
      });
      return { user: withoutPassword(user) };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.FORBIDDEN,
          error: 'User already exists',
        },
        HttpStatus.FORBIDDEN,
        {
          cause: error,
        },
      );
    }
  }

  async updateUser(
    email: string,
    password: string,
    shopCode: string,
    role: string,
    name: string,
  ) {
    const normalizedRole = this.normalizeRole(role);
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { password: hashedPassword, shopCode, role: normalizedRole, name },
    });
    if (!user) {
      throw new BadRequestException(`User with email ${email} not found`);
    }
    return withoutPassword(user);
  }
}
