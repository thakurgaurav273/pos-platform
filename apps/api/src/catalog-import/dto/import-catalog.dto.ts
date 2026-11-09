import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Rows per request. The dashboard refuses larger files before uploading. */
export const IMPORT_MAX_ROWS = 1000;

/**
 * One spreadsheet row as text, exactly as the dashboard read it. Only the shape is checked
 * here: the field rules (price range, decimals, units...) are applied per row by the import
 * service, so one bad cell fails that row instead of the whole upload.
 */
export class ImportProductRowDto {
  /** Spreadsheet row number, echoed back in the results. */
  @IsInt()
  @Min(1)
  row!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  costPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  quantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  hsnCode?: string;
}

export class ImportProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportProductRowDto)
  rows!: ImportProductRowDto[];

  /** Check every row and report what would happen, without saving. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ImportCategoryRowDto {
  @IsInt()
  @Min(1)
  row!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class ImportCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportCategoryRowDto)
  rows!: ImportCategoryRowDto[];

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
