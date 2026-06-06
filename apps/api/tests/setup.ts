import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = join(__dirname, "../src/db/migrations");

export async function setup() {
  const container = await new PostgreSqlContainer("postgis/postgis:16-3.4")
    .withDatabase("lnf_test")
    .withUsername("lnf")
    .withPassword("test")
    .start();
  process.env.DATABASE_URL = container.getConnectionUri();
  globalThis.__PG_CONTAINER__ = container;

  const sql = postgres(container.getConnectionUri(), { max: 1 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await sql.end();
}

export async function teardown() {
  await globalThis.__PG_CONTAINER__?.stop();
}
