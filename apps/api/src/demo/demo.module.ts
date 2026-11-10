import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemoController, DemoRateLimitGuard } from './demo.controller';
import { DemoSeederService } from './demo-seeder.service';
import { DemoService } from './demo.service';

@Module({
  imports: [AuthModule],
  controllers: [DemoController],
  providers: [DemoService, DemoSeederService, DemoRateLimitGuard],
})
export class DemoModule {}
