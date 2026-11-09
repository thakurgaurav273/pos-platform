import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  FONT_STYLES,
  HEADER_STYLES,
  HEX_COLOUR,
  LOGO_HEIGHT,
  LOGO_URL_MAX_LENGTH,
  LOGO_WIDTH,
  RADIUS_STYLES,
  SIDEBAR_STYLES,
  THEME_MODES,
  THEME_PRESETS,
} from '../theme/shop-theme';

const HEX_MESSAGE = 'must be a 6-digit hex colour like #a84f1c';

export class ShopThemeConfigDto {
  @IsOptional()
  @IsIn([1])
  version?: 1;

  @IsIn(THEME_PRESETS)
  preset!: (typeof THEME_PRESETS)[number];

  @IsString()
  @Matches(HEX_COLOUR, { message: `primaryColor ${HEX_MESSAGE}` })
  primaryColor!: string;

  @IsString()
  @Matches(HEX_COLOUR, { message: `secondaryColor ${HEX_MESSAGE}` })
  secondaryColor!: string;

  @IsString()
  @Matches(HEX_COLOUR, { message: `accentColor ${HEX_MESSAGE}` })
  accentColor!: string;

  @IsIn(THEME_MODES)
  mode!: (typeof THEME_MODES)[number];

  @IsIn(SIDEBAR_STYLES)
  sidebarStyle!: (typeof SIDEBAR_STYLES)[number];

  @IsIn(HEADER_STYLES)
  headerStyle!: (typeof HEADER_STYLES)[number];

  @IsIn(RADIUS_STYLES)
  radius!: (typeof RADIUS_STYLES)[number];

  @IsIn(FONT_STYLES)
  font!: (typeof FONT_STYLES)[number];

  @IsOptional()
  @IsInt()
  @Min(LOGO_HEIGHT.min)
  @Max(LOGO_HEIGHT.max)
  logoHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(LOGO_WIDTH.min)
  @Max(LOGO_WIDTH.max)
  logoWidth?: number;
}

/**
 * `PATCH /shops/current/branding`. Omitted fields are left unchanged; `null` clears
 * the value (themeConfig: null restores the default theme, logoUrl: null removes the logo).
 */
export class UpdateShopBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(LOGO_URL_MAX_LENGTH)
  logoUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShopThemeConfigDto)
  themeConfig?: ShopThemeConfigDto | null;
}
