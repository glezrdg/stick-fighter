# syntax=docker/dockerfile:1.6
# Multi-stage: build el bundle Vite del cliente y servirlo con nginx alpine.
# Mismo patrón que apps/api: context = monorepo root, dockerfile = apps/game/Dockerfile.

FROM node:22-alpine AS base
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# ---- deps: instala todo el monorepo (necesita devDeps para vite/tsc) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/game/package.json ./apps/game/
COPY packages/shared/package.json ./packages/shared/
COPY packages/content/package.json ./packages/content/
COPY packages/sim/package.json ./packages/sim/
RUN pnpm install --frozen-lockfile

# ---- build: compila packages workspace + bundle Vite ----
FROM deps AS build
ARG VITE_API_URL=https://stick-fighter-api.neomac.io
ENV VITE_API_URL=${VITE_API_URL}
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/content ./packages/content
COPY packages/sim ./packages/sim
COPY apps/game ./apps/game
RUN pnpm --filter @stick/shared build \
 && pnpm --filter @stick/content build \
 && pnpm --filter @stick/sim build \
 && pnpm --filter @stick/game build

# ---- runtime: nginx alpine sirviendo dist/ con SPA fallback ----
FROM nginx:alpine AS runtime
COPY --from=build /repo/apps/game/dist /usr/share/nginx/html
COPY apps/game/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
