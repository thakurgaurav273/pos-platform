import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { ShopsModule } from '../shops/shops.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { SignupRateLimitGuard } from './signup-rate-limit.guard';

@Module({
  imports: [AuthModule, EmailModule, ShopsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, SignupRateLimitGuard],
})
export class OrganizationsModule {}
