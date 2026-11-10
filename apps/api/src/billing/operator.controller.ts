import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { EnquiryStatus } from '@fluxen/database';
import type { Request } from 'express';
import {
  ActivateDto,
  ChallengeCodeDto,
  ChallengeDto,
  EnquiryStatusDto,
  ExtendTrialDto,
  OperatorLoginDto,
} from './dto';
import { OperatorAuthGuard, type OperatorRequest } from './operator.guard';
import { OperatorAuthService } from './operator-auth.service';
import { OperatorService } from './operator.service';
import type { SubscriptionState } from './subscription';

const who = (req: Request) => (req as OperatorRequest).operator;

/**
 * The admin center API. Sign-in is three steps (password, then an authenticator code, with
 * a first-time QR enrolment); everything else needs the resulting operator session token.
 */
@Controller('operator')
export class OperatorController {
  constructor(
    private readonly auth: OperatorAuthService,
    private readonly operator: OperatorService,
  ) {}

  // ---- sign-in (public) ----

  @Post('auth/login')
  login(@Body() dto: OperatorLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('auth/enroll/start')
  enrollStart(@Body() dto: ChallengeDto) {
    return this.auth.startEnrol(dto.challengeToken);
  }

  @Post('auth/enroll/confirm')
  enrollConfirm(@Body() dto: ChallengeCodeDto) {
    return this.auth.confirmEnrol(dto.challengeToken, dto.code);
  }

  @Post('auth/verify')
  verify(@Body() dto: ChallengeCodeDto) {
    return this.auth.verify(dto.challengeToken, dto.code);
  }

  // ---- everything below needs an operator session ----

  @Get('me')
  @UseGuards(OperatorAuthGuard)
  me(@Req() req: Request) {
    return this.auth.me(who(req));
  }

  @Get('overview')
  @UseGuards(OperatorAuthGuard)
  overview() {
    return this.operator.overview();
  }

  @Get('organizations')
  @UseGuards(OperatorAuthGuard)
  organizations(
    @Query('search') search?: string,
    @Query('state') state?: SubscriptionState,
  ) {
    return this.operator.listOrganizations(search, state);
  }

  @Get('organizations/:id')
  @UseGuards(OperatorAuthGuard)
  organization(@Param('id') id: string) {
    return this.operator.organizationDetail(id);
  }

  @Post('organizations/:id/activate')
  @UseGuards(OperatorAuthGuard)
  activate(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ActivateDto,
  ) {
    return this.operator.activate(id, dto, who(req).email);
  }

  @Post('organizations/:id/extend-trial')
  @UseGuards(OperatorAuthGuard)
  extendTrial(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ExtendTrialDto,
  ) {
    return this.operator.extendTrial(id, dto.days, who(req).email);
  }

  @Post('organizations/:id/revoke')
  @UseGuards(OperatorAuthGuard)
  revoke(@Req() req: Request, @Param('id') id: string) {
    return this.operator.revoke(id, who(req).email);
  }

  @Post('users/:id/password-reset')
  @UseGuards(OperatorAuthGuard)
  sendPasswordReset(@Req() req: Request, @Param('id') id: string) {
    return this.operator.sendPasswordReset(id, who(req).email);
  }

  @Get('enquiries')
  @UseGuards(OperatorAuthGuard)
  enquiries(@Query('status') status?: EnquiryStatus) {
    return this.operator.listEnquiries(status);
  }

  @Patch('enquiries/:id')
  @UseGuards(OperatorAuthGuard)
  setEnquiryStatus(@Param('id') id: string, @Body() dto: EnquiryStatusDto) {
    return this.operator.setEnquiryStatus(id, dto.status);
  }
}
