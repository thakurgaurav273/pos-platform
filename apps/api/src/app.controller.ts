import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Liveness probe - no DB I/O. Use for Render health checks and uptime pings.
   * Path is `/health` (not under `/api`) so platforms can use a standard URL.
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'fluxen-pos-api',
      timestamp: new Date().toISOString(),
    };
  }

  /** Verify database connection */
  @Get('health/db')
  async checkDb() {
    const ok = await this.prisma.isHealthy();
    return {
      database: ok ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
