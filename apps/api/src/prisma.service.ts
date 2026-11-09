import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '@fluxen/database';
import { PrismaClient } from '@fluxen/database';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function prismaLogLevels(): Prisma.LogLevel[] {
  if (process.env.NODE_ENV !== 'development') {
    return [];
  }
  if (process.env.PRISMA_LOG_QUERIES === '1') {
    return ['query', 'warn', 'error'];
  }
  return ['warn', 'error'];
}

/** Shared pool: reuse TCP connections to Postgres instead of opening one per query burst. */
function createPgPool(): Pool {
  const max = Math.min(
    50,
    Math.max(2, parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10) || 10),
  );
  const idleTimeoutMillis = parseInt(
    process.env.DATABASE_POOL_IDLE_MS ?? '30000',
    10,
  );
  const connectionTimeoutMillis = parseInt(
    process.env.DATABASE_CONNECT_TIMEOUT_MS ?? '10000',
    10,
  );
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMillis)
      ? idleTimeoutMillis
      : 30000,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis)
      ? connectionTimeoutMillis
      : 10000,
    // Detect connections dropped by a network hop instead of hanging on them.
    keepAlive: true,
  });
  // Neon closes connections when its compute auto-suspends. pg reports that on idle
  // clients as a pool 'error' event, and with no listener Node crashes the whole API
  // (Render then restarts it: a minute of 502s). The pool already discards the dead
  // client and opens a fresh one on the next query, so logging is all that is needed.
  pool.on('error', (err) => {
    console.warn(
      `Postgres idle client error (pool will reconnect): ${err.message}`,
    );
  });
  return pool;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const pool = createPgPool();
    super({
      adapter: new PrismaPg(pool),
      log: prismaLogLevels(),
    });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // The adapter does not own the pool, so close it to release connections on shutdown.
    await this.pool.end().catch(() => undefined);
  }

  /** Verify DB connection - useful for health checks */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
