import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShopThemeConfigDto } from './shop-theme.dto';
import { LOGO_URL_MAX_LENGTH } from '../theme/shop-theme';

class InventoryItemDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}

export class CreateShopWithInventoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  shopCode?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsNotEmpty()
  sourceShopCode!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  @IsOptional()
  initialInventory?: InventoryItemDto[];

  /** Branding step of the onboarding wizard (optional; skipped = default theme). */
  @IsOptional()
  @IsString()
  @MaxLength(LOGO_URL_MAX_LENGTH)
  logoUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShopThemeConfigDto)
  themeConfig?: ShopThemeConfigDto;
}
