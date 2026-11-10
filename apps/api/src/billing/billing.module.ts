import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { OperatorController } from './operator.controller';
import { OperatorAuthGuard } from './operator.guard';
import { OperatorAuthService } from './operator-auth.service';
import { OperatorService } from './operator.service';
import { ReadOnlyWhenExpiredInterceptor } from './read-only.interceptor';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [BillingController, OperatorController],
  providers: [
    BillingService,
    OperatorService,
    OperatorAuthService,
    OperatorAuthGuard,
    // Global: makes expired businesses read-only on every route.
    { provide: APP_INTERCEPTOR, useClass: ReadOnlyWhenExpiredInterceptor },
  ],
})
export class BillingModule {}
