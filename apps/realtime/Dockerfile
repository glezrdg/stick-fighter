# syntax=docker/dockerfile:1.6
# Multi-stage build para Colyseus + workspace pnpm. Mismo patrón que apps/api:
# pnpm deploy aplana las deps del workspace en /prod/realtime para un image
# runtime sin symlinks.

FROM node:22-alpine AS base
WORKDIR /repo
# git: necesario por pnpm deploy (algunos peers de colyseus se resuelven git+https).
# python3 + make + g++: por si node-gyp baja a un native module en build (defensivo).
RUN apk add --no-cache git python3 make g++
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/realtime/package.json ./apps/realtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/sim/package.json ./packages/sim/
COPY packages/content/package.json ./packages/content/
RUN pnpm install --frozen-lockfile

# ---- build (compila TS de shared, content, sim y luego realtime) ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/content ./packages/content
COPY packages/sim ./packages/sim
COPY apps/realtime ./apps/realtime
RUN pnpm --filter @stick/shared build \
 && pnpm --filter @stick/content build \
 && pnpm --filter @stick/sim build \
 && pnpm --filter @stick/realtime build

# ---- prune (aplana deps de @stick/realtime a /prod/realtime) ----
FROM build AS prune
RUN pnpm deploy --filter @stick/realtime --prod --legacy /prod/realtime

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prune /prod/realtime/node_modules ./node_modules
COPY --from=prune /prod/realtime/package.json ./package.json
COPY --from=build /repo/apps/realtime/dist ./dist

EXPOSE 2567
CMD ["node", "dist/server.js"]
