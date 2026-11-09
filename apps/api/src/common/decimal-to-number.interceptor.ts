import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@fluxen/database';
import { map, type Observable } from 'rxjs';

/**
 * Money and stock are stored as DECIMAL, which Prisma returns as Decimal objects
 * (serialised to strings by JSON.stringify). Clients expect plain numbers, so
 * convert them at the edge. Values are already rounded to 2/3 dp in the DB.
 */
function convert(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Prisma.Decimal.isDecimal(value)) return Number(value);
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(convert);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = convert(v);
  return out;
}

@Injectable()
export class DecimalToNumberInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(convert));
  }
}
