# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The repository is empty. The first task in any session here is scaffolding — verify state with `ls` before assuming any of the paths below exist.

## Product

A webservice with three clients sharing one backend:
- **Web** — full-featured browser app
- **iOS** and **Android** — lightweight mobile clients

"Lightweight mobile" is a deliberate constraint: clients should be thin views over the API, not parallel reimplementations of business logic. Logic lives in the backend or in shared packages.

## Stack

TypeScript end-to-end in a pnpm + Turborepo monorepo:

| Layer | Choice | Why |
|---|---|---|
| Backend | **Hono** on Node (or Bun) | Small, fast, type-safe RPC client for free |
| Database | **PostgreSQL** + **Drizzle ORM** | Lighter and more transparent than Prisma; SQL-first |
| Web | **Next.js** (App Router) | React, SSR, deploys anywhere |
| Mobile | **Expo** (React Native) + Expo Router | One codebase → iOS + Android; OTA updates |
| Validation | **Zod** in a shared package | Same schemas validate at API boundary, web forms, and mobile forms |
| Auth | **Better-Auth** | Self-hostable, framework-agnostic, no vendor lock-in |
| Tests | **Vitest** for libs/server, **Playwright** for web E2E, **Maestro** for mobile flows | Vitest is ESM-native and fast; Maestro avoids the Detox setup tax |

## Planned layout

```
apps/
  api/        # Hono server — exports an AppType for RPC
  web/        # Next.js
  mobile/     # Expo
packages/
  schemas/    # Zod schemas shared across all clients + server
  api-client/ # Hono RPC wrapper, tree-shakeable
  ui/         # Shared React primitives usable by web (and React Native via solito or NativeWind, if added)
  config/     # eslint/tsconfig/tailwind base configs
```

Both web and mobile import from `@app/schemas` and `@app/api-client` — never duplicate types or fetch logic per client.

## Conventions

- **API contracts live in `packages/schemas`**, not in the app that happens to need them first. If web needs a new endpoint shape, the schema goes in the shared package and both mobile and server pick it up.
- **Server is the source of truth for business rules.** Clients render and submit; they don't compute. A "lightweight" mobile client that quietly grew a pricing calculator is a regression — push the calculation server-side.
- **Drizzle migrations are checked in.** Never edit a migration that's been merged to main; add a new one.
- **Use Hono RPC, not hand-written fetch wrappers.** `import type { AppType } from '@app/api'` on the client gives you typed routes without codegen.

## Commands

(To be filled in once scaffolded. Expected shape:)

```
pnpm install                  # install everything
pnpm dev                      # turbo runs api + web + mobile in parallel
pnpm --filter @app/api dev    # backend only
pnpm --filter @app/web dev    # web only
pnpm --filter @app/mobile dev # expo dev client
pnpm test                     # all workspaces
pnpm --filter @app/api test -- path/to/file.test.ts  # single test file
pnpm --filter @app/api db:migrate   # apply pending migrations
pnpm --filter @app/api db:generate  # generate migration from schema diff
pnpm lint && pnpm typecheck   # before pushing
```

When scaffolding, wire `turbo.json` so `dev`/`build`/`test`/`lint`/`typecheck` are the standard task names across every workspace — Turborepo's caching depends on consistent naming.

## Gotchas to anticipate

- **React Native ≠ React.** Don't import DOM-only code (`window`, `document`, most of MUI) into anything `mobile/` consumes. Keep `packages/ui` strictly cross-platform, or split into `ui-web` and `ui-mobile` if it grows.
- **Expo Go vs dev client.** Native modules (auth, push, anything outside the Expo SDK) require a custom dev client — `expo prebuild` will be needed eventually. Plan for it before adding the first native dep.
- **Cookies don't work the same on mobile.** Better-Auth sessions over cookies work for web; mobile typically uses bearer tokens. Settle this in the first auth PR — don't let two auth shapes drift apart.
