import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { BillingService } from './billing.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Still allowed when read-only: signing in/out, asking for a plan, and the operator area. */
const ALWAYS_ALLOWED = ['/api/auth/', '/api/billing/', '/api/operator/'];

/**
 * When a business's trial or plan has ended it becomes read-only: every request that
 * changes data is refused with 402, while reading and exporting keep working.
 * Runs after the auth guards, so only signed-in staff are affected; public routes
 * (the storefront, payment callbacks, signup) pass straight through.
 */
@Injectable()
export class ReadOnlyWhenExpiredInterceptor implements NestInterceptor {
  constructor(private readonly billing: BillingService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return next.handle();

    const orgId = (
      req.user as (User & { shop?: { orgId: string } }) | undefined
    )?.shop?.orgId;
    if (!orgId) return next.handle();

    const path = (req.originalUrl ?? req.url).split('?')[0];
    if (ALWAYS_ALLOWED.some((p) => path.startsWith(p))) return next.handle();

    const view = await this.billing.getView(orgId);
    if (view.readOnly) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: 'SUBSCRIPTION_EXPIRED',
          message:
            'Your free trial has ended, so this business is read-only. Request a plan to keep making changes.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return next.handle();
  }
}
