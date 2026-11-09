import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { invalidateJwtUserCache } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma.service';
import { ROLE_PERMISSION_FIELD_KEYS } from '../settings/effective-permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { EmailService } from '../email/email.service';
import {
  assertIndianMobile10,
  normalizeIndianMobile,
} from '../common/indian-mobile';
import * as bcrypt from 'bcrypt';

/** Keeps only known permission keys with boolean values; empty means "role defaults". */
function cleanPermissionOverrides(
  raw: unknown,
): Record<string, boolean> | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(
      'permissionOverrides must be an object or null',
    );
  }
  const cleaned: Record<string, boolean> = {};
  for (const k of ROLE_PERMISSION_FIELD_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'boolean') cleaned[k] = v;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async findPage(shopCode: string, page: number, size: number) {
    if (!shopCode) {
      throw new BadRequestException('shopCode is required');
    }
    const skip = (page - 1) * size;
    const where = { shopCode };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: size,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          shopCode: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const last_page = Math.max(1, Math.ceil(total / size) || 1);
    return { data: rows, last_page };
  }

  async create(dto: CreateUserDto, orgId: string) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const shop = await this.prisma.shop.findFirst({
      where: { shopCode: dto.shopCode, orgId },
    });
    if (!shop) {
      throw new BadRequestException(`Shop ${dto.shopCode} not found`);
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: dto.name ?? null,
        shopCode: dto.shopCode,
        role: dto.role,
        permissionOverrides:
          cleanPermissionOverrides(dto.permissionOverrides) ?? Prisma.DbNull,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        shopCode: true,
        isActive: true,
        permissionOverrides: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Send welcome email asynchronously
    this.emailService
      .sendWelcomeEmail(
        user.email,
        user.name || '',
        user.role,
        shop.name,
        dto.password,
      )
      .catch((err) => {
        console.error(`Failed to send welcome email to ${user.email}:`, err);
      });

    return user;
  }

  assertActorCanRemoveUser(actorRole: UserRole, targetRole: UserRole) {
    if (actorRole === UserRole.SUPER_ADMIN) {
      return;
    }
    if (targetRole === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot remove a super admin');
    }
    if (actorRole === UserRole.ADMIN) {
      if (targetRole === UserRole.ADMIN) {
        throw new ForbiddenException('Admins cannot remove other admins');
      }
      return;
    }
    if (actorRole === UserRole.MANAGER) {
      if (targetRole === UserRole.MANAGER || targetRole === UserRole.ADMIN) {
        throw new ForbiddenException(
          'You do not have permission to remove this user',
        );
      }
      return;
    }
    throw new ForbiddenException('You do not have permission to remove users');
  }

  async remove(
    id: string,
    scopeShopCode: string | null,
    actor: { id: string; role: UserRole },
    orgId: string,
  ) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const target = await this.findOneForShop(id, scopeShopCode, orgId);
    this.assertActorCanRemoveUser(actor.role, target.role);

    // Users who rang up sales, moved stock or handled transfers are deactivated, not
    // deleted, so "who did this" stays answerable. Users with no history are removed.
    const [orders, movements, transfers] = await Promise.all([
      this.prisma.order.count({
        where: { OR: [{ createdById: id }, { cancelledById: id }] },
      }),
      this.prisma.stockMovement.count({ where: { userId: id } }),
      this.prisma.stockTransferRequest.count({
        where: { OR: [{ createdById: id }, { approvedById: id }] },
      }),
    ]);
    if (orders + movements + transfers > 0) {
      await this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      invalidateJwtUserCache(id);
      return { removed: false, deactivated: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roleRequest.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
    invalidateJwtUserCache(id);
    return { removed: true, deactivated: false };
  }

  /**
   * Who may change whom: only a super admin can grant ADMIN/SUPER_ADMIN, move a user to
   * another shop, or edit an admin. Nobody changes their own role.
   */
  private assertActorCanUpdateUser(
    actor: { id: string; role: UserRole },
    target: { id: string; role: UserRole; shopCodeOrNull: string },
    dto: UpdateUserDto,
  ) {
    if (
      dto.role !== undefined &&
      actor.id === target.id &&
      dto.role !== target.role
    ) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if (actor.role === UserRole.SUPER_ADMIN) return;
    const privileged: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (actor.id !== target.id && privileged.includes(target.role)) {
      throw new ForbiddenException('Only a super admin can edit an admin');
    }
    if (dto.role !== undefined && privileged.includes(dto.role)) {
      throw new ForbiddenException(
        'Only a super admin can grant the ADMIN or SUPER_ADMIN role',
      );
    }
    if (dto.shopCode !== undefined && dto.shopCode !== target.shopCodeOrNull) {
      throw new ForbiddenException(
        'Only a super admin can move a user to another shop',
      );
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    scopeShopCode: string | null,
    actor: { id: string; role: UserRole },
    orgId: string,
  ) {
    const target = await this.findOneForShop(id, scopeShopCode, orgId);
    this.assertActorCanUpdateUser(
      actor,
      { id: target.id, role: target.role, shopCodeOrNull: target.shopCode },
      dto,
    );

    if (dto.shopCode) {
      const shop = await this.prisma.shop.findFirst({
        where: { shopCode: dto.shopCode, orgId },
      });
      if (!shop) {
        throw new BadRequestException(`Shop ${dto.shopCode} not found`);
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.password !== undefined) {
      data.password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }
    if (dto.shopCode !== undefined) data.shopCode = dto.shopCode;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.permissionOverrides !== undefined) {
      data.permissionOverrides =
        cleanPermissionOverrides(dto.permissionOverrides) ?? Prisma.DbNull;
    } else if (dto.role !== undefined && dto.role !== target.role) {
      // Overrides are diffs against the old role's defaults; carried over they would
      // silently grant/revoke things on the new role.
      data.permissionOverrides = Prisma.DbNull;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: data as any,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        shopCode: true,
        isActive: true,
        permissionOverrides: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    invalidateJwtUserCache(id);
    return updated;
  }

  /** `shopCode` null = any shop (super admin, who can create users in other shops). */
  async findOneForShop(id: string, shopCode: string | null, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...(shopCode ? { shopCode } : {}), shop: { orgId } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        shopCode: true,
        isActive: true,
        permissionOverrides: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        shopCode: true,
        isActive: true,
        avatarUrl: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User not found`);
    }
    return user;
  }

  async updateProfile(
    id: string,
    dto: { name?: string; avatarUrl?: string; phone?: string },
  ) {
    const phonePatch =
      dto.phone === undefined
        ? {}
        : (() => {
            const d = normalizeIndianMobile(dto.phone);
            if (d === '') return { phone: null as string | null };
            assertIndianMobile10(d);
            return { phone: d };
          })();

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...phonePatch,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        shopCode: true,
        isActive: true,
        avatarUrl: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
