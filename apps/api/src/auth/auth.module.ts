import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailModule } from '../email/email.module';
import { RedisService } from '../redis.provider';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';
import { ShopScopeGuard } from './shop-scope.guard';

@Module({
  imports: [
    EmailModule,
    // registerAsync so the secret is read after ConfigModule has loaded and validated .env
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RedisService,
    JwtAuthGuard,
    RolesGuard,
    ShopScopeGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    RedisService,
    JwtModule,
    JwtAuthGuard,
    RolesGuard,
    ShopScopeGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
