import { EnquiryStatus } from '@fluxen/database';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OperatorLoginDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

/** The short-lived token returned after a correct password. */
export class ChallengeDto {
  @IsString()
  @Length(10, 2000)
  challengeToken!: string;
}

export class ChallengeCodeDto extends ChallengeDto {
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Enter the 6-digit code from your authenticator app',
  })
  code!: string;
}

export class CreateEnquiryDto {
  @IsString()
  @Length(1, 120)
  contactName!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  plan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class ActivateDto {
  @IsString()
  @Length(1, 80)
  planName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months!: number;
}

export class ExtendTrialDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days!: number;
}

export class EnquiryStatusDto {
  @IsEnum(EnquiryStatus)
  status!: EnquiryStatus;
}
