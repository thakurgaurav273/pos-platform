import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma.module';
import { DemoSeederService } from './demo-seeder.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
  ],
  providers: [DemoSeederService],
})
class DemoSeedModule {}

/**
 * `pnpm --filter api seed:demo`             create the demo business if missing
 * `pnpm --filter api seed:demo -- --reset`  wipe it and rebuild (e.g. from a nightly cron)
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(DemoSeedModule);
  try {
    const seeder = app.get(DemoSeederService);
    if (process.argv.includes('--reset')) await seeder.reset();
    else await seeder.ensureSeeded();
  } finally {
    await app.close();
  }
}

void bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
