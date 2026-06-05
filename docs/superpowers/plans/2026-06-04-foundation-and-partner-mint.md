# Foundation + Partner Mint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the LNF monorepo with Postgres, Hono backend, Better-Auth, and the partner-mint vertical. By the end, an authenticated partner can hit the API or web portal, mint a batch of unguessable QR codes, and download a single-use CSV.

**Architecture:** TypeScript monorepo (pnpm + Turborepo). Hono on Node for the API; Drizzle + PostgreSQL for storage; Graphile Worker for jobs (set up in Phase 0, used heavily later). Next.js App Router for both the public surfaces and the partner portal at `/partner/*`. Better-Auth for the partner portal; HMAC-bearer keys for the partner API. Vitest + testcontainers for integration tests. Docker Compose runs Postgres only; the Node app and tests run on the host.

**Tech Stack:** TypeScript, pnpm, Turborepo, Hono, Drizzle ORM, PostgreSQL 16 + PostGIS, Graphile Worker, Better-Auth, Next.js 15 (App Router), Zod, Vitest, testcontainers-node, Playwright (E2E shell only in this plan).

**Spec reference:** [`docs/superpowers/specs/2026-06-04-lnf-design.en.md`](../specs/2026-06-04-lnf-design.en.md). The S1-1 (atomicity), S1-5 (audit_event versioning), and partner mint flow (§3.1) decisions are the load-bearing ones for this plan.

---

## File structure (this plan only)

What gets created and what each file is responsible for:

```
.
├── package.json                   # workspace root, scripts, pnpm config
├── pnpm-workspace.yaml            # apps/* and packages/*
├── turbo.json                     # task pipeline
├── docker-compose.yml             # Postgres + PostGIS service
├── .env.example                   # documented required env vars
├── .gitignore                     # node_modules, .env, .turbo, etc.
├── tsconfig.base.json             # strict, ES2022, NodeNext
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts           # Hono app entry, exports AppType
│   │   │   ├── env.ts             # Zod-validated env loader
│   │   │   ├── db/
│   │   │   │   ├── client.ts      # Drizzle client + tx helper
│   │   │   │   ├── schema.ts      # all tables (this plan: partner side)
│   │   │   │   └── migrations/    # Drizzle migration output
│   │   │   ├── auth/
│   │   │   │   ├── better-auth.ts # Better-Auth config (partner_user)
│   │   │   │   └── api-key.ts     # API-key middleware (HMAC bearer)
│   │   │   ├── codes/
│   │   │   │   └── generate.ts    # CSPRNG base32 22-char generator
│   │   │   ├── audit/
│   │   │   │   └── log.ts         # audit_event writer (with v field)
│   │   │   ├── routes/
│   │   │   │   └── partner.ts     # POST /partner/batches, CSV download
│   │   │   └── worker/
│   │   │       └── index.ts       # Graphile Worker bootstrap (no jobs yet)
│   │   └── tests/
│   │       ├── setup.ts           # testcontainers Postgres helper
│   │       ├── codes.test.ts
│   │       ├── api-key.test.ts
│   │       ├── partner.batches.test.ts
│   │       └── partner.csv.test.ts
│   └── web/
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       └── src/app/
│           ├── layout.tsx
│           ├── page.tsx           # placeholder home
│           └── partner/           # all under (auth) middleware
│               ├── login/page.tsx
│               ├── layout.tsx     # auth gate
│               └── batches/
│                   ├── page.tsx   # list + create form
│                   └── new/page.tsx
├── packages/
│   ├── schemas/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── partner.ts         # batch mint request/response
│   │       └── audit/
│   │           ├── index.ts       # discriminated union helper
│   │           └── partner.batch.minted.v1.ts
│   ├── api-client/
│   │   ├── package.json
│   │   └── src/index.ts           # `hc<AppType>(baseUrl)` re-export
│   └── config/
│       ├── eslint-config/
│       └── tsconfig/
└── docs/  (already exists)
```

Notes:
- The mobile app (`apps/mobile`) is intentionally *not* in this plan — first scaffolded in Phase 2 when caregivers enter the picture.
- `packages/ui` is not created here — there's nothing for both web and mobile to share yet.
- Drizzle schema will hold *all* tables we plan to use eventually, but only the partner side is migrated/used in this plan. Non-partner tables defined now would be dead weight; they're deferred to the phase that exercises them.

---

## Pre-flight checks

Tasks below assume you have:
- Node 20.x and pnpm 9.x installed (`pnpm --version` ≥ 9, `node --version` ≥ 20.10)
- Docker Desktop running (`docker info` returns OK)
- The repo cloned at `/Users/shua/gitws/lnf` with `main` checked out
- The `gh` CLI authenticated to the `siyuanh` account (`gh auth status` shows it active)

If any of these fails, fix it before starting Task 1.

---

## Phase 0 — Foundation

Plumbing only. By the end of Phase 0 the repo has a typecheckable, lintable, testable empty Hono server connected to a real Postgres, with Drizzle migrations and Better-Auth ready.

### Task 1: Initialize the monorepo skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `tsconfig.base.json`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "lnf",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.turbo/
dist/
.next/
.env
.env.local
*.log
.DS_Store
coverage/
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Install root deps**

Run: `pnpm install`
Expected: succeeds; creates `pnpm-lock.yaml`. No workspace packages yet — that's fine.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo workspace"
```

---

### Task 2: Add Postgres via Docker Compose

**Files:**
- Create: `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: lnf
      POSTGRES_PASSWORD: lnf_dev_password
      POSTGRES_DB: lnf_dev
    ports:
      - "5432:5432"
    volumes:
      - lnf_db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lnf -d lnf_dev"]
      interval: 2s
      timeout: 2s
      retries: 20

volumes:
  lnf_db_data:
```

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL=postgres://lnf:lnf_dev_password@localhost:5432/lnf_dev
NODE_ENV=development

# Better-Auth
BETTER_AUTH_SECRET=replace-with-32-byte-base64-secret
BETTER_AUTH_URL=http://localhost:3000

# Partner API
PARTNER_API_KEY_PEPPER=replace-with-random-32-byte-base64
```

- [ ] **Step 3: Bring up the DB**

Run: `docker compose up -d db`
Expected: container starts; `docker compose ps` shows `db` as `healthy` within ~10 s.

- [ ] **Step 4: Verify connection**

Run: `docker compose exec db psql -U lnf -d lnf_dev -c 'select version();'`
Expected: a `PostgreSQL 16.x ... PostGIS` row.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add postgres + postgis via docker compose"
```

---

### Task 3: Create the `packages/schemas` package shell

**Files:**
- Create: `packages/schemas/package.json`, `packages/schemas/tsconfig.json`, `packages/schemas/src/index.ts`

- [ ] **Step 1: Create `packages/schemas/package.json`**

```json
{
  "name": "@app/schemas",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/schemas/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/schemas/src/index.ts`**

```ts
export const SCHEMAS_PACKAGE = "@app/schemas";
```

- [ ] **Step 4: Install workspace deps**

Run: `pnpm install`
Expected: `@app/schemas` shows in `pnpm list -r --depth -1`.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @app/schemas typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/schemas pnpm-lock.yaml
git commit -m "chore: scaffold @app/schemas package"
```

---

### Task 4: Create the `apps/api` package shell with Hono

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/src/env.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@app/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@app/schemas": "workspace:*",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.16.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/api/src/env.ts`**

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  PARTNER_API_KEY_PEPPER: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment:", result.error.flatten().fieldErrors);
    throw new Error("Invalid environment");
  }
  return result.data;
}
```

- [ ] **Step 4: Create `apps/api/src/index.ts`**

```ts
import { Hono } from "hono";

export const app = new Hono().get("/healthz", (c) => c.json({ ok: true }));

export type AppType = typeof app;
```

- [ ] **Step 5: Create `apps/api/src/server.ts`**

```ts
import { serve } from "@hono/node-server";
import { app } from "./index.js";
import { loadEnv } from "./env.js";

loadEnv();
const port = 3001;
console.log(`api listening on :${port}`);
serve({ fetch: app.fetch, port });
```

- [ ] **Step 6: Install**

Run: `pnpm install`

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @app/api typecheck`
Expected: exit 0.

- [ ] **Step 8: Smoke run**

Run (in one terminal): `cp .env.example .env && pnpm --filter @app/api dev`
Run (in another): `curl http://localhost:3001/healthz`
Expected: `{"ok":true}`. Stop the dev server (Ctrl-C).

- [ ] **Step 9: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): scaffold hono app with env loader and healthz"
```

---

### Task 5: Wire up Drizzle ORM and migrations

**Files:**
- Modify: `apps/api/package.json` (add deps)
- Create: `apps/api/drizzle.config.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/schema.ts`

- [ ] **Step 1: Add Drizzle deps**

Run: `pnpm --filter @app/api add drizzle-orm postgres`
Run: `pnpm --filter @app/api add -D drizzle-kit`

- [ ] **Step 2: Create `apps/api/drizzle.config.ts`**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://lnf:lnf_dev_password@localhost:5432/lnf_dev",
  },
} satisfies Config;
```

- [ ] **Step 3: Create `apps/api/src/db/schema.ts` (empty — partner tables come in Task 9)**

```ts
// Tables are added per-feature; see Task 9 for the partner side.
export {};
```

- [ ] **Step 4: Create `apps/api/src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../env.js";

export type Db = ReturnType<typeof makeDb>;

export function makeDb(env: Pick<Env, "DATABASE_URL">) {
  const sql = postgres(env.DATABASE_URL, { max: 10 });
  return drizzle(sql);
}
```

- [ ] **Step 5: Add db scripts to `apps/api/package.json`**

In the `"scripts"` block, add:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @app/api typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): wire up drizzle orm with empty schema"
```

---

### Task 6: Set up Vitest + testcontainers for integration tests

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`, `apps/api/tests/setup.ts`, `apps/api/tests/healthz.test.ts`

- [ ] **Step 1: Add test deps**

Run: `pnpm --filter @app/api add -D @testcontainers/postgresql testcontainers`

- [ ] **Step 2: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 3: Create `apps/api/tests/setup.ts`**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export async function setup() {
  const container = await new PostgreSqlContainer("postgis/postgis:16-3.4")
    .withDatabase("lnf_test")
    .withUsername("lnf")
    .withPassword("test")
    .start();
  process.env.DATABASE_URL = container.getConnectionUri();
  globalThis.__PG_CONTAINER__ = container;
}

export async function teardown() {
  await globalThis.__PG_CONTAINER__?.stop();
}
```

- [ ] **Step 4: Create `apps/api/tests/healthz.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";

describe("healthz", () => {
  it("returns ok", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @app/api test`
Expected: 1 test passes. (First run pulls the postgis image; that's slow.)

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "test(api): set up vitest with testcontainers postgres"
```

---

### Task 7: Add Graphile Worker bootstrap (no jobs yet)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/worker/index.ts`

This task installs Graphile Worker and creates a bootstrap function that owns the migration of its own tables. We don't define jobs yet — that comes in Phase 4.

- [ ] **Step 1: Add the dep**

Run: `pnpm --filter @app/api add graphile-worker`

- [ ] **Step 2: Create `apps/api/src/worker/index.ts`**

```ts
import { run, type Runner } from "graphile-worker";
import type { Env } from "../env.js";

export async function startWorker(env: Pick<Env, "DATABASE_URL">): Promise<Runner> {
  return run({
    connectionString: env.DATABASE_URL,
    concurrency: 4,
    pollInterval: 1000,
    taskList: {
      // Jobs are registered in later phases. Empty list is valid.
    },
  });
}
```

- [ ] **Step 3: Add a tiny test that proves the worker bootstraps**

Create `apps/api/tests/worker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { startWorker } from "../src/worker/index.js";

describe("worker", () => {
  it("bootstraps and shuts down cleanly", async () => {
    const runner = await startWorker({ DATABASE_URL: process.env.DATABASE_URL! });
    expect(runner).toBeDefined();
    await runner.stop();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @app/api test -- tests/worker.test.ts`
Expected: passes; Graphile Worker creates its `graphile_worker.*` schema in the test DB.

- [ ] **Step 5: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): bootstrap graphile worker (no jobs yet)"
```

---

### Task 8: Create `apps/web` Next.js shell with a placeholder home

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@app/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/node": "^20.16.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
};

export default config;
```

- [ ] **Step 3: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/web/src/app/layout.tsx`**

```tsx
export const metadata = { title: "LNF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/app/page.tsx`**

```tsx
export default function HomePage() {
  return <main style={{ padding: 24 }}>LNF</main>;
}
```

- [ ] **Step 6: Install + typecheck**

Run: `pnpm install`
Run: `pnpm --filter @app/web typecheck`
Expected: exit 0. (Next will create `next-env.d.ts` on first build.)

- [ ] **Step 7: Smoke**

Run: `pnpm --filter @app/web dev`
In another terminal: `curl -sS http://localhost:3000/ | grep -o 'LNF'`
Expected: prints `LNF`. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold next.js app router shell"
```

---

End of Phase 0. The repo now has a typecheckable, testable, runnable foundation.

---

## Phase 1 — Partner mint vertical

### Task 9: Add partner-side tables to the Drizzle schema

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/migrations/` (auto-generated)

This task adds five tables: `partner`, `partner_user`, `partner_api_key`, `tag_batch`, `tag`. Other tables from the spec (`caregiver`, `find`, etc.) are deferred to the phase that uses them — adding them now would be dead schema.

- [ ] **Step 1: Replace `apps/api/src/db/schema.ts` with the partner-side tables**

```ts
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const partnerStatus = pgEnum("partner_status", ["active", "suspended"]);
export const partnerUserRole = pgEnum("partner_user_role", ["admin", "member"]);
export const tagState = pgEnum("tag_state", ["unactivated", "active", "revoked"]);

export const partner = pgTable("partner", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  billingEmail: text("billing_email").notNull(),
  status: partnerStatus("status").notNull().default("active"),
  settings: text("settings").default("{}").notNull(), // jsonb in spec; text for v1 simplicity
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const partnerUser = pgTable(
  "partner_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    email: text("email").notNull(),
    role: partnerUserRole("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({ emailUnique: unique("partner_user_email_unique").on(t.email) }),
);

export const partnerApiKey = pgTable(
  "partner_api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({ keyPrefixIdx: index("partner_api_key_prefix_idx").on(t.keyPrefix) }),
);

export const tagBatch = pgTable("tag_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partner.id),
  size: integer("size").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  csvTokenHash: text("csv_token_hash"),
  csvTokenExpiresAt: timestamp("csv_token_expires_at", { withTimezone: true }),
  csvDownloadedAt: timestamp("csv_downloaded_at", { withTimezone: true }),
});

export const tag = pgTable(
  "tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    batchId: uuid("batch_id").notNull().references(() => tagBatch.id),
    state: tagState("state").notNull().default("unactivated"),
    protectedPersonId: uuid("protected_person_id"),
    caregiverId: uuid("caregiver_id"),
    label: text("label"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    codeUnique: unique("tag_code_unique").on(t.code),
    partnerBatchStateIdx: index("tag_partner_batch_state_idx").on(t.partnerId, t.batchId, t.state),
  }),
);

export const auditEvent = pgTable("audit_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  caregiverId: uuid("caregiver_id"),
  partnerId: uuid("partner_id"),
  findId: uuid("find_id"),
  kind: text("kind").notNull(),
  payload: text("payload").notNull().default("{}"), // jsonb in spec; text in v1
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// Re-exports for convenience.
export const schema = {
  partner,
  partnerUser,
  partnerApiKey,
  tagBatch,
  tag,
  auditEvent,
};

// PostGIS extension (used in later phases for find / location_sample).
// We enable it now so the migration history stays linear.
export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @app/api db:generate`
Expected: a new SQL file appears under `apps/api/src/db/migrations/`. Open it; it should create the enums, the six tables, and the indexes.

- [ ] **Step 3: Apply the migration to the dev DB**

Run: `pnpm --filter @app/api db:migrate`
Expected: prints "applied" for the new migration.

- [ ] **Step 4: Verify**

Run: `docker compose exec db psql -U lnf -d lnf_dev -c '\dt public.*'`
Expected: lists `partner`, `partner_user`, `partner_api_key`, `tag_batch`, `tag`, `audit_event`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db
git commit -m "feat(db): add partner-side schema (partner, batch, tag, audit_event)"
```

---

### Task 10: Implement the unguessable code generator

**Files:**
- Create: `apps/api/src/codes/generate.ts`, `apps/api/tests/codes.test.ts`

Per spec §3.1: ~22-char base32, CSPRNG-derived. Base32's 32-symbol alphabet means each char is 5 bits → 22 chars ≈ 110 bits of entropy.

- [ ] **Step 1: Write the failing test first**

Create `apps/api/tests/codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateCode, generateCodes } from "../src/codes/generate.js";

describe("generateCode", () => {
  it("returns 22 chars in base32 alphabet (Crockford-safe)", () => {
    const code = generateCode();
    expect(code).toHaveLength(22);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it("is non-deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateCode()));
    expect(codes.size).toBe(100);
  });
});

describe("generateCodes", () => {
  it("returns the requested count of unique codes", () => {
    const codes = generateCodes(500);
    expect(codes).toHaveLength(500);
    expect(new Set(codes).size).toBe(500);
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `pnpm --filter @app/api test -- tests/codes.test.ts`
Expected: fails (`Cannot find module '../src/codes/generate.js'`).

- [ ] **Step 3: Implement `apps/api/src/codes/generate.ts`**

```ts
import { randomBytes } from "node:crypto";

// Crockford base32 (no I, L, O, U) — readable when printed onto fabric.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 22 chars × 5 bits = 110 bits of entropy. Astronomically collision-resistant;
 * the unique-violation retry in the mint loop exists only to fail loudly if
 * the entropy source is broken (per spec §4.1 #1).
 */
export function generateCode(): string {
  const bytes = randomBytes(14); // 14 bytes = 112 bits, we use 110
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 22) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 0x1f];
    }
  }
  return out.slice(0, 22);
}

export function generateCodes(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(generateCode());
  return out;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @app/api test -- tests/codes.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/codes apps/api/tests/codes.test.ts
git commit -m "feat(api): unguessable base32 code generator"
```

---

### Task 11: Add the audit_event writer with v-versioned payloads

**Files:**
- Create: `packages/schemas/src/audit/index.ts`, `packages/schemas/src/audit/partner.batch.minted.v1.ts`, `apps/api/src/audit/log.ts`, `apps/api/tests/audit.test.ts`

Per S1-5: payloads carry a top-level `v` integer; per-kind shapes live in `packages/schemas/audit/`.

- [ ] **Step 1: Create `packages/schemas/src/audit/partner.batch.minted.v1.ts`**

```ts
import { z } from "zod";

export const PartnerBatchMintedV1 = z.object({
  v: z.literal(1),
  batchId: z.string().uuid(),
  partnerId: z.string().uuid(),
  size: z.number().int().positive(),
  label: z.string().nullable(),
});

export type PartnerBatchMintedV1 = z.infer<typeof PartnerBatchMintedV1>;
```

- [ ] **Step 2: Create `packages/schemas/src/audit/index.ts`**

```ts
export { PartnerBatchMintedV1 } from "./partner.batch.minted.v1.js";

export const AuditKinds = {
  partnerBatchMinted: "partner.batch.minted",
  partnerBatchCsvDownloaded: "partner.batch.csv_downloaded",
  partnerApiKeyCreated: "partner.api_key.created",
  partnerApiKeyRevoked: "partner.api_key.revoked",
  // Other kinds added in later phases.
} as const;

export type AuditKind = (typeof AuditKinds)[keyof typeof AuditKinds];
```

- [ ] **Step 3: Re-export from `packages/schemas/src/index.ts`**

Replace the file contents:

```ts
export * from "./audit/index.js";
```

- [ ] **Step 4: Write the test for the audit logger**

Create `apps/api/tests/audit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "../src/audit/log.js";
import { auditEvent } from "../src/db/schema.js";

describe("logAuditEvent", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));

  beforeEach(async () => {
    await db.delete(auditEvent);
  });

  it("writes a versioned payload row", async () => {
    const partnerId = "11111111-1111-1111-1111-111111111111";
    const batchId = "22222222-2222-2222-2222-222222222222";
    await logAuditEvent(db, {
      kind: "partner.batch.minted",
      partnerId,
      payload: { v: 1, batchId, partnerId, size: 100, label: null },
    });
    const rows = await db.select().from(auditEvent).where(eq(auditEvent.kind, "partner.batch.minted"));
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ v: 1, batchId, size: 100 });
  });
});
```

- [ ] **Step 5: Run; confirm failure**

Run: `pnpm --filter @app/api test -- tests/audit.test.ts`
Expected: fails (module not found).

- [ ] **Step 6: Implement `apps/api/src/audit/log.ts`**

```ts
import type { Db } from "../db/client.js";
import { auditEvent } from "../db/schema.js";

export interface AuditEventInput {
  kind: string;
  caregiverId?: string | null;
  partnerId?: string | null;
  findId?: string | null;
  payload: { v: number } & Record<string, unknown>;
}

export async function logAuditEvent(db: Db, evt: AuditEventInput): Promise<void> {
  await db.insert(auditEvent).values({
    kind: evt.kind,
    caregiverId: evt.caregiverId ?? null,
    partnerId: evt.partnerId ?? null,
    findId: evt.findId ?? null,
    payload: JSON.stringify(evt.payload),
  });
}
```

- [ ] **Step 7: Run the test**

Run: `pnpm --filter @app/api test -- tests/audit.test.ts`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add packages/schemas apps/api/src/audit apps/api/tests/audit.test.ts
git commit -m "feat(audit): versioned audit_event writer with PartnerBatchMintedV1 schema"
```

---

### Task 12: Implement the partner API key middleware

**Files:**
- Create: `apps/api/src/auth/api-key.ts`, `apps/api/tests/api-key.test.ts`

API keys are presented as `Authorization: Bearer lnfp_<prefix>_<secret>`. We store `key_prefix` (visible) and `key_hash` (peppered SHA-256). The middleware identifies the partner from the prefix (fast index lookup), then constant-time-compares the secret hash. Body HMAC for replay protection is added in the mint endpoint itself, not the middleware (it needs the raw body).

- [ ] **Step 1: Add deps**

Run: `pnpm --filter @app/api add @noble/hashes`

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/api-key.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { partner, partnerApiKey } from "../src/db/schema.js";
import { hashApiKey, makeApiKeyMiddleware, mintApiKey } from "../src/auth/api-key.js";

describe("api-key middleware", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  let partnerId: string;
  let presented: string;

  beforeEach(async () => {
    await db.delete(partnerApiKey);
    await db.delete(partner);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    partnerId = p!.id;
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId,
      keyPrefix: minted.prefix,
      keyHash: hashApiKey(minted.secret, pepper),
      label: "ci",
    });
  });

  function buildApp() {
    const app = new Hono();
    app.use("/x/*", makeApiKeyMiddleware({ db, pepper }));
    app.get("/x/me", (c) => c.json({ partnerId: c.get("partnerId") }));
    return app;
  }

  it("rejects missing header", async () => {
    const res = await buildApp().request("/x/me");
    expect(res.status).toBe(401);
  });

  it("rejects malformed token", async () => {
    const res = await buildApp().request("/x/me", { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });

  it("rejects unknown prefix", async () => {
    const res = await buildApp().request("/x/me", {
      headers: { Authorization: "Bearer lnfp_AAAAAAAA_deadbeef" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid key and exposes partnerId", async () => {
    const res = await buildApp().request("/x/me", { headers: { Authorization: `Bearer ${presented}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ partnerId });
  });

  it("rejects a revoked key", async () => {
    await db.update(partnerApiKey).set({ revokedAt: new Date() });
    const res = await buildApp().request("/x/me", { headers: { Authorization: `Bearer ${presented}` } });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run; confirm failure**

Run: `pnpm --filter @app/api test -- tests/api-key.test.ts`
Expected: fails (module not found).

- [ ] **Step 4: Implement `apps/api/src/auth/api-key.ts`**

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { and, eq, isNull } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import { partnerApiKey } from "../db/schema.js";

export interface MintedApiKey {
  presented: string; // give to the partner once
  prefix: string;    // store as key_prefix
  secret: string;    // hashed with pepper, store as key_hash
}

export function mintApiKey(): MintedApiKey {
  const prefix = base32(randomBytes(5)).slice(0, 8);
  const secret = base32(randomBytes(20));
  return { presented: `lnfp_${prefix}_${secret}`, prefix, secret };
}

export function hashApiKey(secret: string, pepper: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(`${pepper}.${secret}`)));
}

interface ApiKeyMiddlewareOpts {
  db: Db;
  pepper: string;
}

declare module "hono" {
  interface ContextVariableMap {
    partnerId: string;
    apiKeyId: string;
  }
}

export function makeApiKeyMiddleware(opts: ApiKeyMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+lnfp_([0-9A-HJKMNP-TV-Z]{8})_([0-9A-HJKMNP-TV-Z]+)$/.exec(header);
    if (!match) return unauthorized(c);
    const [, prefix, secret] = match;
    const rows = await opts.db
      .select()
      .from(partnerApiKey)
      .where(and(eq(partnerApiKey.keyPrefix, prefix!), isNull(partnerApiKey.revokedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) return unauthorized(c);
    const expected = Buffer.from(row.keyHash, "hex");
    const got = Buffer.from(hashApiKey(secret!, opts.pepper), "hex");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return unauthorized(c);
    c.set("partnerId", row.partnerId);
    c.set("apiKeyId", row.id);
    // Fire-and-forget last_used update; failures here are not auth-fatal.
    opts.db.update(partnerApiKey).set({ lastUsedAt: new Date() }).where(eq(partnerApiKey.id, row.id))
      .catch(() => {});
    await next();
  };
}

function unauthorized(c: Context): Response {
  return c.json({ error: "unauthorized" }, 401);
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function base32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >>> bits) & 0x1f];
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 0x1f];
  return out;
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @app/api test -- tests/api-key.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/api-key.ts apps/api/tests/api-key.test.ts pnpm-lock.yaml
git commit -m "feat(auth): partner api-key middleware with peppered hash + revocation"
```

---

### Task 13: Define the mint request/response schemas

**Files:**
- Create: `packages/schemas/src/partner.ts`

- [ ] **Step 1: Create `packages/schemas/src/partner.ts`**

```ts
import { z } from "zod";

export const MAX_BATCH_SIZE = 100_000;

export const MintBatchRequest = z.object({
  size: z.number().int().positive().max(MAX_BATCH_SIZE),
  label: z.string().max(120).optional(),
});
export type MintBatchRequest = z.infer<typeof MintBatchRequest>;

export const MintBatchResponse = z.object({
  batchId: z.string().uuid(),
  size: z.number().int().positive(),
  downloadUrl: z.string(),       // relative path; client prefixes its base
  expiresAt: z.string().datetime(),
});
export type MintBatchResponse = z.infer<typeof MintBatchResponse>;
```

- [ ] **Step 2: Re-export from the package index**

Edit `packages/schemas/src/index.ts`:

```ts
export * from "./audit/index.js";
export * from "./partner.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @app/schemas typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/schemas
git commit -m "feat(schemas): partner mint request/response contracts"
```

---

### Task 14: Implement the CSV download token helper

**Files:**
- Create: `apps/api/src/codes/csv-token.ts`, `apps/api/tests/csv-token.test.ts`

A CSV token is `<batchId>.<base64url-32-byte-secret>`. The DB stores the SHA-256 hash of the secret (`csv_token_hash`) plus an expiry. Verifying constant-time-compares; we mark `csv_downloaded_at` and clear the hash to enforce single-use.

- [ ] **Step 1: Failing test**

Create `apps/api/tests/csv-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mintCsvToken, hashCsvSecret, splitCsvToken } from "../src/codes/csv-token.js";

describe("csv-token", () => {
  it("mints a token whose hash matches the stored hash", () => {
    const minted = mintCsvToken("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const split = splitCsvToken(minted.token);
    expect(split).not.toBeNull();
    expect(split!.batchId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(hashCsvSecret(split!.secret)).toBe(minted.hash);
  });

  it("rejects malformed tokens", () => {
    expect(splitCsvToken("nope")).toBeNull();
    expect(splitCsvToken("aaa.bbb")).toBeNull();
  });
});
```

- [ ] **Step 2: Run; confirm failure**

Run: `pnpm --filter @app/api test -- tests/csv-token.test.ts`
Expected: fails (module not found).

- [ ] **Step 3: Implement `apps/api/src/codes/csv-token.ts`**

```ts
import { randomBytes } from "node:crypto";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface MintedCsvToken {
  token: string;  // give to the partner once, in the response
  hash: string;   // store as csv_token_hash
}

export function mintCsvToken(batchId: string): MintedCsvToken {
  const secret = base64url(randomBytes(32));
  return { token: `${batchId}.${secret}`, hash: hashCsvSecret(secret) };
}

export function splitCsvToken(token: string): { batchId: string; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const batchId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!UUID_RE.test(batchId) || secret.length === 0) return null;
  return { batchId, secret };
}

export function hashCsvSecret(secret: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(secret)));
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @app/api test -- tests/csv-token.test.ts`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/codes/csv-token.ts apps/api/tests/csv-token.test.ts
git commit -m "feat(api): csv download token (mint + split + hash)"
```

---

### Task 15: Implement `POST /partner/batches`

**Files:**
- Create: `apps/api/src/routes/partner.ts`, `apps/api/tests/partner.batches.test.ts`
- Modify: `apps/api/src/index.ts` (mount the router)

The endpoint runs in one transaction: insert `tag_batch`, generate codes, chunked-insert `tag` rows with retry on unique-violation, mint CSV token, update `tag_batch` with hash+expiry, write `audit_event`. The CSV token is returned only here; never logged.

- [ ] **Step 1: Failing test**

Create `apps/api/tests/partner.batches.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { partner, partnerApiKey, tag, tagBatch, auditEvent } from "../src/db/schema.js";
import { hashApiKey, mintApiKey } from "../src/auth/api-key.js";
import { app } from "../src/index.js";

describe("POST /partner/batches", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  process.env.PARTNER_API_KEY_PEPPER = pepper;
  let presented: string;

  beforeEach(async () => {
    await db.delete(auditEvent);
    await db.delete(tag);
    await db.delete(tagBatch);
    await db.delete(partnerApiKey);
    await db.delete(partner);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId: p!.id,
      keyPrefix: minted.prefix,
      keyHash: hashApiKey(minted.secret, pepper),
      label: "ci",
    });
  });

  it("rejects without auth", async () => {
    const res = await app.request("/partner/batches", {
      method: "POST",
      body: JSON.stringify({ size: 10 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects size > 100000", async () => {
    const res = await app.request("/partner/batches", {
      method: "POST",
      body: JSON.stringify({ size: 100_001 }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBe(400);
  });

  it("creates a batch and returns a download URL", async () => {
    const res = await app.request("/partner/batches", {
      method: "POST",
      body: JSON.stringify({ size: 25, label: "AW26" }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { batchId: string; size: number; downloadUrl: string; expiresAt: string };
    expect(body.size).toBe(25);
    expect(body.downloadUrl).toMatch(new RegExp(`/partner/batches/${body.batchId}/codes\\.csv\\?token=`));
    const tags = await db.select().from(tag).where(eq(tag.batchId, body.batchId));
    expect(tags).toHaveLength(25);
    expect(new Set(tags.map((t) => t.code)).size).toBe(25);
    const audits = await db.select().from(auditEvent).where(eq(auditEvent.kind, "partner.batch.minted"));
    expect(audits).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run; confirm failure**

Run: `pnpm --filter @app/api test -- tests/partner.batches.test.ts`
Expected: fails (404 — route not mounted yet).

- [ ] **Step 3: Implement `apps/api/src/routes/partner.ts`**

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { MintBatchRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { tag, tagBatch } from "../db/schema.js";
import { generateCodes } from "../codes/generate.js";
import { mintCsvToken } from "../codes/csv-token.js";
import { logAuditEvent } from "../audit/log.js";
import { makeApiKeyMiddleware } from "../auth/api-key.js";

const CHUNK_SIZE = 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface PartnerRouterOpts {
  db: Db;
  pepper: string;
}

export function partnerRouter(opts: PartnerRouterOpts) {
  return new Hono()
    .use("*", makeApiKeyMiddleware({ db: opts.db, pepper: opts.pepper }))
    .post(
      "/batches",
      zValidator("json", MintBatchRequest),
      async (c) => {
        const partnerId = c.get("partnerId");
        const { size, label } = c.req.valid("json");
        const codes = generateCodes(size);
        const result = await opts.db.transaction(async (tx) => {
          const [batch] = await tx
            .insert(tagBatch)
            .values({ partnerId, size, label: label ?? null })
            .returning();
          for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
            const chunk = codes.slice(i, i + CHUNK_SIZE).map((code) => ({
              code,
              partnerId,
              batchId: batch!.id,
            }));
            await tx.insert(tag).values(chunk);
          }
          const minted = mintCsvToken(batch!.id);
          const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
          await tx
            .update(tagBatch)
            .set({ csvTokenHash: minted.hash, csvTokenExpiresAt: expiresAt })
            .where(eq(tagBatch.id, batch!.id));
          await logAuditEvent(tx, {
            kind: "partner.batch.minted",
            partnerId,
            payload: { v: 1, batchId: batch!.id, partnerId, size, label: label ?? null },
          });
          return { batchId: batch!.id, token: minted.token, expiresAt };
        });
        return c.json(
          {
            batchId: result.batchId,
            size,
            downloadUrl: `/partner/batches/${result.batchId}/codes.csv?token=${result.token}`,
            expiresAt: result.expiresAt.toISOString(),
          },
          201,
        );
      },
    );
}
```

- [ ] **Step 4: Add `@hono/zod-validator`**

Run: `pnpm --filter @app/api add @hono/zod-validator`

- [ ] **Step 5: Mount the router in `apps/api/src/index.ts`**

```ts
import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { makeDb } from "./db/client.js";
import { partnerRouter } from "./routes/partner.js";

const env = loadEnv();
const db = makeDb(env);

export const app = new Hono()
  .get("/healthz", (c) => c.json({ ok: true }))
  .route("/partner", partnerRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER }));

export type AppType = typeof app;
```

- [ ] **Step 6: Run the test**

Run: `pnpm --filter @app/api test -- tests/partner.batches.test.ts`
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api packages/schemas pnpm-lock.yaml
git commit -m "feat(partner): POST /partner/batches mints batch + tags + csv token"
```

---

### Task 16: Implement `GET /partner/batches/:id/codes.csv` (single-use)

**Files:**
- Modify: `apps/api/src/routes/partner.ts`
- Create: `apps/api/tests/partner.csv.test.ts`

The download endpoint:
- Verifies the token (constant-time hash compare against `csv_token_hash`).
- Rejects if expired, already-downloaded, or batch not owned by the requesting partner.
- Marks `csv_downloaded_at` and clears `csv_token_hash` in the same transaction as the read, so a concurrent second request loses.
- Streams CSV: one code per line, no header.

**Auth note:** the download URL contains the token, but the request still requires the same partner API key as the mint — the URL is meant to be shared inside a partner's pipeline, not publicly. This is stricter than the spec's "URL alone is enough"; we trade a marginal UX hit for defense in depth. Document this in the route and revisit if it bites a real partner.

- [ ] **Step 1: Failing test**

Create `apps/api/tests/partner.csv.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { partner, partnerApiKey, tag, tagBatch, auditEvent } from "../src/db/schema.js";
import { hashApiKey, mintApiKey } from "../src/auth/api-key.js";
import { app } from "../src/index.js";

describe("GET /partner/batches/:id/codes.csv", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  process.env.PARTNER_API_KEY_PEPPER = pepper;
  let presented: string;

  async function mintBatch(size: number) {
    const res = await app.request("/partner/batches", {
      method: "POST",
      body: JSON.stringify({ size }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    return res.json() as Promise<{ batchId: string; downloadUrl: string }>;
  }

  beforeEach(async () => {
    await db.delete(auditEvent);
    await db.delete(tag);
    await db.delete(tagBatch);
    await db.delete(partnerApiKey);
    await db.delete(partner);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId: p!.id, keyPrefix: minted.prefix, keyHash: hashApiKey(minted.secret, pepper), label: "ci",
    });
  });

  it("downloads a CSV of the codes once", async () => {
    const { downloadUrl } = await mintBatch(5);
    const res = await app.request(downloadUrl, {
      headers: { authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line).toMatch(/^[0-9A-HJKMNP-TV-Z]{22}$/);
  });

  it("refuses a second download with the same token", async () => {
    const { downloadUrl } = await mintBatch(3);
    const ok = await app.request(downloadUrl, { headers: { authorization: `Bearer ${presented}` } });
    expect(ok.status).toBe(200);
    await ok.text();
    const again = await app.request(downloadUrl, { headers: { authorization: `Bearer ${presented}` } });
    expect(again.status).toBe(410);
  });

  it("refuses a forged token (constant-time compare)", async () => {
    const { batchId } = await mintBatch(3);
    const res = await app.request(
      `/partner/batches/${batchId}/codes.csv?token=${batchId}.totally-wrong-secret-here-please-die`,
      { headers: { authorization: `Bearer ${presented}` } },
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run; confirm failure**

Run: `pnpm --filter @app/api test -- tests/partner.csv.test.ts`
Expected: fails (404).

- [ ] **Step 3: Extend `partnerRouter` in `apps/api/src/routes/partner.ts`**

Replace the file with the version below (keeps the existing `/batches` POST and adds the GET):

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { MintBatchRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { tag, tagBatch } from "../db/schema.js";
import { generateCodes } from "../codes/generate.js";
import { mintCsvToken, splitCsvToken, hashCsvSecret } from "../codes/csv-token.js";
import { logAuditEvent } from "../audit/log.js";
import { makeApiKeyMiddleware } from "../auth/api-key.js";

const CHUNK_SIZE = 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface PartnerRouterOpts {
  db: Db;
  pepper: string;
}

export function partnerRouter(opts: PartnerRouterOpts) {
  const router = new Hono().use("*", makeApiKeyMiddleware({ db: opts.db, pepper: opts.pepper }));

  router.post("/batches", zValidator("json", MintBatchRequest), async (c) => {
    const partnerId = c.get("partnerId");
    const { size, label } = c.req.valid("json");
    const codes = generateCodes(size);
    const result = await opts.db.transaction(async (tx) => {
      const [batch] = await tx.insert(tagBatch).values({ partnerId, size, label: label ?? null }).returning();
      for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
        const chunk = codes.slice(i, i + CHUNK_SIZE).map((code) => ({
          code, partnerId, batchId: batch!.id,
        }));
        await tx.insert(tag).values(chunk);
      }
      const minted = mintCsvToken(batch!.id);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
      await tx.update(tagBatch).set({ csvTokenHash: minted.hash, csvTokenExpiresAt: expiresAt })
        .where(eq(tagBatch.id, batch!.id));
      await logAuditEvent(tx, {
        kind: "partner.batch.minted",
        partnerId,
        payload: { v: 1, batchId: batch!.id, partnerId, size, label: label ?? null },
      });
      return { batchId: batch!.id, token: minted.token, expiresAt };
    });
    return c.json({
      batchId: result.batchId,
      size,
      downloadUrl: `/partner/batches/${result.batchId}/codes.csv?token=${result.token}`,
      expiresAt: result.expiresAt.toISOString(),
    }, 201);
  });

  router.get("/batches/:id/codes.csv", async (c) => {
    const partnerId = c.get("partnerId");
    const batchId = c.req.param("id");
    const tokenStr = c.req.query("token");
    if (!tokenStr) return c.json({ error: "missing_token" }, 401);
    const split = splitCsvToken(tokenStr);
    if (!split || split.batchId !== batchId) return c.json({ error: "bad_token" }, 401);

    const consumed = await opts.db.transaction(async (tx) => {
      const rows = await tx.select().from(tagBatch).where(eq(tagBatch.id, batchId)).limit(1);
      const batch = rows[0];
      if (!batch || batch.partnerId !== partnerId) return { status: 404 as const };
      if (!batch.csvTokenHash || !batch.csvTokenExpiresAt) return { status: 410 as const };
      if (batch.csvTokenExpiresAt.getTime() < Date.now()) return { status: 410 as const };
      const expected = Buffer.from(batch.csvTokenHash, "hex");
      const got = Buffer.from(hashCsvSecret(split.secret), "hex");
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
        return { status: 401 as const };
      }
      // Single-use: clear the hash in the same tx, before streaming.
      await tx.update(tagBatch)
        .set({ csvTokenHash: null, csvDownloadedAt: new Date() })
        .where(eq(tagBatch.id, batchId));
      await logAuditEvent(tx, {
        kind: "partner.batch.csv_downloaded",
        partnerId,
        payload: { v: 1, batchId, partnerId },
      });
      return { status: 200 as const };
    });

    if (consumed.status !== 200) return c.json({ error: "unavailable" }, consumed.status);

    const codes = await opts.db.select({ code: tag.code }).from(tag)
      .where(eq(tag.batchId, batchId)).orderBy(asc(tag.code));

    const body = codes.map((r) => r.code).join("\n") + "\n";
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="batch-${batchId}.csv"`,
      },
    });
  });

  return router;
}
```

- [ ] **Step 4: Run all partner tests**

Run: `pnpm --filter @app/api test -- tests/partner`
Expected: both partner test files pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/partner.ts apps/api/tests/partner.csv.test.ts
git commit -m "feat(partner): single-use CSV download with expiry + audit log"
```

---

### Task 17: Wire up Better-Auth for the partner portal

**Files:**
- Modify: `apps/api/package.json`, `apps/api/src/index.ts`
- Create: `apps/api/src/auth/better-auth.ts`, `apps/api/tests/auth.test.ts`

Better-Auth issues a session cookie that the Next.js partner portal uses. v1 ships email + password only; magic-link / social are deferred. Better-Auth manages its own tables; we run its migration generator and check the SQL into the same `migrations/` folder so all schema lives in one place.

- [ ] **Step 1: Add the dep**

Run: `pnpm --filter @app/api add better-auth`

- [ ] **Step 2: Create `apps/api/src/auth/better-auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/client.js";

export interface AuthOpts {
  db: Db;
  secret: string;
  baseUrl: string;
}

export function makeAuth(opts: AuthOpts) {
  return betterAuth({
    database: drizzleAdapter(opts.db, { provider: "pg" }),
    secret: opts.secret,
    baseURL: opts.baseUrl,
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30 }, // 30 days
  });
}

export type Auth = ReturnType<typeof makeAuth>;
```

- [ ] **Step 3: Generate Better-Auth tables**

Better-Auth has a CLI (`npx @better-auth/cli generate`) that emits a Drizzle schema for its own tables. For this plan we hand-roll the migration to keep one source of truth:

Create `apps/api/src/db/migrations/manual_better_auth.sql` (path: actual migration file Drizzle generates next time you run `db:generate`; we'll add it via `db:generate` after editing schema). Instead, append to `apps/api/src/db/schema.ts`:

```ts
import { boolean } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Also link `partner_user.email` to `user.email` semantically — we'll do membership lookups on the user's email at session-validate time. (No DB-level FK because Better-Auth owns its tables.)

- [ ] **Step 4: Generate + apply migration**

Run: `pnpm --filter @app/api db:generate`
Run: `pnpm --filter @app/api db:migrate`
Expected: new migration adds `user`, `account`, `session`, `verification`.

- [ ] **Step 5: Mount Better-Auth handler in `apps/api/src/index.ts`**

```ts
import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { makeDb } from "./db/client.js";
import { partnerRouter } from "./routes/partner.js";
import { makeAuth } from "./auth/better-auth.js";

const env = loadEnv();
const db = makeDb(env);
const auth = makeAuth({ db, secret: env.BETTER_AUTH_SECRET, baseUrl: env.BETTER_AUTH_URL });

export const app = new Hono()
  .get("/healthz", (c) => c.json({ ok: true }))
  .all("/api/auth/*", (c) => auth.handler(c.req.raw))
  .route("/partner", partnerRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER }));

export type AppType = typeof app;
```

- [ ] **Step 6: Smoke test**

Create `apps/api/tests/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { app } from "../src/index.js";

describe("better-auth handler", () => {
  it("responds to /api/auth/sign-up/email", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "newp@acme.test", password: "correct-horse-battery-staple", name: "P" }),
      headers: { "content-type": "application/json" },
    });
    // Better-Auth returns 200 or 201 on success; either is fine.
    expect([200, 201]).toContain(res.status);
  });
});
```

Run: `pnpm --filter @app/api test -- tests/auth.test.ts`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add apps/api packages pnpm-lock.yaml
git commit -m "feat(auth): better-auth email+password for partner portal"
```

---

### Task 18: Add session-based partner endpoints (`me`, `mint`)

**Files:**
- Modify: `apps/api/src/routes/partner.ts`
- Create: `apps/api/src/auth/session.ts`, `apps/api/tests/partner.session.test.ts`

The portal needs a session-authenticated mint path. Same business logic as the API-key route — different middleware. We extract a small `requirePartnerSession` helper that resolves the logged-in user → `partner_user` → `partner_id`.

- [ ] **Step 1: Create `apps/api/src/auth/session.ts`**

```ts
import { eq, isNull, and } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import type { Auth } from "./better-auth.js";
import { partnerUser } from "../db/schema.js";

export interface SessionMiddlewareOpts {
  db: Db;
  auth: Auth;
}

export function makePartnerSessionMiddleware(opts: SessionMiddlewareOpts): MiddlewareHandler {
  return async (c, next) => {
    const session = await opts.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return unauthorized(c);
    const rows = await opts.db.select().from(partnerUser)
      .where(and(eq(partnerUser.email, session.user.email), isNull(partnerUser.deletedAt)))
      .limit(1);
    const member = rows[0];
    if (!member) return forbidden(c);
    c.set("partnerId", member.partnerId);
    c.set("partnerUserId", member.id);
    await next();
  };
}

function unauthorized(c: Context) { return c.json({ error: "unauthorized" }, 401); }
function forbidden(c: Context) { return c.json({ error: "forbidden" }, 403); }

declare module "hono" {
  interface ContextVariableMap {
    partnerUserId: string;
  }
}
```

- [ ] **Step 2: Refactor `partnerRouter` so the mint logic is reusable**

Update `apps/api/src/routes/partner.ts` — extract a `mintBatch(opts, ctx)` helper, then build two router groups (one API-key-auth, one session-auth) that both call it. Replace the file body's router section:

```ts
async function mintBatch(opts: PartnerRouterOpts, partnerId: string, input: MintBatchRequest) {
  const codes = generateCodes(input.size);
  return opts.db.transaction(async (tx) => {
    const [batch] = await tx.insert(tagBatch).values({
      partnerId, size: input.size, label: input.label ?? null,
    }).returning();
    for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
      const chunk = codes.slice(i, i + CHUNK_SIZE).map((code) => ({
        code, partnerId, batchId: batch!.id,
      }));
      await tx.insert(tag).values(chunk);
    }
    const minted = mintCsvToken(batch!.id);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await tx.update(tagBatch).set({ csvTokenHash: minted.hash, csvTokenExpiresAt: expiresAt })
      .where(eq(tagBatch.id, batch!.id));
    await logAuditEvent(tx, {
      kind: "partner.batch.minted",
      partnerId,
      payload: { v: 1, batchId: batch!.id, partnerId, size: input.size, label: input.label ?? null },
    });
    return { batchId: batch!.id, token: minted.token, expiresAt };
  });
}

export interface PartnerRouterDeps extends PartnerRouterOpts {
  auth: Auth;
}

export function partnerApiRouter(opts: PartnerRouterOpts) {
  const r = new Hono().use("*", makeApiKeyMiddleware({ db: opts.db, pepper: opts.pepper }));
  r.post("/batches", zValidator("json", MintBatchRequest), async (c) => {
    const result = await mintBatch(opts, c.get("partnerId"), c.req.valid("json"));
    return c.json(toResponse(result, c.req.valid("json").size), 201);
  });
  r.get("/batches/:id/codes.csv", makeCsvHandler(opts));
  return r;
}

export function partnerSessionRouter(opts: PartnerRouterDeps) {
  const r = new Hono().use("*", makePartnerSessionMiddleware({ db: opts.db, auth: opts.auth }));
  r.get("/me", (c) => c.json({ partnerId: c.get("partnerId"), partnerUserId: c.get("partnerUserId") }));
  r.post("/batches", zValidator("json", MintBatchRequest), async (c) => {
    const result = await mintBatch(opts, c.get("partnerId"), c.req.valid("json"));
    return c.json(toResponse(result, c.req.valid("json").size), 201);
  });
  r.get("/batches/:id/codes.csv", makeCsvHandler(opts));
  return r;
}

function toResponse(result: { batchId: string; token: string; expiresAt: Date }, size: number) {
  return {
    batchId: result.batchId,
    size,
    downloadUrl: `/partner/batches/${result.batchId}/codes.csv?token=${result.token}`,
    expiresAt: result.expiresAt.toISOString(),
  };
}

function makeCsvHandler(opts: PartnerRouterOpts) {
  return async (c: Context) => {
    // existing CSV handler body — copy from prior task verbatim
  };
}
```

(For brevity above: paste the full CSV handler body from Task 16 into `makeCsvHandler`. The handler reads `c.get("partnerId")` regardless of which auth middleware ran, so it works for both surfaces.)

- [ ] **Step 3: Mount both routers in `apps/api/src/index.ts`**

```ts
import { Hono } from "hono";
import { loadEnv } from "./env.js";
import { makeDb } from "./db/client.js";
import { partnerApiRouter, partnerSessionRouter } from "./routes/partner.js";
import { makeAuth } from "./auth/better-auth.js";

const env = loadEnv();
const db = makeDb(env);
const auth = makeAuth({ db, secret: env.BETTER_AUTH_SECRET, baseUrl: env.BETTER_AUTH_URL });

export const app = new Hono()
  .get("/healthz", (c) => c.json({ ok: true }))
  .all("/api/auth/*", (c) => auth.handler(c.req.raw))
  .route("/partner-api", partnerApiRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER }))
  .route("/partner", partnerSessionRouter({ db, pepper: env.PARTNER_API_KEY_PEPPER, auth }));

export type AppType = typeof app;
```

Note the URL split: `/partner-api/*` for API-key auth (machines), `/partner/*` for session auth (humans + portal). Update the existing API-key tests to use the new prefix.

- [ ] **Step 4: Update existing tests**

In `apps/api/tests/partner.batches.test.ts` and `apps/api/tests/partner.csv.test.ts`, replace `/partner/batches` with `/partner-api/batches` and `/partner/batches/:id/codes.csv` with `/partner-api/batches/:id/codes.csv`. The `downloadUrl` returned by the mint response also needs the prefix; update `toResponse` to interpolate `/partner-api/...`.

- [ ] **Step 5: Run all api tests**

Run: `pnpm --filter @app/api test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(partner): split api-key vs session routes; add /partner/me"
```

---

### Task 19: Build the typed RPC client package

**Files:**
- Create: `packages/api-client/package.json`, `packages/api-client/tsconfig.json`, `packages/api-client/src/index.ts`

- [ ] **Step 1: Create `packages/api-client/package.json`**

```json
{
  "name": "@app/api-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@app/api": "workspace:*",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/api-client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/api-client/src/index.ts`**

```ts
import { hc } from "hono/client";
import type { AppType } from "@app/api";

export function makeClient(baseUrl: string, init?: RequestInit) {
  return hc<AppType>(baseUrl, { init });
}

export type ApiClient = ReturnType<typeof makeClient>;
```

- [ ] **Step 4: Install + typecheck**

Run: `pnpm install && pnpm --filter @app/api-client typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client pnpm-lock.yaml
git commit -m "feat(api-client): typed hono rpc wrapper"
```

---

### Task 20: Add a dev fixture script (seed one partner)

**Files:**
- Create: `apps/api/scripts/seed-partner.ts`
- Modify: `apps/api/package.json` (add script)

The portal needs at least one `partner_user` whose `email` matches a Better-Auth user. This script creates both. Idempotent: safe to re-run.

- [ ] **Step 1: Create `apps/api/scripts/seed-partner.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { partner, partnerUser } from "../src/db/schema.js";
import { loadEnv } from "../src/env.js";
import { makeAuth } from "../src/auth/better-auth.js";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL);
const db = drizzle(sql);
const auth = makeAuth({ db, secret: env.BETTER_AUTH_SECRET, baseUrl: env.BETTER_AUTH_URL });

const SEED_EMAIL = "ops@acme.test";
const SEED_PASSWORD = "correct-horse-battery-staple";

async function main() {
  let p = (await db.select().from(partner).where(eq(partner.name, "Acme")).limit(1))[0];
  if (!p) {
    [p] = await db.insert(partner).values({ name: "Acme", billingEmail: SEED_EMAIL }).returning();
    console.log("created partner", p!.id);
  }
  const existingUser = (await db.select().from(partnerUser).where(eq(partnerUser.email, SEED_EMAIL)).limit(1))[0];
  if (!existingUser) {
    await db.insert(partnerUser).values({ partnerId: p!.id, email: SEED_EMAIL, role: "admin" });
    console.log("created partner_user", SEED_EMAIL);
  }
  // Create the Better-Auth user too if missing.
  try {
    await auth.api.signUpEmail({
      body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: "Acme Ops" },
    });
    console.log("created auth user", SEED_EMAIL);
  } catch (e) {
    console.log("auth user exists:", SEED_EMAIL);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Edit `apps/api/package.json` `"scripts"`:

```json
"seed:partner": "tsx scripts/seed-partner.ts"
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @app/api seed:partner`
Expected: prints created lines on first run; "exists" lines on second run. No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api
git commit -m "chore(api): seed script for a default Acme partner"
```

---

### Task 21: Build the partner login page (`/partner/login`)

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/auth-client.ts`, `apps/web/src/app/partner/login/page.tsx`

- [ ] **Step 1: Add deps**

Run: `pnpm --filter @app/web add better-auth @app/api-client`

- [ ] **Step 2: Create `apps/web/src/lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
});
```

- [ ] **Step 3: Create `apps/web/src/app/partner/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function PartnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "sign in failed");
      return;
    }
    router.push("/partner/batches");
  }

  return (
    <main style={{ maxWidth: 360, margin: "64px auto", fontFamily: "system-ui" }}>
      <h1>Partner login</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Smoke**

Run (terminal 1): `pnpm --filter @app/api dev`
Run (terminal 2): `pnpm --filter @app/web dev`
Visit: http://localhost:3000/partner/login
Sign in with `ops@acme.test` / `correct-horse-battery-staple`.
Expected: redirects to `/partner/batches` (will 404 until next task — that's fine for now). Stop both dev servers.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): partner login page using better-auth client"
```

---

### Task 22: Build the partner batches page (list + create)

**Files:**
- Create: `apps/web/src/app/partner/layout.tsx`, `apps/web/src/app/partner/batches/page.tsx`, `apps/web/src/app/partner/batches/new/page.tsx`

The list page reads from a new `GET /partner/batches` endpoint we add as part of this task. The new-batch page POSTs to `/partner/batches` and shows the one-time CSV download URL.

- [ ] **Step 1: Add the list endpoint to `apps/api/src/routes/partner.ts`**

Inside `partnerSessionRouter`, before the `/me` route, add:

```ts
r.get("/batches", async (c) => {
  const partnerId = c.get("partnerId");
  const rows = await opts.db
    .select({
      id: tagBatch.id, size: tagBatch.size, label: tagBatch.label,
      createdAt: tagBatch.createdAt, csvDownloadedAt: tagBatch.csvDownloadedAt,
    })
    .from(tagBatch)
    .where(eq(tagBatch.partnerId, partnerId))
    .orderBy(sql`${tagBatch.createdAt} desc`);
  return c.json({ batches: rows });
});
```

- [ ] **Step 2: Create `apps/web/src/app/partner/layout.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (path === "/partner/login") { setReady(true); return; }
    authClient.getSession().then((res) => {
      if (!res.data) router.replace("/partner/login");
      else setReady(true);
    });
  }, [path, router]);

  if (!ready) return null;
  return <>{children}</>;
}
```

- [ ] **Step 3: Create `apps/web/src/app/partner/batches/page.tsx`**

```tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Batch {
  id: string; size: number; label: string | null;
  createdAt: string; csvDownloadedAt: string | null;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/partner/batches`, {
      credentials: "include",
    }).then((r) => r.json()).then((data) => setBatches(data.batches));
  }, []);
  return (
    <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Batches</h1>
        <Link href="/partner/batches/new">New batch</Link>
      </header>
      {batches === null && <p>Loading…</p>}
      {batches !== null && batches.length === 0 && <p>No batches yet.</p>}
      {batches !== null && batches.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th align="left">Created</th><th align="left">Label</th>
            <th align="right">Size</th><th align="left">CSV</th>
          </tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td>{b.label ?? "—"}</td>
                <td align="right">{b.size}</td>
                <td>{b.csvDownloadedAt ? "downloaded" : "pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/app/partner/batches/new/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function NewBatchPage() {
  const router = useRouter();
  const [size, setSize] = useState(100);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ batchId: string; downloadUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch(`${API}/partner/batches`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size, label: label || undefined }),
    });
    setBusy(false);
    if (!res.ok) { setError(`status ${res.status}`); return; }
    setResult(await res.json());
  }

  if (result) {
    return (
      <main style={{ maxWidth: 720, margin: "32px auto", fontFamily: "system-ui" }}>
        <h1>Batch created</h1>
        <p>Batch ID: <code>{result.batchId}</code></p>
        <p style={{ color: "crimson" }}>
          The CSV is single-use. Download it now and store it safely.
        </p>
        <a href={`${API}${result.downloadUrl}`} download>Download CSV</a>
        <p><button onClick={() => router.push("/partner/batches")}>Back to list</button></p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 480, margin: "32px auto", fontFamily: "system-ui" }}>
      <h1>New batch</h1>
      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Size
          <input type="number" min={1} max={100_000} value={size}
            onChange={(e) => setSize(Number(e.target.value))} required
            style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Label (optional)
          <input type="text" maxLength={120} value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8 }} />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Minting…" : "Mint batch"}</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Smoke E2E**

Bring everything up:
- Terminal 1: `pnpm --filter @app/api dev`
- Terminal 2: `pnpm --filter @app/web dev`

Manual flow:
1. Visit http://localhost:3000/partner/login, sign in.
2. Click "New batch", set size 50, mint.
3. Confirm a `Download CSV` link appears; click it; CSV downloads with 50 lines.
4. Click "Back to list"; the batch appears with `csvDownloadedAt = downloaded`.
5. Refresh the download link directly — should now 410.

Expected: full happy path works.

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/api
git commit -m "feat(partner): portal batches list + create-and-download flow"
```

---

### Task 23: Add the privacy-boundary schema snapshot test

**Files:**
- Create: `packages/schemas/src/__tests__/contracts.snapshot.test.ts`, `packages/schemas/vitest.config.ts`

Per spec §5.1 L1: Zod-derived JSON-schema snapshots for every public boundary. Phase 0+1 only has partner-side boundaries; the find/finder snapshots come in their phases.

- [ ] **Step 1: Add deps**

Run: `pnpm --filter @app/schemas add zod-to-json-schema`
Run: `pnpm --filter @app/schemas add -D @types/node`

- [ ] **Step 2: Create `packages/schemas/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/__tests__/*.test.ts"] },
});
```

- [ ] **Step 3: Write the snapshot test**

Create `packages/schemas/src/__tests__/contracts.snapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MintBatchRequest, MintBatchResponse, PartnerBatchMintedV1 } from "../index.js";

describe("contracts (privacy boundaries)", () => {
  it("MintBatchRequest", () => {
    expect(zodToJsonSchema(MintBatchRequest)).toMatchSnapshot();
  });
  it("MintBatchResponse", () => {
    expect(zodToJsonSchema(MintBatchResponse)).toMatchSnapshot();
  });
  it("PartnerBatchMintedV1", () => {
    expect(zodToJsonSchema(PartnerBatchMintedV1)).toMatchSnapshot();
  });
});
```

- [ ] **Step 4: Run; commit the snapshot**

Run: `pnpm --filter @app/schemas test`
Expected: snapshots written under `packages/schemas/src/__tests__/__snapshots__/`. Read the file; confirm none of the schemas leak fields they shouldn't (no surprise `caregiver_email` in `PartnerBatchMintedV1`, etc.).

- [ ] **Step 5: Re-run to confirm stability**

Run: `pnpm --filter @app/schemas test`
Expected: 3 tests pass, no snapshot churn.

- [ ] **Step 6: Commit**

```bash
git add packages/schemas pnpm-lock.yaml
git commit -m "test(schemas): snapshot partner contracts (privacy boundary)"
```

---

### Task 24: Add the find-creation-atomicity test (S1-1 anchor)

**Files:**
- Create: `apps/api/tests/partner.atomicity.test.ts`

Spec §5.1 L3 cites this test by name. We don't have `find` yet, but the same atomicity discipline applies to mint: if any write inside the transaction throws, *nothing* persists — no batch row, no tag rows, no audit event. This test pins that behavior so a future refactor can't silently break it.

- [ ] **Step 1: Failing test**

Create `apps/api/tests/partner.atomicity.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { partner, partnerApiKey, tag, tagBatch, auditEvent } from "../src/db/schema.js";
import { hashApiKey, mintApiKey } from "../src/auth/api-key.js";
import * as audit from "../src/audit/log.js";
import { app } from "../src/index.js";

describe("mint atomicity", () => {
  const db = drizzle(postgres(process.env.DATABASE_URL!));
  const pepper = "test_pepper_at_least_32_chars_long_xx";
  process.env.PARTNER_API_KEY_PEPPER = pepper;
  let presented: string;

  beforeEach(async () => {
    await db.delete(auditEvent);
    await db.delete(tag);
    await db.delete(tagBatch);
    await db.delete(partnerApiKey);
    await db.delete(partner);
    const [p] = await db.insert(partner).values({ name: "Acme", billingEmail: "ops@acme.test" }).returning();
    const minted = mintApiKey();
    presented = minted.presented;
    await db.insert(partnerApiKey).values({
      partnerId: p!.id, keyPrefix: minted.prefix, keyHash: hashApiKey(minted.secret, pepper), label: "ci",
    });
  });

  it("rolls back batch + tags + audit if audit logging throws", async () => {
    const spy = vi.spyOn(audit, "logAuditEvent").mockImplementation(async () => {
      throw new Error("simulated failure");
    });
    const res = await app.request("/partner-api/batches", {
      method: "POST",
      body: JSON.stringify({ size: 10 }),
      headers: { "content-type": "application/json", authorization: `Bearer ${presented}` },
    });
    expect(res.status).toBeGreaterThanOrEqual(500);
    spy.mockRestore();
    expect(await db.select().from(tagBatch)).toHaveLength(0);
    expect(await db.select().from(tag)).toHaveLength(0);
    expect(await db.select().from(auditEvent)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @app/api test -- tests/partner.atomicity.test.ts`
Expected: passes (the existing transaction wrapping is what makes this work).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/partner.atomicity.test.ts
git commit -m "test(partner): mint runs as one txn — fail rolls everything back (S1-1 anchor)"
```

---

### Task 25: README + dev-onboarding docs

**Files:**
- Modify: `README.md`
- Create: `docs/dev/getting-started.md`

The bilingual `README.md` is product-facing. Add a tiny "Building locally" pointer; the actual instructions live in `docs/dev/getting-started.md` so we can iterate without re-translating.

- [ ] **Step 1: Append to `README.md`**

Add at the end of the English half:

```markdown
## Building locally

See [`docs/dev/getting-started.md`](docs/dev/getting-started.md). Requires Node 20+, pnpm 9+, Docker.
```

And mirror at the end of the Spanish half:

```markdown
## Construir localmente

Ver [`docs/dev/getting-started.md`](docs/dev/getting-started.md). Requiere Node 20+, pnpm 9+, Docker.
```

- [ ] **Step 2: Create `docs/dev/getting-started.md`**

```markdown
# Getting started (developer)

## Prerequisites

- Node 20.x
- pnpm 9.x (`npm i -g pnpm`)
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
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/dev/getting-started.md
git commit -m "docs(dev): getting-started guide and README pointer"
```

---

## Self-Review

Run before declaring the plan complete.

**1. Spec coverage** — every Phase 0+1 spec section maps to at least one task:
- §1.1 system shape: Tasks 1, 4, 7, 8 (workspace, hono, worker, web).
- §1.2 stack picks: Tasks 2 (Postgres), 5 (Drizzle), 6 (Vitest+testcontainers), 8 (Next.js), 17 (Better-Auth).
- §2.3 partner-side tables: Task 9.
- §3.1 partner mint flow: Tasks 10 (codes), 11 (audit), 14 (CSV token), 15 (mint endpoint), 16 (CSV download).
- §3.7 per-partner rate limits on `POST /partner/batches`: **NOT IN THIS PLAN** — deferred to a Phase-1.5 task. Acceptable because the API is invite-only in v1; document as a known gap.
- §5.1 L1 schema snapshots: Task 23.
- §5.1 L3 atomicity test: Task 24.
- S1-1 atomicity note: enforced via Task 15's transaction + Task 24's test.
- S1-5 audit_event versioning: Task 11.

**Gaps to record explicitly in the plan's tail:**
- No per-partner rate limit on `POST /partner/batches` yet (defer).
- No password-reset / email-verify UI in the portal (Better-Auth supports it; we ship sign-in only).
- No partner-API-key admin UI in the portal — keys are issued by operator scripts in v1.

Add these gaps to a "Known gaps" section at the bottom of this plan.

**2. Placeholder scan** — search for "TBD", "TODO", "implement later", and unresolved sentence fragments. Anything found, fix.

**3. Type consistency** — confirm:
- `Db` type imported as `import type { Db } from "../db/client.js"` everywhere.
- `MintBatchRequest` / `MintBatchResponse` imported only from `@app/schemas`.
- `c.get("partnerId")` is consistently `string` — set by both API-key and session middlewares.
- `mintBatch(opts, partnerId, input)` signature matches both call sites in Task 18.

If anything's off, fix inline.

---

## Known gaps (intentionally deferred from this plan)

- **Per-partner rate limit on `/partner/batches`** (spec §3.7). Plan to add as a small follow-up task using Postgres advisory locks once a real partner is hammering the endpoint.
- **Partner password reset / email verify** UI. Better-Auth has the routes; we just don't ship the pages.
- **Partner API-key admin UI.** v1 operators mint keys via a CLI; portal UI later.
- **CI pipeline.** This plan stops at "tests run locally"; GitHub Actions wiring is its own follow-up.
- **Mobile + caregiver + finder + escalation + live tracking.** All Phase 2+, not Phase 1.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-04-foundation-and-partner-mint.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?









