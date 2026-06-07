# syntax=docker/dockerfile:1.7
#
# Production runtime for @app/api. Build context is the monorepo root.
# Uses `pnpm deploy` to flatten the workspace into a single self-contained
# tree under /deploy/api — that way the runtime image carries only api's
# transitive prod deps, not the entire monorepo's virtual store.

# ---------- builder: install deps + run pnpm deploy ----------
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/schemas/package.json packages/schemas/
COPY packages/api-client/package.json packages/api-client/

RUN pnpm install --frozen-lockfile

# Source for the api + the workspace package it depends on.
COPY tsconfig.base.json ./
COPY packages/schemas ./packages/schemas
COPY apps/api ./apps/api

# Flatten api's prod tree into /deploy/api. --legacy keeps it compatible with
# pnpm 9; it copies node_modules and dereferences workspace links so the result
# is a self-contained directory.
RUN pnpm --filter @app/api deploy --prod --no-optional /deploy/api

# tsx is dev-only on the workspace; install it as a global tool we'll lift over.
RUN npm install -g tsx@4.19.0

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy/api /app
# Copy tsx with its bundled node_modules; recreate the bin shim as a symlink
# so Node resolves tsx's own deps relative to its install dir.
COPY --from=builder /usr/local/lib/node_modules/tsx /usr/local/lib/node_modules/tsx
RUN ln -s /usr/local/lib/node_modules/tsx/dist/cli.mjs /usr/local/bin/tsx

EXPOSE 3001
CMD ["tsx", "src/server.ts"]
