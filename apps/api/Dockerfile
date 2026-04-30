# syntax=docker/dockerfile:1.6
# Multi-stage build para Fastify + workspace pnpm. Usa `pnpm deploy` en el
# stage `prune` para aplanar las deps del workspace en un node_modules
# autocontenido — ahí drizzle-orm, postgres, fastify, @stick/shared, etc.
# quedan resueltos sin symlinks externos.

FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# ---- deps (instala todo el monorepo, incluido devDeps para tsc) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- build (compila TS → dist; shared primero, después api) ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN pnpm --filter @stick/shared build
RUN pnpm --filter @stick/api build

# ---- prune (aplana deps de @stick/api a un solo node_modules portable) ----
FROM build AS prune
# `pnpm deploy` copia el package + sus deps de prod a /prod/api.
# `--legacy` es necesario si tu pnpm decide rechazar `--prod` con workspace deps.
RUN pnpm deploy --filter @stick/api --prod --legacy /prod/api

# ---- runtime (alpine slim, solo lo necesario) ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copia el output ya autocontenido.
COPY --from=prune /prod/api/node_modules ./node_modules
COPY --from=prune /prod/api/package.json ./package.json

# Copia el dist compilado y las migraciones (drizzle las necesita en runtime).
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/src/db/migrations ./dist/db/migrations

EXPOSE 3000
CMD ["node", "dist/server.js"]
