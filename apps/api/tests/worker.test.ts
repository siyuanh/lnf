import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { startWorker } from "../src/worker/index.js";

describe("worker bootstrap", () => {
  it("installs the graphile_worker schema in the test database", async () => {
    const db = drizzle(postgres(process.env.DATABASE_URL!));
    const rows = await db.execute(
      sql`select proname from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
          where pg_namespace.nspname = 'graphile_worker' and proname = 'add_job'`,
    );
    expect(rows.length).toBe(1);
  });

  it("starts with an empty task list", async () => {
    const runner = await startWorker({ DATABASE_URL: process.env.DATABASE_URL! });
    await runner.stop();
  });
});
