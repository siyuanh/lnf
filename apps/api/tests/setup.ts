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
