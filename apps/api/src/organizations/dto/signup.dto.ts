import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsOptional,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SignupDto {
  /** Business name, e.g. "Mithai Mahal". Also names the first (factory) location. */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** bcrypt truncates at 72 bytes, so cap there instead of silently ignoring the tail. */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^$|^[6-9]\d{9}$/, {
    message: 'Enter a 10-digit Indian mobile number',
  })
  phone?: string;
}
