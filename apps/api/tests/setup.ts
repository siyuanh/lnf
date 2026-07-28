import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: StartedTestContainer | undefined;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, "../src/db/migrations");

export async function setup() {
  // PostGIS container on ARM64 requires reaper disabled (platform mismatch)
  process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

  const container = await new GenericContainer("postgis/postgis:16-3.4")
    .withEnvironment({
      POSTGRES_DB: "lnf_test",
      POSTGRES_USER: "lnf",
      POSTGRES_PASSWORD: "test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(120_000)
    .start();

  const connectionUri = `postgresql://lnf:test@${container.getHost()}:${container.getMappedPort(5432)}/lnf_test`;
  process.env.DATABASE_URL = connectionUri;
  globalThis.__PG_CONTAINER__ = container;

  const sql = postgres(connectionUri, { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await sql.end();
}

export async function teardown() {
  await globalThis.__PG_CONTAINER__?.stop();
}
