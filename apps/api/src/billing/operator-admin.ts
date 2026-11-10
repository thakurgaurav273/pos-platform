import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaModule } from '../prisma.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
  ],
})
class OperatorAdminModule {}

const USAGE = `Manage platform operators (admin center accounts).

  node dist/billing/operator-admin.js create <email> [name]   new operator + temporary password
  node dist/billing/operator-admin.js reset-password <email>  new temporary password
  node dist/billing/operator-admin.js reset-2fa <email>       they re-enrol an authenticator at next sign-in
  node dist/billing/operator-admin.js deactivate <email>      block sign-in
  node dist/billing/operator-admin.js activate <email>        allow sign-in again
  node dist/billing/operator-admin.js list                    show all operators

Operators sign in at /operator/login with email + password + an authenticator code.`;

const newPassword = () => randomBytes(15).toString('base64url');
const hash = (pw: string) => bcrypt.hash(pw, 12);

async function run(prisma: PrismaService, args: string[]) {
  const [cmd, rawEmail, ...rest] = args;
  const email = rawEmail?.trim().toLowerCase();

  if (cmd === 'list') {
    const ops = await prisma.operatorAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });
    if (ops.length === 0) return console.log('No operators yet.');
    for (const o of ops) {
      console.log(
        `${o.email}  ${o.isActive ? 'active' : 'DISABLED'}  2FA ${o.totpEnabledAt ? 'on' : 'not set up'}  last sign-in ${o.lastLoginAt?.toISOString() ?? 'never'}`,
      );
    }
    return;
  }

  if (!cmd || !email) {
    console.error(USAGE);
    process.exit(1);
  }

  if (cmd === 'create') {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      console.error('That does not look like an email address.');
      process.exit(1);
    }
    if (await prisma.operatorAccount.findUnique({ where: { email } })) {
      console.error(`${email} already exists. Use reset-password instead.`);
      process.exit(1);
    }
    const pw = newPassword();
    await prisma.operatorAccount.create({
      data: {
        email,
        name: rest.join(' ').trim() || null,
        passwordHash: await hash(pw),
      },
    });
    console.log(`Operator created: ${email}`);
    console.log(`Temporary password (shown once): ${pw}`);
    console.log(
      'They sign in at /operator/login and set up an authenticator app on first sign-in.',
    );
    return;
  }

  const op = await prisma.operatorAccount.findUnique({ where: { email } });
  if (!op) {
    console.error(`No operator with email ${email}.`);
    process.exit(1);
  }

  if (cmd === 'reset-password') {
    const pw = newPassword();
    await prisma.operatorAccount.update({
      where: { id: op.id },
      data: { passwordHash: await hash(pw) },
    });
    console.log(`New temporary password for ${email} (shown once): ${pw}`);
  } else if (cmd === 'reset-2fa') {
    await prisma.operatorAccount.update({
      where: { id: op.id },
      data: { totpSecretEnc: null, totpEnabledAt: null, lastUsedStep: null },
    });
    console.log(
      `Authenticator removed for ${email}. They enrol again at next sign-in.`,
    );
  } else if (cmd === 'deactivate' || cmd === 'activate') {
    await prisma.operatorAccount.update({
      where: { id: op.id },
      data: { isActive: cmd === 'activate' },
    });
    console.log(
      `${email} is now ${cmd === 'activate' ? 'active' : 'disabled'}.`,
    );
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(OperatorAdminModule, {
    logger: ['error'],
  });
  try {
    await run(app.get(PrismaService), process.argv.slice(2));
  } finally {
    await app.close();
  }
}

void bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
