import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { OperatorAccount } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { operatorSessionSecret } from './totp';

export type OperatorRequest = Request & { operator: OperatorAccount };

/**
 * Admin-center sessions are separate from shop logins: a Bearer token signed with the
 * operator secret, issued only after password + authenticator code. A shop user's
 * token can never pass this guard.
 */
@Injectable()
export class OperatorAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<OperatorRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in to the admin center.');
    }
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; op: string }>(
        header.slice(7),
        { secret: operatorSessionSecret() },
      );
      if (p.op !== 'session') throw new Error('not a session token');
      const operator = await this.prisma.operatorAccount.findUnique({
        where: { id: p.sub },
      });
      if (!operator?.isActive) throw new Error('inactive');
      req.operator = operator;
      return true;
    } catch {
      throw new UnauthorizedException(
        'Your admin session has expired. Please sign in again.',
      );
    }
  }
}
