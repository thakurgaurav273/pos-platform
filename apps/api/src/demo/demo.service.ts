import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@fluxen/database';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth/auth.service';
import { invalidateJwtUserCache } from '../auth/jwt-auth.guard';
import { DEMO_OWNER_EMAIL, isDemoEnabled } from './demo.constants';
import { DemoSeederService } from './demo-seeder.service';

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly seeder: DemoSeederService,
  ) {}

  /** Signs the caller into the shared demo business, creating its data on first use. */
  async startSession() {
    if (!isDemoEnabled()) throw new NotFoundException();

    await this.seeder.ensureSeeded();

    // The demo is shared and fully editable. If an earlier visitor deactivated or
    // demoted the owner, put it back so the next visitor is not locked out.
    const owner = await this.prisma.user.update({
      where: { email: DEMO_OWNER_EMAIL },
      data: {
        isActive: true,
        role: UserRole.SUPER_ADMIN,
        permissionOverrides: undefined,
      },
    });
    invalidateJwtUserCache(owner.id);

    const session = await this.auth.issueSession(owner);
    return { ...session, user: { ...session.user, isDemo: true } };
  }
}
