# syntax=docker/dockerfile:1.7
#
# Production runtime for @app/web. Build context is the monorepo root.
# Next.js standalone output bundles only the runtime deps it actually uses,
# so we don't need pnpm deploy here — the .next/standalone tree is already
# self-contained.

FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/schemas/package.json packages/schemas/
COPY packages/api-client/package.json packages/api-client/
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /repo/packages/api-client/node_modules ./packages/api-client/node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY tsconfig.base.json ./
COPY packages/schemas ./packages/schemas
COPY packages/api-client ./packages/api-client
COPY apps/api/src ./apps/api/src
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @app/web build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone output: with outputFileTracingRoot set to the monorepo root in
# next.config.ts, the standalone tree places server.js under apps/web/server.js
# and expects static at apps/web/.next/static. The whole tree is self-contained
# (its node_modules has only what server.js loads at runtime).
COPY --from=build /repo/apps/web/.next/standalone/ ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app/apps/web
CMD ["node", "server.js"]
