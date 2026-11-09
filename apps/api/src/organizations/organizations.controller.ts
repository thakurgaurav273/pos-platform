import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OrganizationsService } from './organizations.service';
import { SignupDto } from './dto/signup.dto';
import { ResendSignupCodeDto, VerifySignupDto } from './dto/verify-signup.dto';
import { SignupRateLimitGuard } from './signup-rate-limit.guard';

function orgIdOf(req: Request): string {
  return (req.user as User & { shop: { orgId: string } }).shop.orgId;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** Public. Holds the signup and emails a verification code. */
  @Post('signup')
  @UseGuards(SignupRateLimitGuard)
  signUp(@Body() dto: SignupDto) {
    return this.orgs.startSignup(dto);
  }

  @Post('signup/resend')
  @UseGuards(SignupRateLimitGuard)
  resendCode(@Body() dto: ResendSignupCodeDto) {
    return this.orgs.resendSignupCode(dto.email);
  }

  /** Public. A correct code creates the business, its factory and the owner; returns a session. */
  @Post('signup/verify')
  verify(@Body() dto: VerifySignupDto) {
    return this.orgs.verifySignup(dto.email, dto.otp);
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  current(@Req() req: Request) {
    return this.orgs.getCurrent(orgIdOf(req));
  }

  @Post('current/complete-onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  complete(@Req() req: Request) {
    return this.orgs.completeOnboarding(orgIdOf(req));
  }
}
