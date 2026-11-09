# Fluxen POS

A monorepo for a sweets shop management system-dashboard (Next.js) + REST API (NestJS) + shared database (Prisma + PostgreSQL).

---

## Prerequisites

- **Node.js** 20.19+ (22.x recommended)
- **pnpm** 10.x (`npm install -g pnpm`)
- **PostgreSQL** 14+ running locally or via Docker

**Docker (PostgreSQL):** `docker run -d --name fluxen-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fluxen_pos postgres:16`

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Monorepo | Turborepo, pnpm workspaces |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | NestJS 11, Express |
| Database | PostgreSQL, Prisma 7 (with `@prisma/adapter-pg`) |
| Language | TypeScript 5.x |

---

## Project Structure

```
fluxen-pos/
├── apps/
│   ├── api/          # NestJS REST API (port 3000)
│   └── dashboard/    # Next.js frontend (port 3000)
├── packages/
│   └── database/     # Prisma schema, client, migrations
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Quick Start (Run Everything in One Go)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

Copy the example env files and fill in values:

```bash
# API
cp apps/api/.env.example apps/api/.env

# Dashboard (optional, for API URL override)
cp apps/dashboard/.env.example apps/dashboard/.env.local
```

**Required:** Edit `apps/api/.env` and set:

```env
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fluxen_pos"
JWT_SECRET=your-secret-here
```

Adjust `DATABASE_URL` if your PostgreSQL user/password/host/port differ.

### 3. Create the database and run migrations

```bash
# Create DB (if it doesn't exist)
# macOS/Linux: createdb fluxen_pos
# Or via psql: psql -U postgres -c "CREATE DATABASE fluxen_pos;"
# Docker: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

createdb fluxen_pos

# Run migrations (from database package)
pnpm --filter @fluxen/database exec prisma migrate deploy

# Generate Prisma client (required after clone/install)
pnpm --filter @fluxen/database exec prisma generate
```

### 4. Start all apps

```bash
pnpm dev
```

This runs both the API and dashboard in parallel via Turborepo.

| App | URL |
|-----|-----|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3000 |
| API health check | http://localhost:3000/health/db |

---

## One-Liner Setup (Fresh Clone)

Assumes PostgreSQL is running and `createdb` is available:

```bash
pnpm install && \
cp apps/api/.env.example apps/api/.env && \
createdb fluxen_pos 2>/dev/null || true && \
pnpm --filter @fluxen/database exec prisma migrate deploy && \
pnpm --filter @fluxen/database exec prisma generate && \
pnpm dev
```

Edit `apps/api/.env` with your `DATABASE_URL` and `JWT_SECRET` before running if needed.

---

## Running Individual Apps

```bash
# API only
pnpm --filter api dev

# Dashboard only
pnpm --filter dashboard dev

# Build all
pnpm build

# Lint all
pnpm lint
```

---

## Environment Variables

### `apps/api/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | API port (default: 3000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |

### `apps/dashboard/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | No | API base URL (default: http://localhost:3000) |

### `packages/database/.env`

Used by Prisma CLI (migrate, generate, studio). Can mirror `apps/api/.env` or use the same `DATABASE_URL`.

---

## Database Commands

Run from repo root:

```bash
# Generate Prisma client (after schema changes)
pnpm --filter @fluxen/database exec prisma generate

# Create a new migration
pnpm --filter @fluxen/database exec prisma migrate dev --name your_migration_name

# Apply migrations (production)
pnpm --filter @fluxen/database exec prisma migrate deploy

# Open Prisma Studio (DB GUI)
pnpm --filter @fluxen/database exec prisma studio

# Reset DB (drops all data)
pnpm --filter @fluxen/database exec prisma migrate reset
```

---

## Database Schema (Current)

- **Shop** – id, name, address
- **User** – id, email, password, role, shopId
- **Product** – id, name, price, barcode, shopId

---

## Troubleshooting

### `PrismaClientConstructorValidationError: adapter or accelerateUrl required`

Prisma 7 needs the `@prisma/adapter-pg` adapter. This is already wired in `PrismaService` and `packages/database/client.ts`. Ensure `@prisma/adapter-pg` and `pg` are installed.

### `Database connection failed` on startup

- PostgreSQL is running: `pg_isready -h localhost -p 5432`
- `DATABASE_URL` in `apps/api/.env` is correct
- Database exists: `psql -l | grep fluxen_pos`
- Migrations applied: `pnpm --filter @fluxen/database exec prisma migrate deploy`

### `EADDRINUSE: address already in use`

Another process is using the port. Change `PORT` in `apps/api/.env` or stop the conflicting process.

### Prisma client out of sync

After pulling schema changes or switching branches:

```bash
pnpm --filter @fluxen/database exec prisma generate
```

### pnpm store / install issues

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

