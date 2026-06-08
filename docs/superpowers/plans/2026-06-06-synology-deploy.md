# Synology NAS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 0+1 stack to a personal Synology NAS (x86_64) so a partner sign-in → mint → CSV download flow works against `https://api.<domain>` and `https://app.<domain>` from the public internet.

**Architecture:** All three services run as Docker containers on the NAS, joined on one bridge network. Postgres uses a host bind-mount on `/volume1/docker/lnf/db-data`. The api and web images are multi-stage builds against the existing pnpm + Turborepo workspace. DSM's Application Portal terminates TLS and reverse-proxies the two subdomains to the container ports. Better-Auth is configured for cross-subdomain cookies on `.<domain>`.

**Tech Stack:** Docker, Docker Compose v2, Node 20-alpine, Next.js standalone output, DSM Application Portal (reverse proxy), Synology Let's Encrypt cert, Better-Auth `crossSubDomainCookies`.

---

## File structure (this plan only)

```
.
├── apps/
│   ├── api/
│   │   ├── Dockerfile               # multi-stage build → node:20-alpine runtime
│   │   └── .dockerignore
│   └── web/
│       ├── Dockerfile               # Next.js standalone output → node:20-alpine
│       ├── .dockerignore
│       └── next.config.ts           # add `output: "standalone"`
├── docker-compose.prod.yml          # db + api + web on one bridge network
├── .env.prod.example                # documents prod env without real secrets
├── docs/dev/deploy-synology.md      # NAS-side runbook (DSM clicks + ssh commands)
└── docs/dev/deploy-synology.es.md   # Spanish parallel
```

Notes:
- The two existing `docker-compose.yml` (dev) is unchanged. Prod stack lives in a separate compose file.
- Better-Auth config takes a new optional `cookieDomain` so prod sets `.<your-domain>` while dev stays on localhost (no cookie domain).
- `apps/web` `output: "standalone"` is the supported Next.js way to ship a minimal runtime image.

---

## Pre-flight

- A NAS with DSM 7.2+ and Container Manager installed.
- A registered domain or `*.synology.me` DDNS handle. Two host records: `api.<root>` and `app.<root>`, both pointing at the NAS public IP.
- SSH access to the NAS as a user in the `administrators` group.
- Router port-forward of 443 → NAS:443 (or QuickConnect, but reverse proxy is simpler).

---

## Task 1: Add `output: "standalone"` to Next.js config

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Update config**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
};

export default config;
```

- [ ] **Step 2: Verify build still works**

Run: `pnpm --filter @app/web build`
Expected: succeeds; produces `apps/web/.next/standalone/` directory.

- [ ] **Step 3: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(web): emit Next.js standalone build for container runtime"
```

---

## Task 2: Add `apps/api/.dockerignore`

**Files:**
- Create: `apps/api/.dockerignore`

- [ ] **Step 1: Write the file**

```
node_modules
dist
.turbo
.env
.env.*
tests
*.test.ts
coverage
*.tsbuildinfo
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/.dockerignore
git commit -m "chore(api): docker build ignore list"
```

---

## Task 3: Add `apps/api/Dockerfile`

**Files:**
- Create: `apps/api/Dockerfile`

The build runs at the **monorepo root** so workspace deps (`@app/schemas`) resolve. Build context is the repo root; the Dockerfile path is `apps/api/Dockerfile`.

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- deps stage: install all workspace deps ----------
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copy lockfile + every workspace's package.json so pnpm can resolve.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/schemas/package.json packages/schemas/
COPY packages/api-client/package.json packages/api-client/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# ---------- build stage: tsc -> dist ----------
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/schemas/node_modules ./packages/schemas/node_modules
COPY tsconfig.base.json ./
COPY packages/schemas ./packages/schemas
COPY apps/api ./apps/api

RUN pnpm --filter @app/api build

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NODE_ENV=production

# Copy only what the runtime needs.
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/src/db/migrations ./dist/db/migrations
COPY --from=build /repo/apps/api/scripts ./scripts
COPY --from=build /repo/packages/schemas ./node_modules/@app/schemas
COPY --from=deps /repo/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Smoke-build locally**

Run from repo root:
```bash
docker buildx build --platform linux/amd64 -t lnf-api:dev -f apps/api/Dockerfile .
```
Expected: image builds without errors. Note the size; should be < 400 MB.

- [ ] **Step 3: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "feat(api): multi-stage Dockerfile for production runtime"
```

---

## Task 4: Add `apps/web/.dockerignore`

**Files:**
- Create: `apps/web/.dockerignore`

- [ ] **Step 1: Write the file**

```
node_modules
.next
.turbo
.env
.env.*
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/.dockerignore
git commit -m "chore(web): docker build ignore list"
```

---

## Task 5: Add `apps/web/Dockerfile`

**Files:**
- Create: `apps/web/Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.7

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
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public 2>/dev/null || true

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 2: Smoke-build locally**

```bash
docker buildx build --platform linux/amd64 -t lnf-web:dev -f apps/web/Dockerfile .
```
Expected: builds; image < 250 MB.

- [ ] **Step 3: Commit**

```bash
git add apps/web/Dockerfile
git commit -m "feat(web): Next.js standalone Dockerfile for production runtime"
```

---

## Task 6: Better-Auth cross-subdomain cookies

**Files:**
- Modify: `apps/api/src/auth/better-auth.ts`
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Add `COOKIE_DOMAIN` to env**

Edit `apps/api/src/env.ts`. Inside `EnvSchema`, add:

```ts
COOKIE_DOMAIN: z.string().optional(),
```

(Optional — undefined in dev, set to `.<root-domain>` in prod.)

- [ ] **Step 2: Update Better-Auth config**

Replace `apps/api/src/auth/better-auth.ts` with:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface AuthOpts {
  db: Db;
  secret: string;
  baseUrl: string;
  cookieDomain?: string;
}

export function makeAuth(opts: AuthOpts) {
  return betterAuth({
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: {
        user: schema.user,
        account: schema.account,
        session: schema.session,
        verification: schema.verification,
      },
    }),
    secret: opts.secret,
    baseURL: opts.baseUrl,
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    advanced: opts.cookieDomain
      ? {
          crossSubDomainCookies: { enabled: true, domain: opts.cookieDomain },
          defaultCookieAttributes: { sameSite: "none", secure: true },
        }
      : undefined,
  });
}

export type Auth = ReturnType<typeof makeAuth>;
```

- [ ] **Step 3: Pass it through in `index.ts`**

In `apps/api/src/index.ts`, change the `makeAuth` call to:

```ts
const auth = makeAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseUrl: env.BETTER_AUTH_URL,
  cookieDomain: env.COOKIE_DOMAIN,
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @app/api test
```
Expected: 27/27 still pass (cookie-domain path is opt-in; dev path unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src
git commit -m "feat(auth): cross-subdomain cookies for prod two-domain layout"
```

---

## Task 7: Add `docker-compose.prod.yml`

**Files:**
- Create: `docker-compose.prod.yml`

- [ ] **Step 1: Write the compose file**

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - /volume1/docker/lnf/db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 20

  api:
    image: lnf-api:${IMAGE_TAG}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL}
      WEB_ORIGIN: ${WEB_ORIGIN}
      COOKIE_DOMAIN: ${COOKIE_DOMAIN}
      PARTNER_API_KEY_PEPPER: ${PARTNER_API_KEY_PEPPER}
    ports:
      - "127.0.0.1:3001:3001"

  web:
    image: lnf-web:${IMAGE_TAG}
    restart: unless-stopped
    depends_on:
      - api
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: ${BETTER_AUTH_URL}
    ports:
      - "127.0.0.1:3000:3000"
```

The `127.0.0.1:` bind keeps the containers reachable only from the NAS itself; DSM's reverse proxy bridges them to the public internet on 443.

- [ ] **Step 2: Validate locally**

Run from repo root with the dev `.env`:
```bash
docker compose -f docker-compose.prod.yml config
```
Expected: prints expanded config; no errors. Won't actually start (images may not be tagged yet locally).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "feat(deploy): production compose stack (db + api + web)"
```

---

## Task 8: Add `.env.prod.example` and Compose env-file docs

**Files:**
- Create: `.env.prod.example`

- [ ] **Step 1: Write the file**

```
# Image tag built and shipped to the NAS. Bump on each deploy.
IMAGE_TAG=0.1.0

# Postgres
POSTGRES_USER=lnf
POSTGRES_PASSWORD=replace-with-openssl-rand
POSTGRES_DB=lnf_prod

# Better-Auth — secrets MUST be 32+ random chars; loadEnv refuses placeholders.
BETTER_AUTH_SECRET=replace-with-openssl-rand-32
BETTER_AUTH_URL=https://api.example.com
WEB_ORIGIN=https://app.example.com
COOKIE_DOMAIN=.example.com

# Partner API
PARTNER_API_KEY_PEPPER=replace-with-openssl-rand-32
```

- [ ] **Step 2: Commit**

```bash
git add .env.prod.example
git commit -m "docs(deploy): document required production env vars"
```

---

## Task 9: Image-bundle script

**Files:**
- Create: `scripts/build-and-bundle.sh`

A one-shot helper that builds both images for amd64 and saves them to a tarball ready to scp.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-$(git rev-parse --short HEAD)}"
OUT="dist/lnf-images-${TAG}.tar"
mkdir -p dist

echo "Building lnf-api:${TAG}..."
docker buildx build --platform linux/amd64 -t "lnf-api:${TAG}" -f apps/api/Dockerfile --load .

echo "Building lnf-web:${TAG}..."
docker buildx build --platform linux/amd64 -t "lnf-web:${TAG}" -f apps/web/Dockerfile --load .

echo "Saving to ${OUT}..."
docker save "lnf-api:${TAG}" "lnf-web:${TAG}" -o "${OUT}"

echo "Done. Ship ${OUT} + docker-compose.prod.yml + .env.prod to the NAS."
echo "On the NAS: docker load -i ${OUT##*/} && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/build-and-bundle.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-and-bundle.sh
git commit -m "chore(deploy): build-and-bundle helper script"
```

---

## Task 10: Local prod-stack smoke test

Verify the whole stack runs locally before touching the NAS.

- [ ] **Step 1: Build the bundle**

```bash
./scripts/build-and-bundle.sh local
```

- [ ] **Step 2: Create a local prod env**

Copy `.env.prod.example` to `.env.prod` and fill with real-but-local values:
- `IMAGE_TAG=local`
- `BETTER_AUTH_URL=http://localhost:3001` (for local; cross-subdomain not tested locally)
- `WEB_ORIGIN=http://localhost:3000`
- `COOKIE_DOMAIN=` (leave empty for localhost)
- Generate the three random secrets with `openssl rand -base64 32`

- [ ] **Step 3: Bring up the stack**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api
```
Expected: api logs show `api listening on :3001` and Better-Auth boots.

- [ ] **Step 4: Run migrations + seed**

```bash
docker compose -f docker-compose.prod.yml exec api node --experimental-strip-types scripts/seed-partner.ts
```
*(Note: prod image has compiled JS only — adjust if migrations need to run.)* Better: run migrations as a one-shot:

```bash
docker compose -f docker-compose.prod.yml run --rm api node dist/db/migrate.js
```
**This requires a small `apps/api/src/db/migrate.ts` entry point** — add in step 5.

- [ ] **Step 5: Add `apps/api/src/db/migrate.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "../env.js";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);
const __dirname = dirname(fileURLToPath(import.meta.url));
await migrate(db, { migrationsFolder: join(__dirname, "migrations") });
console.log("migrations applied");
await sql.end();
```

Add to `apps/api/package.json` scripts:
```json
"db:migrate:prod": "node dist/db/migrate.js"
```

Update Task 3 Dockerfile final stage so it copies migrations relative to `dist/db/migrations` (already covered in the COPY line).

- [ ] **Step 6: E2E smoke**

Visit `http://localhost:3000/partner/login`, sign in with seeded credentials, mint a small batch, download the CSV. Confirm 410 on second download.

- [ ] **Step 7: Tear down**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/migrate.ts apps/api/package.json
git commit -m "feat(api): standalone migrate entry point for prod containers"
```

---

## Task 11: Synology runbook (English)

**Files:**
- Create: `docs/dev/deploy-synology.md`

- [ ] **Step 1: Write the runbook**

````markdown
# Deploying LNF to a Synology NAS (x86_64)

## Assumptions
- DSM 7.2+ with Container Manager installed
- A registered domain or `*.synology.me` DDNS handle
- DNS A records: `api.<root>` and `app.<root>` → NAS public IP
- SSH access to the NAS as a user in the `administrators` group
- Router port 443 → NAS:443

## One-time setup

### 1. Prepare directories

SSH to the NAS, then:

```bash
sudo mkdir -p /volume1/docker/lnf/{db-data,images}
sudo chown -R $(whoami) /volume1/docker/lnf
```

### 2. Issue the TLS certificate

DSM → Control Panel → Security → Certificate → Add → Get a certificate from Let's Encrypt.
Domain: `app.<root>`. SAN: `api.<root>`. Email: yours.

### 3. Configure reverse proxy entries

DSM → Login Portal → Advanced → Reverse Proxy → Create:

Entry 1 — web:
- Source: HTTPS, `app.<root>`, port 443, hostname-based.
- Destination: HTTP, `localhost`, port 3000.
- Custom headers (Advanced): `WebSocket` enabled.

Entry 2 — api:
- Source: HTTPS, `api.<root>`, port 443.
- Destination: HTTP, `localhost`, port 3001.
- Custom headers (Advanced): `WebSocket` enabled.

Bind both entries to the cert from step 2 (Cert tab in the same dialog).

### 4. Open firewall

DSM → Control Panel → Security → Firewall → allow TCP 443 from anywhere.

## First deploy

### 1. From your laptop

```bash
./scripts/build-and-bundle.sh 0.1.0
scp dist/lnf-images-0.1.0.tar admin@nas:/volume1/docker/lnf/images/
scp docker-compose.prod.yml admin@nas:/volume1/docker/lnf/
scp .env.prod.example admin@nas:/volume1/docker/lnf/.env.prod
```

### 2. On the NAS

```bash
cd /volume1/docker/lnf
sudo docker load -i images/lnf-images-0.1.0.tar

# Generate secrets
{
  echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=')"
  echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n=')"
  echo "PARTNER_API_KEY_PEPPER=$(openssl rand -base64 32 | tr -d '\n=')"
} >> .env.prod
chmod 600 .env.prod
```

Edit `.env.prod` and set:
- `IMAGE_TAG=0.1.0`
- `BETTER_AUTH_URL=https://api.<root>`
- `WEB_ORIGIN=https://app.<root>`
- `COOKIE_DOMAIN=.<root>`
- `POSTGRES_USER=lnf`
- `POSTGRES_DB=lnf_prod`

### 3. Apply migrations + start

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api node dist/db/migrate.js
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

### 4. Seed your first partner

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  node --experimental-vm-modules dist/scripts/seed-partner.js
```

(If `seed-partner.ts` isn't compiled into the image, run it via tsx in a one-shot dev container instead.)

### 5. Verify

```bash
curl -I https://api.<root>/healthz
# Expect: HTTP/2 200, content-type: application/json
```

Open `https://app.<root>/partner/login` in a browser. Sign in with the seeded credentials.

## Updating to a new version

```bash
# laptop
./scripts/build-and-bundle.sh 0.2.0
scp dist/lnf-images-0.2.0.tar admin@nas:/volume1/docker/lnf/images/

# NAS
cd /volume1/docker/lnf
sudo docker load -i images/lnf-images-0.2.0.tar
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=0.2.0/' .env.prod
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api node dist/db/migrate.js
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Rollback

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=0.1.0/' .env.prod
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Backups

DSM → Hyper Backup → schedule a job over `/volume1/docker/lnf/db-data`.
Or nightly `pg_dump`:

```bash
sudo docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U lnf lnf_prod | gzip > /volume1/docker/lnf/backups/$(date +%F).sql.gz
```
````

- [ ] **Step 2: Commit**

```bash
git add docs/dev/deploy-synology.md
git commit -m "docs(deploy): Synology NAS runbook"
```

---

## Task 12: Synology runbook (Spanish mirror)

**Files:**
- Create: `docs/dev/deploy-synology.es.md`

- [ ] **Step 1: Write the Spanish parallel**

Mirror Task 11's structure with Spanish prose. Keep all commands, paths, env-var names, and code blocks verbatim in English. Translate only narrative headings and explanatory sentences.

Headings to translate:
- "Deploying LNF to a Synology NAS (x86_64)" → "Despliegue de LNF en un NAS Synology (x86_64)"
- "Assumptions" → "Supuestos"
- "One-time setup" → "Configuración inicial"
- "Prepare directories" → "Preparar directorios"
- "Issue the TLS certificate" → "Emitir el certificado TLS"
- "Configure reverse proxy entries" → "Configurar las entradas del proxy inverso"
- "Open firewall" → "Abrir el firewall"
- "First deploy" → "Primer despliegue"
- "From your laptop" → "Desde tu laptop"
- "On the NAS" → "En el NAS"
- "Apply migrations + start" → "Aplicar migraciones y arrancar"
- "Seed your first partner" → "Sembrar el primer partner"
- "Verify" → "Verificar"
- "Updating to a new version" → "Actualizar a una nueva versión"
- "Rollback" → "Reversión"
- "Backups" → "Respaldos"

- [ ] **Step 2: Commit**

```bash
git add docs/dev/deploy-synology.es.md
git commit -m "docs(deploy): mirror Synology runbook in Spanish"
```

---

## Self-Review

**1. Spec coverage** — every requirement maps to a task:
- x86_64 build target → Task 9 (`--platform linux/amd64`)
- Two subdomains → Task 6 (cross-subdomain cookies), Task 11 (reverse proxy)
- `.env.prod` on NAS → Task 8 (template) + Task 11 (placement, mode 600)
- DSM Application Portal reverse proxy + Let's Encrypt → Task 11 §2-§3
- Postgres bind-mount under `/volume1/docker/lnf` → Task 7 + Task 11 §1
- Migrations from container → Task 10 §5 (`migrate.ts` entry) + Task 11 §3
- Bilingual docs (EN+ES) → Tasks 11+12

**Gaps:**
- No Spanish version of `.env.prod.example` — code/identifier file, no narrative to translate. Acceptable.
- No CI build of Docker images — out of scope; build-and-bundle is a laptop script in v1.

**2. Placeholder scan** — no "TBD"/"TODO"/"implement later" in the plan. The string `replace-with-` appears inside `.env.prod.example` and existing `.env.example`; that's intentional content (the `loadEnv` guard relies on this prefix to refuse placeholder secrets).

**3. Type / signature consistency:**
- `COOKIE_DOMAIN` env name used identically in env.ts, better-auth.ts, docker-compose.prod.yml, .env.prod.example, runbook.
- `WEB_ORIGIN` already used in PR #1; reused unchanged here.
- `IMAGE_TAG` env name consistent across `docker-compose.prod.yml`, `.env.prod.example`, runbook, build script.

---

## Known gaps (intentionally deferred from this plan)

- **CI/CD pipeline.** Manual scp + ssh deploy in v1. GitHub Actions building images and pushing to GHCR is the natural next step.
- **HTTPS in dev.** Local dev still HTTP; cross-subdomain cookie flag won't be exercised until NAS deploy. The provided env tests cover the option-passing, not the runtime.
- **Health probes for Compose.** Postgres has one; api/web don't. Their `restart: unless-stopped` covers crash loops well enough; add app-level healthchecks once we have anything more interesting than `/healthz`.
- **Observability.** No metrics, no log shipping. Container Manager + DSM Log Center are enough for v1.
- **Multi-arch images.** amd64 only. ARM64 NAS owners would rebuild with `--platform linux/arm64`; cross-build is fast on Apple Silicon laptops via buildx but not exercised in this plan.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-06-synology-deploy.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
