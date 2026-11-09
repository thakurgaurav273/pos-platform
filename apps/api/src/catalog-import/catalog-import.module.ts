import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoryModule } from '../category/category.module';
import { ProductsModule } from '../products/products.module';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';

@Module({
  imports: [AuthModule, ProductsModule, CategoryModule],
  controllers: [CatalogImportController],
  providers: [CatalogImportService],
})
export class CatalogImportModule {}
