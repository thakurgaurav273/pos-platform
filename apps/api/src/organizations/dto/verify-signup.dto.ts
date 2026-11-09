import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ResendSignupCodeDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;
}

export class VerifySignupDto extends ResendSignupCodeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  otp!: string;
}
