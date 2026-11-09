import {
  GoneException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import type { PrismaService } from '../prisma.service';
import type { RedisService } from '../redis.provider';
import type { AuthService } from '../auth/auth.service';
import type { EmailService } from '../email/email.service';
import type { ShopsService } from '../shops/shops.service';

const dto = {
  businessName: 'Sharma Sweets',
  name: 'Asha Sharma',
  email: 'owner@example.com',
  password: 'correct-horse',
};

function setup() {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return Promise.resolve(keys.length);
    }),
    ttl: jest.fn((k: string) => Promise.resolve(store.has(k) ? 60 : -2)),
  };
  const tx = {
    organization: { create: jest.fn().mockResolvedValue({ id: 'org1' }) },
    shop: { create: jest.fn().mockResolvedValue({}) },
    user: {
      create: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ id: 'u1', ...data }),
      ),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const auth = {
    issueOtp: jest.fn((key: string) => {
      store.set(key, '123456');
      return Promise.resolve('123456');
    }),
    matchOtp: jest.fn((key: string, otp: string) =>
      Promise.resolve(store.get(key) === otp),
    ),
    issueSession: jest.fn((user: { id: string }) =>
      Promise.resolve({ user: { id: user.id }, access_token: 't' }),
    ),
  };
  const email = {
    sendSignupVerificationEmail: jest.fn().mockResolvedValue({}),
  };
  const shops = { generateShopCode: jest.fn().mockResolvedValue('SH1') };
  const service = new OrganizationsService(
    prisma as unknown as PrismaService,
    shops as unknown as ShopsService,
    auth as unknown as AuthService,
    redis as unknown as RedisService,
    email as unknown as EmailService,
  );
  return { service, store, prisma, tx, email };
}

describe('OrganizationsService signup verification', () => {
  it('emails a code and writes nothing to the database until it is verified', async () => {
    const { service, store, tx, email } = setup();
    await expect(service.startSignup(dto)).resolves.toEqual({
      email: dto.email,
      resendInSeconds: 60,
    });
    expect(email.sendSignupVerificationEmail).toHaveBeenCalledWith(
      dto.email,
      dto.name,
      '123456',
    );
    const pending = JSON.parse(store.get(`signup:pending:${dto.email}`)!);
    expect(pending.password).not.toBe(dto.password);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('creates the organization, factory and owner on the right code', async () => {
    const { service, store, tx } = setup();
    await service.startSignup(dto);
    await expect(service.verifySignup(dto.email, '123456')).resolves.toEqual({
      user: { id: 'u1' },
      access_token: 't',
    });
    expect(tx.shop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: 'org1', isFactory: true }),
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'SUPER_ADMIN', shopCode: 'SH1' }),
    });
    expect(store.size).toBe(0);
  });

  it('rejects a wrong code without creating anything', async () => {
    const { service, tx } = setup();
    await service.startSignup(dto);
    await expect(service.verifySignup(dto.email, '000000')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it('reports an expired signup as gone', async () => {
    const { service } = setup();
    await expect(service.verifySignup(dto.email, '123456')).rejects.toThrow(
      GoneException,
    );
  });

  it('surfaces an email failure as 503 and discards the unsent code', async () => {
    const { service, store, email } = setup();
    email.sendSignupVerificationEmail.mockRejectedValueOnce(
      new Error('domain not verified'),
    );
    await expect(service.startSignup(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(store.has(`otp:signup:${dto.email}`)).toBe(false);
  });
});
