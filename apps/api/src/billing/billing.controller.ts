import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@fluxen/database';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BillingService } from './billing.service';
import { CreateEnquiryDto } from './dto';

type Authed = User & { shop: { orgId: string } };
const authed = (req: Request) => req.user as Authed;

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Trial / plan state of the caller's business (drives the banner and the lock screen). */
  @Get('status')
  status(@Req() req: Request) {
    return this.billing.getStatus(authed(req).shop.orgId);
  }

  /** The owner asks to move to a paid plan; the operator is emailed and follows up. */
  @Post('enquiries')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createEnquiry(@Req() req: Request, @Body() dto: CreateEnquiryDto) {
    const u = authed(req);
    return this.billing.createEnquiry(u.shop.orgId, u.id, dto);
  }
}
