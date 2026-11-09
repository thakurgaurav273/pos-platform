/**
 * Runs before every e2e test file. The suite TRUNCATEs every table, so it must only
 * ever touch a disposable local database: never the shared/production DB in .env.
 *
 *   createdb cs_test
 *   DATABASE_URL=postgresql://localhost:5432/cs_test pnpm --filter @fluxen/database exec prisma migrate deploy
 *   TEST_DATABASE_URL=postgresql://localhost:5432/cs_test pnpm --filter api test:e2e
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('Set TEST_DATABASE_URL to a disposable local Postgres database');
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', ''].includes(host)) {
  throw new Error(
    `Refusing to run e2e tests against non-local database host "${host}"`,
  );
}

// Set before AppModule loads: ConfigModule never overrides variables that already exist,
// so the remote services configured in .env are never used by the tests.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: url,
  REDIS_URL: 'redis://127.0.0.1:1',
  RESEND_API_KEY: 're_test_disabled',
  EMAIL_FROM: 'test@localhost',
  JWT_SECRET: 'e2e-test-secret-e2e-test-secret-0001',
  PAYTM_MID: 'TESTMID',
  PAYTM_MERCHANT_KEY: 'TestKey123456789',
  PAYTM_SKIP_STATUS_VERIFY: '1',
  FRONTEND_URL: 'http://localhost:3100',
  APP_URL: 'http://localhost:4100',
});
