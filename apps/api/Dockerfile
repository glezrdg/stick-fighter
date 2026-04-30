# syntax=docker/dockerfile:1.6
# Multi-stage build for the Fastify API. Targets the monorepo root so we can
# install all workspace deps (incl. @stick/shared) in one go.
FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN pnpm --filter @stick/api build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Copy only what we need to run.
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/apps/api/src/db/migrations ./dist/db/migrations
COPY --from=build /repo/packages/shared ./node_modules/@stick/shared
COPY --from=build /repo/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/server.js"]
