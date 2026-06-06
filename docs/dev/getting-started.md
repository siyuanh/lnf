# Getting started (developer)

## Prerequisites

- Node 20.x
- pnpm 9.x (`corepack enable pnpm` and `corepack prepare pnpm@9.12.0 --activate`)
- Docker (Compose v2)

## First-time setup

```bash
git clone https://github.com/siyuanh/lnf
cd lnf
pnpm install
cp .env.example .env
docker compose up -d db
pnpm --filter @app/api db:migrate
pnpm --filter @app/api seed:partner
```

## Run

```bash
# Terminal 1
pnpm --filter @app/api dev

# Terminal 2
pnpm --filter @app/web dev
```

Then visit http://localhost:3000/partner/login and sign in with `ops@acme.test` / `correct-horse-battery-staple`.

## Test

```bash
pnpm test                                   # everything
pnpm --filter @app/api test                  # api only
pnpm --filter @app/api test -- tests/foo     # one file
```

The first integration test run pulls a PostGIS Docker image; subsequent runs are fast.

## Common commands

| What | Command |
|---|---|
| Generate a Drizzle migration from schema diffs | `pnpm --filter @app/api db:generate` |
| Apply pending migrations | `pnpm --filter @app/api db:migrate` |
| Open Drizzle Studio | `pnpm --filter @app/api db:studio` |
| Reset the dev DB | `docker compose down -v && docker compose up -d db && pnpm --filter @app/api db:migrate && pnpm --filter @app/api seed:partner` |
