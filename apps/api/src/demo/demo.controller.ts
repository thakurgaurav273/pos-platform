import {
  CanActivate,
  Controller,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DemoService } from './demo.service';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

/** Per-IP limiter for the public demo endpoint (in-memory, per instance). */
@Injectable()
export class DemoRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
      throw new HttpException(
        'Too many demo sessions from this network. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear();
    return true;
  }
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /** Public. Returns a session for the shared, pre-filled demo owner. */
  @Post('session')
  @UseGuards(DemoRateLimitGuard)
  session() {
    return this.demo.startSession();
  }
}
