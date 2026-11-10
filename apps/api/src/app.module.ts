import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { ProductsModule } from './products/products.module';
import { ShopsModule } from './shops/shops.module';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { UsersModule } from './users/users.module';
import { CategoryModule } from './category/category.module';
import { OrdersModule } from './orders/orders.module';
import { CustomersModule } from './customers/customers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RoleRequestsModule } from './role-requests/role-requests.module';
import { SettingsModule } from './settings/settings.module';
import { PublicModule } from './public/public.module';
import { PaymentModule } from './payment/payment.module';
import { StockTransfersModule } from './stock-transfers/stock-transfers.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CatalogImportModule } from './catalog-import/catalog-import.module';
import { DemoModule } from './demo/demo.module';
import { BillingModule } from './billing/billing.module';
import { validateEnv } from './common/env.validation';
import { KeepWarmService } from './keep-warm.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    PrismaModule,
    ShopsModule,
    ProductsModule,
    InventoryModule,
    AuthModule,
    UsersModule,
    CategoryModule,
    OrdersModule,
    CustomersModule,
    NotificationsModule,
    AnalyticsModule,
    RoleRequestsModule,
    SettingsModule,
    PublicModule,
    PaymentModule,
    StockTransfersModule,
    OrganizationsModule,
    CatalogImportModule,
    DemoModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [AppService, KeepWarmService],
})
export class AppModule {}
