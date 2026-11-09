import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DecimalToNumberInterceptor } from './common/decimal-to-number.interceptor';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

/** Global pipes, interceptors, filters and route prefix. Shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication) {
  // Express defaults to 100 KB; a 1000-row catalog import is a few hundred KB of JSON.
  app.useBodyParser('json', { limit: '2mb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new DecimalToNumberInterceptor());
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
}
