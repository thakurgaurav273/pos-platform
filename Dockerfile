# syntax=docker/dockerfile:1.7
# One Dockerfile for the monorepo; docker-compose.yml picks a target (`api` or `dashboard`).
# Build context is the repo root, so the pnpm workspace and lockfile are available.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# ── Dependencies (shared by both apps; cached until a manifest or the schema changes) ──
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/database/package.json packages/database/prisma.config.ts packages/database/
# The database package runs `prisma generate` on install, so the schema must be present.
COPY packages/database/prisma packages/database/prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── API (NestJS) ──
FROM deps AS api-build
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter api build

FROM api-build AS api
ENV NODE_ENV=production \
    PORT=4000 \
    NODE_PATH=/repo/node_modules:/repo/apps/api/node_modules
WORKDIR /repo/apps/api
RUN mkdir -p public/uploads
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]

# ── Dashboard (Next.js) ──
FROM deps AS dashboard-build
# Next bakes the /api rewrite target and NEXT_PUBLIC_* values in at build time.
ARG API_UPSTREAM_URL=http://fluxen-api:4000
ARG NEXT_PUBLIC_API_DEFAULT_SHOP_CODE=
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
ARG NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=
ENV API_UPSTREAM_URL=${API_UPSTREAM_URL} \
    NEXT_PUBLIC_API_DEFAULT_SHOP_CODE=${NEXT_PUBLIC_API_DEFAULT_SHOP_CODE} \
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME} \
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=${NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
COPY packages packages
COPY apps/dashboard apps/dashboard
RUN pnpm --filter dashboard build

FROM dashboard-build AS dashboard
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /repo/apps/dashboard
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "exec node /repo/node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT}"]
